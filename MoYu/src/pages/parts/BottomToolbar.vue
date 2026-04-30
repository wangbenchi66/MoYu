<script setup>
// BottomToolbar.vue
// 本文件负责底部工具栏的 UI 与本地交互控制。
// 主要职责：
// - 渲染底部工具栏、处理溢出和弹层位置
// - 响应工具栏按钮（缩放、刷新、自动滚动、字号、无图等）并通过 patchSetting 更新设置
// - 提供局部全局快捷键处理（onGlobalKeydown），仅在窗口/鼠标在窗内时生效，且避免与渲染进程重复处理
import { ArrowLeft, ArrowRight, Brush, Close, DCaret, Hide, Menu, Picture, Refresh, TopRight, View, ZoomIn } from '@element-plus/icons-vue';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import BaseButton from '../../components/BaseButton.vue';

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

const popActiveKey = ref(null);
const popValue = ref(0);
const popLeft = ref('50%');
const POP_X_OFFSET = 30;
const draggingKey = ref(null);
const fontRangeRef = ref(null);
const autoRangeRef = ref(null);
let hideTimeout = null;
let hidePopTimeout = null;
// container ref and dynamic hotzone height (measured from DOM)
const containerRef = ref(null);
const hotzoneHeight = ref(260);
let _resizeObserver = null;
let _overflowObserver = null;

// overflow handling
const toolbarRef = ref(null);
const overflowIds = ref([]);
const showOverflowMenu = ref(false);

function overflowLabel(id) {
  try {
    switch (id) {
      case 'back':
        return '后退';
      case 'forward':
        return '前进';
      case 'reload':
        return '刷新';
      case 'color':
        return props.settings.forceReaderTextColor ? `文字颜色 (${props.settings.readerTextColor})` : '文字颜色';
      case 'font':
        return `字号 ${Math.round(props.settings.readerFontScale)}`;
      case 'noImage':
        return props.settings.noImageMode ? '显示图片' : '隐藏图片';
      case 'showScrollbars':
        return props.settings.showScrollbars ? '隐藏滚动条' : '显示滚动条';
      case 'auto':
        return props.settings.autoScrollEnabled ? `自动滚动 ${Math.round(props.settings.autoScrollSpeed)}` : '自动滚动';
      case 'zoom':
        return `缩放 ${Math.round(Number(props.siteZoom) * 100)}%`;
      case 'openExternal':
        return '在浏览器中打开';
      case 'zoomOut':
        return '缩小';
      case 'zoomIn':
        return '放大';
      case 'resetZoom':
        return '重置缩放';
      case 'pin':
        return props.settings.toolbarPinned ? '切换显示模式' : '固定工具栏';
      case 'close':
        return '关闭工具栏';
      default:
        return id;
    }
  } catch (e) {
    return id;
  }
}

function onOverflowClick(id) {
  try {
    const map = {
      back: () => props.webviewBack && props.webviewBack(),
      forward: () => props.webviewForward && props.webviewForward(),
      reload: () => props.webviewReload && props.webviewReload(),
      color: () => props.patchSetting('forceReaderTextColor', !props.settings.forceReaderTextColor),
      font: () => props.patchSetting('forceReaderFont', !props.settings.forceReaderFont),
      noImage: () => props.patchSetting('noImageMode', !props.settings.noImageMode),
      showScrollbars: () => props.patchSetting('showScrollbars', !props.settings.showScrollbars),
      auto: () => props.patchSetting('autoScrollEnabled', !props.settings.autoScrollEnabled),
      zoom: () => props.resetZoom && props.resetZoom(),
      openExternal: () => props.openExternal && props.openExternal(),
      zoomOut: () => props.zoomOut && props.zoomOut(),
      zoomIn: () => props.zoomIn && props.zoomIn(),
      resetZoom: () => props.resetZoom && props.resetZoom(),
      pin: () => props.toggleToolbarPinned && props.toggleToolbarPinned(),
      close: () =>
        props.disableToolbar ? props.disableToolbar() : (props.patchSetting('toolbarDisabled', true), props.patchSetting('toolbarVisible', false), props.patchSetting('toolbarPinned', false))
    };
    if (map[id]) map[id]();
  } catch (e) {}
  showOverflowMenu.value = false;
}

function computeOverflow() {
  try {
    const tb = toolbarRef.value;
    if (!tb) return;
    // ensure all candidates visible first
    const candidates = Array.from(tb.querySelectorAll('.overflow-candidate'));
    candidates.forEach((el) => el.classList.remove('overflow-hidden'));

    const toolbarWidth = tb.clientWidth || 0;
    const children = Array.from(tb.children || []);
    let totalWidth = children.reduce((sum, ch) => sum + (ch.offsetWidth || 0), 0);
    const overflowBtn = tb.querySelector('.overflow-btn');
    const overflowBtnWidth = overflowBtn ? overflowBtn.offsetWidth : 40;
    const hidden = [];

    if (totalWidth > toolbarWidth) {
      const candInfos = candidates.map((el) => ({ el, id: el.dataset.id, pr: Number(el.dataset.priority || 10) })).sort((a, b) => b.pr - a.pr);
      for (const c of candInfos) {
        if (!c.el) continue;
        c.el.classList.add('overflow-hidden');
        hidden.push(c.id);
        // recompute width
        const children2 = Array.from(tb.children || []);
        totalWidth = children2.reduce((sum, ch) => sum + (ch.offsetWidth || 0), 0);
        if (totalWidth + overflowBtnWidth <= toolbarWidth) break;
      }
    }
    overflowIds.value = hidden;
  } catch (e) {}
}

function clearHidePopTimeout() {
  if (hidePopTimeout) {
    clearTimeout(hidePopTimeout);
    hidePopTimeout = null;
  }
}
// 全局 pointermove 相关，用于检测鼠标靠近窗口底部时显示工具栏
let _lastNear = false;
let _pmHandler = null;
// NOTE: 不再使用静态 HOTZONE_HEIGHT，使用 `hotzoneHeight` 动态测量

function clearHideTimeout() {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
}

function onContainerMouseEnter() {
  try {
    clearHideTimeout();
    // 当进入容器时确保可见
    try {
      props.patchSetting('toolbarVisible', true);
    } catch (e) {}
  } catch (e) {}
}

function updateHotzoneFromDOM() {
  try {
    const el = containerRef.value;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const h = rect && rect.height ? rect.height : el.offsetHeight || 0;
    // 加上少量缓冲区，保证手柄与弹层也被包含
    hotzoneHeight.value = Math.max(48, Math.round(h + 40));
  } catch (e) {}
}

function toggleHandle() {
  try {
    props.patchSetting('toolbarVisible', !props.toolbarVisible);
  } catch (e) {}
}

function _onPointerMove(e) {
  try {
    if (props.toolbarDisabled || props.toolbarPinned || props.hideHandle) return;
    const y = e && typeof e.clientY === 'number' ? e.clientY : (window.event && window.event.clientY) || 0;
    const winH = window.innerHeight || document.documentElement.clientHeight || 0;
    const near = y >= winH - (hotzoneHeight.value || 260);
    if (near && !_lastNear) {
      _lastNear = true;
      try {
        props.patchSetting('toolbarVisible', true);
      } catch (err) {}
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
    } else if (!near && _lastNear) {
      _lastNear = false;
      // 只有在没有拖拽或弹出时才自动隐藏
      if (!draggingKey.value && !popActiveKey.value && !props.toolbarPinned) {
        clearHideTimeout();
        hideTimeout = setTimeout(() => {
          try {
            props.patchSetting('toolbarVisible', false);
          } catch (e) {}
          hideTimeout = null;
        }, 360);
      }
    }
  } catch (e) {}
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
    // 如果 ref 指向的是组件实例，尝试使用其 $el
    if (el && el.$el) el = el.$el;
    if (el && el instanceof HTMLElement) {
      const mn = Number(min || 0);
      const mx = Number(max || 100);
      let v = Number(value);
      if (Number.isNaN(v)) v = mn + (mx - mn) / 2;
      const ratio = mx === mn ? 0.5 : Math.max(0, Math.min(1, (v - mn) / (mx - mn)));
      const elRect = el.getBoundingClientRect();
      // 寻找最近的 hover-pop 作为定位参考，如果没有则退回到 offsetParent
      let parent = el.closest && el.closest('.hover-pop');
      if (!parent) parent = el.offsetParent || el.parentElement || document.body;
      const parentRect = parent.getBoundingClientRect();
      const centerX = elRect.left + ratio * elRect.width;
      const leftPx = Math.round(centerX - parentRect.left + POP_X_OFFSET);
      return `${leftPx}px`;
    }
  } catch (e) {
    // fallback
  }
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
  hidePopTimeout = setTimeout(() => {
    popActiveKey.value = null;
    hidePopTimeout = null;
  }, delay);
}

function onPopMouseEnter() {
  clearHidePopTimeout();
}

function onPopMouseLeave() {
  hidePopIfNotDragging();
}

function onToggleMouseLeave(e) {
  try {
    const to = e && e.relatedTarget;
    const el = e && e.currentTarget;
    if (to && el) {
      const hover = el.querySelector && el.querySelector('.hover-pop');
      if (hover && (hover === to || hover.contains(to) || el === to || el.contains(to))) {
        return;
      }
    }
  } catch (err) {
    // ignore
  }
  hidePopIfNotDragging();
}

function onContainerMouseLeave(e) {
  try {
    if (props.toolbarPinned || props.toolbarDisabled || props.hideHandle) return;
    const to = e && e.relatedTarget;
    const el = e && e.currentTarget;
    if (to && el) {
      // 如果离开是移动到容器内部的子元素或弹层，则不立即隐藏
      if (el === to || el.contains(to)) return;
      const hover = el.querySelector && el.querySelector('.hover-pop');
      if (hover && (hover === to || hover.contains(to))) return;
    }
    // 只有在没有拖拽且没有弹出项时，立即隐藏工具栏
    if (!draggingKey.value && !popActiveKey.value) {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
      try {
        props.patchSetting('toolbarVisible', false);
      } catch (err) {}
    }
  } catch (err) {}
}

function onRangePointerDown(key) {
  draggingKey.value = key;
}

function onRangePointerUp() {
  draggingKey.value = null;
}

function setFontDefault() {
  const def = 100;
  props.patchSetting('readerFontScale', def);
  if (!props.settings.forceReaderFont) props.patchSetting('forceReaderFont', true);
  updatePopPosition(def, 80, 160);
}

function setAutoDefault() {
  const def = 22;
  props.patchSetting('autoScrollSpeed', def);
  if (!props.settings.autoScrollEnabled) props.patchSetting('autoScrollEnabled', true);
  updatePopPosition(def, 5, 80);
}

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
  try {
    props.patchSetting('autoScrollEnabled', !props.settings.autoScrollEnabled);
  } catch (e) {}
}

// 滚轮操作：缩放
function onZoomWheel(e) {
  try {
    e.preventDefault();
    if (e.deltaY < 0) props.zoomIn && props.zoomIn();
    else props.zoomOut && props.zoomOut();
  } catch (e) {}
}

// 滚轮操作：字号缩放
function onFontWheel(e) {
  try {
    e.preventDefault();
    const cur = Number(props.settings.readerFontScale || 100);
    const delta = e.deltaY < 0 ? 1 : -1;
    onFontScaleInput(Math.max(80, Math.min(160, cur + delta)));
  } catch (e) {}
}

// 滚轮操作：自动滚动速度（未开启时先开启）
function onAutoScrollWheel(e) {
  try {
    e.preventDefault();
    if (!props.settings.autoScrollEnabled) {
      props.patchSetting('autoScrollEnabled', true);
    }
    adjustAutoSpeed(e.deltaY < 0 ? 3 : -3);
  } catch (e) {}
}

function adjustAutoSpeed(delta) {
  try {
    // 仅在自动滚动已开启时调整速度
    if (!props.settings.autoScrollEnabled) return;
    const cur = Number(props.settings.autoScrollSpeed || 22);
    const min = 5;
    const max = 80;
    let next = Math.round(cur + delta);
    if (next < min) next = min;
    if (next > max) next = max;
    props.patchSetting('autoScrollSpeed', next);
    updatePopPosition(next, 5, 80);
  } catch (e) {}
}

function onGlobalKeydown(e) {
  try {
    // 仅在应用/窗口聚焦时响应全局快捷键（避免应用外误触）
    if (typeof document !== 'undefined' && !document.hasFocus()) return;
    // 如果事件已由渲染进程处理，跳过以避免双重切换
    if (e && e.__glassReaderHandled) return;
    // (duplicate-handling guard removed)
    // 调试输出，确认是否收到事件
    // (debug logs removed)

    // 不在输入或可编辑区域时才响应快捷键
    const active = document && document.activeElement;
    if (active) {
      const tag = (active.tagName || '').toLowerCase();
      const editable = active.isContentEditable;
      if (tag === 'input' || tag === 'textarea' || editable) return;
    }
    // 按键映射："=" 开/关，"[" 慢， "]" 快（使用 Alt 修饰键）
    const k = e && e.key;
    // 兼容修饰键带来的符号（例如 Shift+'=' -> '+'）以及不同键盘布局
    const match = (expected) => {
      if (!k || !expected) return false;
      if (k === expected) return true;
      // common shifted counterparts
      if (expected === '=' && k === '+') return true;
      if (expected === '[' && k === '{') return true;
      if (expected === ']' && k === '}') return true;
      return false;
    };

    if (match('=')) {
      e.preventDefault();
      toggleAutoScroll();
    } else if (match('[')) {
      e.preventDefault();
      adjustAutoSpeed(-5);
    } else if (match(']')) {
      e.preventDefault();
      adjustAutoSpeed(5);
    }
  } catch (e) {}
}

onMounted(() => {
  window.addEventListener('pointerup', onRangePointerUp);
  _pmHandler = _onPointerMove;
  window.addEventListener('pointermove', _pmHandler);
  // pointerdown 可以更快响应触摸/点击场景
  window.addEventListener('pointerdown', _pmHandler);
  // 全局快捷键已由 App.vue 的 localShortcutHandler 统一处理，避免重复注册
  // 初次测量并监听大小变化以保持热区与工具栏高度一致
  updateHotzoneFromDOM();
  try {
    if (typeof ResizeObserver !== 'undefined') {
      _resizeObserver = new ResizeObserver(updateHotzoneFromDOM);
      if (containerRef.value) _resizeObserver.observe(containerRef.value);
      const tb = containerRef.value && containerRef.value.querySelector ? containerRef.value.querySelector('.bottom-toolbar') : null;
      if (tb) _resizeObserver.observe(tb);
    }
  } catch (e) {}
  window.addEventListener('resize', updateHotzoneFromDOM);

  // overflow observer and listeners
  try {
    if (typeof ResizeObserver !== 'undefined') {
      _overflowObserver = new ResizeObserver(computeOverflow);
      const tb2 = containerRef.value && containerRef.value.querySelector ? containerRef.value.querySelector('.bottom-toolbar') : null;
      if (tb2) _overflowObserver.observe(tb2);
    }
  } catch (e) {}
  window.addEventListener('resize', computeOverflow);
  // click outside to close overflow menu
  const onWindowClick = (ev) => {
    try {
      const tbEl = toolbarRef.value || (containerRef.value && containerRef.value.querySelector && containerRef.value.querySelector('.bottom-toolbar'));
      if (!tbEl) return;
      if (!tbEl.contains(ev.target)) showOverflowMenu.value = false;
    } catch (e) {}
  };
  window.addEventListener('click', onWindowClick);
  // store handler so we can remove later
  window.__bottomToolbar_onWindowClick = onWindowClick;

  // initial compute
  computeOverflow();
});

onBeforeUnmount(() => {
  window.removeEventListener('pointerup', onRangePointerUp);
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
  if (_pmHandler) {
    try {
      window.removeEventListener('pointermove', _pmHandler);
    } catch (e) {}
    try {
      window.removeEventListener('pointerdown', _pmHandler);
    } catch (e) {}
    _pmHandler = null;
  }
  // keydown 监听由 App.vue 管理，无需在此处移除
  try {
    if (_resizeObserver) {
      try {
        _resizeObserver.disconnect();
      } catch (e) {}
      _resizeObserver = null;
    }
  } catch (e) {}
  try {
    window.removeEventListener('resize', updateHotzoneFromDOM);
  } catch (e) {}
  try {
    if (_overflowObserver) {
      try {
        _overflowObserver.disconnect();
      } catch (e) {}
      _overflowObserver = null;
    }
  } catch (e) {}
  try {
    window.removeEventListener('resize', computeOverflow);
  } catch (e) {}
  try {
    if (window.__bottomToolbar_onWindowClick) {
      window.removeEventListener('click', window.__bottomToolbar_onWindowClick);
      window.__bottomToolbar_onWindowClick = null;
    }
  } catch (e) {}
});
</script>

<template>
  <div
    :class="['bottom-toolbar-container', props.toolbarDocked ? 'docked' : 'overlay', props.toolbarDisabled ? 'no-hover' : '', props.external ? 'external' : '']"
    ref="containerRef"
    @mouseleave="onContainerMouseLeave"
    @mouseenter="onContainerMouseEnter">
    <div
      v-if="!props.toolbarPinned && !props.toolbarVisible && !props.toolbarDisabled && !props.hideHandle"
      class="toolbar-handle"
      @click="toggleHandle"></div>

    <div
      ref="toolbarRef"
      class="bottom-toolbar"
      :class="{ hidden: !props.toolbarVisible, 'icon-mode': props.toolbarIconOnly }">
      <div class="toolbar-left">
        <BaseButton
          class="icon-btn icon-only overflow-candidate"
          data-id="back"
          data-priority="10"
          @click="props.webviewBack"
          title="后退"
          ><el-icon><ArrowLeft /></el-icon
        ></BaseButton>
        <BaseButton
          class="icon-btn icon-only overflow-candidate"
          data-id="forward"
          data-priority="10"
          @click="props.webviewForward"
          title="前进"
          ><el-icon><ArrowRight /></el-icon
        ></BaseButton>
        <BaseButton
          class="icon-btn icon-only overflow-candidate"
          data-id="reload"
          data-priority="10"
          @click="props.webviewReload"
          title="刷新"
          ><el-icon><Refresh /></el-icon
        ></BaseButton>
      </div>

      <div class="toolbar-center">
        <!-- 字号：点击开关，滚轮调大小，开启时显示当前倍率 -->
        <div class="btn-with-badge overflow-candidate" data-id="font" data-priority="2">
          <BaseButton
            class="icon-btn icon-only"
            :class="{ on: props.settings.forceReaderFont }"
            @click="() => props.patchSetting('forceReaderFont', !props.settings.forceReaderFont)"
            @wheel.prevent="onFontWheel"
            :title="props.settings.forceReaderFont
              ? `字号 ${Math.round(props.settings.readerFontScale)}%（滚轮调整，点击关闭）`
              : '字号（点击开启，滚轮调整大小）'"
            >字</BaseButton
          >
          <span v-if="props.settings.forceReaderFont" class="val-badge">{{ Math.round(props.settings.readerFontScale) }}</span>
        </div>

        <!-- 自动滚动：点击开关，滚轮调速，开启时显示速度 -->
        <div class="btn-with-badge overflow-candidate" data-id="auto" data-priority="2">
          <BaseButton
            class="icon-btn icon-only"
            :class="{ on: props.settings.autoScrollEnabled }"
            @click="toggleAutoScroll"
            @wheel.prevent="onAutoScrollWheel"
            :title="props.settings.autoScrollEnabled
              ? `自动滚动 速度${Math.round(props.settings.autoScrollSpeed)}（滚轮调速，点击关闭）`
              : '自动滚动（点击开启，滚轮调速）'"
            ><el-icon><DCaret /></el-icon></BaseButton
          >
          <span v-if="props.settings.autoScrollEnabled" class="val-badge">{{ Math.round(props.settings.autoScrollSpeed) }}</span>
        </div>

        <!-- 图片：切换隐藏/显示 -->
        <BaseButton
          class="icon-btn icon-only overflow-candidate"
          data-id="noImage"
          data-priority="2"
          :class="{ on: props.settings.noImageMode }"
          @click="() => props.patchSetting('noImageMode', !props.settings.noImageMode)"
          :title="props.settings.noImageMode ? '显示图片' : '隐藏图片'"
          ><el-icon><Picture /></el-icon></BaseButton
        >

        <!-- 文字颜色（溢出优先级低） -->
        <div
          class="toggle-with-pop overflow-candidate"
          data-id="color"
          data-priority="10"
          @mouseenter="() => showPop('color', props.settings.readerTextColor, 0, 1)"
          @mouseleave="onToggleMouseLeave">
          <BaseButton
            class="icon-btn icon-only"
            :class="{ on: props.settings.forceReaderTextColor }"
            @click="() => props.patchSetting('forceReaderTextColor', !props.settings.forceReaderTextColor)"
            title="文字颜色"
            ><el-icon><Brush /></el-icon></BaseButton
          >
          <div
            class="hover-pop"
            :class="{ visible: popActiveKey === 'color' || draggingKey === 'color' }"
            @mouseenter="onPopMouseEnter"
            @mouseleave="onPopMouseLeave">
            <div class="mini-pop-panel">
              <input type="color" :value="props.settings.readerTextColor" @input="onReaderColorInput" />
            </div>
          </div>
        </div>

        <!-- 滚动条（溢出优先级低） -->
        <BaseButton
          class="icon-btn icon-only overflow-candidate"
          data-id="showScrollbars"
          data-priority="2"
          :class="{ on: props.settings.showScrollbars }"
          @click="() => props.patchSetting('showScrollbars', !props.settings.showScrollbars)"
          :title="props.settings.showScrollbars ? '隐藏滚动条' : '显示滚动条'"
          ><el-icon><Menu /></el-icon></BaseButton
        >
      </div>

      <div class="toolbar-right">
        <BaseButton
          v-if="props.openExternal"
          class="icon-btn icon-only overflow-candidate"
          data-id="openExternal"
          data-priority="10"
          title="在浏览器中打开"
          @click="props.openExternal">
          <el-icon><TopRight /></el-icon>
        </BaseButton>

        <!-- 缩放：显示当前百分比，点击重置，滚轮调整 -->
        <div class="btn-with-badge overflow-candidate" data-id="zoom" data-priority="10">
          <BaseButton
            class="icon-btn zoom-val-btn"
            :title="`缩放 ${Math.round(props.siteZoom * 100)}%（滚轮调整，点击重置）`"
            @click="props.resetZoom"
            @wheel.prevent="onZoomWheel">
            <span class="zoom-val">{{ Math.round(props.siteZoom * 100) }}%</span>
          </BaseButton>
        </div>

        <BaseButton
          v-if="overflowIds.length"
          class="icon-btn overflow-btn"
          @click="showOverflowMenu = !showOverflowMenu"
          title="更多">
          ...
        </BaseButton>
        <div
          v-if="showOverflowMenu && overflowIds.length"
          class="overflow-menu">
          <div
            v-for="id in overflowIds"
            :key="id"
            class="overflow-item"
            @click="onOverflowClick(id)">
            {{ overflowLabel(id) }}
          </div>
        </div>

        <BaseButton
          data-test="pin-toggle"
          class="icon-btn hide-toolbar-btn icon-only overflow-candidate"
          data-id="pin"
          data-priority="1"
          @click="props.toggleToolbarPinned"
          :title="props.settings.toolbarPinned ? '切换到移入显示/移出隐藏' : '切换到始终显示'">
          <el-icon><component :is="props.settings.toolbarPinned ? View : Hide" /></el-icon>
        </BaseButton>

        <BaseButton
          data-test="close-toolbar"
          class="icon-btn close-toolbar-btn icon-only overflow-candidate"
          data-id="close"
          data-priority="1"
          @click="
            props.disableToolbar ? props.disableToolbar() : (props.patchSetting('toolbarDisabled', true), props.patchSetting('toolbarVisible', false), props.patchSetting('toolbarPinned', false))
          "
          title="关闭工具栏（不再移入显示）">
          <el-icon><Close /></el-icon>
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* toolbar container — 右下角浮动胶囊，不铺满 */
.bottom-toolbar-container.overlay {
  position: absolute;
  right: 16px;
  left: auto;
  bottom: 14px;
  width: max-content;
  max-width: calc(100% - 32px);
  /* 保证容器能接收 hover，并置于 webview 之上 */
  z-index: 10001;
  pointer-events: auto;
}

.bottom-toolbar-container.docked {
  position: fixed;
  right: 16px;
  left: auto;
  bottom: 14px;
  width: max-content;
  max-width: calc(100vw - 32px);
  z-index: 10001;
  pointer-events: auto;
}

.bottom-toolbar {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 4px;
  width: max-content;
  max-width: 100%;
  box-sizing: border-box;
  padding: 4px 8px;
  border-radius: 20px;
  overflow: visible;
  position: relative;
  z-index: 10002;
  /* 固定背景：不随 fullWindowTransparent / pageTransparentMode 消失，确保工具栏始终可见 */
  background: rgba(240, 242, 247, 0.92);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: 0 4px 20px rgba(16, 23, 32, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.7);
}

/* external 模式（App.vue 外挂渲染） */
.bottom-toolbar-container.external {
  position: absolute;
  right: 16px;
  left: auto;
  bottom: 14px;
  width: max-content;
  max-width: calc(100% - 32px);
  z-index: 10001;
  pointer-events: auto;
}

.bottom-toolbar-container.external .bottom-toolbar {
  position: relative;
  z-index: 1;
  background: rgba(240, 242, 247, 0.92);
  box-shadow: 0 4px 16px rgba(16, 23, 32, 0.1);
}

.bottom-toolbar-container.external .toolbar-handle {
  display: none;
}

.bottom-toolbar.hidden {
  transform: translateY(calc(100% + 20px));
  opacity: 0;
  pointer-events: none;
}

/* 悬浮手柄（右下角） */
.toolbar-handle {
  position: absolute;
  right: 0;
  bottom: 6px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(0, 0, 0, 0.1);
  cursor: pointer;
  z-index: 10005;
  box-shadow: 0 4px 12px rgba(16, 23, 32, 0.12);
  transition: transform 150ms ease, opacity 150ms, box-shadow 150ms ease;
  display: flex;
  align-items: center;
  justify-content: center;
}
.toolbar-handle::before {
  content: '≡';
  font-size: 14px;
  color: rgba(0, 0, 0, 0.4);
  line-height: 1;
}
.toolbar-handle:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 20px rgba(16, 23, 32, 0.16);
  opacity: 1;
}

.bottom-toolbar-container:hover .bottom-toolbar.hidden {
  transform: translateY(0);
  opacity: 1;
  pointer-events: auto;
}
.bottom-toolbar-container.no-hover:hover .bottom-toolbar.hidden {
  transform: translateY(calc(100% + 20px));
  opacity: 0;
  pointer-events: none;
}

.toolbar-left,
.toolbar-center,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 2px;
}
.zoom-label {
  min-width: 48px;
  text-align: center;
  font-weight: 600;
}
.mini-range {
  width: 110px;
  height: 28px;
}
.slider-inline-values {
  display: none;
}
.slider-inline-value {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.72);
  margin-left: 6px;
  min-width: 40px;
  text-align: center;
  display: inline-block;
}
.bottom-toolbar.icon-mode .slider-inline-value {
  display: none;
}
.hover-pop {
  position: absolute;
  bottom: calc(100% - 8px);
  left: 50%;
  transform: translateX(-50%) translateY(12px);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
  background: transparent;
  padding: 0;
  border-radius: 0;
  box-shadow: 0 8px 24px rgba(16, 23, 32, 0.12);
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
  transform: translateX(-50%) translateY(0);
}

.pop-value {
  position: absolute;
  top: -26px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
  padding: 3px 6px;
  border-radius: 4px;
  font-size: 12px;
  z-index: 10005;
}

/* 更紧凑的滑块容器：在窄面板下滑块占满可用剩余空间 */
.panel .range-row {
  gap: 6px;
}
.panel .mini-range[style] {
  width: 100% !important;
}

/* 数值标签样式 */
.panel .panel-row span {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.72);
}

.panel .mini-range {
  width: 120px;
  height: 28px;
}

/* 带角标的按钮容器 */
.btn-with-badge {
  position: relative;
  display: inline-flex;
  align-items: center;
}

/* 数值角标（字号/滚动速度） */
.val-badge {
  position: absolute;
  top: 1px;
  right: 0px;
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

/* 缩放百分比按钮 */
.zoom-val-btn {
  min-width: 36px;
  text-align: center;
}

/* 缩放数值文字 */
.zoom-val {
  font-size: 10px;
  font-weight: 700;
  color: inherit;
  display: inline-block;
  white-space: nowrap;
  min-width: 28px;
  text-align: center;
}

/* 颜色选择器小面板 */
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

/* icon/button visuals */
.icon-btn {
  border: 0;
  background: transparent;
  padding: 4px 6px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition:
    background 120ms ease,
    transform 120ms ease;
}

/* 统一图标尺寸 */
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
  transition:
    background 150ms ease,
    color 120ms ease;
}

.close-toolbar-btn:hover {
  background: rgba(235, 84, 84, 0.1) !important;
  color: #eb5454;
}

.mini-reset-icon {
  border: 0;
  background: transparent;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0;
  cursor: pointer;
  font-size: 14px;
  color: #444;
}
.mini-reset-icon:hover {
  background: rgba(0, 0, 0, 0.06);
}

.range-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
}
.range-anchor {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 12px;
  height: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.range-anchor::before {
  content: '';
  display: block;
  width: 2px;
  height: 10px;
  background: rgba(64, 158, 255, 0.9);
  border-radius: 2px;
}

/* overflow handling */
.overflow-hidden {
  display: none !important;
}
.overflow-btn {
  padding: 6px 10px;
  font-weight: 700;
}
.overflow-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  background: var(--surface);
  box-shadow: 0 8px 24px rgba(16, 23, 32, 0.12);
  border-radius: 4px;
  padding: 6px 8px;
  z-index: 10006;
  min-width: 140px;
}
.overflow-item {
  padding: 6px 8px;
  cursor: pointer;
  border-radius: 3px;
  font-size: 13px;
}
.overflow-item:hover {
  background: rgba(0, 0, 0, 0.04);
}

/* panel styles matching image */
.panel {
  min-width: 180px;
  max-width: 260px;
  background: var(--surface);
  border-radius: 8px;
  box-shadow: 0 14px 34px rgba(16, 23, 32, 0.16);
  overflow: visible;
  position: relative;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
}
.panel-title {
  font-weight: 600;
}
.panel-actions {
  display: flex;
  gap: 8px;
}
.panel-body {
  padding: 8px 12px;
}
.panel-row {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.panel .mini-reset-icon {
  font-size: 13px;
  width: 40px;
}
.panel .mini-range {
  width: 140px;
  height: 28px;
}

/* 小箭头 */
.panel::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -8px;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 8px solid var(--surface);
}

/* highlight state for panel buttons */
.panel .mini-reset-icon.on {
  background: rgba(64, 158, 255, 0.12);
  color: #409eff;
}
.range-anchor:hover::before {
  background: #2b88ff;
}
.range-default {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.46);
  font-weight: 400;
  margin-left: 6px;
}
.range-current {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.8);
  font-weight: 600;
  margin-left: 6px;
}
</style>
