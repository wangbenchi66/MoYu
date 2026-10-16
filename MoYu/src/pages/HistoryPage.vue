<!-- HistoryPage.vue — 历史记录（搜索 + 分页浏览） -->
<script setup>
import { ElMessage } from 'element-plus';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import ContextMenu from '../components/ContextMenu.vue';
import { useDesktopApp } from '../composables/useDesktopApp';

defineProps({
  isTransparent: Boolean,
});

const router = useRouter();

const { recentVisits, openRecentVisit } = useDesktopApp();

const menuVisible = ref(false);
const menuX = ref(0);
const menuY = ref(0);
const menuTarget = ref(null);
const menuItems = [
  { key: 'open', label: '打开链接' },
  { key: 'copy', label: '复制链接' },
];

function copyToClipboard(text) {
  if (!text) return Promise.reject(new Error('empty'));
  if (navigator?.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement('textarea');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy') ? resolve() : reject(new Error('execCopyFailed'));
      document.body.removeChild(ta);
    } catch (e) { reject(e); }
  });
}

function showMenuForItem(e, item) {
  e.preventDefault();
  e.stopPropagation();
  menuTarget.value = item;
  menuX.value = e.clientX || 0;
  menuY.value = e.clientY || 0;
  menuVisible.value = true;
}

function onMenuSelect(item) {
  const target = menuTarget.value;
  menuVisible.value = false;
  menuTarget.value = null;
  if (!item || !target) return;
  if (item.key === 'open') {
    openRecentVisit(target);
  } else if (item.key === 'copy') {
    const url = target.url || '';
    if (!url) { ElMessage({ message: '没有可复制的链接', type: 'warning' }); return; }
    copyToClipboard(url)
      .then(() => ElMessage({ message: '已复制链接', type: 'success' }))
      .catch(() => ElMessage({ message: '复制失败', type: 'error' }));
  }
}

const searchKeyword = ref('');
const currentPage = ref(1);
const pageSize = 20;

const filtered = computed(() => {
  if (!searchKeyword.value) return recentVisits.value;
  const kw = searchKeyword.value.toLowerCase();
  return recentVisits.value.filter((item) => {
    const title = (item.title || '').toLowerCase();
    const url = (item.url || '').toLowerCase();
    return title.includes(kw) || url.includes(kw);
  });
});

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)));

const pagedList = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return filtered.value.slice(start, start + pageSize);
});

function onSearch() {
  currentPage.value = 1;
}

function prevPage() {
  if (currentPage.value > 1) currentPage.value--;
}

function nextPage() {
  if (currentPage.value < totalPages.value) currentPage.value++;
}

function formatTime(t) {
  try {
    if (!t) return '';
    const d = new Date(t);
    if (isNaN(d.getTime())) return String(t);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (d.toDateString() === now.toDateString()) return time;
    const date = `${d.getMonth() + 1}/${d.getDate()}`;
    if (d.getFullYear() === now.getFullYear()) return `${date} ${time}`;
    return `${d.getFullYear()}/${date}`;
  } catch (e) {
    return t || '';
  }
}
</script>

<template>
  <div class="history-page" :class="{ 'transparent-page': isTransparent }">
    <div class="page-header">
      <button class="back-btn" @click="router.back()">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h2>历史记录</h2>
    </div>

    <div class="search-bar">
      <input
        v-model="searchKeyword"
        placeholder="搜索历史记录..."
        class="search-input"
        @input="onSearch" />
    </div>

    <div class="history-list">
      <div
        v-for="(item, idx) in pagedList"
        :key="`${item.url}-${item.time}-${idx}`"
        class="history-item"
        @click="openRecentVisit(item)"
        @contextmenu.prevent.stop="showMenuForItem($event, item)">
        <div class="item-header">
          <strong class="item-title">{{ item.title || '未知页面' }}</strong>
          <small class="item-time">{{ formatTime(item.time) }}</small>
        </div>
        <span class="url">{{ item.url }}</span>
      </div>
      <div v-if="!pagedList.length" class="empty-tip">
        {{ searchKeyword ? '没有找到匹配的记录' : '暂无访问记录' }}
      </div>
    </div>

    <div class="pagination" v-if="totalPages > 1">
      <button class="page-btn" :disabled="currentPage <= 1" @click="prevPage">上一页</button>
      <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>
      <button class="page-btn" :disabled="currentPage >= totalPages" @click="nextPage">下一页</button>
    </div>
  </div>
  <ContextMenu
    :visible="menuVisible"
    :x="menuX"
    :y="menuY"
    :items="menuItems"
    @select="onMenuSelect"
    @close="menuVisible = false" />
</template>

<style scoped>
.history-page {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 8px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

.history-page.transparent-page .history-item {
  background: transparent !important;
  border-color: transparent !important;
}

.history-page.transparent-page .search-input {
  background: transparent !important;
  border-color: rgba(var(--bg-rgb), 0.2) !important;
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
  letter-spacing: 0;
  text-transform: none;
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

.search-bar {
  flex-shrink: 0;
}

.search-input {
  width: 100%;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--line-strong);
  font-size: 12px;
  box-sizing: border-box;
}

.search-input:focus {
  outline: none;
  border-color: var(--primary);
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-height: 0;
}

.history-item {
  padding: 4px 6px;
  border-radius: 5px;
  border: 1px solid var(--fill-soft);
  background: var(--surface);
  cursor: pointer;
  font-size: 12px;
  transition: background 0.12s;
}

.history-item:hover {
  background: var(--primary-faint);
}

.item-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.item-title {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-time {
  flex-shrink: 0;
  color: var(--muted);
  font-size: 10px;
  opacity: 0.7;
}

.url {
  display: block;
  color: #888;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty-tip {
  text-align: center;
  padding: 24px 0;
  color: var(--overlay);
  font-size: 13px;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 6px 0;
  flex-shrink: 0;
}

.page-btn {
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid var(--line-strong);
  background: var(--surface, rgb(var(--bg-rgb)));
  cursor: pointer;
  font-size: 12px;
  color: var(--text-secondary);
  transition: border-color 0.12s, color 0.12s;
}

.page-btn:hover:not(:disabled) {
  border-color: var(--primary);
  color: var(--primary);
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-info {
  font-size: 12px;
  color: var(--muted);
}
</style>
