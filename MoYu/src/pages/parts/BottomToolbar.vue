<script setup>
import { ArrowLeft, ArrowRight, Close, Hide, Refresh, View, ZoomIn } from '@element-plus/icons-vue';
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

function adjustAutoSpeed(delta) {
  try {
    const cur = Number(props.settings.autoScrollSpeed || 22);
    const min = 5;
    const max = 80;
    let next = Math.round(cur + delta);
    if (next < min) next = min;
    if (next > max) next = max;
    props.patchSetting('autoScrollSpeed', next);
    // 打开自动滚动以立即生效（如果用户只是调整速度）
    if (!props.settings.autoScrollEnabled) props.patchSetting('autoScrollEnabled', true);
    updatePopPosition(next, 5, 80);
  } catch (e) {}
}

function onGlobalKeydown(e) {
  try {
    // 调试输出，确认是否收到事件
    try {
      console.log('[bottomToolbar] keydown', e && e.key, 'target=', e && e.target && e.target.tagName);
    } catch (e) {}

    // 不在输入或可编辑区域时才响应快捷键
    const active = document && document.activeElement;
    if (active) {
      const tag = (active.tagName || '').toLowerCase();
      const editable = active.isContentEditable;
      if (tag === 'input' || tag === 'textarea' || editable) return;
    }
    // 按键映射："=" 开/关，"[" 慢， "]" 快
    if (e.key === '=') {
      e.preventDefault();
      toggleAutoScroll();
    } else if (e.key === '[') {
      e.preventDefault();
      adjustAutoSpeed(-5);
    } else if (e.key === ']') {
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
  // 全局快捷键用于自动滚动控制（使用 capture 以提高命中率）
  window.addEventListener('keydown', onGlobalKeydown, true);
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
  try {
    window.removeEventListener('keydown', onGlobalKeydown, true);
  } catch (e) {}
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
          data-priority="1"
          @click="props.webviewBack"
          title="后退"
          ><el-icon><ArrowLeft /></el-icon
        ></BaseButton>
        <BaseButton
          class="icon-btn icon-only overflow-candidate"
          data-id="forward"
          data-priority="1"
          @click="props.webviewForward"
          title="前进"
          ><el-icon><ArrowRight /></el-icon
        ></BaseButton>
        <BaseButton
          class="icon-btn icon-only overflow-candidate"
          data-id="reload"
          data-priority="1"
          @click="props.webviewReload"
          title="刷新"
          ><el-icon><Refresh /></el-icon
        ></BaseButton>
      </div>

      <div class="toolbar-center">
        <div
          class="toggle-with-pop overflow-candidate"
          data-id="color"
          data-priority="4"
          @mouseenter="() => showPop('color', props.settings.readerTextColor, 0, 1)"
          @mouseleave="onToggleMouseLeave">
          <BaseButton
            class="icon-btn icon-only"
            :class="{ on: props.settings.forceReaderTextColor }"
            @click="() => props.patchSetting('forceReaderTextColor', !props.settings.forceReaderTextColor)"
            title="文字颜色"
            >A</BaseButton
          >

          <div
            class="hover-pop"
            :class="{ visible: popActiveKey === 'color' || draggingKey === 'color' }"
            @mouseenter="onPopMouseEnter"
            @mouseleave="onPopMouseLeave">
            <div class="range-row">
              <input
                type="color"
                :value="props.settings.readerTextColor"
                @input="onReaderColorInput" />
            </div>
          </div>
        </div>

        <!-- 字号控制 -->
        <div
          class="toggle-with-pop overflow-candidate"
          data-id="font"
          data-priority="4"
          @mouseenter="() => showPop('font', props.settings.readerFontScale, 80, 160)"
          @mouseleave="onToggleMouseLeave">
          <BaseButton
            class="icon-btn icon-only"
            :class="{ on: props.settings.forceReaderFont }"
            @click="() => props.patchSetting('forceReaderFont', !props.settings.forceReaderFont)"
            title="字号"
            >字</BaseButton
          >
          <!-- 数值标签改为在弹出层与滑块同行显示（见下方 range-row 内的标签） -->

          <div
            class="hover-pop"
            :class="{ visible: popActiveKey === 'font' || draggingKey === 'font' }"
            @mouseenter="onPopMouseEnter"
            @mouseleave="onPopMouseLeave">
            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">字号</div>
                <div class="panel-actions">
                  <BaseButton
                    class="mini-reset-icon"
                    title="默认"
                    @click="setFontDefault"
                    >默认</BaseButton
                  >
                </div>
              </div>
              <div class="panel-body">
                <div class="range-row">
                  <el-slider
                    ref="fontRangeRef"
                    data-test="font-range"
                    class="mini-range"
                    :model-value="props.settings.readerFontScale"
                    :min="80"
                    :max="160"
                    @input="onFontScaleInput"
                    @change="onFontScaleInput"
                    @update:modelValue="onFontScaleInput"
                    @pointerdown="() => onRangePointerDown('font')" />
                  <div
                    class="range-anchor"
                    title="回到默认"
                    @click="setFontDefault"
                    :style="{ left: computeLeftFromInput('font', 100, 80, 160) }"></div>
                </div>
                <div class="panel-row">
                  <span>当前 {{ Math.round(props.settings.readerFontScale) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <BaseButton
          class="icon-btn icon-only overflow-candidate"
          data-id="noImage"
          data-priority="3"
          :class="{ on: props.settings.noImageMode }"
          @click="() => props.patchSetting('noImageMode', !props.settings.noImageMode)"
          :title="props.settings.noImageMode ? '显示图片' : '隐藏图片'"
          >🖼</BaseButton
        >
        <BaseButton
          class="icon-btn icon-only overflow-candidate"
          data-id="showScrollbars"
          data-priority="3"
          :class="{ on: props.settings.showScrollbars }"
          @click="() => props.patchSetting('showScrollbars', !props.settings.showScrollbars)"
          :title="props.settings.showScrollbars ? '隐藏滚动条' : '显示滚动条'"
          >≡</BaseButton
        >

        <div
          class="toggle-with-pop overflow-candidate"
          data-id="auto"
          data-priority="4"
          @mouseenter="() => showPop('auto', props.settings.autoScrollSpeed, 5, 80)"
          @mouseleave="onToggleMouseLeave">
          <BaseButton
            class="icon-btn icon-only"
            :class="{ on: props.settings.autoScrollEnabled }"
            @click="() => props.patchSetting('autoScrollEnabled', !props.settings.autoScrollEnabled)"
            :title="props.settings.autoScrollEnabled ? '关闭自动滚动' : '开启自动滚动'"
            >⇳</BaseButton
          >
          <!-- 数值标签改为在弹出层与滑块同行显示（见下方 range-row 内的标签） -->
          <div
            class="hover-pop"
            :class="{ visible: popActiveKey === 'auto' || draggingKey === 'auto' }"
            @mouseenter="onPopMouseEnter"
            @mouseleave="onPopMouseLeave">
            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">自动滚动</div>
                <div class="panel-actions">
                  <BaseButton
                    class="mini-reset-icon"
                    title="重置"
                    @click="setAutoDefault"
                    >重置</BaseButton
                  >
                </div>
              </div>
              <div class="panel-body">
                <div class="range-row">
                  <el-slider
                    ref="autoRangeRef"
                    data-test="auto-range"
                    class="mini-range"
                    :model-value="props.settings.autoScrollSpeed"
                    :min="5"
                    :max="80"
                    @input="onAutoScrollSpeedInput"
                    @change="onAutoScrollSpeedInput"
                    @update:modelValue="onAutoScrollSpeedInput"
                    @pointerdown="() => onRangePointerDown('auto')" />
                </div>
                <div class="panel-row">
                  <span>速度 {{ Math.round(props.settings.autoScrollSpeed) }}</span>
                  <BaseButton
                    class="mini-reset-icon"
                    :class="{ on: props.settings.autoScrollEnabled }"
                    title="开启"
                    @click="() => props.patchSetting('autoScrollEnabled', true)"
                    >开启</BaseButton
                  >
                  <BaseButton
                    class="mini-reset-icon"
                    :class="{ on: !props.settings.autoScrollEnabled }"
                    title="关闭"
                    @click="() => props.patchSetting('autoScrollEnabled', false)"
                    >关闭</BaseButton
                  >
                </div>
                <div class="panel-row">
                  <small style="color: var(--text-muted, #888)">快捷键：<strong>=</strong> 开/关 · <strong>[</strong> 慢 · <strong>]</strong> 快</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="toolbar-right">
        <div class="toggle-with-pop">
          <BaseButton
            class="icon-btn"
            title="缩放"
            @mouseenter="() => showPop('zoom', Math.round(props.siteZoom * 100))"
            @mouseleave="hidePopIfNotDragging">
            <el-icon><ZoomIn /></el-icon>
          </BaseButton>
          <div
            class="hover-pop"
            :class="{ visible: popActiveKey === 'zoom' }"
            @mouseenter="onPopMouseEnter"
            @mouseleave="onPopMouseLeave">
            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">页面缩放</div>
                <div class="panel-actions">
                  <BaseButton
                    class="mini-reset-icon"
                    title="重置"
                    @click="props.resetZoom"
                    >重置</BaseButton
                  >
                </div>
              </div>
              <div class="panel-body">
                <div class="panel-row">
                  <BaseButton
                    class="mini-reset-icon"
                    @click="props.zoomOut"
                    >-</BaseButton
                  >
                  <span style="min-width: 60px; text-align: center; display: inline-block">{{ Math.round(props.siteZoom * 100) }}%</span>
                  <BaseButton
                    class="mini-reset-icon"
                    @click="props.zoomIn"
                    >+</BaseButton
                  >
                </div>
              </div>
            </div>
          </div>
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
          <component
            :is="props.settings.toolbarPinned ? View : Hide"
            style="width: 18px; height: 18px" />
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
          <component
            :is="Close"
            style="width: 18px; height: 18px" />
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* toolbar container (overlay/docked) */
.bottom-toolbar-container.overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 8px;
  /* 保证容器能接收 hover，并置于 webview 之上 */
  z-index: 10001;
  pointer-events: auto;
}

.bottom-toolbar-container.docked {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 8px;
  z-index: 10001;
  pointer-events: auto;
}

.bottom-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  padding: 4px 0;
  border-radius: 0;
  overflow: visible;
  /* 提升到较高层级，避免被 webview 或热区遮挡 */
  position: relative;
  z-index: 10002;
  /* 使用 shell alpha 与标题栏一致，便于 fullWindowTransparent 生效 */
  background: rgba(255, 255, 255, var(--shell-alpha, 1));
  backdrop-filter: blur(8px);
  box-shadow: 0 6px 18px rgba(16, 23, 32, 0.08);
}

/* external 模式：将工具栏作为页面流的一部分渲染（位于父容器内，非 fixed/absolute） */
.bottom-toolbar-container.external {
  position: static;
  left: auto;
  right: auto;
  bottom: auto;
  z-index: auto;
  pointer-events: auto;
}

.bottom-toolbar-container.external .bottom-toolbar {
  position: relative;
  z-index: 1;
  background: rgba(255, 255, 255, var(--shell-alpha, 1));
  box-shadow: 0 6px 18px rgba(16, 23, 32, 0.04);
}

.bottom-toolbar-container.external .toolbar-handle {
  display: none;
}

.bottom-toolbar.hidden {
  transform: translateY(calc(100% + 8px));
  opacity: 0;
  pointer-events: none;
}

/* 悬浮手柄 */
.toolbar-handle {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 6px;
  width: 64px;
  height: 10px;
  border-radius: 8px;
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.04));
  border: 1px solid rgba(0, 0, 0, 0.06);
  cursor: pointer;
  /* 确保手柄始终在最上层，能被鼠标触达 */
  z-index: 10005;
  box-shadow: 0 10px 24px rgba(16, 23, 32, 0.08);
  transition:
    transform 150ms ease,
    opacity 150ms;
}
.toolbar-handle:hover {
  transform: translateX(-50%) translateY(-4px);
  opacity: 1;
}

.bottom-toolbar-container:hover .bottom-toolbar.hidden {
  transform: translateY(0);
  opacity: 1;
  pointer-events: auto;
}
.bottom-toolbar-container.no-hover:hover .bottom-toolbar.hidden {
  transform: translateY(calc(100% + 8px));
  opacity: 0;
  pointer-events: none;
}

.toolbar-left,
.toolbar-center,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
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

/* icon/button visuals */
.icon-btn {
  border: 0;
  background: transparent;
  padding: 6px 8px;
  border-radius: 0;
  cursor: pointer;
  font-size: 14px;
  transition:
    background 120ms ease,
    transform 120ms ease;
}
.icon-btn.on {
  background: rgba(64, 158, 255, 0.1);
  color: #409eff;
}
.close-toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 6px;
  border-radius: 2px;
  transition:
    background 150ms ease,
    transform 120ms ease;
}
.close-toolbar-btn:hover {
  transform: translateY(-2px);
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
