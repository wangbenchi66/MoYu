<!-- StatsPage.vue — 摸鱼时间统计（今日/历史/累计） -->
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';

defineProps({
  isTransparent: Boolean,
});

const router = useRouter();

const sessions = ref({});
const activeStart = ref(null);
const now = ref(Date.now());
let timer = null;

async function loadStats() {
  if (!window.desktop?.getMoyuStats) return;
  const data = await window.desktop.getMoyuStats();
  sessions.value = data.sessions || {};
  activeStart.value = data.activeStart;
}

async function clearStats() {
  if (!window.desktop?.clearMoyuStats) return;
  await window.desktop.clearMoyuStats();
  sessions.value = {};
  activeStart.value = null;
}

onMounted(() => {
  loadStats();
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});

const todayKey = computed(() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});

// 当前活跃会话的实时时长
const activeDuration = computed(() => {
  if (!activeStart.value) return 0;
  return now.value - activeStart.value;
});

// 按日期降序排列的天数列表
const sortedDays = computed(() => {
  return Object.keys(sessions.value).sort((a, b) => b.localeCompare(a));
});

// 计算某天的总时长
function dayTotal(key) {
  const list = sessions.value[key] || [];
  let total = list.reduce((sum, s) => sum + (s.end - s.start), 0);
  if (key === todayKey.value && activeStart.value) {
    total += activeDuration.value;
  }
  return total;
}

// 所有天数的累计总时长
const grandTotal = computed(() => {
  return sortedDays.value.reduce((sum, key) => sum + dayTotal(key), 0);
});

// 今日会话列表
const todaySessions = computed(() => {
  return sessions.value[todayKey.value] || [];
});

// 今日总时长
const todayTotal = computed(() => dayTotal(todayKey.value));

function formatDuration(ms) {
  if (ms <= 0) return '0秒';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}小时`);
  if (m > 0) parts.push(`${m}分钟`);
  if (s > 0 || parts.length === 0) parts.push(`${s}秒`);
  return parts.join('');
}

function formatTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDate(key) {
  const [y, m, d] = key.split('-');
  return `${parseInt(m)}月${parseInt(d)}日`;
}

// 展开/折叠历史天数的会话详情
const expandedDays = ref(new Set());

function toggleDay(key) {
  if (expandedDays.value.has(key)) {
    expandedDays.value.delete(key);
  } else {
    expandedDays.value.add(key);
  }
}

// 最近 7 天柱状图数据
const last7Days = computed(() => {
  const result = [];
  const d = new Date();
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(d);
    dt.setDate(dt.getDate() - i);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    result.push({
      key,
      label: `${dt.getMonth() + 1}/${dt.getDate()}`,
      weekday: `周${weekdays[dt.getDay()]}`,
      value: dayTotal(key),
    });
  }
  return result;
});

const last7Max = computed(() => Math.max(1, ...last7Days.value.map(d => d.value)));

// 按小时分布热力图数据（0-23 点）
const hourlyData = computed(() => {
  const buckets = new Array(24).fill(0);
  const allSessions = [];
  for (const key in sessions.value) {
    allSessions.push(...(sessions.value[key] || []));
  }
  if (activeStart.value) {
    allSessions.push({ start: activeStart.value, end: now.value });
  }
  for (const s of allSessions) {
    const startDate = new Date(s.start);
    const endDate = new Date(s.end);
    // 按小时累加
    const cur = new Date(startDate);
    cur.setMinutes(0, 0, 0);
    while (cur < endDate) {
      const h = cur.getHours();
      const hourStart = cur.getTime();
      const hourEnd = hourStart + 3600000;
      const overlapStart = Math.max(s.start, hourStart);
      const overlapEnd = Math.min(s.end, hourEnd);
      if (overlapEnd > overlapStart) {
        buckets[h] += overlapEnd - overlapStart;
      }
      cur.setTime(cur.getTime() + 3600000);
    }
  }
  return buckets;
});

const hourlyMax = computed(() => Math.max(1, ...hourlyData.value));
</script>

<template>
  <div class="stats-page" :class="{ 'transparent-page': isTransparent }">
    <div class="page-header">
      <button class="back-btn" @click="router.back()">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h2>摸鱼时间统计</h2>
    </div>

    <!-- 今日摸鱼卡片 -->
    <div class="stats-card today-card">
      <div class="card-header">
        <span class="card-title">今日摸鱼</span>
        <span class="today-total">{{ formatDuration(todayTotal) }}</span>
      </div>
      <div v-if="activeStart" class="active-badge">
        <span class="active-dot"></span>
        <span>摸鱼中... {{ formatDuration(activeDuration) }}</span>
      </div>
      <div class="session-list" v-if="todaySessions.length || activeStart">
        <div v-if="activeStart" class="session-item active-session">
          <span class="session-time">{{ formatTime(activeStart) }} — 进行中</span>
          <span class="session-dur">{{ formatDuration(activeDuration) }}</span>
        </div>
        <div v-for="(s, i) in todaySessions" :key="i" class="session-item">
          <span class="session-time">{{ formatTime(s.start) }} — {{ formatTime(s.end) }}</span>
          <span class="session-dur">{{ formatDuration(s.end - s.start) }}</span>
        </div>
      </div>
      <div v-else class="empty-tip">今天还没有摸鱼记录</div>
    </div>

    <!-- 最近 7 天柱状图 -->
    <div class="stats-card chart-card" v-if="sortedDays.length">
      <div class="card-header">
        <span class="card-title">最近 7 天</span>
      </div>
      <div class="bar-chart">
        <div v-for="d in last7Days" :key="d.key" class="bar-col">
          <div class="bar-value">{{ d.value > 0 ? formatDuration(d.value) : '' }}</div>
          <div class="bar-track">
            <div class="bar-fill" :style="{ height: (d.value / last7Max * 100) + '%' }"></div>
          </div>
          <div class="bar-label">{{ d.label }}</div>
          <div class="bar-weekday">{{ d.weekday }}</div>
        </div>
      </div>
    </div>

    <!-- 按小时分布热力图 -->
    <div class="stats-card chart-card" v-if="sortedDays.length">
      <div class="card-header">
        <span class="card-title">摸鱼时段分布</span>
      </div>
      <div class="heatmap">
        <div v-for="(val, h) in hourlyData" :key="h" class="heat-cell"
          :style="{ opacity: val > 0 ? 0.2 + 0.8 * (val / hourlyMax) : 0.06 }"
          :title="`${h}:00 - ${formatDuration(val)}`">
          <span class="heat-hour">{{ h }}</span>
        </div>
      </div>
      <div class="heatmap-legend">
        <span>少</span>
        <div class="legend-gradient"></div>
        <span>多</span>
      </div>
    </div>

    <!-- 累计总时长 -->
    <div class="stats-card total-card">
      <div class="card-header">
        <span class="card-title">累计摸鱼</span>
        <span class="grand-total">{{ formatDuration(grandTotal) }}</span>
      </div>
      <div class="total-days">共 {{ sortedDays.length }} 天记录</div>
    </div>

    <!-- 历史记录 -->
    <div class="stats-card history-card" v-if="sortedDays.length">
      <div class="card-header">
        <span class="card-title">历史记录</span>
      </div>
      <div class="day-list">
        <div v-for="day in sortedDays" :key="day" class="day-group">
          <div class="day-header" @click="toggleDay(day)">
            <svg
              class="expand-icon"
              :class="{ expanded: expandedDays.has(day) }"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            <span class="day-date">{{ formatDate(day) }}</span>
            <span class="day-total">{{ formatDuration(dayTotal(day)) }}</span>
            <span class="day-count">{{ (sessions[day]?.length || 0) + (day === todayKey && activeStart ? 1 : 0) }} 次</span>
          </div>
          <div v-if="expandedDays.has(day)" class="day-sessions">
            <div v-if="day === todayKey && activeStart" class="session-item active-session">
              <span class="session-time">{{ formatTime(activeStart) }} — 进行中</span>
              <span class="session-dur">{{ formatDuration(activeDuration) }}</span>
            </div>
            <div v-for="(s, i) in sessions[day]" :key="i" class="session-item">
              <span class="session-time">{{ formatTime(s.start) }} — {{ formatTime(s.end) }}</span>
              <span class="session-dur">{{ formatDuration(s.end - s.start) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 清空按钮 -->
    <button v-if="sortedDays.length" class="clear-btn" @click="clearStats">清空统计数据</button>
  </div>
</template>

<style scoped>
.stats-page {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 8px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

.stats-page.transparent-page .stats-card {
  background: transparent !important;
  border-color: transparent !important;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.page-header h2 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text, var(--text));
  margin: 0;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-secondary);
  transition: background 0.12s;
}

.back-btn:hover {
  background: var(--overlay-weak);
}

.stats-card {
  background: var(--surface, rgb(var(--bg-rgb)));
  border-radius: 8px;
  border: 1px solid var(--fill-soft);
  padding: 10px 12px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text, var(--text));
}

.today-total,
.grand-total {
  font-size: 15px;
  font-weight: 700;
  color: var(--primary);
}

.active-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--success);
  font-weight: 500;
}

.active-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.session-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 8px;
}

.session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  border-radius: 4px;
  background: var(--overlay-weak);
  font-size: 12px;
}

.session-item.active-session {
  background: rgba(103, 194, 58, 0.06);
}

.session-time {
  color: var(--text-secondary);
}

.session-dur {
  color: var(--muted);
  font-size: 11px;
}

.total-card .total-days {
  font-size: 11px;
  color: var(--muted);
  margin-top: 4px;
}

.day-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 6px;
}

.day-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 4px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.12s;
}

.day-header:hover {
  background: var(--overlay-weak);
}

.expand-icon {
  flex-shrink: 0;
  color: var(--muted);
  transition: transform 0.2s;
}

.expand-icon.expanded {
  transform: rotate(90deg);
}

.day-date {
  font-size: 12px;
  font-weight: 500;
  color: var(--text, var(--text));
}

.day-total {
  flex: 1;
  text-align: right;
  font-size: 12px;
  font-weight: 600;
  color: var(--primary);
}

.day-count {
  font-size: 11px;
  color: var(--muted);
  flex-shrink: 0;
}

.day-sessions {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 20px;
  margin-bottom: 4px;
}

.empty-tip {
  text-align: center;
  padding: 16px 0;
  color: var(--overlay);
  font-size: 12px;
}

.clear-btn {
  align-self: center;
  padding: 5px 16px;
  border-radius: 4px;
  border: 1px solid var(--danger);
  background: transparent;
  color: var(--danger);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  margin-top: 4px;
}

.clear-btn:hover {
  background: var(--danger);
  color: rgb(var(--bg-rgb));
}

/* 柱状图 */
.bar-chart {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  margin-top: 10px;
  height: 100px;
  padding: 0 4px;
}

.bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
}

.bar-value {
  font-size: 9px;
  color: var(--muted);
  height: 16px;
  line-height: 16px;
  white-space: nowrap;
  overflow: visible;
}

.bar-track {
  flex: 1;
  width: 100%;
  max-width: 28px;
  background: var(--fill-soft);
  border-radius: 3px 3px 0 0;
  display: flex;
  align-items: flex-end;
  overflow: hidden;
}

.bar-fill {
  width: 100%;
  background: linear-gradient(180deg, var(--primary), #66b1ff);
  border-radius: 3px 3px 0 0;
  min-height: 2px;
  transition: height 0.3s ease;
}

.bar-label {
  font-size: 10px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.bar-weekday {
  font-size: 9px;
  color: var(--muted);
}

/* 热力图 */
.heatmap {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 3px;
  margin-top: 10px;
}

.heat-cell {
  aspect-ratio: 1;
  background: var(--primary);
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  transition: opacity 0.2s;
}

.heat-hour {
  font-size: 9px;
  color: rgb(var(--bg-rgb));
  font-weight: 600;
}

.heatmap-legend {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 10px;
  color: var(--muted);
}

.legend-gradient {
  width: 60px;
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--primary-soft), rgba(64, 158, 255, 1));
}
</style>
