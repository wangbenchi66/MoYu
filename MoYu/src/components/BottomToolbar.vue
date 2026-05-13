<script setup>
import { ArrowLeft, ArrowRight, Brush, Close, DCaret, Menu, Picture, Refresh, TopRight } from '@element-plus/icons-vue';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import BaseButton from './BaseButton.vue';

const props = defineProps({
  settings: { type: Object, required: true },
  siteZoom: { type: [Number, String], required: true },
  patchSetting: { type: Function, required: true },
  webviewBack: Function,
  webviewForward: Function,
  webviewReload: Function,
  zoomOut: Function,
  zoomIn: Function,
  resetZoom: Function,
  toggleToolbarPinned: Function,
  disableToolbar: Function,
  openExternal: Function,
  toolbarVisible: Boolean,
  toolbarPinned: Boolean,
  toolbarDisabled: Boolean,
  toolbarIconOnly: Boolean,
  toolbarDocked: Boolean,
  hideHandle: Boolean,
  external: { type: Boolean, default: false }
});

const expanded = ref(false);
const containerRef = ref(null);

const popActiveKey = ref(null);
const popValue = ref(0);
const popLeft = ref('50%');
const POP_X_OFFSET = 30;
const draggingKey = ref(null);
const fontRangeRef = ref(null);
const autoRangeRef = ref(null);
let hidePopTimeout = null;


function toggleExpanded() {
  expanded.value = !expanded.value;
}

function collapse() {
  expanded.value = false;
  popActiveKey.value = null;
}


function clearHidePopTimeout() {
  if (hidePopTimeout) { clearTimeout(hidePopTimeout); hidePopTimeout = null; }
}

function computeLeftPct(value, min, max) {
  const v = Number(value);
  if (Number.isNaN(v)) return '50%';
  const mn = Number(min || 0);
  const mx = Number(max || 100);
  const pct = mx === mn ? 50 : Math.max(0, Math.min(100, ((v - mn) / (mx - mn)) * 100));
  return `${pct}%`;
}

function computeLeftFromInput(key, value, min = 0, max = 100) {
  try {
    let el = key === 'font' ? fontRangeRef.value : key === 'auto' ? autoRangeRef.value : null;
    if (el && el.$el) el = el.$el;
    if (el && el instanceof HTMLElement) {
      const mn = Number(min || 0);
      const mx = Number(max || 100);
      let v = Number(value);
      if (Number.isNaN(v)) v = mn + (mx - mn) / 2;
      const ratio = mx === mn ? 0.5 : Math.max(0, Math.min(1, (v - mn) / (mx - mn)));
      const elRect = el.getBoundingClientRect();
      let parent = el.closest && el.closest('.hover-pop');
      if (!parent) parent = el.offsetParent || el.parentElement || document.body;
      const parentRect = parent.getBoundingClientRect();
      const centerX = elRect.left + ratio * elRect.width;
      const leftPx = Math.round(centerX - parentRect.left + POP_X_OFFSET);
      return `${leftPx}px`;
    }
  } catch (e) {}
  return computeLeftPct(value, min, max);
}

function showPop(key, value, min = 0, max = 100) {
  popActiveKey.value = key;
  popValue.value = Number(value || 0);
  popLeft.value = computeLeftFromInput(key, popValue.value, min, max);
  clearHidePopTimeout();
}

function updatePopPosition(value, min = 0, max = 100) {
  popValue.value = Number(value || 0);
  popLeft.value = computeLeftFromInput(draggingKey.value || popActiveKey.value, popValue.value, min, max);
}

function hidePopIfNotDragging(delay = 300) {
  if (draggingKey.value) return;
  clearHidePopTimeout();
  hidePopTimeout = setTimeout(() => { popActiveKey.value = null; hidePopTimeout = null; }, delay);
}

function onPopMouseEnter() { clearHidePopTimeout(); }
function onPopMouseLeave() { hidePopIfNotDragging(); }

function onToggleMouseLeave(e) {
  try {
    const to = e && e.relatedTarget;
    const el = e && e.currentTarget;
    if (to && el) {
      const hover = el.querySelector && el.querySelector('.hover-pop');
      if (hover && (hover === to || hover.contains(to) || el === to || el.contains(to))) return;
    }
  } catch (err) {}
  hidePopIfNotDragging();
}

function onRangePointerDown(key) { draggingKey.value = key; }
function onRangePointerUp() { draggingKey.value = null; }

function onReaderColorInput(e) {
  const v = e.target.value;
  props.patchSetting('readerTextColor', v);
  if (!props.settings.forceReaderTextColor) props.patchSetting('forceReaderTextColor', true);
}

function onFontScaleInput(e) {
  let v;
  if (e === undefined || e === null) v = 100;
  else if (typeof e === 'number' || !e.target) v = Number(e);
  else v = Number(e.target.value || 100);
  props.patchSetting('readerFontScale', v);
  if (!props.settings.forceReaderFont) props.patchSetting('forceReaderFont', true);
  updatePopPosition(v, 80, 160);
}

function onAutoScrollSpeedInput(e) {
  let v;
  if (e === undefined || e === null) v = 22;
  else if (typeof e === 'number' || !e.target) v = Number(e);
  else v = Number(e.target.value || 22);
  props.patchSetting('autoScrollSpeed', v);
  if (!props.settings.autoScrollEnabled) props.patchSetting('autoScrollEnabled', true);
  updatePopPosition(v, 5, 80);
}

function toggleAutoScroll() {
  try { props.patchSetting('autoScrollEnabled', !props.settings.autoScrollEnabled); } catch (e) {}
}

function onZoomWheel(e) {
  try {
    e.preventDefault();
    if (e.deltaY < 0) props.zoomIn && props.zoomIn();
    else props.zoomOut && props.zoomOut();
  } catch (e) {}
}

function onFontWheel(e) {
  try {
    e.preventDefault();
    const cur = Number(props.settings.readerFontScale || 100);
    const delta = e.deltaY < 0 ? 1 : -1;
    onFontScaleInput(Math.max(80, Math.min(160, cur + delta)));
  } catch (e) {}
}

function onAutoScrollWheel(e) {
  try {
    e.preventDefault();
    if (!props.settings.autoScrollEnabled) props.patchSetting('autoScrollEnabled', true);
    adjustAutoSpeed(e.deltaY < 0 ? 3 : -3);
  } catch (e) {}
}

function adjustAutoSpeed(delta) {
  try {
    if (!props.settings.autoScrollEnabled) return;
    const cur = Number(props.settings.autoScrollSpeed || 22);
    let next = Math.round(cur + delta);
    if (next < 5) next = 5;
    if (next > 80) next = 80;
    props.patchSetting('autoScrollSpeed', next);
    updatePopPosition(next, 5, 80);
  } catch (e) {}
}

let _onWindowClick = null;

onMounted(() => {
  window.addEventListener('pointerup', onRangePointerUp);
  _onWindowClick = (ev) => {
    try {
      const el = containerRef.value;
      if (!el) return;
      if (!el.contains(ev.target)) collapse();
    } catch (e) {}
  };
  window.addEventListener('click', _onWindowClick, true);
});

onBeforeUnmount(() => {
  window.removeEventListener('pointerup', onRangePointerUp);
  if (_onWindowClick) {
    window.removeEventListener('click', _onWindowClick, true);
    _onWindowClick = null;
  }
});
</script>

<template>
  <div class="bottom-toolbar-container" ref="containerRef">

    <!-- 热区：鼠标靠近右下角时显示 FAB -->
    <div v-if="!expanded" class="fab-hotzone">
      <button class="fab-btn" @click.stop="toggleExpanded" title="展开工具栏">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
        </svg>
      </button>
    </div>

    <!-- 展开态：倒 L 形布局，向上 + 向左展开 -->
    <template v-if="expanded">
      <!-- 垂直臂：功能按钮整体面板 -->
      <div class="fab-arm fab-arm-up">
        <div class="btn-with-badge" data-id="font">
          <BaseButton class="icon-btn icon-only" :class="{ on: props.settings.forceReaderFont }"
            @click="() => props.patchSetting('forceReaderFont', !props.settings.forceReaderFont)"
            @wheel.prevent="onFontWheel"
            :title="props.settings.forceReaderFont ? `字号 ${Math.round(props.settings.readerFontScale)}%` : '字号'">字</BaseButton>
          <span v-if="props.settings.forceReaderFont" class="val-badge">{{ Math.round(props.settings.readerFontScale) }}</span>
        </div>

        <div class="btn-with-badge" data-id="auto">
          <BaseButton class="icon-btn icon-only" :class="{ on: props.settings.autoScrollEnabled }"
            @click="toggleAutoScroll" @wheel.prevent="onAutoScrollWheel"
            :title="props.settings.autoScrollEnabled ? `自动滚动 ${Math.round(props.settings.autoScrollSpeed)}` : '自动滚动'"><el-icon><DCaret /></el-icon></BaseButton>
          <span v-if="props.settings.autoScrollEnabled" class="val-badge">{{ Math.round(props.settings.autoScrollSpeed) }}</span>
        </div>

        <BaseButton class="icon-btn icon-only" :class="{ on: props.settings.noImageMode }"
          @click="() => props.patchSetting('noImageMode', !props.settings.noImageMode)"
          :title="props.settings.noImageMode ? '显示图片' : '隐藏图片'"><el-icon><Picture /></el-icon></BaseButton>

        <div class="toggle-with-pop" data-id="color"
          @mouseenter="() => showPop('color', props.settings.readerTextColor, 0, 1)"
          @mouseleave="onToggleMouseLeave">
          <BaseButton class="icon-btn icon-only" :class="{ on: props.settings.forceReaderTextColor }"
            @click="() => props.patchSetting('forceReaderTextColor', !props.settings.forceReaderTextColor)" title="文字颜色"><el-icon><Brush /></el-icon></BaseButton>
          <div class="hover-pop" :class="{ visible: popActiveKey === 'color' || draggingKey === 'color' }" @mouseenter="onPopMouseEnter" @mouseleave="onPopMouseLeave">
            <div class="mini-pop-panel">
              <input type="color" :value="props.settings.readerTextColor" @input="onReaderColorInput" />
            </div>
          </div>
        </div>

        <BaseButton class="icon-btn icon-only" :class="{ on: props.settings.showScrollbars }"
          @click="() => props.patchSetting('showScrollbars', !props.settings.showScrollbars)"
          :title="props.settings.showScrollbars ? '隐藏滚动条' : '显示滚动条'"><el-icon><Menu /></el-icon></BaseButton>
      </div>

      <!-- 水平臂：导航按钮整体面板 -->
      <div class="fab-arm fab-arm-left">
        <BaseButton class="icon-btn icon-only" @click="props.webviewBack" title="后退"><el-icon><ArrowLeft /></el-icon></BaseButton>
        <BaseButton class="icon-btn icon-only" @click="props.webviewForward" title="前进"><el-icon><ArrowRight /></el-icon></BaseButton>
        <BaseButton class="icon-btn icon-only" @click="props.webviewReload" title="刷新"><el-icon><Refresh /></el-icon></BaseButton>

        <div class="btn-with-badge">
          <BaseButton class="icon-btn zoom-val-btn" :title="`缩放 ${Math.round(props.siteZoom * 100)}%`" @click="props.resetZoom" @wheel.prevent="onZoomWheel">
            <span class="zoom-val">{{ Math.round(props.siteZoom * 100) }}%</span>
          </BaseButton>
        </div>

        <BaseButton v-if="props.openExternal" class="icon-btn icon-only" title="在浏览器中打开" @click="props.openExternal">
          <el-icon><TopRight /></el-icon>
        </BaseButton>
      </div>

      <!-- FAB 拐角：关闭按钮 -->
      <button class="fab-btn fab-btn-expanded" @click.stop="collapse" title="收起工具栏">
        <el-icon><Close /></el-icon>
      </button>
    </template>
  </div>
</template>

<style scoped>
.bottom-toolbar-container {
  position: absolute;
  right: 8px;
  bottom: 8px;
  z-index: 10001;
  pointer-events: none;
}

/* 热区 */
.fab-hotzone {
  width: 40px;
  height: 40px;
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* FAB 按钮（收起态 + 展开态共用基础样式） */
.fab-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(240, 242, 247, 0.92);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: 0 2px 10px rgba(16, 23, 32, 0.1);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(0, 0, 0, 0.45);
  opacity: 0;
  transition: opacity 200ms ease, transform 150ms ease, box-shadow 150ms ease;
  pointer-events: auto;
}

.fab-hotzone:hover .fab-btn { opacity: 1; }

.fab-btn:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 14px rgba(16, 23, 32, 0.16);
  color: rgba(0, 0, 0, 0.65);
}

/* 展开态 FAB：保持圆形 */
.fab-btn-expanded {
  opacity: 1;
  position: absolute;
  right: 0;
  bottom: 0;
  z-index: 2;
}

/* === 倒 L 形臂（胶囊面板） === */
.fab-arm {
  position: absolute;
  pointer-events: auto;
  display: flex;
  background: rgba(240, 242, 247, 0.94);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: 0 2px 12px rgba(16, 23, 32, 0.12);
  border: 1px solid rgba(0, 0, 0, 0.06);
}

/* 垂直臂 */
.fab-arm-up {
  right: 0px;
  bottom: 38px;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-radius: 16px;
  animation: fab-slide-up 150ms ease-out both;
}

/* 水平臂 */
.fab-arm-left {
  right: 38px;
  bottom: 0px;
  flex-direction: row;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-radius: 16px;
  animation: fab-slide-left 150ms ease-out both;
}

.fab-item {
  pointer-events: auto;
}

@keyframes fab-slide-up {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes fab-slide-left {
  from { opacity: 0; transform: translateX(8px); }
  to   { opacity: 1; transform: translateX(0); }
}

/* hover-pop（颜色选择器弹出） */
.hover-pop {
  position: absolute;
  left: auto;
  right: calc(100% + 6px);
  bottom: 50%;
  transform: translateY(50%) translateX(8px);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease, transform 0.12s ease;
  z-index: 10004;
}

.toggle-with-pop {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.hover-pop.visible,
.toggle-with-pop:hover .hover-pop {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(50%) translateX(0);
}

.mini-pop-panel {
  background: rgba(255, 255, 255, 0.96);
  border-radius: 8px;
  padding: 8px;
  box-shadow: 0 8px 24px rgba(16, 23, 32, 0.12);
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.mini-pop-panel input[type='color'] {
  width: 48px;
  height: 32px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: block;
}

.btn-with-badge {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.val-badge {
  position: absolute;
  top: 1px;
  right: 0;
  font-size: 8px;
  font-weight: 700;
  line-height: 1;
  background: #409eff;
  color: #fff;
  border-radius: 5px;
  padding: 1px 2px;
  pointer-events: none;
  min-width: 10px;
  text-align: center;
}

.zoom-val-btn {
  min-width: 36px;
  text-align: center;
}

.zoom-val {
  font-size: 10px;
  font-weight: 700;
  color: inherit;
  display: inline-block;
  white-space: nowrap;
  min-width: 28px;
  text-align: center;
}

.icon-btn {
  border: 0;
  background: transparent;
  padding: 4px 6px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: background 120ms ease;
}

.icon-btn .el-icon svg {
  width: 14px;
  height: 14px;
  display: block;
}

.icon-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}

.icon-btn.on {
  background: rgba(64, 158, 255, 0.1);
  color: #409eff;
}

.close-toolbar-btn {
  color: rgba(0, 0, 0, 0.4);
  transition: background 150ms ease, color 120ms ease;
}

.close-toolbar-btn:hover {
  background: rgba(235, 84, 84, 0.1) !important;
  color: #eb5454;
}

</style>
