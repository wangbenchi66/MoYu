<!-- TopBar.vue — 顶部标题栏（窗口控制、透明度快速切换、品牌图标） -->
<script setup>
import {
  CloseBold,
  DArrowLeft,
  DArrowRight,
  Document,
  Files,
  Hide,
  House,
  Lock,
  MagicStick,
  Mouse,
  Setting,
  Unlock,
  View,
} from "@element-plus/icons-vue";
import { computed, onUnmounted, ref, watch } from "vue";
import BaseButton from "../components/BaseButton.vue";

// 检测平台：Mac 上窗口控制习惯在左侧
const isMac = computed(
  () => typeof window !== "undefined" && window.desktop?.platform === "darwin",
);
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
  themeMode: { type: String, default: "system" },
  cycleTheme: Function,
});

// 透明度在预设值间循环：0 → 20 → 50 → 85 → 100
const cycleTitlebarOpacity = () => {
  try {
    const presets = [0, 20, 50, 85, 100];
    const cur = Number(props.settings?.transparency ?? 85);
    // 找第一个严格大于当前值的预设；到头了就回到 0
    const next = presets.find((v) => v > cur) ?? presets[0];
    setOpacity(next);
  } catch (e) {}
};

// 透明度上限与设置面板滑块保持一致（0-100）
const OPACITY_MAX = 100;

function currentOpacity() {
  const v = Number(props.settings?.transparency);
  return Number.isFinite(v) ? v : 0;
}

function setOpacity(v) {
  try {
    const next = Math.max(0, Math.min(OPACITY_MAX, Math.round(Number(v) || 0)));
    props.patchSetting && props.patchSetting("transparency", next);
  } catch (e) {}
}

// 调节反馈：数字短暂放大，让用户确认微调已生效
const adjusting = ref(false);
let _adjustTimer = null;
function flashAdjusting() {
  try {
    adjusting.value = true;
    if (_adjustTimer) clearTimeout(_adjustTimer);
    _adjustTimer = setTimeout(() => {
      adjusting.value = false;
      _adjustTimer = null;
    }, 420);
  } catch (e) {}
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
 * 单击循环透明度档位。
 *
 * 之前为了区分「单击循环档位」和「双击在 0 与上次值间切换」，
 * 单击要延迟 220ms 等一等看有没有第二次点击 —— 体感上就是「点了没反应」。
 * 现在双击功能已按需求移除，单击可以直接执行，响应更跟手。
 */
function onOpacityClick() {
  try {
    cycleTitlebarOpacity();
  } catch (e) {}
}

onUnmounted(() => {
  clearTimeout(_statusTimer);
});

/**
 * 顶栏图标的展开/收起。
 *
 * 默认收起：只留「透明度」「标题栏显隐」「关闭」三个高频入口 + 一个箭头，
 * 窗口小的时候顶栏不会挤满图标。点箭头才展开其余（软件透明、网页透明、
 * 主题、自动隐藏、置顶、设置）。
 *
 * 箭头方向：展开时 DArrowLeft（«），收起时 DArrowRight（»）。
 * 箭头位置固定在关闭按钮左侧，不随展开状态移动。
 */
const iconsExpanded = ref(false);

const iconsToggleTitle = computed(() =>
  iconsExpanded.value ? "收起顶栏图标" : "展开全部顶栏图标",
);

// ─── 极简模式 ───

/** 极简模式下使用的透明度档位 */
const MINIMAL_OPACITY = 50;

/**
 * 极简模式：一键把「摸鱼时最该打开」的几项同时设好。
 *
 * 包含：软件背景透明 + 网页背景透明 + 窗口置顶 + 标题栏悬停显示 + 透明度 50%。
 *
 * 状态用**派生**判断，不额外存一个 minimalMode 设置项：
 * 上述五项全部满足才算「开」。好处是用户在顶栏手动关掉任意一项后，
 * 这个开关会自动反映为「关」，不会出现「开关显示开着、实际却不满配」的错位。
 *
 * 点关闭时会把五项**全部**还原（透明度回 0），不只是翻转当前那一项，
 * 这样即便用户中途手动开过某些项也能一次收干净。
 */
const minimalActive = computed(() => {
  const s = props.settings || {};
  return (
    !!s.fullWindowTransparent &&
    !!s.pageTransparentMode &&
    !!s.alwaysOnTop &&
    !!s.hoverHeaderMode &&
    Number(s.transparency) === MINIMAL_OPACITY
  );
});

const minimalTitle = computed(() =>
  minimalActive.value
    ? "极简模式（已开启，点击全部关闭）"
    : "极简模式（软件透明 + 网页透明 + 置顶 + 悬停标题栏 + 透明度 50%）",
);

function toggleMinimalMode() {
  try {
    const patch = props.patchSetting;
    if (typeof patch !== "function") return;

    if (minimalActive.value) {
      // 关闭：五项全部还原，透明度回到 0
      patch("fullWindowTransparent", false);
      patch("pageTransparentMode", false);
      patch("alwaysOnTop", false);
      patch("hoverHeaderMode", false);
      patch("transparency", 0);
    } else {
      // 开启：一次性设成极简组合
      patch("fullWindowTransparent", true);
      patch("pageTransparentMode", true);
      patch("alwaysOnTop", true);
      patch("hoverHeaderMode", true);
      patch("transparency", MINIMAL_OPACITY);
    }
  } catch (e) {}
}

// 自动隐藏二态循环：关闭 → 移入不显示 → 关闭
const autoHideTitle = computed(() => {
  return props.settings?.autoHide
    ? "移出隐藏 · 移入不显示（点击关闭）"
    : "自动隐藏（关闭）";
});
const cycleAutoHide = () => {
  try {
    props.patchSetting &&
      props.patchSetting("autoHide", props.settings?.autoHide ? false : "hide");
  } catch (e) {}
};

const showStatus = ref(false);
let _statusTimer = null;

watch(
  () => props.statusMessage,
  (msg) => {
    if (!msg) return;
    showStatus.value = true;
    clearTimeout(_statusTimer);
    _statusTimer = setTimeout(() => {
      showStatus.value = false;
    }, 2500);
  },
);

function dragAreaText() {
  if (showStatus.value && props.statusMessage) return props.statusMessage;
  const tab = props.activeTab;
  if (!tab) return "";
  if (tab.kind === "dashboard") return "工作台";
  return tab.title || tab.url || "";
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
        :class="{ 'is-status': showStatus && statusMessage }"
      >
        {{ dragAreaText() }}
      </span>
    </div>

    <!-- 窗口控制区
         布局：常显（透明度 / 标题栏显隐）→ 展开箭头 → 折叠区（其余全部图标）
         折叠区默认隐藏，点箭头才展开。 -->
    <div class="window-controls no-drag">
      <!-- ── 常显：透明度 ── -->
      <div class="ctrl-group">
        <BaseButton
          class="ctrl-btn opacity-btn"
          :class="{ 'opacity-adjusting': adjusting }"
          :title="`透明度 ${props.settings?.transparency ?? 0}%｜滚轮微调（±1%）· 单击循环档位`"
          @click="onOpacityClick"
          @wheel.prevent="onOpacityWheel"
        >
          <span class="opacity-label"
            >{{ props.settings?.transparency ?? 0 }}%</span
          >
        </BaseButton>
      </div>

      <!-- ── 常显：标题栏显隐 ── -->
      <div class="ctrl-group">
        <BaseButton
          class="ctrl-btn"
          :class="{ active: props.settings.hoverHeaderMode }"
          :title="
            props.settings.hoverHeaderMode
              ? '悬停显示标题栏（点击关闭）'
              : '标题栏改为悬停显示（点击开启）'
          "
          @click="
            () => props.toggleSetting && props.toggleSetting('hoverHeaderMode')
          "
        >
          <el-icon v-if="props.settings.hoverHeaderMode"><View /></el-icon>
          <el-icon v-else><Hide /></el-icon>
          <span v-if="props.settings.hoverHeaderMode" class="state-dot"></span>
        </BaseButton>
      </div>

      <!-- ── 常显：极简模式 ──
           一键开关「软件透明 + 网页透明 + 置顶 + 悬停标题栏 + 透明度 50%」。
           不放进折叠区：它是常用的一键切换，藏起来就失去意义了。 -->
      <div class="ctrl-group">
        <BaseButton
          class="ctrl-btn"
          :class="{ active: minimalActive }"
          :title="minimalTitle"
          @click="toggleMinimalMode"
        >
          <el-icon><MagicStick /></el-icon>
          <span v-if="minimalActive" class="state-dot"></span>
        </BaseButton>
      </div>

      <!-- ── 折叠区：其余全部图标，默认隐藏 ── -->
      <div v-show="iconsExpanded" class="ctrl-group ctrl-group-extra">
        <!-- 软件背景透明：只让外壳/面板透明（fullWindowTransparent）
             拆成两个按钮而不是循环：循环一次要改多个设置项，
             切换过程中容易出现"点了却像没生效"的错觉，分开更直观可控。 -->
        <BaseButton
          class="ctrl-btn"
          :class="{ active: !!props.settings?.fullWindowTransparent }"
          :title="
            props.settings?.fullWindowTransparent
              ? '软件背景透明（已开启，点击关闭）'
              : '软件背景透明（点击开启）'
          "
          @click="
            () =>
              props.toggleSetting &&
              props.toggleSetting('fullWindowTransparent')
          "
        >
          <el-icon><Files /></el-icon>
        </BaseButton>
        <!-- 网页背景透明：让嵌入的网页也透明（pageTransparentMode） -->
        <BaseButton
          class="ctrl-btn"
          :class="{ active: !!props.settings?.pageTransparentMode }"
          :title="
            props.settings?.pageTransparentMode
              ? '网页背景透明（已开启，点击关闭）'
              : '网页背景透明（点击开启）'
          "
          @click="
            () =>
              props.toggleSetting && props.toggleSetting('pageTransparentMode')
          "
        >
          <el-icon><Document /></el-icon>
        </BaseButton>
        <span class="ctrl-sep"></span>

        <BaseButton
          class="ctrl-btn"
          :class="{ active: !!props.settings.autoHide }"
          :title="autoHideTitle"
          @click="cycleAutoHide"
        >
          <!-- 移出隐藏：用鼠标图标直指触发条件（鼠标移出窗口），
               比原先的 Top（向上箭头）更不易被误读成「置顶」 -->
          <el-icon><Mouse /></el-icon>
          <span v-if="props.settings.autoHide" class="state-dot"></span>
        </BaseButton>
        <BaseButton
          class="ctrl-btn"
          :class="{ active: props.settings.alwaysOnTop }"
          :title="
            props.settings.alwaysOnTop
              ? '已置顶（点击取消）'
              : '窗口置顶（开启）'
          "
          @click="props.togglePin"
        >
          <el-icon v-if="props.settings.alwaysOnTop"><Lock /></el-icon>
          <el-icon v-else><Unlock /></el-icon>
          <span v-if="props.settings.alwaysOnTop" class="state-dot"></span>
        </BaseButton>
        <span class="ctrl-sep"></span>

        <!-- 设置（关闭按钮不在这里，它常驻在最右侧） -->
        <BaseButton
          class="ctrl-btn"
          title="设置"
          @click="props.openSettingsModal"
        >
          <el-icon><Setting /></el-icon>
        </BaseButton>
      </div>

      <!-- ── 展开 / 收起 ──
           位置固定在关闭按钮左侧，不随展开状态移动。
           图标：收起时 DArrowLeft（«），展开时 DArrowRight（»）。 -->
      <BaseButton
        class="ctrl-btn expand-toggle"
        :class="{ active: iconsExpanded }"
        :title="iconsToggleTitle"
        @click="iconsExpanded = !iconsExpanded"
      >
        <el-icon v-if="iconsExpanded"><DArrowRight /></el-icon>
        <!-- 展开：« -->
        <el-icon v-else><DArrowLeft /></el-icon>
        <!-- 收起：» -->
      </BaseButton>

      <span class="ctrl-sep"></span>

      <!-- ── 常显：关闭 ──
           始终在最右端。收起状态下也要能直接关窗口，不该被迫先展开。 -->
      <div class="ctrl-group">
        <BaseButton
          class="ctrl-btn close-btn"
          title="关闭"
          @click="props.handleClose"
        >
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
  transition:
    background 0.1s ease,
    color 0.1s ease !important;
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
  .drag-title {
    display: none;
  }
  /* 压缩按钮内边距而非隐藏 */
  .ctrl-btn {
    padding: 0 3px !important;
  }
  .opacity-label {
    min-width: 22px;
    font-size: 9px;
  }
}

/* ── 展开/收起箭头 ──
 *
 * 常显，位置固定在关闭按钮左侧。展开时 DArrowLeft（«），收起时 DArrowRight（»）。
 * 展开期间套用 .ctrl-btn.active 的蓝底蓝字，让「现在是展开状态」一眼可见。 */
.expand-toggle {
  flex: 0 0 auto;
}

/* ── 折叠区（其余全部图标）──
 * 默认 v-show 隐藏，点箭头才出现。flex 布局与常显组一致。 */
.ctrl-group-extra {
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
  transition:
    background 0.1s ease,
    color 0.1s ease !important;
  cursor: pointer;
  color: var(--icon);
}

.ctrl-btn .el-icon svg {
  width: 14px;
  height: 14px;
  display: block;
}

/* 展开/收起箭头：双箭头（«/»）比单图标更"重"，在 14px 下显得偏大，
   单独缩一档，避免它比相邻按钮更抢眼。 */
.ctrl-btn.expand-toggle .el-icon svg {
  width: 11px;
  height: 11px;
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
