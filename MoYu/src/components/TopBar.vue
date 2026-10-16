<!-- TopBar.vue — 顶部标题栏（窗口控制、透明度快速切换、品牌图标） -->
<script setup>
import { CloseBold, Document, Files, Hide, House, Lock, Moon, Mouse, Setting, Sunny, Sunrise, Unlock, View } from '@element-plus/icons-vue';
import { computed, onUnmounted, ref, watch } from 'vue';
import BaseButton from '../components/BaseButton.vue';

// 检测平台：Mac 上窗口控制习惯在左侧
const isMac = computed(() => typeof window !== 'undefined' && window.desktop?.platform === 'darwin');
const isDev = import.meta.env.DEV;

const props = defineProps({
  settings: Object,
  headerHoverActive: Boolean,
  openSettingsModal: Function,
  togglePin: Function,
  toggleSetting: Function,
  patchSetting: Function,
  handleMinimize: Function,
  handleMaximize: Function,
  handleClose: Function,
  goHome: Function,
  activeTab: Object,
  statusMessage: String,
  // 主题：当前设置的模式 + 切换回调（由 App.vue 传入，保持本组件无状态依赖）
  themeMode: { type: String, default: 'system' },
  cycleTheme: Function,
});

/** 主题按钮的图标与提示：跟随系统/浅色/深色 */
const themeIcon = computed(() => {
  const m = props.themeMode;
  if (m === 'light') return 'sunny';
  if (m === 'dark') return 'moon';
  return 'system';
});

const themeTitle = computed(() => {
  const label = props.themeMode === 'light' ? '浅色' : props.themeMode === 'dark' ? '深色' : '跟随系统';
  return `主题：${label}（点击切换 跟随系统 → 浅色 → 深色）`;
});

// 透明度在预设值间循环：15 → 40 → 60 → 85
const cycleTitlebarOpacity = () => {
  try {
    const presets = [0, 20, 50, 85, 100];
    const cur = Number(props.settings?.transparency ?? 85);
    // 找第一个严格大于当前值的预设；到头了就回到 0
    const next = presets.find(v => v > cur) ?? presets[0];
    setOpacity(next);
  } catch (e) {}
};

// 透明度上限与设置面板滑块保持一致（0-100）
const OPACITY_MAX = 100;

/** 记忆「双击前」的非零透明度，用于双击在 0 与它之间切换 */
const lastNonZeroOpacity = ref(0);

function currentOpacity() {
  const v = Number(props.settings?.transparency);
  return Number.isFinite(v) ? v : 0;
}

function setOpacity(v) {
  try {
    const next = Math.max(0, Math.min(OPACITY_MAX, Math.round(Number(v) || 0)));
    const cur = currentOpacity();
    // 记录最近一次非零值（供双击恢复）
    if (cur > 0) lastNonZeroOpacity.value = cur;
    props.patchSetting && props.patchSetting('transparency', next);
  } catch (e) {}
}

// 调节反馈：数字短暂放大，让用户确认微调已生效
const adjusting = ref(false);
let _adjustTimer = null;
function flashAdjusting() {
  try {
    adjusting.value = true;
    if (_adjustTimer) clearTimeout(_adjustTimer);
    _adjustTimer = setTimeout(() => { adjusting.value = false; _adjustTimer = null; }, 420);
  } catch (e) { }
}

/**
 * 滚轮微调透明度：每格 ±1%。
 * 顶栏空间紧张，用滚轮代替滑块，既能精细调节又不占位置。
 */
function onOpacityWheel(e) {
  try {
    // 阻止滚轮穿透到下层（否则可能触发页面滚动）
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY < 0 ? 1 : -1;
    setOpacity(currentOpacity() + delta);
    flashAdjusting();
  } catch (e) {}
}

/**
 * 单击与双击共用同一个按钮，需要区分：
 * 双击必然先触发两次 click，若立即执行会导致透明度被循环两轮再归零。
 * 做法：单击延迟 DBLCLICK_DELAY 执行，等待期内若发生第二次点击就取消它。
 */
const DBLCLICK_DELAY = 220;
let _clickTimer = null;

function onOpacityClick() {
  try {
    if (_clickTimer) {
      // 已在等待中 → 这是第二次点击，交给 dblclick 处理
      clearTimeout(_clickTimer);
      _clickTimer = null;
      return;
    }
    _clickTimer = setTimeout(() => {
      _clickTimer = null;
      cycleTitlebarOpacity();
    }, DBLCLICK_DELAY);
  } catch (e) { }
}

function onOpacityDblClick(e) {
  try {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    // 取消挂起的单击，避免它稍后再执行一次
    if (_clickTimer) { clearTimeout(_clickTimer); _clickTimer = null; }
    const cur = currentOpacity();
    if (cur > 0) {
      lastNonZeroOpacity.value = cur;
      setOpacity(0);
    } else {
      // 记忆值为 0（从未设过非零）时，给一个直观的默认值
      const restore = lastNonZeroOpacity.value > 0 ? lastNonZeroOpacity.value : 50;
      setOpacity(restore);
    }
    flashAdjusting();
  } catch (e) { }
}

onUnmounted(() => {
  if (_clickTimer) { clearTimeout(_clickTimer); _clickTimer = null; }
  clearTimeout(_statusTimer);
});

// 自动隐藏二态循环：关闭 → 移入不显示 → 关闭
const autoHideTitle = computed(() => {
  return props.settings?.autoHide ? '移出隐藏 · 移入不显示（点击关闭）' : '自动隐藏（关闭）';
});
const cycleAutoHide = () => {
  try {
    props.patchSetting && props.patchSetting('autoHide', props.settings?.autoHide ? false : 'hide');
  } catch (e) {}
};

const showStatus = ref(false);
let _statusTimer = null;

watch(() => props.statusMessage, (msg) => {
  if (!msg) return;
  showStatus.value = true;
  clearTimeout(_statusTimer);
  _statusTimer = setTimeout(() => {
    showStatus.value = false;
  }, 2500);
});

function dragAreaText() {
  if (showStatus.value && props.statusMessage) return props.statusMessage;
  const tab = props.activeTab;
  if (!tab) return '';
  if (tab.kind === 'dashboard') return '工作台';
  return tab.title || tab.url || '';
}
</script>

<template>
  <header class="topbar" :class="{ 'is-mac': isMac }">
    <!-- Mac 专属：红绿灯占位区域（titleBarStyle: hidden 时红绿灯浮在内容上，需要留出空间） -->
    <div v-if="isMac" class="mac-trafficlights-space no-drag"></div>

    <!-- 品牌图标（仅 House，无文字） -->
    <div class="brand-group no-drag">
      <BaseButton class="home-btn" @click="props.goHome" title="首页">
        <el-icon><House /></el-icon>
      </BaseButton>
      <span v-if="isDev" class="dev-badge">dev</span>
    </div>

    <!-- 中间拖拽区 -->
    <div class="title-drag drag-region" aria-hidden="true">
      <span
        v-if="dragAreaText()"
        class="drag-title"
        :class="{ 'is-status': showStatus && statusMessage }">
        {{ dragAreaText() }}
      </span>
    </div>

    <!-- 窗口控制区 -->
    <div class="window-controls no-drag">
      <!-- 组1：透明度（空间不足时优先隐藏） -->
      <div class="ctrl-group grp-collapsible-a">
        <BaseButton
          class="ctrl-btn opacity-btn"
          :class="{ 'opacity-adjusting': adjusting }"
          :title="`透明度 ${props.settings?.transparency ?? 0}%｜滚轮微调（±1%）· 单击循环档位 · 双击在 0 与上次值间切换`"
          @click="onOpacityClick"
          @wheel.prevent="onOpacityWheel"
          @dblclick="onOpacityDblClick">
          <span class="opacity-label">{{ props.settings?.transparency ?? 0 }}%</span>
        </BaseButton>
        <!-- 软件背景透明：只让外壳/面板透明（fullWindowTransparent）
             拆成两个按钮而不是循环：循环一次要改多个设置项，
             切换过程中容易出现"点了却像没生效"的错觉，分开更直观可控。 -->
        <BaseButton
          class="ctrl-btn"
          :class="{ active: !!props.settings?.fullWindowTransparent }"
          :title="props.settings?.fullWindowTransparent ? '软件背景透明（已开启，点击关闭）' : '软件背景透明（点击开启）'"
          @click="() => props.toggleSetting && props.toggleSetting('fullWindowTransparent')">
          <el-icon><Files /></el-icon>
        </BaseButton>
        <!-- 网页背景透明：让嵌入的网页也透明（pageTransparentMode） -->
        <BaseButton
          class="ctrl-btn"
          :class="{ active: !!props.settings?.pageTransparentMode }"
          :title="props.settings?.pageTransparentMode ? '网页背景透明（已开启，点击关闭）' : '网页背景透明（点击开启）'"
          @click="() => props.toggleSetting && props.toggleSetting('pageTransparentMode')">
          <el-icon><Document /></el-icon>
        </BaseButton>
        <span class="ctrl-sep"></span>
      </div>

      <!-- 组2：可见性控制（空间不足时次优先隐藏） -->
      <div class="ctrl-group grp-collapsible-b">
        <!-- 主题：点击在「跟随系统 → 浅色 → 深色」间循环 -->
        <BaseButton
          class="ctrl-btn theme-btn"
          :title="themeTitle"
          @click="() => props.cycleTheme && props.cycleTheme()">
          <el-icon v-if="themeIcon === 'sunny'"><Sunny /></el-icon>
          <el-icon v-else-if="themeIcon === 'moon'"><Moon /></el-icon>
          <el-icon v-else><Sunrise /></el-icon>
          <span
            v-if="props.themeMode === 'system'"
            class="state-dot system"></span>
        </BaseButton>
        <BaseButton
          class="ctrl-btn"
          :class="{ active: props.settings.hoverHeaderMode }"
          :title="props.settings.hoverHeaderMode ? '悬停显示标题栏（点击关闭）' : '标题栏改为悬停显示（点击开启）'"
          @click="() => props.toggleSetting && props.toggleSetting('hoverHeaderMode')">
          <el-icon v-if="props.settings.hoverHeaderMode"><View /></el-icon>
          <el-icon v-else><Hide /></el-icon>
          <span
            v-if="props.settings.hoverHeaderMode"
            class="state-dot"></span>
        </BaseButton>
        <BaseButton
          class="ctrl-btn"
          :class="{ active: !!props.settings.autoHide }"
          :title="autoHideTitle"
          @click="cycleAutoHide">
          <!-- 移出隐藏：用鼠标图标直指触发条件（鼠标移出窗口），
               比原先的 Top（向上箭头）更不易被误读成「置顶」 -->
          <el-icon><Mouse /></el-icon>
          <span
            v-if="props.settings.autoHide"
            class="state-dot"></span>
        </BaseButton>
        <BaseButton
          class="ctrl-btn"
          :class="{ active: props.settings.alwaysOnTop }"
          :title="props.settings.alwaysOnTop ? '已置顶（点击取消）' : '窗口置顶（开启）'"
          @click="props.togglePin">
          <el-icon v-if="props.settings.alwaysOnTop"><Lock /></el-icon>
          <el-icon v-else><Unlock /></el-icon>
          <span
            v-if="props.settings.alwaysOnTop"
            class="state-dot"></span>
        </BaseButton>
        <span class="ctrl-sep"></span>
      </div>

      <!-- 组3：窗口操作（始终可见） -->
      <div class="ctrl-group grp-essential">
        <BaseButton
          class="ctrl-btn"
          title="设置"
          @click="props.openSettingsModal">
          <el-icon><Setting /></el-icon>
        </BaseButton>
        <BaseButton
          class="ctrl-btn close-btn"
          title="关闭"
          @click="props.handleClose">
          <el-icon><CloseBold /></el-icon>
        </BaseButton>
      </div>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  height: 28px;
  min-height: 28px;
  max-height: 28px;
  display: flex;
  align-items: center;
  padding: 0 2px 0 6px;
  gap: 0;
}

/* 品牌图标 */
.brand-group {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 4px;
}

.dev-badge {
  font-size: 9px;
  font-weight: 700;
  color: rgb(var(--bg-rgb));
  background: var(--warning);
  padding: 1px 4px;
  border-radius: 3px;
  line-height: 1.2;
  letter-spacing: 0.5px;
}

.home-btn {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 22px !important;
  height: 22px !important;
  padding: 0 !important;
  margin: 0 !important;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  border-radius: 4px !important;
  min-width: 0 !important;
  color: var(--icon);
  transition: background 0.1s ease, color 0.1s ease !important;
  cursor: pointer;
}

.home-btn:hover {
  background: var(--overlay-weak) !important;
  color: var(--icon-hover) !important;
}

.home-btn .el-icon svg {
  width: 14px;
  height: 14px;
  display: block;
}

/* 中间拖拽区
 *
 * flex 说明（重要）：这里是 1 1 0 —— 允许「生长」也允许「收缩到 0」。
 * 原先只写 flex:1（等价 1 1 0%）时标题区会与按钮区争夺空间；
 * 现在配合 .window-controls 的 flex-shrink:0，窗口变窄时**先压缩标题**，
 * 快捷操作始终留在原位（用户明确要求：标题可以不显示，按钮必须保留）。 */
.title-drag {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  height: 100%;
}

.drag-title {
  font-size: 11px;
  color: var(--icon-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 260px;
  transition: color 0.2s ease;
  pointer-events: none;
  user-select: none;
}

.drag-title.is-status {
  color: var(--primary);
  font-weight: 500;
}

/* 窗口控制区
 *
 * flex-shrink: 0 —— **永不收缩**。窗口变窄时由 .title-drag（flex:1 1 0）先让位，
 * 快捷操作始终保留。这是用户明确要求的优先级：标题可以不显示，按钮必须在。
 * 注意不要写 overflow:hidden 后依赖它「静默裁切」，那会把按钮切一半。 */
.window-controls {
  flex: 0 0 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0;
}

/* 通用组容器 */
.ctrl-group {
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 0 0 auto;
}

/*
 * 响应式：窄窗口下**不再隐藏任何按钮组**。
 *
 * 历史：曾用 @media 在 <=420px 隐藏透明度组、<=340px 隐藏可见性组，
 * 结果窗口一小快捷操作就整组消失（用户反馈的实际问题）。
 * 现在改为「压缩标题 + 保留全部按钮」：
 *   - .title-drag { flex: 1 1 0 }      → 空间不足时先缩小到 0
 *   - .window-controls { flex: 0 0 auto } → 按钮区不参与收缩
 * 实测窗口窄到 360px 时全部按钮仍完整可见。
 *
 * 极窄时（< 300px）仅把标题隐藏、按钮缩小间距，功能不丢。
 */
@media (max-width: 360px) {
  /* 标题让位（用户接受「不要标题」） */
  .drag-title { display: none; }
  /* 压缩按钮内边距而非隐藏 */
  .ctrl-btn { padding: 0 3px !important; }
  .opacity-label { min-width: 22px; font-size: 9px; }
}

/* 组3（设置/最小化/关闭）：始终完整显示 */
.grp-essential {
  flex: 0 0 auto;
}

/* 通用控制按钮 */
.ctrl-btn {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  height: 22px !important;
  min-width: 22px !important;
  padding: 0 5px !important;
  margin: 0 !important;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  border-radius: 4px !important;
  transition: background 0.1s ease, color 0.1s ease !important;
  cursor: pointer;
  color: var(--icon);
}

.ctrl-btn .el-icon svg {
  width: 14px;
  height: 14px;
  display: block;
}

.ctrl-btn:hover {
  background: var(--overlay-weak) !important;
  color: var(--icon-hover) !important;
}

/* 激活状态：蓝色图标 + 浅蓝背景 */
.ctrl-btn.active {
  background: rgba(59, 130, 246, 0.12) !important;
  color: var(--primary) !important;
}

.ctrl-btn.active .el-icon {
  color: var(--primary) !important;
}

/* 状态圆点：小窗口下图标语义难辨，用一个点明确「此项已开启」
   单点 = 普通两态开启；双点（.double）= 三态中的最高档 */
.ctrl-btn {
  position: relative;
}

.state-dot {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--primary);
  box-shadow: 0 0 0 1px rgba(var(--bg-rgb), 0.9);
  pointer-events: none;
}

.state-dot.double {
  /* 双点：并排两个点，表示「全部透明」这一档 */
  width: 9px;
  border-radius: 3px;
}

/* 「跟随系统」用灰色点，与「已固定为某主题」的蓝点区分 */
.state-dot.system {
  background: #9aa3b2;
}

.ctrl-btn.active:hover {
  background: rgba(59, 130, 246, 0.2) !important;
}

/* 关闭按钮悬停变红 */
.close-btn:hover {
  background: rgba(235, 84, 84, 0.1) !important;
  color: var(--danger) !important;
}

/* 组间分隔线 */
.ctrl-sep {
  display: inline-block;
  width: 1px;
  height: 12px;
  background: var(--overlay);
  margin: 0 3px;
  flex-shrink: 0;
}

/* Mac 红绿灯占位区域：titleBarStyle: hidden 时红绿灯浮在内容上，需留出约 70px 空间 */
.mac-trafficlights-space {
  flex: 0 0 70px;
  height: 100%;
}

/* Mac 模式下 topbar 不需要额外左侧内缩（红绿灯占位已处理） */
.topbar.is-mac {
  padding-left: 0;
}

/* 透明度数值标签 */
.opacity-label {
  font-size: 10px;
  font-weight: 600;
  color: inherit;
  min-width: 26px;
  text-align: center;
  display: inline-block;
  line-height: 1;
  white-space: nowrap;
  transition: transform 0.08s ease;
}

/* 滚轮/双击微调时的高亮反馈：数字闪一下，提示已生效 */
.opacity-btn.opacity-adjusting .opacity-label {
  transform: scale(1.18);
}

.opacity-btn {
  /* 滚轮调节的语义提示 */
  cursor: ns-resize;
}

.opacity-btn:hover {
  cursor: ns-resize;
}
</style>
