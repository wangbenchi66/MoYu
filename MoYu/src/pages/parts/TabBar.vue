<script setup>
import { Close } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { computed, defineProps, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import BaseButton from '../../components/BaseButton.vue';
import ContextMenu from '../../components/ContextMenu.vue';

const props = defineProps({
  tabs: Array,
  activeTabId: [String, Number],
  formatTabTitle: Function,
  selectTab: Function,
  closeTab: Function,
  addNewTab: Function,
  createPageTab: Function,
  closeTabsToLeft: Function,
  closeTabsToRight: Function,
  closeAllTabs: Function
});

// context menu (right-click) for individual tabs
const menuVisible = ref(false);
const menuX = ref(0);
const menuY = ref(0);
const menuTarget = ref(null);
const menuItems = computed(() => getMenuItems(menuTarget.value));

function getMenuItems(tab) {
  return [
    { key: 'copy', label: '复制链接', iconKey: 'view' },
    { key: 'copy_title', label: '复制标题', iconKey: 'view' },
    { key: 'close', label: '关闭标签', iconKey: 'close' },
    { key: 'close_left', label: '关闭左侧标签', iconKey: 'left' },
    { key: 'close_right', label: '关闭右侧标签', iconKey: 'right' },
    { key: 'close_all', label: '关闭全部标签', iconKey: 'close' }
  ];
}

function copyToClipboard(text) {
  if (!text) return Promise.reject(new Error('empty'));
  if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement('textarea');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) resolve();
      else reject(new Error('execCopyFailed'));
    } catch (e) {
      reject(e);
    }
  });
}

function showMenu(e, tab) {
  try {
    e.preventDefault();
    e.stopPropagation();
  } catch (e) {}
  menuTarget.value = tab;
  menuX.value = e.clientX || 0;
  menuY.value = e.clientY || 0;
  menuVisible.value = true;
}

function onMenuSelect(item) {
  const tab = menuTarget.value;
  menuVisible.value = false;
  menuTarget.value = null;
  if (!item || !tab) return;
  if (item.key === 'copy') {
    const url = tab.url || '';
    if (!url) {
      ElMessage({ message: '此标签没有可复制的链接', type: 'warning' });
      return;
    }
    copyToClipboard(url)
      .then(() => ElMessage({ message: '已复制链接', type: 'success' }))
      .catch(() => ElMessage({ message: '复制失败', type: 'error' }));
  } else if (item.key === 'copy_title') {
    const title = tab.title || '';
    if (!title) {
      ElMessage({ message: '无标题可复制', type: 'warning' });
      return;
    }
    copyToClipboard(title)
      .then(() => ElMessage({ message: '已复制标题', type: 'success' }))
      .catch(() => ElMessage({ message: '复制失败', type: 'error' }));
  } else if (item.key === 'close') {
    try {
      props.closeTab(tab.id);
    } catch (e) {}
  } else if (item.key === 'close_left') {
    try {
      if (typeof props.closeTabsToLeft === 'function') props.closeTabsToLeft(tab.id);
    } catch (e) {}
  } else if (item.key === 'close_right') {
    try {
      if (typeof props.closeTabsToRight === 'function') props.closeTabsToRight(tab.id);
    } catch (e) {}
  } else if (item.key === 'close_all') {
    try {
      if (typeof props.closeAllTabs === 'function') props.closeAllTabs();
    } catch (e) {}
  }
}

// --- Overflow / collapse logic ---
const tabsWrapRef = ref(null);
const tabEls = ref({}); // map: tabId -> element
const addBtnRef = ref(null);
const moreBtnRef = ref(null);
const overflowPopRef = ref(null);
const showOverflowMenu = ref(false);
const visibleCount = ref(props.tabs ? props.tabs.length : 0);
let resizeObserver = null;

function setTabRef(el, id) {
  if (el) {
    // 如果获取到的是组件实例，使用其 $el（真实 DOM 节点）
    try {
      tabEls.value[id] = el.$el && el.$el instanceof HTMLElement ? el.$el : el instanceof HTMLElement ? el : el.$el || el;
    } catch (e) {
      tabEls.value[id] = el;
    }
  } else delete tabEls.value[id];
}

function getNodeWidth(node) {
  if (!node) return undefined;
  let el = node;
  try {
    if (el && el.$el) el = el.$el;
  } catch (e) {}
  if (el && el instanceof HTMLElement) return el.offsetWidth;
  return undefined;
}

function getDomNode(node) {
  if (!node) return null;
  let el = node;
  try {
    if (el && el.$el) el = el.$el;
  } catch (e) {}
  if (el && el instanceof HTMLElement) return el;
  return null;
}

const visibleTabs = computed(() => (props.tabs || []).slice(0, visibleCount.value));
const overflowTabs = computed(() => (props.tabs || []).slice(visibleCount.value));

function selectOverflowTab(tab) {
  try {
    props.selectTab(tab.id);
  } catch (e) {}
  showOverflowMenu.value = false;
}

function closeOverflowTab(tab) {
  try {
    props.closeTab(tab.id);
  } catch (e) {}
}

function toggleOverflowMenu(e) {
  if (e && e.stopPropagation) e.stopPropagation();
  console.debug('[TabBar] toggleOverflowMenu before:', showOverflowMenu.value, 'event:', !!e);
  showOverflowMenu.value = !showOverflowMenu.value;
  console.debug('[TabBar] toggleOverflowMenu after:', showOverflowMenu.value);
}

// document-level click handling removed; rely on Element Plus popover for outside clicks

function onWinResize() {
  updateTabMinWidth();
  computeVisibleTabs();
}

function updateTabMinWidth() {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
  let val = 96;
  if (w < 800) val = 64;
  else if (w < 1200) val = 88;
  else if (w < 1600) val = 104;
  else val = 120;
  try {
    document.documentElement.style.setProperty('--tab-chip-min-width', val + 'px');
  } catch (e) {}
}

async function computeVisibleTabs() {
  await nextTick();
  const wrap = tabsWrapRef.value;
  const addEl = addBtnRef.value;
  const moreEl = moreBtnRef.value;
  const tabs = props.tabs || [];
  if (!wrap) {
    visibleCount.value = tabs.length;
    return;
  }
  const gap = Math.max(6, parseFloat(getComputedStyle(wrap).gap) || 6);
  const containerWidth = wrap.clientWidth;
  const addWidth = getNodeWidth(addEl) || 36;
  const minWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tab-chip-min-width')) || 96;

  // gather widths (fallback to minWidth)
  const widths = tabs.map((t) => {
    const el = tabEls.value[t.id];
    return el && el.offsetWidth ? el.offsetWidth : minWidth;
  });

  const total = widths.reduce((acc, w, i) => acc + w + (i > 0 ? gap : 0), 0);
  // if all fit with space reserved for add button, show all
  if (total + addWidth + gap <= containerWidth) {
    visibleCount.value = tabs.length;
    return;
  }

  const moreWidth = getNodeWidth(moreEl) || 36;
  const reserved = addWidth + moreWidth + gap * 2;
  let cap = containerWidth - reserved;
  let used = 0;
  let fit = 0;
  for (let i = 0; i < widths.length; i++) {
    const w = widths[i];
    const nextUsed = used + (fit > 0 ? gap : 0) + w;
    if (nextUsed <= cap) {
      used = nextUsed;
      fit++;
    } else break;
  }
  if (fit < 1 && tabs.length > 0) fit = 1;
  // 如果剩余空间不足以容纳另一个完整的 tab（minWidth），则不要把该 tab 放入可见列，改为放入溢出
  const minTab = minWidth;
  const remainingForTabs = cap - used; // cap 是可用于 tabs 的空间（已扣除 reserved）
  if (remainingForTabs < minTab && fit > 0 && fit < tabs.length) {
    // 把最后一个可见 tab 移到溢出以给更多按钮/新增按钮留出空间
    fit = Math.max(1, fit - 1);
  }

  visibleCount.value = fit;
}

watch(
  () => props.tabs && props.tabs.length,
  () => {
    nextTick().then(() => computeVisibleTabs());
  },
  { immediate: true }
);

onMounted(() => {
  updateTabMinWidth();
  computeVisibleTabs();
  window.addEventListener('resize', onWinResize);
  try {
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => computeVisibleTabs());
      if (tabsWrapRef.value) resizeObserver.observe(tabsWrapRef.value);
    }
  } catch (e) {}
});
onBeforeUnmount(() => {
  try {
    window.removeEventListener('resize', onWinResize);
  } catch (e) {}
  // document click listener removed; Element Plus popover handles outside clicks
  try {
    if (resizeObserver) resizeObserver.disconnect();
  } catch (e) {}
});
</script>

<template>
  <section class="tabbar panel">
    <div
      class="tabs"
      ref="tabsWrapRef">
      <BaseButton
        v-for="tab in visibleTabs"
        :key="tab.id"
        class="tab-chip"
        :class="{ active: String(tab.id) === String(props.activeTabId) }"
        :title="tab.title || tab.url"
        @click="props.selectTab(tab.id)"
        @contextmenu.prevent.stop="showMenu($event, tab)"
        :ref="(el) => setTabRef(el, tab.id)">
        <span class="tab-title">{{ props.formatTabTitle(tab.title) }}</span>

        <span
          class="close-mark"
          @click.stop="props.closeTab(tab.id)">
          <el-icon><Close /></el-icon>
        </span>
      </BaseButton>

      <!-- 更多溢出按钮 -->
      <div
        v-if="overflowTabs.length"
        class="more-wrap">
        <el-popover
          v-model:visible="showOverflowMenu"
          placement="bottom-start"
          trigger="click"
          :append-to-body="true"
          popper-class="tabbar-overflow-popper">
          <div
            class="overflow-pop"
            ref="overflowPopRef">
            <div
              v-for="tab in overflowTabs"
              :key="tab.id"
              class="overflow-item"
              @click="() => selectOverflowTab(tab)">
              <span class="ov-title">{{ props.formatTabTitle(tab.title) }}</span>
              <span
                class="close-mark"
                @click.stop="() => closeOverflowTab(tab)"
                ><el-icon><Close /></el-icon
              ></span>
            </div>
          </div>
          <template #reference>
            <BaseButton
              :use-el="true"
              class="tab-more"
              ref="moreBtnRef"
              title="更多标签"
              >⋯</BaseButton
            >
          </template>
        </el-popover>
      </div>

      <BaseButton
        class="tab-add"
        ref="addBtnRef"
        @click="props.addNewTab">
        +
      </BaseButton>
    </div>
    <ContextMenu
      :visible="menuVisible"
      :x="menuX"
      :y="menuY"
      :items="menuItems"
      @select="onMenuSelect"
      @close="menuVisible = false" />
  </section>
</template>

<style scoped>
/* 仅用于 tabbar 的局部样式（应用已有样式表为主） */
/* 优化：当标签较多时，使用横向滚动并对标题进行省略处理，避免换行或堆叠 */
.tabbar .tabs {
  /* 保证在容器内不换行，超出时横向滚动 */
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  flex-wrap: nowrap;
  white-space: nowrap;
  /* 允许缩小以适应父容器 */
  min-width: 0;
  gap: 6px;
  /* 为右侧的 更多/新增 按钮预留空间，避免被标签挤出 */
  padding-right: 92px;
  position: relative; /* 使内部的绝对定位按钮相对于此容器定位 */
}

.tabbar .tabs::-webkit-scrollbar {
  height: 6px;
}
.tabbar .tabs::-webkit-scrollbar-thumb {
  background: rgba(60, 68, 80, 0.12);
  border-radius: 6px;
}

.tabbar .tab-chip {
  /* 不允许 flex 项换行或伸展，统一大小由内容或 max-width 控制 */
  flex: 0 0 auto;
  min-width: var(--tab-chip-min-width, 64px);
  max-width: 220px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
}

.tabbar .tab-chip .tab-title {
  display: inline-block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  /* 保证关闭按钮有空间 */
  max-width: calc(100% - 36px);
}

.tabbar .tab-chip .close-mark {
  flex: 0 0 auto;
  margin-left: 6px;
}

.more-wrap {
  position: absolute;
  right: 36px; /* 留出给 tab-add 的空间 */
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  z-index: 70;
  background: transparent;
}

.tab-more {
  border: 0;
  background: transparent;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 16px;
  cursor: pointer;
}

.tab-add {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 72;
  background: transparent;
}

.overflow-pop {
  max-height: 420px; /* 在多数屏幕上一次性显示足够项 */
  overflow-y: auto; /* 允许滚动但隐藏滚动条视觉 */
  -ms-overflow-style: none; /* IE/Edge */
  scrollbar-width: none; /* Firefox */
  padding: 0 6px 0 0; /* 仅为右侧留出少量空间，避免关闭图标被裁切 */
  display: flex;
  flex-direction: column;
  gap: 0; /* 项之间无额外间距 */
  box-sizing: border-box;
}
.overflow-pop::-webkit-scrollbar {
  width: 0;
  height: 0;
}
.overflow-item {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  border-radius: 6px;
  min-width: 150px;
  transition:
    background-color 0.12s ease,
    color 0.12s ease;
  box-sizing: border-box;
  background: transparent;
}
.overflow-item + .overflow-item {
  margin-top: 0; /* 不要额外的项间距 */
}
.overflow-item:hover {
  background: rgba(0, 0, 0, 0.04);
}
.overflow-item .ov-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
  flex: 1 1 auto;
  /* 给关闭按钮留更多空间，避免被遮挡 */
  max-width: calc(100% - 70px);
  color: var(--el-text-color-regular);
  font-size: 13.5px;
}
.overflow-item .close-mark {
  flex: 0 0 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 28px;
  border-radius: 6px;
  color: rgba(0, 0, 0, 0.75); /* 提高对比度，便于识别 */
  box-shadow: none;
}
.overflow-item .close-mark:hover {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.85);
}

/* 放大并突出 el-icon 的视觉 */
.overflow-item .close-mark .el-icon {
  font-size: 16px;
  color: inherit;
  display: inline-flex;
  align-items: center;
}

.tabbar .tab-chip .tab-title {
  display: inline-block;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

.tabbar .tab-chip .close-mark {
  margin-left: 8px;
  flex: 0 0 auto;
}
</style>

/* 全局（非 scoped）样式：仅用于本页面的 el-popover 弹窗自定义 */
<style>
.tabbar-overflow-popper {
  background: var(--el-popover-bg-color);
  border-radius: var(--el-popover-border-radius);
  border: 1px solid var(--el-popover-border-color);
  min-width: 200px; /* 略宽以避免内容被截断，给关闭按钮留出空间 */
  padding: var(--el-popover-padding);
  z-index: var(--el-index-popper);
  color: var(--el-text-color-regular);
  line-height: 1.4;
  font-size: var(--el-popover-font-size);
  box-shadow: var(--el-box-shadow-light);
  overflow-wrap: break-word;
  box-sizing: border-box;
}
</style>
