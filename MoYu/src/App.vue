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

function _onMouseMoveForHeader(e) {
  try {
    if (!settings.hoverHeaderMode) {
      if (headerHoverActive.value) headerHoverActive.value = false;
      return;
    }
    const y = e && typeof e.clientY === 'number' ? e.clientY : 0;
    // 当光标靠近窗口顶部时激活；增加迟滞以避免闪烁
    const THRESHOLD = 80; // 触发高度
    const HYSTERESIS = 24; // 取消触发的附加距离，避免抖动
    if (y <= THRESHOLD) {
      if (!headerHoverActive.value) headerHoverActive.value = true;
    } else if (headerHoverActive.value && y > THRESHOLD + HYSTERESIS) {
      headerHoverActive.value = false;
    }
  } catch (e) {}
}

function formatAcceleratorFromEvent(e) {
  // 返回例如: Ctrl+Alt+T
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
  e.preventDefault();
  const acc = formatAcceleratorFromEvent(e);
  if (!acc) return;
  capturedAccel.value = acc;
}

function startEditShortcut(key) {
  editingShortcut.value = key;
  capturedAccel.value = settings[key] || '';
  window.addEventListener('keydown', _onCaptureKeydown);
}

function confirmShortcut(key) {
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
  window.removeEventListener('keydown', _onCaptureKeydown);
  editingShortcut.value = null;
  capturedAccel.value = '';
}

function clearCaptured(key) {
  if (editingShortcut.value !== key) return;
  // 停止捕获键盘事件并将该快捷键保存为空（清除快捷键）
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
  // 全局鼠标移动监听：用于 hover 标题栏逻辑
  try {
    window.addEventListener('mousemove', _onMouseMoveForHeader);
  } catch (e) {}

  if (desktopApi?.onOpenSettingsRequest) {
    removeOpenSettingsListener = desktopApi.onOpenSettingsRequest(() => {
      openSettingsModal();
    });
  }
});

onBeforeUnmount(() => {
  disposeDesktopApp();
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('keydown', _onCaptureKeydown);
  try {
    window.removeEventListener('mousemove', _onMouseMoveForHeader);
  } catch (e) {}
  removeOpenSettingsListener?.();
  removeOpenSettingsListener = null;
});
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
      aria-hidden="true"></div>
    <TopBar
      :settings="settings"
      :headerHoverActive="headerHoverActive"
      :openSettingsModal="openSettingsModal"
      :togglePin="togglePin"
      :toggleSetting="toggleSetting"
      :handleMinimize="handleMinimize"
      :handleMaximize="handleMaximize"
      :handleClose="handleClose" />

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
            <div class="shortcut-title">全局快捷键</div>
            <div class="shortcut-grid">
              <ShortcutRow
                label="老板键"
                :value="settings.bossKey"
                keyName="bossKey"
                :editingKey="editingShortcut"
                :capturedAccel="capturedAccel"
                @start="startEditShortcut"
                @confirm="confirmShortcut"
                @cancel="cancelShortcut"
                @clear="clearCaptured" />

              <ShortcutRow
                label="降低透明"
                :value="settings.decreaseTransparencyShortcut"
                keyName="decreaseTransparencyShortcut"
                :editingKey="editingShortcut"
                :capturedAccel="capturedAccel"
                @start="startEditShortcut"
                @confirm="confirmShortcut"
                @cancel="cancelShortcut"
                @clear="clearCaptured" />

              <ShortcutRow
                label="提高透明"
                :value="settings.increaseTransparencyShortcut"
                keyName="increaseTransparencyShortcut"
                :editingKey="editingShortcut"
                :capturedAccel="capturedAccel"
                @start="startEditShortcut"
                @confirm="confirmShortcut"
                @cancel="cancelShortcut"
                @clear="clearCaptured" />

              <ShortcutRow
                label="鼠标穿透"
                :value="settings.clickThroughShortcut"
                keyName="clickThroughShortcut"
                :editingKey="editingShortcut"
                :capturedAccel="capturedAccel"
                @start="startEditShortcut"
                @confirm="confirmShortcut"
                @cancel="cancelShortcut"
                @clear="clearCaptured" />

              <ShortcutRow
                label="自动滚动：切换（全局）"
                :value="settings.autoToggleShortcut"
                keyName="autoToggleShortcut"
                :editingKey="editingShortcut"
                :capturedAccel="capturedAccel"
                @start="startEditShortcut"
                @confirm="confirmShortcut"
                @cancel="cancelShortcut"
                @clear="clearCaptured" />

              <ShortcutRow
                label="自动滚动：减速（全局）"
                :value="settings.autoSpeedDownShortcut"
                keyName="autoSpeedDownShortcut"
                :editingKey="editingShortcut"
                :capturedAccel="capturedAccel"
                @start="startEditShortcut"
                @confirm="confirmShortcut"
                @cancel="cancelShortcut"
                @clear="clearCaptured" />

              <ShortcutRow
                label="自动滚动：加速（全局）"
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
