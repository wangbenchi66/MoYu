<script setup>
import { Connection, HomeFilled, Lock, Opportunity, Tools, Unlock } from '@element-plus/icons-vue';
import { defineProps } from 'vue';
import BaseButton from '../components/BaseButton.vue';

const props = defineProps({
  settings: Object,
  headerHoverActive: Boolean,
  openSettingsModal: Function,
  togglePin: Function,
  toggleSetting: Function,
  handleMinimize: Function,
  handleMaximize: Function,
  handleClose: Function,
  goHome: Function
});
</script>

<template>
  <header class="topbar">
    <div class="brand-group">
      <div class="brand-block">
        <BaseButton
          class="home-btn"
          @click="props.goHome">
          <el-icon><HomeFilled /></el-icon>
        </BaseButton>
        <strong>moyu</strong>
      </div>
    </div>

    <div
      class="title-drag drag-region"
      aria-hidden="true"></div>

    <div class="window-controls no-drag">
      <BaseButton
        class="control-btn settings-gear"
        aria-label="设置"
        @click="props.openSettingsModal">
        <el-icon><Tools /></el-icon>
      </BaseButton>
      <BaseButton
        class="control-btn soft-transparent-toggle"
        :class="{ active: props.settings.fullWindowTransparent }"
        aria-label="软件背景透明"
        @click="() => props.toggleSetting && props.toggleSetting('fullWindowTransparent')">
        <el-icon><Opportunity /></el-icon>
      </BaseButton>
      <BaseButton
        class="control-btn page-transparent-toggle"
        :class="{ active: props.settings.pageTransparentMode }"
        aria-label="网站背景透明"
        @click="() => props.toggleSetting && props.toggleSetting('pageTransparentMode')">
        <el-icon><Connection /></el-icon>
      </BaseButton>
      <BaseButton
        class="control-btn pin-toggle"
        :class="{ active: props.settings.alwaysOnTop }"
        aria-label="窗口置顶"
        @click="props.togglePin">
        <el-icon v-if="props.settings.alwaysOnTop"><Lock /></el-icon>
        <el-icon v-else><Unlock /></el-icon>
      </BaseButton>
      <BaseButton
        class="control-btn"
        aria-label="最小化"
        @click="props.handleMinimize">
        -
      </BaseButton>
      <BaseButton
        class="control-btn"
        aria-label="最大化"
        @click="props.handleMaximize">
        □
      </BaseButton>
      <BaseButton
        class="control-btn close"
        aria-label="关闭"
        @click="props.handleClose">
        x
      </BaseButton>
    </div>
  </header>
</template>

<style scoped>
/* TopBar 使用应用的全局样式 */
.brand-group .brand-block {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
}

/* 强制 home 按钮与标题保持同行并垂直居中 */
.brand-group .brand-block .home-btn {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 0 !important;
  margin: 0 !important;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  min-width: 0 !important;
}

/* 防止按钮或标题换行 */
.brand-group .brand-block *,
.brand-group .brand-block {
  white-space: nowrap;
}

/* 放大图标 SVG 尺寸并垂直居中 */
.brand-group .brand-block .home-btn .el-icon svg,
.topbar .window-controls .control-btn .el-icon svg {
  width: 22px;
  height: 22px;
  display: block;
}

/* 移除标题栏右侧控制按钮的边框/背景 */
.topbar .window-controls .control-btn {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 0 6px !important;
  min-width: 0 !important;
}

/* hover 时只改变图标颜色 */
.brand-group .brand-block .home-btn:hover .el-icon,
.topbar .window-controls .control-btn:hover .el-icon {
  color: rgba(0, 0, 0, 0.85);
}

.brand-group .brand-block strong {
  margin: 0;
  display: inline-block;
  line-height: 1;
}
/* 按钮按下（press）效果：轻微下移并显示低对比度背景 */
.topbar .window-controls .control-btn:active,
.brand-group .brand-block .home-btn:active {
  /* 按下时仅保持轻微下移，ring 效果在放置（hover/focus）时显示 */
  transform: translateY(1px) scale(0.995);
}

.topbar .window-controls .control-btn:active .el-icon,
.brand-group .brand-block .home-btn:active .el-icon {
  color: rgba(0, 0, 0, 0.9);
}

/* 放置（hover / focus）时显示多层环状边框与浅色背景，增强可视反馈 */
.topbar .window-controls .control-btn:hover,
.topbar .window-controls .control-btn:focus-visible,
.brand-group .brand-block .home-btn:hover,
.brand-group .brand-block .home-btn:focus-visible {
  transform: translateY(-1px) scale(1.01);
  background: rgba(0, 0, 0, 0.04) !important;
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.06),
    0 0 0 6px rgba(0, 0, 0, 0.04);
}

.topbar .window-controls .control-btn,
.brand-group .brand-block .home-btn {
  transition:
    transform 0.06s ease,
    background-color 0.12s ease,
    color 0.12s ease,
    box-shadow 0.12s ease;
}
</style>
