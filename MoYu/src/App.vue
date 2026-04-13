<script setup>
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import ShortcutRow from './components/ShortcutRow.vue';
import { useDesktopApp } from './composables/useDesktopApp';
import TopBar from './layouts/TopBar.vue';
import MainPage from './pages/MainPage.vue';
import BottomToolbar from './pages/parts/BottomToolbar.vue';
import TabBar from './pages/parts/TabBar.vue';
import defaultSettings from './shared/defaultSettings.js';

const {
  settings,
  statusMessage,
  shellClasses,
  themeVars,
  handleMinimize,
  handleMaximize,
  handleClose,
  patchSetting,
  initializeDesktopApp,
  disposeDesktopApp,
  leftToggleKeys,
  rightToggleKeys,
  tabs,
  activeTabId,
  selectTab,
  closeTab,
  addNewTab,
  createPageTab,
  closeTabsToLeft,
  closeTabsToRight,
  closeAllTabs,
  toggleSetting,
  urlInput,
  handleOpenUrl
} = useDesktopApp();
const desktopApi = typeof window !== 'undefined' ? window.desktop : null;

// 说明：
// 1. 本文件为渲染进程入口，负责窗口级别的 UI 与全局快捷键处理。
// 2. 主要职责包括：管理设置面板、捕获与匹配快捷键、协调 BottomToolbar 与 MainPage 的交互、以及窗口热区/悬停逻辑。
// 3. 关键事件：window 的 keydown（快捷键捕获）、pointermove（热区检测）、mouseout/blur（失焦/移出回退处理）。

const isSettingsOpen = ref(false);
let removeOpenSettingsListener = null;
const editingShortcut = ref(null);
const capturedAccel = ref('');
const autoRangeRef = ref(null);
// 当开启 hoverHeaderMode 时，记录是否处于“悬停激活”状态（由全局鼠标位置控制）
const headerHoverActive = ref(false);

// 引用 MainPage 实例，以便将 BottomToolbar 渲染在 MainPage 之外（位于 MainPage 下面）
const mainPageRef = ref(null);

// 为 BottomToolbar 准备需要的 props（从 MainPage expose 的实例中读取）
const toolbarProps = computed(() => {
  const mp = mainPageRef.value;
  const eff = mp && mp.effectiveToolbar ? (mp.effectiveToolbar.value ?? mp.effectiveToolbar) : null;
  return {
    settings: mp ? mp.settings : settings,
    siteZoom: mp ? (mp.siteZoom ?? 1) : 1,
    patchSetting: mp ? mp.patchSetting : patchSetting,
    webviewBack: mp && mp.webviewBack ? mp.webviewBack : () => {},
    webviewForward: mp && mp.webviewForward ? mp.webviewForward : () => {},
    webviewReload: mp && mp.webviewReload ? mp.webviewReload : () => {},
    zoomIn: mp && mp.zoomIn ? mp.zoomIn : () => {},
    zoomOut: mp && mp.zoomOut ? mp.zoomOut : () => {},
    resetZoom: mp && mp.resetZoom ? mp.resetZoom : () => {},
    toggleToolbarPinned: mp && mp.toggleToolbarPinned ? mp.toggleToolbarPinned : () => {},
    disableToolbar: mp && mp.disableToolbar ? mp.disableToolbar : () => {},
    toolbarVisible: eff ? (eff.visible ?? false) : settings.toolbarVisible,
    toolbarPinned: eff ? (eff.pinned ?? false) : settings.toolbarPinned,
    toolbarDisabled: eff ? (eff.disabled ?? false) : settings.toolbarDisabled,
    toolbarIconOnly: eff ? (eff.iconOnly ?? false) : false,
    toolbarDocked: eff ? (eff.docked ?? false) : settings.toolbarDocked,
    hideHandle: eff ? (eff.hideHandle ?? false) : false,
    external: true
  };
});

// 动态热区 + pointermove 实现，行为与 BottomToolbar 类似：移入显示，移出立即隐藏
const hotzoneHeight = ref(28);
let _resizeObserver = null;
let _pmHandler = null;
let _mouseInsideWindow = false;
let _lastNear = false;
// 缓存常用 DOM 元素，避免在频繁事件中反复查询
let _topbarEl = null;
let _hzEl = null;

/**
 * 更新热区高度并缓存相关 DOM 元素
 * 说明：读取 `.header-hotzone` 的高度并保存在 `hotzoneHeight` 中，
 *      同时缓存 `.topbar` / `.header-hotzone` 元素引用以供事件处理使用，
 *      避免高频事件中反复执行 `querySelector`。
 */
function updateHotzoneFromDOM() {
  try {
    _hzEl = document && document.querySelector ? document.querySelector('.header-hotzone') : null;
    _topbarEl = document && document.querySelector ? document.querySelector('.topbar') : null;
    if (!_hzEl) return;
    const rect = _hzEl.getBoundingClientRect();
    const h = rect && rect.height ? rect.height : _hzEl.offsetHeight || 0;
    // 加少量缓冲，包含 title-drag 区域
    hotzoneHeight.value = Math.max(24, Math.round(h + 8));
  } catch (e) {}
}

// 说明：更新热区高度并缓存 DOM 引用
// - 用于 hoverHeaderMode 功能：当鼠标靠近顶部热区时显示标题栏
// - 减少频繁的 querySelector 调用，性能优化

/**
 * 全局 pointermove 处理器
 * - 当开启 `hoverHeaderMode` 时，根据鼠标 Y 坐标判断是否进入热区
 * - 进入热区立即将 `headerHoverActive` 置为 true，离开立即置为 false
 * - 使用 `hotzoneHeight`（由 `updateHotzoneFromDOM` 动态计算）
 */
function _onPointerMoveForHeader(e) {
  try {
    if (!settings.hoverHeaderMode) {
      if (headerHoverActive.value) headerHoverActive.value = false;
      return;
    }
    const y = e && typeof e.clientY === 'number' ? e.clientY : 0;
    const near = y <= (hotzoneHeight.value || 28);
    if (near && !_lastNear) {
      _lastNear = true;
      if (!headerHoverActive.value) headerHoverActive.value = true;
    } else if (!near && _lastNear) {
      _lastNear = false;
      // 立即隐藏（与底部工具栏的 container mouseleave 行为一致）
      if (headerHoverActive.value) headerHoverActive.value = false;
    }
  } catch (e) {}
}

// 说明：全局 pointermove 处理器，用于检测光标是否进入顶部热区
// - 当 hoverHeaderMode 开启时会触发 headerHoverActive 的开关
// - 仅触发 UI 状态，不直接修改 DOM

function onWindowMouseOut(e) {
  try {
    // 当鼠标移出窗口（relatedTarget 为 null）时立即隐藏
    const to = e && e.relatedTarget;
    if (!to) {
      _mouseInsideWindow = false;
      if (headerHoverActive.value) headerHoverActive.value = false;
    }
  } catch (e) {}
}

function onWindowMouseOver() {
  try {
    _mouseInsideWindow = true;
  } catch (e) {}
}

function onWindowBlur() {
  try {
    if (headerHoverActive.value) headerHoverActive.value = false;
  } catch (e) {}
}

// 说明：当窗口失焦时的回退处理
// - 用于关闭 hoverHeaderMode 的显示状态，避免在失焦时仍保持悬停显示

// 鼠标移入/移出处理，参考 BottomToolbar 的 container mouseenter/leave
function clearHeaderHideTimeout() {
  // placeholder if later需要延迟隐藏
}

function onHeaderMouseEnter(e) {
  try {
    clearHeaderHideTimeout();
    if (!headerHoverActive.value) headerHoverActive.value = true;
  } catch (e) {}
}

function onHeaderMouseLeave(e) {
  try {
    const to = e && e.relatedTarget;
    // 如果移动目标仍在 topbar 或 header-hotzone 内，则不隐藏
    if (to) {
      if (_topbarEl && (_topbarEl === to || _topbarEl.contains(to))) return;
      if (_hzEl && (_hzEl === to || _hzEl.contains(to))) return;
    }
    if (headerHoverActive.value) headerHoverActive.value = false;
  } catch (e) {}
}

function onTopbarMouseEnter(e) {
  try {
    clearHeaderHideTimeout();
    if (!headerHoverActive.value) headerHoverActive.value = true;
  } catch (e) {}
}

function onTopbarMouseLeave(e) {
  try {
    const to = e && e.relatedTarget;
    if (to) {
      if (_hzEl && (_hzEl === to || _hzEl.contains(to))) return;
      if (_topbarEl && (_topbarEl === to || _topbarEl.contains(to))) return;
    }
    if (headerHoverActive.value) headerHoverActive.value = false;
  } catch (e) {}
}

function formatAcceleratorFromEvent(e) {
  // 将原生键事件格式化为可展示与可比较的“Accelerator”字符串
  // 返回示例: "Ctrl+Alt+T" 或 "Shift+="
  // 说明：用于在 UI 中展示快捷键及在代码中与设置项进行精确匹配。
  const isModifierOnly = (k) => ['Control', 'Shift', 'Alt', 'Meta'].includes(k);
  if (isModifierOnly(e.key)) {
    return null;
  }

  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');

  const map = {
    ' ': 'Space',
    Escape: 'Esc',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right'
  };

  let keyName = map[e.key] || e.key;
  // 当 Shift 被按下且 e.key 返回的是符号（如 '+' / '{' / '}'），将其映射回基础键
  const shiftReverseMap = { '+': '=', '{': '[', '}': ']' };
  if (e.shiftKey && shiftReverseMap[keyName]) {
    keyName = shiftReverseMap[keyName];
  }
  if (keyName.length === 1) keyName = keyName.toUpperCase();
  // 对于 FunctionKeys F1..F12 保持原样
  parts.push(keyName);
  return parts.join('+');
}

function formatTabTitle(title) {
  const s = (title ?? '').toString().trim();
  const limit = 10; // 超过 10 个字符则截断
  if (!s) return '';
  return s.length <= limit ? s : s.slice(0, limit) + '…';
}

function _onCaptureKeydown(e) {
  // 用于快捷键编辑器：拦截一次按键并将其转为规范化的 Accelerator 存放到 capturedAccel
  e.preventDefault();
  const acc = formatAcceleratorFromEvent(e);
  if (!acc) return;
  capturedAccel.value = acc;
}

function startEditShortcut(key) {
  // 进入指定快捷键的编辑模式：开始监听 keydown 捕获下一次按键
  editingShortcut.value = key;
  capturedAccel.value = settings[key] || '';
  window.addEventListener('keydown', _onCaptureKeydown);
}

function confirmShortcut(key) {
  // 结束编辑并保存：停止监听并将捕获到的 Accelerator 写入设置
  window.removeEventListener('keydown', _onCaptureKeydown);
  editingShortcut.value = null;
  if (capturedAccel.value) {
    patchSetting(key, capturedAccel.value);
    if (desktopApi?.log) {
      try {
        desktopApi.log(`[renderer] shortcut set ${key} -> ${capturedAccel.value}`);
      } catch (e) {}
    }
  }
  capturedAccel.value = '';
}

function cancelShortcut() {
  // 取消快捷键编辑：清理状态
  window.removeEventListener('keydown', _onCaptureKeydown);
  editingShortcut.value = null;
  capturedAccel.value = '';
}

function clearCaptured(key) {
  if (editingShortcut.value !== key) return;
  // 清除已配置的快捷键（将对应设置设为空）
  window.removeEventListener('keydown', _onCaptureKeydown);
  try {
    patchSetting(key, '');
    if (desktopApi?.log) {
      try {
        desktopApi.log(`[renderer] shortcut cleared ${key}`);
      } catch (e) {}
    }
  } catch (e) {}
  editingShortcut.value = null;
  capturedAccel.value = '';
}

function openSettingsModal() {
  // 当打开设置时，临时确保窗口可接收鼠标事件，避免被鼠标穿透挡住设置交互
  isSettingsOpen.value = true;
  if (desktopApi?.setIgnoreMouseEvents) {
    try {
      desktopApi.setIgnoreMouseEvents(false);
    } catch (e) {}
  }
}

async function restoreDefaults() {
  try {
    await ElMessageBox.confirm('恢复默认配置将重置各种开关与快捷键为默认值（不会清空浏览器缓存）。是否继续？', '恢复默认设置', {
      confirmButtonText: '继续',
      cancelButtonText: '取消',
      type: 'warning'
    });

    // 二次确认
    await ElMessageBox.confirm('再次确认：将仅恢复各种开关与全局快捷键到默认值。是否立即应用？', '请再次确认', {
      confirmButtonText: '恢复',
      cancelButtonText: '取消',
      type: 'warning'
    });

    const defaults = defaultSettings || {};
    // 收集需要恢复的开关键（来源于 leftToggleKeys / rightToggleKeys）
    const toggleKeys = [];
    for (const it of leftToggleKeys) toggleKeys.push(it.key);
    for (const it of rightToggleKeys) toggleKeys.push(it.key);
    // 补充 UI 中存在但不在两个数组里的开关
    const extraToggleKeys = ['toolbarPinned', 'toolbarDisabled'];
    for (const k of extraToggleKeys) if (!toggleKeys.includes(k)) toggleKeys.push(k);

    // 全局快捷键列表（仅恢复这些快捷键）
    const shortcutKeys = ['bossKey', 'decreaseTransparencyShortcut', 'increaseTransparencyShortcut', 'clickThroughShortcut', 'autoToggleShortcut', 'autoSpeedDownShortcut', 'autoSpeedUpShortcut'];

    const keysToRestore = Array.from(new Set([...toggleKeys, ...shortcutKeys]));

    // 构建仅包含待恢复键的默认设置对象
    const subset = {};
    for (const k of keysToRestore) {
      if (Object.prototype.hasOwnProperty.call(defaults, k)) {
        subset[k] = defaults[k];
      }
    }

    // 优先通过主进程批量写入（如果可用），否则逐项 patch
    if (typeof window !== 'undefined' && window.desktop && window.desktop.updateSettings) {
      try {
        const ns = await window.desktop.updateSettings({ ...subset });
        if (ns && settings) Object.assign(settings, ns);
        ElMessage({ message: '已恢复默认设置（仅开关与快捷键）', type: 'success' });
      } catch (err) {
        ElMessage({ message: '恢复默认设置失败', type: 'error' });
      }
    } else {
      // 回退：通过 patchSetting 更新每一项
      for (const [k, v] of Object.entries(subset)) {
        patchSetting(k, v);
      }
      ElMessage({ message: '已恢复默认设置（本地，仅开关与快捷键）', type: 'success' });
    }

    // 不自动关闭设置面板，保留当前页面以便用户查看结果
  } catch (err) {
    // 用户取消或出错，什么也不做
  }
}

function closeSettingsModal() {
  isSettingsOpen.value = false;
  // 关闭设置后，恢复当前持久设置中的 clickThroughMode 状态
  if (desktopApi?.getSettings && desktopApi?.setIgnoreMouseEvents) {
    try {
      desktopApi
        .getSettings()
        .then((s) => {
          try {
            desktopApi.setIgnoreMouseEvents(!!s.clickThroughMode);
          } catch (e) {}
        })
        .catch(() => {});
    } catch (e) {}
  }
}

function handleKeydown(event) {
  if (event.key === 'Escape' && isSettingsOpen.value) {
    if (editingShortcut.value) {
      cancelShortcut();
      return;
    }
    closeSettingsModal();
  }
}

function togglePin() {
  patchSetting('alwaysOnTop', !settings.alwaysOnTop);
}

function handleTransparencyInput(e) {
  const v = Number(e.target.value || 0);
  console.log('[renderer] handleTransparencyInput', v, { hasSetTransparency: !!desktopApi?.setTransparency, hasUpdateSettings: !!desktopApi?.updateSettings });
  if (desktopApi?.log) {
    try {
      desktopApi.log(`[renderer] handleTransparencyInput ${v} hasSetTransparency=${!!desktopApi?.setTransparency}`);
    } catch (err) {}
  }
  patchSetting('transparency', v);

  if (desktopApi?.setTransparency) {
    desktopApi.setTransparency(v).catch(() => {});
  }

  if (desktopApi?.updateSettings) {
    desktopApi
      .updateSettings({ ...settings })
      .then((ns) => {
        console.log('[renderer] updateSettings result', ns);
      })
      .catch((err) => {
        console.warn('[renderer] updateSettings failed', err);
      });
  }
}

async function testSetTransparency() {
  if (!desktopApi?.setTransparency) {
    console.warn('[renderer] desktopApi.setTransparency not available');
    return;
  }

  try {
    const res = await desktopApi.setTransparency(50);
    console.log('[renderer] testSetTransparency result', res);
    if (desktopApi?.log) {
      try {
        desktopApi.log(`[renderer] testSetTransparency result ${JSON.stringify(res)}`);
      } catch (e) {}
    }
  } catch (err) {
    console.warn('[renderer] testSetTransparency failed', err);
  }
}

function openDefaultUrl() {
  urlInput.value = settings.defaultUrl === 'about:blank' ? '' : settings.defaultUrl;
  handleOpenUrl();
}

onMounted(() => {
  initializeDesktopApp();
  console.log('[renderer] desktopApi present', !!desktopApi, { setTransparency: !!desktopApi?.setTransparency, updateSettings: !!desktopApi?.updateSettings, log: !!desktopApi?.log });
  window.addEventListener('keydown', handleKeydown);
  // 全局 pointermove 监听：用于 hover 标题栏逻辑（与底部工具栏一致）
  try {
    updateHotzoneFromDOM();
    if (typeof ResizeObserver !== 'undefined') {
      _resizeObserver = new ResizeObserver(updateHotzoneFromDOM);
      const hz = document && document.querySelector ? document.querySelector('.header-hotzone') : null;
      const tb = document && document.querySelector ? document.querySelector('.topbar') : null;
      if (hz) _resizeObserver.observe(hz);
      if (tb) _resizeObserver.observe(tb);
    }
    _pmHandler = _onPointerMoveForHeader;
    window.addEventListener('pointermove', _pmHandler);
    // pointerdown 也用于触发进入检测（在 webview 上也更可靠）
    window.addEventListener('pointerdown', _pmHandler);
    // 鼠标进入/移出窗口标志（用于在窗口内时让本地快捷键生效，即便窗口未真正聚焦）
    window.addEventListener('mouseover', onWindowMouseOver);
    // 窗口移出/失焦的回退处理
    window.addEventListener('mouseout', onWindowMouseOut);
    window.addEventListener('blur', onWindowBlur);
  } catch (e) {}

  if (desktopApi?.onOpenSettingsRequest) {
    removeOpenSettingsListener = desktopApi.onOpenSettingsRequest(() => {
      openSettingsModal();
    });
  }

  // 本地快捷键处理：将部分快捷键限制为仅在应用窗口聚焦时生效（bossKey 仍由主进程全局注册）
  try {
    window.addEventListener('keydown', localShortcutHandler, true);
  } catch (e) {}
});

onBeforeUnmount(() => {
  disposeDesktopApp();
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('keydown', _onCaptureKeydown);
  try {
    if (_pmHandler) {
      window.removeEventListener('pointermove', _pmHandler);
      window.removeEventListener('pointerdown', _pmHandler);
      _pmHandler = null;
    }
  } catch (e) {}
  try {
    window.removeEventListener('mouseout', onWindowMouseOut);
    window.removeEventListener('mouseover', onWindowMouseOver);
    window.removeEventListener('blur', onWindowBlur);
  } catch (e) {}
  try {
    if (_resizeObserver) {
      try {
        _resizeObserver.disconnect();
      } catch (e) {}
      _resizeObserver = null;
    }
  } catch (e) {}
  removeOpenSettingsListener?.();
  removeOpenSettingsListener = null;
  try {
    window.removeEventListener('keydown', localShortcutHandler, true);
  } catch (e) {}
});

/**
 * 本地快捷键处理器（仅在窗口聚焦时生效）
 * 使用 `formatAcceleratorFromEvent` 将按键事件序列化为类似 "Ctrl+Alt+T" 的字符串，
 * 然后与 `settings` 中保存的快捷键做匹配。注意：老板键 (`bossKey`) 保持由主进程作为全局快捷键处理，
 * 因此这里会忽略与 `bossKey` 相同的组合，避免重复触发。
 */
function localShortcutHandler(e) {
  try {
    // 仅当窗口聚焦或鼠标仍在窗口内部时生效（老板键由主进程全局处理）
    if (typeof document !== 'undefined' && !document.hasFocus() && !_mouseInsideWindow) return;
    const acc = formatAcceleratorFromEvent(e);
    if (!acc) return;
    // 严格解析加速器字符串并比较：要求修饰键集合与主键都匹配才认为相同
    const mapShifted = { '+': '=', '{': '[', '}': ']' };
    function parseAccelString(s) {
      if (!s) return { mods: new Set(), key: '' };
      // 处理可能的连续 '+'（替换为占位符再复原）
      let t = String(s).replace(/\+\+/g, '+PLUS');
      const parts = t
        .split('+')
        .map((p) => (p === 'PLUS' ? '+' : p))
        .filter((p) => p !== '');
      if (parts.length === 0) return { mods: new Set(), key: '' };
      const rawKey = parts[parts.length - 1];
      const mappedKey = mapShifted[rawKey] || rawKey;
      const mods = new Set(parts.slice(0, parts.length - 1));
      return { mods, key: mappedKey };
    }

    function accelEquals(a, b) {
      const pa = parseAccelString(a || '');
      const pb = parseAccelString(b || '');
      if (!pa.key || !pb.key) return false;
      if (pa.key !== pb.key) return false;
      if (pa.mods.size !== pb.mods.size) return false;
      for (const m of pa.mods) if (!pb.mods.has(m)) return false;
      return true;
    }

    // 忽略 bossKey（主进程已注册）
    if (accelEquals(acc, settings.bossKey || '')) return;

    // 对应设置：调整透明度 / 切换鼠标穿透 / 自动滚动控制 等
    if (accelEquals(acc, settings.decreaseTransparencyShortcut || '')) {
      e.preventDefault();
      const next = Math.max(0, Number(settings.transparency || 0) - 8);
      patchSetting('transparency', next);
      if (desktopApi?.setTransparency) desktopApi.setTransparency(next).catch(() => {});
      return;
    }
    if (accelEquals(acc, settings.increaseTransparencyShortcut || '')) {
      e.preventDefault();
      const next = Math.min(85, Number(settings.transparency || 0) + 8);
      patchSetting('transparency', next);
      if (desktopApi?.setTransparency) desktopApi.setTransparency(next).catch(() => {});
      return;
    }
    if (accelEquals(acc, settings.clickThroughShortcut || '')) {
      e.preventDefault();
      patchSetting('clickThroughMode', !settings.clickThroughMode);
      return;
    }
    // 将自动滚动相关快捷键也在渲染进程内处理（保持与 BottomToolbar 的行为一致）
    if (accelEquals(acc, settings.autoToggleShortcut || '')) {
      e.preventDefault();
      try {
        e.__glassReaderHandled = true;
      } catch (err) {}
      patchSetting('autoScrollEnabled', !settings.autoScrollEnabled);
      return;
    }
    if (accelEquals(acc, settings.autoSpeedDownShortcut || '')) {
      // 仅当自动滚动已开启时允许调整速度
      if (!settings.autoScrollEnabled) return;
      e.preventDefault();
      const next = Math.max(5, Number(settings.autoScrollSpeed || 22) - 5);
      patchSetting('autoScrollSpeed', next);
      return;
    }
    if (accelEquals(acc, settings.autoSpeedUpShortcut || '')) {
      // 仅当自动滚动已开启时允许调整速度
      if (!settings.autoScrollEnabled) return;
      e.preventDefault();
      const next = Math.min(80, Number(settings.autoScrollSpeed || 22) + 5);
      patchSetting('autoScrollSpeed', next);
      return;
    }
  } catch (e) {}
}
</script>

<template>
  <div
    class="window-shell"
    :class="[shellClasses, { 'hide-scrollbars': !settings.showScrollbars, 'header-hover-active': headerHoverActive }]"
    :style="themeVars">
    <!-- top hotzone: when hoverHeaderMode enabled, this invisible strip triggers header/tab reveal -->
    <div
      v-if="settings.hoverHeaderMode"
      class="header-hotzone"
      aria-hidden="true"
      @mouseenter="onHeaderMouseEnter"
      @mouseleave="onHeaderMouseLeave"></div>

    <div
      v-if="settings.hoverHeaderMode"
      @mouseenter="onTopbarMouseEnter"
      @mouseleave="onTopbarMouseLeave">
      <TopBar
        :settings="settings"
        :headerHoverActive="headerHoverActive"
        :openSettingsModal="openSettingsModal"
        :togglePin="togglePin"
        :toggleSetting="toggleSetting"
        :handleMinimize="handleMinimize"
        :handleMaximize="handleMaximize"
        :handleClose="handleClose" />
    </div>
    <template v-else>
      <TopBar
        :settings="settings"
        :headerHoverActive="headerHoverActive"
        :openSettingsModal="openSettingsModal"
        :togglePin="togglePin"
        :toggleSetting="toggleSetting"
        :handleMinimize="handleMinimize"
        :handleMaximize="handleMaximize"
        :handleClose="handleClose" />
    </template>

    <TabBar
      v-if="settings.showTabBar"
      :tabs="tabs"
      :activeTabId="activeTabId"
      :formatTabTitle="formatTabTitle"
      :selectTab="selectTab"
      :closeTab="closeTab"
      :addNewTab="addNewTab"
      :createPageTab="createPageTab"
      :closeTabsToLeft="closeTabsToLeft"
      :closeTabsToRight="closeTabsToRight"
      :closeAllTabs="closeAllTabs" />

    <main class="page-host">
      <MainPage ref="mainPageRef" />
    </main>

    <!-- 将 BottomToolbar 放在 MainPage 之外，作为外挂部件展示，避免遮挡 MainPage 底部内容 -->
    <BottomToolbar v-bind="toolbarProps" />

    <div
      v-if="isSettingsOpen"
      class="settings-modal-layer settings-floating no-drag"
      @click.self="closeSettingsModal">
      <section class="settings-modal panel">
        <!-- modal header removed to simplify layout -->

        <section class="settings-page panel no-drag">
          <div class="settings-header">
            <div>
              <h2>设置中心</h2>
              <p>所有开关都会实时同步到主窗口</p>
            </div>
          </div>

          <section class="settings-block slider-block section-panel">
            <div style="display: flex; justify-content: space-between; align-items: center">
              <label class="field-label">透明度</label>
              <span class="slider-value">{{ settings.transparency }}% 透明度</span>
            </div>
            <input
              :value="settings.transparency"
              class="slider"
              type="range"
              min="0"
              max="85"
              @input="handleTransparencyInput($event)" />
          </section>

          <section class="toggle-grid section-panel">
            <div class="toggle-column">
              <h3 class="toggle-title">窗口行为</h3>
              <BaseButton
                v-for="item in leftToggleKeys"
                :key="item.key"
                class="toggle-row"
                @click="toggleSetting(item.key)">
                <span>{{ item.label }}</span>
                <span
                  class="switch"
                  :class="{ on: settings[item.key] }"></span>
              </BaseButton>
              <BaseButton
                class="toggle-row"
                @click="toggleSetting('toolbarDisabled')">
                <span>禁用工具栏（不再移入显示）</span>
                <span
                  class="switch"
                  :class="{ on: settings.toolbarDisabled }"></span>
              </BaseButton>
            </div>

            <div class="toggle-column">
              <h3 class="toggle-title">显示与渲染</h3>
              <!-- 状态栏背景色控制已移除 -->

              <BaseButton
                v-for="item in rightToggleKeys"
                :key="item.key"
                class="toggle-row"
                @click="toggleSetting(item.key)">
                <span>{{ item.label }}</span>
                <span
                  class="switch"
                  :class="{ on: settings[item.key] }"></span>
              </BaseButton>
            </div>
          </section>

          <!-- 站点规则管理已移除（按需在页面内快速编辑弹窗保留） -->

          <section class="settings-block shortcut-block section-panel">
            <div class="shortcut-title">快捷键</div>
            <div class="shortcut-grid">
              <ShortcutRow
                label="老板键（电脑全局）"
                :value="settings.bossKey"
                keyName="bossKey"
                :editingKey="editingShortcut"
                :capturedAccel="capturedAccel"
                @start="startEditShortcut"
                @confirm="confirmShortcut"
                @cancel="cancelShortcut"
                @clear="clearCaptured" />

              <ShortcutRow
                label="降低透明（仅在软件内生效）"
                :value="settings.decreaseTransparencyShortcut"
                keyName="decreaseTransparencyShortcut"
                :editingKey="editingShortcut"
                :capturedAccel="capturedAccel"
                @start="startEditShortcut"
                @confirm="confirmShortcut"
                @cancel="cancelShortcut"
                @clear="clearCaptured" />

              <ShortcutRow
                label="提高透明（仅在软件内生效）"
                :value="settings.increaseTransparencyShortcut"
                keyName="increaseTransparencyShortcut"
                :editingKey="editingShortcut"
                :capturedAccel="capturedAccel"
                @start="startEditShortcut"
                @confirm="confirmShortcut"
                @cancel="cancelShortcut"
                @clear="clearCaptured" />

              <ShortcutRow
                label="鼠标穿透（仅在软件内生效）"
                :value="settings.clickThroughShortcut"
                keyName="clickThroughShortcut"
                :editingKey="editingShortcut"
                :capturedAccel="capturedAccel"
                @start="startEditShortcut"
                @confirm="confirmShortcut"
                @cancel="cancelShortcut"
                @clear="clearCaptured" />

              <ShortcutRow
                label="自动滚动（仅在软件内生效）"
                :value="settings.autoToggleShortcut"
                keyName="autoToggleShortcut"
                :editingKey="editingShortcut"
                :capturedAccel="capturedAccel"
                @start="startEditShortcut"
                @confirm="confirmShortcut"
                @cancel="cancelShortcut"
                @clear="clearCaptured" />

              <ShortcutRow
                label="自动滚动：减速（仅在软件内生效）"
                :value="settings.autoSpeedDownShortcut"
                keyName="autoSpeedDownShortcut"
                :editingKey="editingShortcut"
                :capturedAccel="capturedAccel"
                @start="startEditShortcut"
                @confirm="confirmShortcut"
                @cancel="cancelShortcut"
                @clear="clearCaptured" />

              <ShortcutRow
                label="自动滚动：加速（仅在软件内生效）"
                :value="settings.autoSpeedUpShortcut"
                keyName="autoSpeedUpShortcut"
                :editingKey="editingShortcut"
                :capturedAccel="capturedAccel"
                @start="startEditShortcut"
                @confirm="confirmShortcut"
                @cancel="cancelShortcut"
                @clear="clearCaptured" />
            </div>
          </section>

          <section class="settings-block section-panel">
            <div class="field-label">恢复</div>
            <div style="margin-top: 8px; display: flex; gap: 8px; align-items: center">
              <el-button
                type="danger"
                @click="restoreDefaults"
                style="padding: 6px 12px; height: 32px; width: 100%"
                >恢复默认配置</el-button
              >
            </div>
          </section>
        </section>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Settings modal: 更紧凑的内间距与控件高度，保持原有圆角与投影 */
.settings-modal {
  width: min(640px, 96%);
  padding: 12px 14px;
  box-sizing: border-box;
}
.settings-modal .settings-header {
  padding-bottom: 8px;
}
.section-panel {
  padding: 10px;
}
.toggle-row {
  min-height: 42px;
  padding: 8px 10px;
}
.text-field {
  height: 36px;
  padding: 6px 8px;
}
/* 新增：快捷键行布局 */
.shortcut-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.shortcut-title {
  margin-bottom: 8px;
  font-weight: 600;
}
/* 透明度显示在滑块区域 */
.slider-value {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
/* 快捷键编辑区域在窄屏下换行显示，避免按钮挤在一起 */
@media (max-width: 720px) {
  .settings-modal {
    width: 94%;
    padding: 10px;
  }
  .shortcut-grid {
    gap: 8px;
  }
  .shortcut-row {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }
  .shortcut-row .shortcut-input {
    width: 100%;
  }
}
</style>
