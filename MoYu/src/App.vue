<!-- App.vue — 根组件：快捷键处理、设置面板、热区悬停、窗口级 UI 布局 -->
<script setup>
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import ShortcutRow from './components/ShortcutRow.vue';
import PrivacyConsent from './components/PrivacyConsent.vue';
import { useDesktopApp } from './composables/useDesktopApp';
import http from './http/index.js';
import TopBar from './components/TopBar.vue';
import MainPage from './pages/MainPage.vue';
import BottomToolbar from './components/BottomToolbar.vue';
import TabBar from './components/TabBar.vue';
import { setForceUpdateActive } from './router/index.js';
import defaultSettings from './shared/defaultSettings.js';
import { reportDevice } from './composables/useDeviceReport.js';

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
  updateInfo
} = useDesktopApp();
const desktopApi = typeof window !== 'undefined' ? window.desktop : null;

// 说明：
// 1. 本文件为渲染进程入口，负责窗口级别的 UI 与全局快捷键处理。
// 2. 主要职责包括：管理设置面板、捕获与匹配快捷键、协调 BottomToolbar 与 MainPage 的交互、以及窗口热区/悬停逻辑。
// 3. 关键事件：window 的 keydown（快捷键捕获）、pointermove（热区检测）、mouseout/blur（失焦/移出回退处理）。

function compareVersions(a, b) {
  const pa = String(a || '0')
    .split('.')
    .map(Number);
  const pb = String(b || '0')
    .split('.')
    .map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

const isSettingsOpen = ref(false);
const hasPrivacyConsent = !!localStorage.getItem('moyu-privacy-consent');
const showPrivacyConsent = ref(!hasPrivacyConsent);
let removeOpenSettingsListener = null;
let _globalErrorHandler = null;
let _globalRejectionHandler = null;
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

// 已同意：关闭弹窗并上报；刚同意也走此路径
function handlePrivacyAgreed() {
  showPrivacyConsent.value = false;
  reportDevice();
}

// 未同意：仅关闭本次弹窗，下次启动继续提示
function handlePrivacyDismissed() {
  showPrivacyConsent.value = false;
}

onMounted(() => {
  initializeDesktopApp();

  // 已同意过隐私协议，每次启动静默上报
  if (hasPrivacyConsent) reportDevice();

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

  // 版本更新检测
  if (desktopApi?.checkForUpdate) {
    desktopApi
      .checkForUpdate()
      .then(async (info) => {
        //TODO:开发环境关闭更新检查，避免频繁访问接口
        if (!info || info.isDev) return;
        //console.log('[update] checkForUpdate result:', info);
        await http
          .get('/api/MoYu/CheckVersion', { platform: info.platform })
          .then((res) => {
            if (!res || !res.success || !res.data?.version) return;
            const { version, downloadUrl, content } = res.data;
            const hasUpdate = compareVersions(version, info.currentVersion) > 0;
            if (hasUpdate) {
              updateInfo.value = { currentVersion: info.currentVersion, latestVersion: version, downloadUrl, updateContent: content };
              setForceUpdateActive(true);
              router.replace({ name: 'update' });
            }
          })
          .catch(() => {
            //如果更新检查失败（如网络问题），接口访问不到就强提示不允许进入
            setForceUpdateActive(true);
            //然后设置一个保底的更新信息，提示用户检查网络或联系管理员
            updateInfo.value = {
              currentVersion: info.currentVersion,
              latestVersion: '9999.9.9',
              downloadUrl:
                'http://qm.qq.com/cgi-bin/qm/qr?_wv=1027&k=Fv7fD8vuvKubhvE0hYSRM2OrkoCLepgr&authKey=QSFki9D1JsetAc7Znyz4ho9n%2FwKBw0YgvELOzr4ASKAP6HEuw%2FJ33owpwrQS8ttJ&noverify=0&group_code=1039337282',
              updateContent: '更新检查失败，点击下方按钮进入qq群(1039337282)获取。'
            };
            router.replace({ name: 'update' });
          });
      })
      .catch((e) => {});
  }

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
        :patchSetting="patchSetting"
        :handleMinimize="handleMinimize"
        :handleMaximize="handleMaximize"
        :handleClose="handleClose"
        :goHome="goHome"
        :activeTab="activeTab"
        :statusMessage="statusMessage" />
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
        :statusMessage="statusMessage" />
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
              max="100"
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

    <PrivacyConsent v-if="showPrivacyConsent" @agreed="handlePrivacyAgreed" @dismissed="handlePrivacyDismissed" />
  </div>
</template>

<style scoped>
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
.toggle-row {
  min-height: 30px;
  padding: 4px 8px;
  font-size: 12px;
}
.toggle-grid {
  gap: 6px;
}
.toggle-title {
  font-size: 11px;
  margin-bottom: 4px;
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
</style>
