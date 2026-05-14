<!-- TopBar.vue — 顶部标题栏（窗口控制、透明度快速切换、品牌图标） -->
<script setup>
import { CloseBold, Hide, House, Lock, Monitor, Picture, Pointer, Setting, Unlock } from '@element-plus/icons-vue';
import { computed, onUnmounted, ref, watch } from 'vue';
import BaseButton from '../components/BaseButton.vue';

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
});

// 透明度在预设值间循环：15 → 40 → 60 → 85
const cycleTitlebarOpacity = () => {
  try {
    const presets = [0, 20, 50, 85, 100];
    const cur = Number(props.settings?.transparency ?? 85);
    // 找第一个严格大于当前值的预设；到头了就回到 0
    const next = presets.find(v => v > cur) ?? presets[0];
    props.patchSetting && props.patchSetting('transparency', next);
  } catch (e) {}
};

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

onUnmounted(() => clearTimeout(_statusTimer));

function dragAreaText() {
  if (showStatus.value && props.statusMessage) return props.statusMessage;
  const tab = props.activeTab;
  if (!tab) return '';
  if (tab.kind === 'dashboard') return '工作台';
  return tab.title || tab.url || '';
}
</script>

<template>
  <header class="topbar">
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
          :title="`透明度 ${props.settings?.transparency ?? 85}%（点击循环切换）`"
          @click="cycleTitlebarOpacity">
          <span class="opacity-label">{{ props.settings?.transparency ?? 85 }}%</span>
        </BaseButton>
        <BaseButton
          class="ctrl-btn"
          :class="{ active: props.settings.fullWindowTransparent }"
          :title="props.settings.fullWindowTransparent ? '软件背景透明（关闭）' : '软件背景透明（开启）'"
          @click="() => props.toggleSetting && props.toggleSetting('fullWindowTransparent')">
          <el-icon><Monitor /></el-icon>
        </BaseButton>
        <BaseButton
          class="ctrl-btn"
          :class="{ active: props.settings.pageTransparentMode }"
          :title="props.settings.pageTransparentMode ? '网页背景透明（关闭）' : '网页背景透明（开启）'"
          @click="() => props.toggleSetting && props.toggleSetting('pageTransparentMode')">
          <el-icon><Picture /></el-icon>
        </BaseButton>
        <span class="ctrl-sep"></span>
      </div>

      <!-- 组2：可见性控制（空间不足时次优先隐藏） -->
      <div class="ctrl-group grp-collapsible-b">
        <BaseButton
          class="ctrl-btn"
          :class="{ active: props.settings.hoverHeaderMode }"
          :title="props.settings.hoverHeaderMode ? '悬停标题栏（关闭）' : '悬停标题栏（开启）'"
          @click="() => props.toggleSetting && props.toggleSetting('hoverHeaderMode')">
          <el-icon><Hide /></el-icon>
        </BaseButton>
        <BaseButton
          class="ctrl-btn"
          :class="{ active: !!props.settings.autoHide }"
          :title="autoHideTitle"
          @click="cycleAutoHide">
          <el-icon><Pointer /></el-icon>
        </BaseButton>
        <BaseButton
          class="ctrl-btn"
          :class="{ active: props.settings.alwaysOnTop }"
          :title="props.settings.alwaysOnTop ? '已置顶（点击取消）' : '窗口置顶（开启）'"
          @click="props.togglePin">
          <el-icon v-if="props.settings.alwaysOnTop"><Lock /></el-icon>
          <el-icon v-else><Unlock /></el-icon>
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
  color: #fff;
  background: #e6a23c;
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
  color: rgba(0, 0, 0, 0.5);
  transition: background 0.1s ease, color 0.1s ease !important;
  cursor: pointer;
}

.home-btn:hover {
  background: rgba(0, 0, 0, 0.06) !important;
  color: rgba(0, 0, 0, 0.8) !important;
}

.home-btn .el-icon svg {
  width: 14px;
  height: 14px;
  display: block;
}

/* 中间拖拽区 */
.title-drag {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  height: 100%;
}

.drag-title {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.35);
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

/* 窗口控制区：允许收缩，overflow hidden 使内容静默消失而非溢出 */
.window-controls {
  flex: 0 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0;
  overflow: hidden;
}

/* 通用组容器 */
.ctrl-group {
  display: flex;
  align-items: center;
  overflow: hidden;
  min-width: 0;
}

/* 组1（透明度）：空间不足时优先消失 */
.grp-collapsible-a {
  flex: 0 3 auto;
}

/* 组2（可见性）：次优先消失 */
.grp-collapsible-b {
  flex: 0 2 auto;
}

/* 组3（最小化/关闭）：始终完整显示 */
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
  color: rgba(0, 0, 0, 0.5);
}

.ctrl-btn .el-icon svg {
  width: 14px;
  height: 14px;
  display: block;
}

.ctrl-btn:hover {
  background: rgba(0, 0, 0, 0.06) !important;
  color: rgba(0, 0, 0, 0.8) !important;
}

/* 激活状态：蓝色图标 + 浅蓝背景 */
.ctrl-btn.active {
  background: rgba(59, 130, 246, 0.12) !important;
  color: #2f78ff !important;
}

.ctrl-btn.active .el-icon {
  color: #2f78ff !important;
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
  background: rgba(0, 0, 0, 0.1);
  margin: 0 3px;
  flex-shrink: 0;
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
}
</style>
