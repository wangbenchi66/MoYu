<!-- App.vue — 根组件：快捷键处理、设置面板、热区悬停、窗口级 UI 布局 -->
<script setup>
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import ShortcutRow from './components/ShortcutRow.vue';
import { useDesktopApp } from './composables/useDesktopApp';
import TopBar from './components/TopBar.vue';
import MainPage from './pages/MainPage.vue';
import BottomToolbar from './components/BottomToolbar.vue';
import TabBar from './components/TabBar.vue';
import defaultSettings from './shared/defaultSettings.js';
import { isRevealing, useRevealHint } from './composables/useRevealHint.js';
import { themeMode, effectiveTheme, isDark, setThemeMode, syncThemeFromMain, attachThemeListener, detachThemeListener } from './composables/useTheme.js';

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
  activeTab,
  selectTab,
  closeTab,
  addNewTab,
  createPageTab,
  closeTabsToLeft,
  closeTabsToRight,
  closeAllTabs,
  toggleSetting,
  urlInput,
  handleOpenUrl,
  clearAllTraces,
  cleanExpiredTraces,
  flushSession
} = useDesktopApp();
const desktopApi = typeof window !== 'undefined' ? window.desktop : null;

// 说明：
// 1. 本文件为渲染进程入口，负责窗口级别的 UI 与全局快捷键处理。
// 2. 主要职责包括：管理设置面板、捕获与匹配快捷键、协调 BottomToolbar 与 MainPage 的交互、以及窗口热区/悬停逻辑。
// 3. 关键事件：window 的 keydown（快捷键捕获）、pointermove（热区检测）、mouseout/blur（失焦/移出回退处理）。

const isSettingsOpen = ref(false);
// 匿名上报功能已移除（连同首次启动的隐私同意弹窗）。
// 这里清理历史版本遗留的同意标记，避免 localStorage 里留无用数据。
try { localStorage.removeItem('moyu-privacy-consent'); } catch (e) { }
let removeOpenSettingsListener = null;
let _globalErrorHandler = null;
let _globalRejectionHandler = null;
let _sessionFlushHandler = null;
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
    openExternal: () => {
      try {
        const url = activeTab.value?.url;
        if (url) desktopApi?.openExternal(url);
      } catch (e) {}
    },
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
let _pmRafId = null;
let _mouseInsideWindow = false;
let _lastNear = false;
let _headerHideTimeout = null;
const HEADER_HIDE_DELAY = 360;
// 缓存常用 DOM 元素，避免在频繁事件中反复查询
let _topbarEl = null;
let _hzEl = null;
let _tabbarEl = null;

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
    const baseHotzone = 28;
    let h = baseHotzone;
    // 如果标签栏开启，则将标签栏高度也计入热区，使在标签栏区域也被视为“靠近顶部”
    try {
      const tabbarEl = document.querySelector('.tabbar');
      if (tabbarEl && settings && settings.showTabBar) {
        const tRect = tabbarEl.getBoundingClientRect();
        h += tRect && tRect.height ? tRect.height : tabbarEl.offsetHeight || 0;
      }
      // 同时把 topbar 自身高度也加入，确保覆盖整个标题栏区域
      if (_topbarEl) {
        const tbRect = _topbarEl.getBoundingClientRect();
        h += tbRect && tbRect.height ? tbRect.height : _topbarEl.offsetHeight || 0;
      }
    } catch (e) {}
    // 加少量缓冲，包含 title-drag 区域
    hotzoneHeight.value = Math.max(24, Math.round(h + 8));
    // 不修改 header-hotzone 的样式以避免触发 ResizeObserver 的循环变化
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
    const threshold = hotzoneHeight.value || 28;

    // 基于阈值和事件目标判断是否靠近顶部
    let near = y <= threshold;
    try {
      const tgt = e && (e.target || null);
      if (tgt) {
        if (_topbarEl && (_topbarEl === tgt || _topbarEl.contains(tgt))) near = true;
        if (_tabbarEl && (_tabbarEl === tgt || _tabbarEl.contains(tgt))) near = true;
      }
    } catch (err) {}

    // 行为参考 BottomToolbar：进入立即显示，离开延迟隐藏
    if (near && !_lastNear) {
      _lastNear = true;
      try {
        if (_headerHideTimeout) {
          clearTimeout(_headerHideTimeout);
          _headerHideTimeout = null;
        }
      } catch (err) {}
      if (!headerHoverActive.value) headerHoverActive.value = true;
    } else if (!near && _lastNear) {
      _lastNear = false;
      try {
        if (_headerHideTimeout) {
          clearTimeout(_headerHideTimeout);
          _headerHideTimeout = null;
        }
        _headerHideTimeout = setTimeout(() => {
          try {
            if (headerHoverActive.value) headerHoverActive.value = false;
          } catch (err) {}
          _headerHideTimeout = null;
        }, HEADER_HIDE_DELAY);
      } catch (err) {}
    }
  } catch (e) {}
}

// 说明：全局 pointermove 处理器，用于检测光标是否进入顶部热区
// - 当 hoverHeaderMode 开启时会触发 headerHoverActive 的开关
// - 仅触发 UI 状态，不直接修改 DOM

/**
 * 窗口鼠标移出处理（用于热区与悬停回退）
 * 参数: e - 鼠标事件对象
 */
function onWindowMouseOut(e) {
  try {
    // 当鼠标移出窗口（relatedTarget 为 null）时立即隐藏
    const to = e && e.relatedTarget;
    if (!to) {
      _mouseInsideWindow = false;
      if (headerHoverActive.value) headerHoverActive.value = false;
      try {
        if (_headerHideTimeout) {
          clearTimeout(_headerHideTimeout);
          _headerHideTimeout = null;
        }
      } catch (err) {}
    }
  } catch (e) {}
}

/**
 * 窗口鼠标移入处理（标记鼠标在窗口内）
 */
function onWindowMouseOver() {
  try {
    _mouseInsideWindow = true;
  } catch (e) {}
}

/**
 * 窗口失焦处理（用于关闭悬停标题栏等）
 */
function onWindowBlur() {
  try {
    if (headerHoverActive.value) headerHoverActive.value = false;
  } catch (e) {}
}

// 说明：当窗口失焦时的回退处理
// - 用于关闭 hoverHeaderMode 的显示状态，避免在失焦时仍保持悬停显示

// 鼠标移入/移出处理，参考 BottomToolbar 的 container mouseenter/leave
/**
 * 清理标题隐藏的延时计时器
 */
function clearHeaderHideTimeout() {
  try {
    if (_headerHideTimeout) {
      clearTimeout(_headerHideTimeout);
      _headerHideTimeout = null;
    }
  } catch (e) {}
}

/**
 * 鼠标进入标题区时的处理
 * 参数: e - 鼠标事件对象
 */
function onHeaderMouseEnter(e) {
  try {
    clearHeaderHideTimeout();
    if (!headerHoverActive.value) headerHoverActive.value = true;
  } catch (e) {}
}

/**
 * 鼠标离开标题区时的处理（延迟隐藏）
 * 参数: e - 鼠标事件对象
 */
function onHeaderMouseLeave(e) {
  try {
    const to = e && e.relatedTarget;
    // 如果移动目标仍在 topbar 或 header-hotzone 内，则不隐藏
    if (to) {
      if (_topbarEl && (_topbarEl === to || _topbarEl.contains(to))) return;
      if (_hzEl && (_hzEl === to || _hzEl.contains(to))) return;
      if (_tabbarEl && (_tabbarEl === to || _tabbarEl.contains(to))) return;
    }
    try {
      if (_headerHideTimeout) {
        clearTimeout(_headerHideTimeout);
        _headerHideTimeout = null;
      }
      _headerHideTimeout = setTimeout(() => {
        try {
          if (headerHoverActive.value) headerHoverActive.value = false;
        } catch (err) {}
        _headerHideTimeout = null;
        _lastNear = false;
      }, HEADER_HIDE_DELAY);
    } catch (err) {}
  } catch (e) {}
}

/**
 * 鼠标进入顶部栏时的处理
 * 参数: e - 鼠标事件对象
 */
function onTopbarMouseEnter(e) {
  try {
    clearHeaderHideTimeout();
    if (!headerHoverActive.value) headerHoverActive.value = true;
  } catch (e) {}
}

/**
 * 鼠标离开顶部栏时的处理（延迟隐藏）
 * 参数: e - 鼠标事件对象
 */
function onTopbarMouseLeave(e) {
  try {
    const to = e && e.relatedTarget;
    if (to) {
      if (_hzEl && (_hzEl === to || _hzEl.contains(to))) return;
      if (_topbarEl && (_topbarEl === to || _topbarEl.contains(to))) return;
      if (_tabbarEl && (_tabbarEl === to || _tabbarEl.contains(to))) return;
    }
    try {
      if (_headerHideTimeout) {
        clearTimeout(_headerHideTimeout);
        _headerHideTimeout = null;
      }
      _headerHideTimeout = setTimeout(() => {
        try {
          if (headerHoverActive.value) headerHoverActive.value = false;
        } catch (err) {}
        _headerHideTimeout = null;
        _lastNear = false;
      }, HEADER_HIDE_DELAY);
    } catch (err) {}
  } catch (e) {}
}

/**
 * 将键盘事件格式化为 Accelerator 字符串（示例："Ctrl+Alt+T"）
 * 参数: e - 键盘事件对象
 */
function formatAcceleratorFromEvent(e) {
  // 将原生键事件格式化为可展示与可比较的“Accelerator”字符串
  // 返回示例: "Ctrl+Alt+T" 或 "="
  // 说明：用于在 UI 中展示快捷键及在代码中与设置项进行精确匹配。
  const isModifierOnly = (k) => ['Control', 'Shift', 'Alt', 'Meta'].includes(k);
  if (isModifierOnly(e.key)) {
    return null;
  }

  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  // 不将 Shift 作为可配置的修饰键之一（禁止使用 Shift 作为快捷键修饰符）
  // 仅保留 Ctrl/Alt/Meta 为修饰键
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

/**
 * 格式化标签标题，超长则截断并追加省略号
 * 参数: title - 原始标题字符串
 */
function formatTabTitle(title) {
  const s = (title ?? '').toString().trim();
  const limit = 10; // 超过 10 个字符则截断
  if (!s) return '';
  return s.length <= limit ? s : s.slice(0, limit) + '…';
}

/**
 * 捕获快捷键编辑期间的 keydown，用于读取按键并转换为 Accelerator
 * 参数: e - 键盘事件对象
 */
function _onCaptureKeydown(e) {
  // 用于快捷键编辑器：拦截一次按键并将其转为规范化的 Accelerator 存放到 capturedAccel
  e.preventDefault();
  // 如果按下了 Shift 且不是用于生成可映射符号（+/{/}），则直接禁止使用 Shift 作为修饰键
  const rawKey = e.key;
  const shiftAllowedSymbols = ['+', '{', '}'];
  if (e.shiftKey && !shiftAllowedSymbols.includes(rawKey)) {
    try {
      ElMessage({ message: '禁止将 Shift 用作快捷键修饰键，请使用 Alt/Ctrl/Meta。', type: 'warning' });
    } catch (err) {}
    return;
  }
  const acc = formatAcceleratorFromEvent(e);
  if (!acc) return;
  capturedAccel.value = acc;
}

/**
 * 开始快捷键编辑模式并监听按键
 * 参数: key - 要编辑的设置键名
 */
function startEditShortcut(key) {
  // 进入指定快捷键的编辑模式：先移除可能残留的旧监听器再重新注册，防止多次调用时监听器堆叠
  window.removeEventListener('keydown', _onCaptureKeydown);
  editingShortcut.value = key;
  capturedAccel.value = settings[key] || '';
  window.addEventListener('keydown', _onCaptureKeydown);
}

/**
 * 确认并保存编辑的快捷键
 * 参数: key - 被编辑的设置键名
 */
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

/**
 * 取消快捷键编辑并清理状态
 */
function cancelShortcut() {
  // 取消快捷键编辑：清理状态
  window.removeEventListener('keydown', _onCaptureKeydown);
  editingShortcut.value = null;
  capturedAccel.value = '';
}

/**
 * 清除当前捕获到的快捷键并写入空设置
 * 参数: key - 对应设置键名
 */
function clearCaptured(key) {
  // 仅当正在编辑此快捷键时才响应：清空捕获值并保持编辑状态，不写入设置
  if (editingShortcut.value !== key) return;
  window.removeEventListener('keydown', _onCaptureKeydown);
  capturedAccel.value = '';
  // 保持 editingShortcut，让用户可以继续按键或点击确认
}

/**
 * 打开设置模态框并确保窗口可交互
 */
function openSettingsModal() {
  // 当打开设置时，临时确保窗口可接收鼠标事件，避免被鼠标穿透挡住设置交互
  isSettingsOpen.value = true;
  // 恢复上次的分区展开状态
  restoreSectionState();
  if (desktopApi?.setIgnoreMouseEvents) {
    try {
      desktopApi.setIgnoreMouseEvents(false);
    } catch (e) {}
  }
}

/**
 * 恢复默认设置（仅开关与快捷键），并提示二次确认
 */
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

/**
 * 设置面板的分区折叠。
 *
 * 为什么需要：面板里有 19 个控件（含 7 行快捷键），内容实测约 2050px，
 * 而摸鱼窗口常常只有 200~500px 高——平铺时用户要滚很久才能找到一项。
 * 折叠后默认只展开最常用的两组，其余按需展开。
 *
 * 展开状态存 localStorage：用户展开过的分组下次打开仍是展开的。
 */
const SETTINGS_SECTIONS_KEY = 'moyu-settings-sections';

/**
 * 设置面板的分区折叠状态。
 *
 * key 必须与模板里各折叠头的 toggleSection('xxx') 一一对应，
 * 且**每个区块一个独立 key**——曾把「窗口与显示」和「外观」都写成 appearance，
 * 结果点一个另一个跟着动。新增区块时记得同时改这里和模板。
 */
const settingsSections = reactive({
  transparency: true,  // 透明度与窗口行为 —— 高频，默认展开
  appearance: true,    // 窗口与显示（双列开关）—— 高频，默认展开
  theme: false,        // 外观（主题 / 网页深色）
  privacy: false,      // 隐私与痕迹
  shortcuts: false,    // 快捷键（7 行，最长的一块，默认收起）
  reset: false,        // 恢复默认（破坏性操作，保持收起以免误触）
});

function toggleSection(key) {
  try {
    settingsSections[key] = !settingsSections[key];
    localStorage.setItem(SETTINGS_SECTIONS_KEY, JSON.stringify({ ...settingsSections }));
  } catch (e) { }
}

function restoreSectionState() {
  try {
    const raw = localStorage.getItem(SETTINGS_SECTIONS_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    for (const k of Object.keys(settingsSections)) {
      if (typeof saved[k] === 'boolean') settingsSections[k] = saved[k];
    }
  } catch (e) { }
}

/**
 * 是否需要提示「窗口可能找不到」。
 *
 * 触发条件：全透明（外壳不可见）+ 标题栏悬停隐藏（顶栏也不可见）同时开启。
 * 此时窗口在视觉上与桌面无异，用户按了老板键也不知道窗口在哪。
 *
 * 这里只做提示，不阻止用户开启 —— 这是他们的选择；
 * 真正的兜底是 useRevealHint 的唤出高亮。
 */
const showVisibilityWarning = computed(() => {
  try {
    return !!(settings.fullWindowTransparent && settings.hoverHeaderMode);
  } catch (e) {
    return false;
  }
});

/**
 * 关闭设置模态并恢复 clickThroughMode 状态
 */
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

/**
 * 处理全局键盘事件（如 Esc 关闭设置或取消编辑）
 * 参数: event - 键盘事件对象
 */
function handleKeydown(event) {
  if (event.key === 'Escape' && isSettingsOpen.value) {
    if (editingShortcut.value) {
      cancelShortcut();
      return;
    }
    closeSettingsModal();
  }
}

/**
 * 切换窗口置顶设置（alwaysOnTop）
 */
function togglePin() {
  patchSetting('alwaysOnTop', !settings.alwaysOnTop);
}

/**
 * 处理透明度滑块输入并同步到主进程
 * 参数: e - 输入事件对象
 */
function handleTransparencyInput(e) {
  const v = Number(e.target.value || 0);
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
      .then((ns) => {})
      .catch((err) => {
        console.warn('[renderer] updateSettings failed', err);
      });
  }
}

/**
 * 测试性地设置透明度（用于调试）
 */
async function testSetTransparency() {
  if (!desktopApi?.setTransparency) {
    console.warn('[renderer] desktopApi.setTransparency not available');
    return;
  }

  try {
    const res = await desktopApi.setTransparency(50);
    if (desktopApi?.log) {
      try {
        desktopApi.log(`[renderer] testSetTransparency result ${JSON.stringify(res)}`);
      } catch (e) {}
    }
  } catch (err) {
    console.warn('[renderer] testSetTransparency failed', err);
  }
}

/**
 * 打开默认地址到输入框并触发导航
 */
function openDefaultUrl() {
  urlInput.value = settings.defaultUrl === 'about:blank' ? '' : settings.defaultUrl;
  handleOpenUrl();
}

/**
 * 跳转到仪表盘或创建空白仪表盘页
 */
const router = useRouter();
function goHome() {
  try {
    const dashboard = tabs.value.find((t) => t && (t.kind === 'dashboard' || t.url === 'about:blank'));
    if (dashboard) {
      selectTab(dashboard.id);
    } else {
      createPageTab('about:blank', { kind: 'dashboard' });
    }
    router.push({ name: 'home' });
  } catch (e) {}
}


/**
 * 应用主题：写设置 + 本地立即生效（避免等待 IPC 往返的闪烁）
 *
 * 刻意**不弹提示**：主题切换的效果是整屏可见的，再弹一个「已切换为深色」
 * 属于多余反馈，反而遮挡界面（顶栏按钮还是连点循环，连续弹窗更烦）。
 */
function applyTheme(mode) {
  const next = ['light', 'dark', 'system'].includes(mode) ? mode : 'system';
  patchSetting('themeMode', next);
  setThemeMode(next);
}

/**
 * 顶栏主题按钮：在「跟随系统 → 浅色 → 深色」间循环。
 * 与设置面板的下拉选择共用同一条链路。
 */
function cycleTopbarTheme() {
  try {
    const order = ['system', 'light', 'dark'];
    const cur = order.includes(themeMode.value) ? themeMode.value : 'system';
    applyTheme(order[(order.indexOf(cur) + 1) % order.length]);
  } catch (e) { }
}

/**
 * 设置面板的主题下拉
 */
function onThemeModeChange(e) {
  applyTheme(String(e?.target?.value || 'system'));
}

// 设置项被其它入口（托盘/快捷键/同步）改动时，保持 DOM 一致
watch(() => settings.themeMode, (m) => {
  try { setThemeMode(m || 'system'); } catch (e) { }
});

function onRetentionChange(e) {
  const v = Number(e?.target?.value ?? 0);
  patchSetting('historyRetentionDays', v);
  // 立刻按新策略清理一次，让用户马上看到效果
  const removed = cleanExpiredTraces();
  if (v > 0) {
    ElMessage({
      message: removed > 0 ? `已保留最近 ${v} 天，清理了 ${removed} 条记录` : `已设为保留最近 ${v} 天`,
      type: 'success',
    });
  } else {
    ElMessage({ message: '历史记录将永久保留', type: 'info' });
  }
}

/**
 * 手动清理过期记录
 */
function handleCleanExpired() {
  const removed = cleanExpiredTraces();
  ElMessage({
    message: removed > 0 ? `已清理 ${removed} 条过期记录` : '没有需要清理的记录',
    type: removed > 0 ? 'success' : 'info',
  });
}

/**
 * 清除所有本地痕迹（二次确认）
 */
function handleClearAllTraces() {
  ElMessageBox.confirm(
    '将清除历史记录、最近访问、自定义推荐站点、阅读进度与阅读器设置。此操作不可撤销。',
    '清除所有痕迹',
    { type: 'warning', confirmButtonText: '确认清除', cancelButtonText: '取消' },
  )
    .then(() => {
      const { cleared } = clearAllTraces();
      ElMessage({ message: `已清除：${cleared.join('、') || '无'}`, type: 'success' });
    })
    .catch(() => {});
}

onMounted(() => {
  initializeDesktopApp();

  // 窗口被老板键/托盘唤出时的短暂高亮。
  // 全透明 + 标题栏悬停隐藏时，窗口显示出来也可能看不见；高亮一次帮用户定位。
  try {
    useRevealHint(() => settings);
  } catch (e) { }

  // 主题：先按设置同步，再订阅主进程广播（含系统深浅色切换）
  try {
    setThemeMode(settings.themeMode || 'system');
    syncThemeFromMain();
    attachThemeListener();
  } catch (e) { }

  // 暴露给主进程：blur 时判断是否应继续摸鱼计时
  window.__moyuShouldKeepTracking = () => {
    try {
      // 自动滚动开启时视为活跃
      if (settings.autoScrollEnabled) return true;
      // 有正在播放的视频/音频时视为活跃
      const media = document.querySelectorAll('video, audio');
      for (const el of media) {
        if (!el.paused && !el.ended) return true;
      }
      // 检查 webview 内的媒体（通过注入标记）
      try {
        const webviews = document.querySelectorAll('webview');
        for (const wv of webviews) {
          try {
            if (wv.getAttribute('data-media-playing') === '1') return true;
          } catch (e) {}
        }
      } catch (e) {}
    } catch (e) {}
    return false;
  };

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
    // 监听 tabbar 的进入/离开以便在标签栏区域也触发 headerHoverActive
    try {
      _tabbarEl = document && document.querySelector ? document.querySelector('.tabbar') : null;
      if (_tabbarEl) {
        _tabbarEl.addEventListener('mouseenter', onTopbarMouseEnter);
        _tabbarEl.addEventListener('mouseleave', onTopbarMouseLeave);
      }
    } catch (e) {}
    _pmHandler = (e) => {
      if (_pmRafId) return;
      _pmRafId = requestAnimationFrame(() => {
        _pmRafId = null;
        _onPointerMoveForHeader(e);
      });
    };
    window.addEventListener('pointermove', _pmHandler);
    // pointerdown 也用于触发进入检测（在 webview 上也更可靠）
    window.addEventListener('pointerdown', _pmHandler);
    // 鼠标进入/移出窗口标志（用于在窗口内时让本地快捷键生效，即便窗口未真正聚焦）
    window.addEventListener('mouseover', onWindowMouseOver);
    // 窗口移出/失焦的回退处理
    window.addEventListener('mouseout', onWindowMouseOut);
    window.addEventListener('blur', onWindowBlur);
  } catch (e) {}

  // 启动时的自动版本检测已移除。
  // 原实现会在接口不可达时把 forceUpdateActive 置真并强制跳转更新页，
  // 导致「启动即被锁在更新页」；且它依赖的后端接口已不再维护。
  // 版本检测改为仅在「关于」页由用户主动触发（checkUpdate）。

  if (desktopApi?.onOpenSettingsRequest) {
    removeOpenSettingsListener = desktopApi.onOpenSettingsRequest(() => {
      openSettingsModal();
    });
  }

  // 本地快捷键处理：将部分快捷键限制为仅在应用窗口聚焦时生效（bossKey 仍由主进程全局注册）
  try {
    window.addEventListener('keydown', localShortcutHandler, true);
  } catch (e) {}

  // 全局错误捕获：写入日志文件方便排查
  _globalErrorHandler = (e) => {
    try {
      desktopApi?.logError?.(e.message || 'unknown error', { filename: e.filename, lineno: e.lineno });
    } catch (_) {}
  };
  _globalRejectionHandler = (e) => {
    try {
      desktopApi?.logError?.('unhandled rejection', { reason: String(e.reason || e) });
    } catch (_) {}
  };
  window.addEventListener('error', _globalErrorHandler);
  window.addEventListener('unhandledrejection', _globalRejectionHandler);

  // 退出前落盘标签会话。
  // 注意：closeToTray 开启时关闭窗口只是 hide()，不会触发 Vue 的 onBeforeUnmount，
  // 因此必须额外监听 pagehide / beforeunload 兜底。
  try {
    _sessionFlushHandler = () => { try { flushSession() } catch (e) {} };
    window.addEventListener('pagehide', _sessionFlushHandler);
    window.addEventListener('beforeunload', _sessionFlushHandler);
  } catch (e) {}
});

onBeforeUnmount(() => {
  disposeDesktopApp();
  try { detachThemeListener(); } catch (e) { }
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('keydown', _onCaptureKeydown);
  try {
    if (_pmHandler) {
      window.removeEventListener('pointermove', _pmHandler);
      window.removeEventListener('pointerdown', _pmHandler);
      _pmHandler = null;
    }
    if (_pmRafId) {
      cancelAnimationFrame(_pmRafId);
      _pmRafId = null;
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
  try {
    if (_tabbarEl) {
      try {
        _tabbarEl.removeEventListener('mouseenter', onTopbarMouseEnter);
        _tabbarEl.removeEventListener('mouseleave', onTopbarMouseLeave);
      } catch (e) {}
    }
    _tabbarEl = null;
  } catch (e) {}
  removeOpenSettingsListener?.();
  removeOpenSettingsListener = null;
  try {
    window.removeEventListener('keydown', localShortcutHandler, true);
  } catch (e) {}
  if (_globalErrorHandler) {
    window.removeEventListener('error', _globalErrorHandler);
    _globalErrorHandler = null;
  }
  if (_globalRejectionHandler) {
    window.removeEventListener('unhandledrejection', _globalRejectionHandler);
    _globalRejectionHandler = null;
  }
  try {
    if (_sessionFlushHandler) {
      window.removeEventListener('pagehide', _sessionFlushHandler);
      window.removeEventListener('beforeunload', _sessionFlushHandler);
      _sessionFlushHandler = null;
    }
  } catch (e) {}
});

/**
 * 本地快捷键处理器（仅在窗口聚焦或鼠标在窗口内时生效）
 * 参数: e - 键盘事件对象
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
    :class="[shellClasses, { 'hide-scrollbars': !settings.showScrollbars, 'header-hover-active': headerHoverActive, 'reveal-hint': isRevealing }]"
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
        :patchSetting="patchSetting"
        :handleMinimize="handleMinimize"
        :handleMaximize="handleMaximize"
        :handleClose="handleClose"
        :goHome="goHome"
        :activeTab="activeTab"
        :statusMessage="statusMessage"
        :themeMode="themeMode"
        :cycleTheme="cycleTopbarTheme" />
    </div>
    <template v-else>
      <TopBar
        :settings="settings"
        :headerHoverActive="headerHoverActive"
        :openSettingsModal="openSettingsModal"
        :togglePin="togglePin"
        :toggleSetting="toggleSetting"
        :patchSetting="patchSetting"
        :handleMinimize="handleMinimize"
        :handleMaximize="handleMaximize"
        :handleClose="handleClose"
        :goHome="goHome"
        :activeTab="activeTab"
        :statusMessage="statusMessage"
        :themeMode="themeMode"
        :cycleTheme="cycleTopbarTheme" />
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

    <!-- 底部工具栏仅在嵌入网页时显示，控制台/个人中心等自有页面不显示 -->
    <BottomToolbar
      v-if="activeTab?.kind !== 'dashboard'"
      v-bind="toolbarProps" />

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

          <!-- 折叠头：点击展开/收起。小窗口下默认收起，避免长列表难找 -->
          <button
            type="button"
            class="section-toggle"
            :class="{ open: settingsSections.transparency }"
            @click="toggleSection('transparency')">
            <span class="section-toggle-arrow">▸</span>
            <span class="section-toggle-title">透明度</span>
          </button>
          <section v-show="settingsSections.transparency" class="settings-block slider-block section-panel">
            <div style="display: flex; justify-content: space-between; align-items: center">
              <span class="slider-value">{{ settings.transparency }}% 透明度</span>
            </div>
            <input
              :value="settings.transparency"
              class="slider"
              type="range"
              min="0"
              max="100"
              @input="handleTransparencyInput($event)" />
          </section>

          <!-- 折叠头：点击展开/收起。小窗口下默认收起，避免长列表难找 -->
          <button
            type="button"
            class="section-toggle"
            :class="{ open: settingsSections.appearance }"
            @click="toggleSection('appearance')">
            <span class="section-toggle-arrow">▸</span>
            <span class="section-toggle-title">窗口与显示</span>
          </button>
          <section v-show="settingsSections.appearance" class="toggle-grid section-panel">
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

          <!-- 外观（主题） -->
          <!-- 折叠头：点击展开/收起。小窗口下默认收起，避免长列表难找 -->
          <button
            type="button"
            class="section-toggle"
            :class="{ open: settingsSections.theme }"
            @click="toggleSection('theme')">
            <span class="section-toggle-arrow">▸</span>
            <span class="section-toggle-title">外观</span>
          </button>
          <section v-show="settingsSections.theme" class="settings-block section-panel">

            <!-- 风险提示：全透明 + 顶栏悬停隐藏 时，窗口在视觉上等同消失 -->
            <div v-if="showVisibilityWarning" class="visibility-warning">
              <span class="visibility-warning-icon">!</span>
              <span v-if="settings.revealHintOnShow !== false">
                「软件背景透明」与「标题栏悬停显示」都已开启，窗口会和桌面背景混在一起。
                按老板键唤出时会自动短暂高亮一次帮你定位；若仍找不到，
                可用托盘菜单的「显示主窗口」。
              </span>
              <span v-else>
                「软件背景透明」与「标题栏悬停显示」都已开启，窗口会和桌面背景混在一起。
                你已关闭「唤出时短暂高亮」，找回窗口只能靠托盘菜单的「显示主窗口」，
                建议保留该高亮，或关闭上面两个透明开关之一。
              </span>
            </div>

            <div class="privacy-row">
              <span class="privacy-label">主题</span>
              <select
                class="privacy-select"
                :value="themeMode"
                @change="onThemeModeChange($event)">
                <option value="system">跟随系统</option>
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
            </div>

            <BaseButton
              class="toggle-row"
              :class="{ disabled: themeMode !== 'system' }"
              @click="themeMode === 'system' && toggleSetting('darkenWebPages')">
              <span>深色模式下让网页也变深</span>
              <span
                class="switch"
                :class="{ on: settings.darkenWebPages }"></span>
            </BaseButton>
            <p class="theme-hint">
              当前生效：{{ effectiveTheme === 'dark' ? '深色' : '浅色' }}<template v-if="themeMode === 'system'">（跟随系统）</template>
            </p>
          </section>

          <!-- 隐私与痕迹 -->
          <!-- 折叠头：点击展开/收起。小窗口下默认收起，避免长列表难找 -->
          <button
            type="button"
            class="section-toggle"
            :class="{ open: settingsSections.privacy }"
            @click="toggleSection('privacy')">
            <span class="section-toggle-arrow">▸</span>
            <span class="section-toggle-title">隐私与痕迹</span>
          </button>
          <section v-show="settingsSections.privacy" class="settings-block privacy-block section-panel">

            <div class="privacy-row">
              <span class="privacy-label">历史记录保留</span>
              <select
                class="privacy-select"
                :value="settings.historyRetentionDays ?? 0"
                @change="onRetentionChange($event)">
                <option :value="0">永久保留</option>
                <option :value="1">最近 1 天</option>
                <option :value="3">最近 3 天</option>
                <option :value="7">最近 7 天</option>
                <option :value="30">最近 30 天</option>
              </select>
            </div>

            <BaseButton
              class="toggle-row"
              @click="toggleSetting('autoCleanOnStartup')">
              <span>启动时自动清理过期记录</span>
              <span
                class="switch"
                :class="{ on: settings.autoCleanOnStartup }"></span>
            </BaseButton>

            <BaseButton
              class="toggle-row"
              @click="toggleSetting('restoreTabsOnStartup')">
              <span>启动时恢复上次标签页</span>
              <span
                class="switch"
                :class="{ on: settings.restoreTabsOnStartup }"></span>
            </BaseButton>

            <BaseButton
              class="toggle-row"
              @click="toggleSetting('muteOnBossKey')">
              <span>老板键隐藏时静音</span>
              <span
                class="switch"
                :class="{ on: settings.muteOnBossKey }"></span>
            </BaseButton>

            <!-- 唤出高亮：全透明 + 标题栏隐藏时，帮用户找到窗口 -->
            <BaseButton
              class="toggle-row"
              @click="toggleSetting('revealHintOnShow')">
              <span>唤出时短暂高亮（便于找到窗口）</span>
              <span
                class="switch"
                :class="{ on: settings.revealHintOnShow !== false }"></span>
            </BaseButton>

            <BaseButton
              class="toggle-row"
              @click="toggleSetting('keepAudioPlayingInBackground')">
              <span>后台继续播放音频</span>
              <span
                class="switch"
                :class="{ on: settings.keepAudioPlayingInBackground }"></span>
            </BaseButton>

            <BaseButton
              class="toggle-row"
              @click="toggleSetting('clearCacheOnExit')">
              <span>退出时清理网页缓存与 Cookie</span>
              <span
                class="switch"
                :class="{ on: settings.clearCacheOnExit }"></span>
            </BaseButton>

            <div class="privacy-actions">
              <el-button
                size="small"
                @click="handleCleanExpired"
                :disabled="!(settings.historyRetentionDays > 0)">
                立即清理过期记录
              </el-button>
              <el-button
                size="small"
                type="danger"
                @click="handleClearAllTraces">
                清除所有痕迹
              </el-button>
            </div>

            <p class="privacy-hint">
              「清除所有痕迹」会清空历史记录、最近访问、自定义推荐站点与已保存的标签会话。
              关闭「老板键隐藏时静音」后，隐藏窗口不会影响正在播放的声音。
              「退出时清理网页缓存与 Cookie」会清掉所有网站的登录态，请谨慎开启。
            </p>
          </section>

          <!-- 站点规则管理已移除（按需在页面内快速编辑弹窗保留） -->

          <!-- 折叠头：点击展开/收起。小窗口下默认收起，避免长列表难找 -->
          <button
            type="button"
            class="section-toggle"
            :class="{ open: settingsSections.shortcuts }"
            @click="toggleSection('shortcuts')">
            <span class="section-toggle-arrow">▸</span>
            <span class="section-toggle-title">快捷键</span>
          </button>
          <section v-show="settingsSections.shortcuts" class="settings-block shortcut-block section-panel">
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

          <!-- 折叠头：点击展开/收起。小窗口下默认收起，避免长列表难找 -->
          <button
            type="button"
            class="section-toggle"
            :class="{ open: settingsSections.reset }"
            @click="toggleSection('reset')">
            <span class="section-toggle-arrow">▸</span>
            <span class="section-toggle-title">恢复</span>
          </button>
          <section v-show="settingsSections.reset" class="settings-block section-panel">
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

    <!-- 隐私同意弹窗已移除：匿名上报功能整体下线 -->
  </div>
</template>

<!-- 窗口唤出提示：**不加 scoped**。
     这里只需要 outline（内联样式没有 outline，本来不必 !important），
     但保留全局样式是为了避免 scoped 的 [data-v-xxx] 影响后续维护者的判断。 -->
<style>
/*
 * 老板键唤出时的「一闪」提示。
 *
 * 场景：软件透明 + 网页透明 + 标题栏悬停隐藏 全开时，窗口虽然显示了，
 * 但看起来和桌面没有区别，连按几次老板键后完全找不到窗口在哪。
 *
 * ⚠️ 设计基线：**这是摸鱼软件，任何持续的视觉异常都可能被人发现**。
 * 因此这里刻意只做最轻的提示 —— 四周一圈细描边，150ms 内闪灭。
 *
 * 刻意**不做**的两件事（都曾被实现过，后按上述理由移除）：
 *   1. 不临时恢复外壳不透明 —— 「一个突然出现的实心方块」是整屏最显眼的
 *      东西，风险远高于一条细线。保持透明，只在边缘画线。
 *   2. 不强制显示顶栏 —— 顶栏弹出来同样显眼，且会带出一整条控制栏。
 *
 * 全程只改视觉（一个 class），不改设置、不落盘。
 */
.window-shell.reveal-hint {
  /* 细描边：1px，位置内缩避免被父级 overflow 裁掉 */
  outline: 1px solid var(--primary) !important;
  outline-offset: -1px;
  /* 极轻的外发光，只为让线条在浅色/深色背景上都能看清，不形成"光晕块" */
  box-shadow: 0 0 6px 0 var(--primary-soft, rgba(91, 147, 255, 0.28)) !important;
  /* 不要 transition：闪烁本身是瞬时效果，渐变会拖长可感知时长 */
  transition: none !important;
}

/* 闪灭：亮 → 灭，单次，150ms。
 * 与 useRevealHint.js 的 REVEAL_DURATION_MS 对齐（那边略长一点做兜底移除 class）。 */
@keyframes reveal-flash {
  0% {
    outline-color: var(--primary);
    box-shadow: 0 0 6px 0 var(--primary-soft, rgba(91, 147, 255, 0.28));
  }
  100% {
    outline-color: rgba(91, 147, 255, 0);
    box-shadow: 0 0 0 0 rgba(91, 147, 255, 0);
  }
}

.window-shell.reveal-hint {
  animation: reveal-flash 0.15s ease-out 1 forwards;
}

/* 用户要求减少动效时：不闪，只短暂显示一条静态细线 */
@media (prefers-reduced-motion: reduce) {
  .window-shell.reveal-hint {
    animation: none;
  }
}
</style>

<style scoped>
/* ── 风险提示（全透明 + 顶栏隐藏 时） ── */
.visibility-warning {
  display: flex;
  gap: 7px;
  align-items: flex-start;
  margin-bottom: 8px;
  padding: 7px 9px;
  border-radius: 8px;
  border: 1px solid rgba(240, 180, 94, 0.42);
  background: rgba(240, 180, 94, 0.12);
  color: var(--text);
  font-size: 11px;
  line-height: 1.55;
}

.visibility-warning-icon {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  margin-top: 1px;
  border-radius: 50%;
  background: var(--warning, #f0b45e);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 14px;
  text-align: center;
}

/* ── 分区折叠头 ──
 * 设置面板有 19 个控件（含 7 行快捷键），内容实测约 2050px；
 * 摸鱼窗口常只有 200~500px 高，平铺时用户要滚很久才找到一项。
 * 折叠后默认只展开最常用的两组，显著缩短滚动距离。 */
.section-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  margin: 8px 0 0;
  padding: 5px 8px;
  border: none;
  border-radius: 7px;
  background: var(--fill-soft);
  color: var(--text);
  font-size: 11.5px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
  /* 点击热区。虽然视觉上变小了，但仍保留 24px，
     低于这个值在触控板上很难点中。 */
  min-height: 24px;
}

.section-toggle:hover {
  background: var(--fill-strong);
}

.section-toggle.open {
  color: var(--primary);
  background: var(--primary-faint);
}

.section-toggle-arrow {
  display: inline-block;
  width: 12px;
  font-size: 10px;
  transition: transform 0.18s ease;
  transform-origin: 50% 50%;
  flex: 0 0 auto;
}

.section-toggle.open .section-toggle-arrow {
  transform: rotate(90deg);
}

.section-toggle-title {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 折叠头之后的区块不再需要顶部外边距（间距由折叠头负责） */
.section-toggle + .settings-block,
.section-toggle + .toggle-grid {
  margin-top: 6px !important;
}

/* 设置面板：摸鱼风格，紧凑低调 */
.settings-modal {
  width: min(480px, 94%);
  padding: 8px 10px;
  box-sizing: border-box;
  font-size: 12px;
}
.settings-modal .settings-header {
  padding-bottom: 6px;
}
.settings-modal .settings-header h2 {
  font-size: 13px !important;
  margin: 0 0 2px !important;
}
.settings-modal .settings-header p {
  font-size: 11px !important;
  margin: 0 !important;
  color: var(--muted);
}
.section-panel {
  padding: 6px 8px;
  margin-top: 6px !important;
}
.settings-modal :deep(.settings-block) {
  margin-top: 6px;
}
.settings-modal :deep(.toggle-grid) {
  margin-top: 6px;
  gap: 6px;
}
.settings-modal :deep(.toggle-column) {
  gap: 0;
}
.settings-modal :deep(.toggle-column .toggle-row),
.settings-modal :deep(.toggle-column .el-button.toggle-row) {
  margin-bottom: 2px !important;
  margin-top: 0 !important;
}
.settings-modal :deep(.toggle-title + .toggle-row),
.settings-modal :deep(.toggle-title + .el-button.toggle-row) {
  margin-top: 4px !important;
}
.settings-modal :deep(.slider) {
  margin-top: 6px;
}
/* ⚠️ 这里的规则带 scoped 属性选择器（.toggle-row[data-v-xxx]），
   特异性 (0,2,0) 高于 style.css 里的纯 class 规则 (0,1,0)，
   因此**会覆盖 style.css 中的同名设置**。
   调整开关行尺寸时要同时改这里，否则改了 style.css 却不生效。 */
.toggle-row {
  min-height: 26px;
  padding: 3px 7px;
  font-size: 11.5px;
}
.toggle-grid {
  gap: 6px;
}
.toggle-title {
  font-size: 11px;
  margin-bottom: 2px;
}
.text-field {
  height: 28px;
  padding: 4px 6px;
  font-size: 12px;
}
.shortcut-grid {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.shortcut-title {
  margin-bottom: 5px;
  font-weight: 600;
  font-size: 11px;
}
.slider-value {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

/* 隐私与痕迹 */
.privacy-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 0;
}
.privacy-label {
  font-size: 11px;
}
.privacy-select {
  font-size: 11px;
  padding: 3px 6px;
  border: 1px solid var(--el-border-color, var(--line-strong));
  border-radius: 4px;
  background: var(--el-fill-color-blank, rgb(var(--bg-rgb)));
  color: inherit;
  cursor: pointer;
}

/* 主题说明文字：次要信息，弱化显示 */
.theme-hint {
  margin: 4px 0 0;
  font-size: 10px;
  color: var(--muted);
  line-height: 1.4;
}

/* 禁用态（如非 system 模式下的网页跟随开关） */
.toggle-row.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.privacy-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.privacy-actions .el-button {
  flex: 1;
  margin-left: 0 !important;
}
.privacy-hint {
  margin: 8px 0 0;
  font-size: 10px;
  line-height: 1.6;
  color: var(--el-text-color-secondary, #909399);
}

@media (max-width: 600px) {
  .settings-modal {
    width: 96%;
    padding: 6px 8px;
  }
  .shortcut-row {
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
  }
  .shortcut-row .shortcut-input {
    width: 100%;
  }
}

/* ── 小窗口自适应 ──
 * 摸鱼场景下窗口常被拉到很小（实测有 360×240、320×200 的用法）。
 * 这里按**高度**收紧间距与字号：矮窗口最缺的是垂直空间，
 * 只按宽度适配不够（窗口可能很宽但很矮）。
 * 用 vh 而非固定 px，保证在各种窗口尺寸下都平滑过渡。 */
@media (max-height: 480px) {
  .section-toggle {
    margin-top: 7px;
    padding: 5px 9px;
    min-height: 26px;
    font-size: 11.5px;
  }
  .settings-modal .settings-header {
    padding-bottom: 3px;
  }
  .settings-modal .settings-header h2 {
    font-size: 12px !important;
  }
}

@media (max-height: 360px) {
  .section-toggle {
    margin-top: 5px;
    padding: 4px 8px;
    min-height: 24px;
    font-size: 11px;
  }
  /* 极矮时隐藏副标题，把空间留给控件 */
  .settings-modal .settings-header p {
    display: none;
  }
  .settings-modal {
    padding: 4px 6px;
  }
}
</style>
