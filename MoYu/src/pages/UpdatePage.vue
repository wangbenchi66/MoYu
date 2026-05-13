<!-- UpdatePage.vue — 版本更新检查与更新日志 -->
<script setup>
import { computed } from 'vue';
import { useDesktopApp } from '../composables/useDesktopApp';

defineProps({
  isTransparent: Boolean,
});

const { updateInfo, settings } = useDesktopApp();
const desktopApi = window.desktop;

const currentVersion = computed(() => updateInfo.value?.currentVersion || settings.appVersion || '—');
const latestVersion = computed(() => updateInfo.value?.latestVersion || '—');
const downloadUrl = computed(() => updateInfo.value?.downloadUrl || '');
const updateContent = computed(() => updateInfo.value?.updateContent || '');
const contentLines = computed(() => updateContent.value ? updateContent.value.split('\n').filter(Boolean) : []);

function handleUpdate() {
  if (downloadUrl.value && desktopApi?.openExternal) {
    desktopApi.openExternal(downloadUrl.value);
  }
}
</script>

<template>
  <div class="update-page" :class="{ 'transparent-mode': isTransparent }">
    <div class="update-card">
      <div class="update-icon">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48" fill="none"
          stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </div>

      <h2 class="update-title">发现新版本</h2>

      <div class="version-compare">
        <span class="version-tag old">v{{ currentVersion }}</span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="arrow-icon">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
        <span class="version-tag new">v{{ latestVersion }}</span>
      </div>

      <div v-if="contentLines.length" class="update-content">
        <p v-for="(line, i) in contentLines" :key="i" class="content-line">{{ line }}</p>
      </div>

      <button class="update-btn" @click="handleUpdate" :disabled="!downloadUrl">
        立即更新
      </button>

      <p class="update-hint">点击后将跳转浏览器下载最新安装包</p>
    </div>
  </div>
</template>

<style scoped>
.update-page {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: var(--surface, #fff);
}

.update-page.transparent-mode {
  background: transparent;
}

.update-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 40px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.06);
  max-width: 320px;
  width: 100%;
}

.update-page.transparent-mode .update-card {
  background: rgba(255, 255, 255, 0.75);
}

.update-icon {
  color: #409eff;
  margin-bottom: 12px;
}

.update-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text, #222);
  margin: 0 0 16px;
}

.version-compare {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
}

.version-tag {
  font-size: 13px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 12px;
}

.version-tag.old {
  background: #f0f0f0;
  color: #999;
}

.version-tag.new {
  background: rgba(64, 158, 255, 0.1);
  color: #409eff;
}

.arrow-icon {
  color: #bbb;
  flex-shrink: 0;
}

.update-content {
  width: 100%;
  max-height: 150px;
  overflow-y: auto;
  margin-bottom: 20px;
  padding: 12px 16px;
  border-radius: 8px;
  background: #f8f9fa;
}

.content-line {
  margin: 0;
  font-size: 13px;
  color: #555;
  line-height: 1.8;
}

.update-btn {
  width: 100%;
  padding: 10px 0;
  border: none;
  border-radius: 8px;
  background: #409eff;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease;
}

.update-btn:hover {
  background: #66b1ff;
}

.update-btn:disabled {
  background: #c0c4cc;
  cursor: not-allowed;
}

.update-hint {
  margin: 10px 0 0;
  font-size: 11px;
  color: #999;
}
</style>
