<!-- AboutPage.vue — 关于页面（显示软件版本信息） -->
<script setup>
import { ElMessage } from 'element-plus';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import http from '../http/index.js';
import { settings } from '../composables/useAppState.js';

defineProps({
  isTransparent: Boolean,
});

const router = useRouter();
const version = ref('');
const platform = ref('');
const checking = ref(false);

function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map(Number);
  const pb = String(b || '0').split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

async function checkUpdate() {
  // 后端在线服务已关闭：不发起版本检测请求
  if (!settings.backendEnabled) {
    ElMessage({ message: '后端在线服务已关闭，版本检测不可用', type: 'info' });
    return;
  }
  const desktopApi = window.desktop;
  if (!desktopApi?.checkForUpdate) return;
  checking.value = true;
  try {
    const info = await desktopApi.checkForUpdate();
    if (!info || info.isDev) {
      ElMessage({ message: '开发环境不支持更新检查', type: 'info' });
      return;
    }
    const res = await http.get('/api/MoYu/CheckVersion', { platform: info.platform });
    if (!res || !res.success || !res.data?.version) {
      ElMessage({ message: '当前已是最新版本', type: 'success' });
      return;
    }
    const latest = res.data.version;
    if (compareVersions(latest, info.currentVersion) > 0) {
      router.push({ name: 'update' });
    } else {
      ElMessage({ message: '当前已是最新版本', type: 'success' });
    }
  } catch (e) {
    ElMessage({ message: '检查更新失败，请检查网络', type: 'error' });
  } finally {
    checking.value = false;
  }
}

onMounted(async () => {
  try {
    const desktopApi = window.desktop;
    if (desktopApi?.checkForUpdate) {
      const info = await desktopApi.checkForUpdate();
      if (info) {
        version.value = info.currentVersion || '';
        platform.value = info.platform || '';
      }
    }
  } catch (e) {}
});
</script>

<template>
  <div class="about-page" :class="{ 'transparent-page': isTransparent }">
    <section class="about-card">
      <img src="/icon.png" class="app-icon" alt="MoYu" />
      <h2 class="app-name">摸鱼工作台</h2>
      <span class="app-version">v{{ version || '—' }}</span>
      <span class="app-platform">{{ platform === 'mac' ? 'macOS' : 'Windows' }}</span>
    </section>

    <section class="info-section">
      <div class="info-row">
        <span class="info-label">版本号</span>
        <span class="info-value">{{ version || '—' }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">运行平台</span>
        <span class="info-value">{{ platform === 'mac' ? 'macOS' : 'Windows' }}</span>
      </div>
      <div class="info-row clickable" @click="checkUpdate">
        <span class="info-label">检查更新</span>
        <span class="info-value">
          <span v-if="checking" class="checking-text">检查中...</span>
          <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.about-page {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 6px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

.about-page.transparent-page .about-card,
.about-page.transparent-page .info-section {
  background: transparent !important;
  box-shadow: none !important;
}

.about-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 28px 0 20px;
  background: var(--surface);
  border-radius: 8px;
}

.app-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
}

.app-name {
  margin: 4px 0 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text, #333);
}

.app-version {
  font-size: 13px;
  color: #409eff;
  font-weight: 500;
}

.app-platform {
  font-size: 11px;
  color: #999;
}

.info-section {
  background: var(--surface);
  border-radius: 8px;
  overflow: hidden;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid #f5f5f5;
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  font-size: 13px;
  color: #666;
}

.info-value {
  font-size: 13px;
  font-weight: 500;
  color: var(--text, #333);
}

.info-row.clickable {
  cursor: pointer;
  transition: background 0.12s;
}

.info-row.clickable:hover {
  background: rgba(64, 158, 255, 0.04);
}

.checking-text {
  font-size: 12px;
  color: #999;
}
</style>
