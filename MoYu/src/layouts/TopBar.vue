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
  <header class="topbar drag-region">
    <div class="brand-group">
      <div class="brand-block">
        <el-button
          class="home-btn"
          @click="props.goHome">
          <el-icon><HomeFilled /></el-icon>
        </el-button>
        <strong>moyu</strong>
      </div>
    </div>

    <div
      class="title-drag"
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
  align-items: center;
  gap: 8px;
}

.brand-group .brand-block el-icon,
.brand-group .brand-block .el-icon,
.brand-group .brand-block .home-btn {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 4px;
  border-radius: 6px;
  transition:
    background-color 0.12s ease,
    transform 0.08s ease,
    color 0.12s ease;
}

/* hover 时图标显示深色背景效果 */
.brand-group .brand-block el-icon:hover,
.brand-group .brand-block .el-icon:hover,
.brand-group .brand-block .home-btn:hover {
  background: rgba(0, 0, 0, 0.12);
  color: rgba(0, 0, 0, 0.85);
  transform: translateY(-1px);
}

.brand-group .brand-block strong {
  margin: 0;
  display: inline-block;
  line-height: 1;
}
</style>
