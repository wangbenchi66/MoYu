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
  color: var(--text, #333);
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
  color: #666;
  transition: background 0.12s;
}

.back-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}

.stats-card {
  background: var(--surface, #fff);
  border-radius: 8px;
  border: 1px solid #f0f0f0;
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
  color: var(--text, #333);
}

.today-total,
.grand-total {
  font-size: 15px;
  font-weight: 700;
  color: #409eff;
}

.active-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 12px;
  color: #67c23a;
  font-weight: 500;
}

.active-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #67c23a;
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
  background: rgba(0, 0, 0, 0.02);
  font-size: 12px;
}

.session-item.active-session {
  background: rgba(103, 194, 58, 0.06);
}

.session-time {
  color: #666;
}

.session-dur {
  color: #999;
  font-size: 11px;
}

.total-card .total-days {
  font-size: 11px;
  color: #999;
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
  background: rgba(0, 0, 0, 0.03);
}

.expand-icon {
  flex-shrink: 0;
  color: #ccc;
  transition: transform 0.2s;
}

.expand-icon.expanded {
  transform: rotate(90deg);
}

.day-date {
  font-size: 12px;
  font-weight: 500;
  color: var(--text, #333);
}

.day-total {
  flex: 1;
  text-align: right;
  font-size: 12px;
  font-weight: 600;
  color: #409eff;
}

.day-count {
  font-size: 11px;
  color: #bbb;
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
  color: rgba(0, 0, 0, 0.25);
  font-size: 12px;
}

.clear-btn {
  align-self: center;
  padding: 5px 16px;
  border-radius: 4px;
  border: 1px solid #f56c6c;
  background: transparent;
  color: #f56c6c;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  margin-top: 4px;
}

.clear-btn:hover {
  background: #f56c6c;
  color: #fff;
}
</style>
