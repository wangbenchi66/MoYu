<!-- AboutPage.vue — 关于页面（显示软件版本信息、检查更新） -->
<script setup>
import { ElMessage, ElMessageBox } from 'element-plus';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { settings } from '../composables/useAppState.js';

defineProps({
  isTransparent: Boolean,
});

const version = ref('');
const platform = ref('');
const releasesUrl = ref('https://github.com/wangbenchi66/MoYu/releases');

const checking = ref(false);
const downloading = ref(false);
const progress = ref(0);
// 已查到的新版本信息（用于「下载」按钮）
const pendingUpdate = ref(null);

let _removeProgress = null;

/**
 * 检查更新：走主进程的 electron-updater（数据源是 GitHub Releases）。
 * 不再请求任何自建后端地址。
 */
async function checkUpdate() {
  const api = window.desktop;
  if (!api?.checkForUpdate) {
    ElMessage({ message: '当前环境不支持检查更新', type: 'info' });
    return;
  }
  checking.value = true;
  pendingUpdate.value = null;
  try {
    const r = await api.checkForUpdate();
    if (!r || r.ok === false) {
      ElMessage({ message: r?.error || '检查更新失败', type: 'warning' });
      return;
    }
    if (r.releasesUrl) releasesUrl.value = r.releasesUrl;
    if (r.hasUpdate) {
      pendingUpdate.value = r;
      ElMessage({ message: `发现新版本 ${r.latestVersion}`, type: 'success' });
    } else {
      ElMessage({ message: `已是最新版本（${r.currentVersion}）`, type: 'success' });
    }
  } catch (e) {
    ElMessage({ message: '检查更新失败，请检查网络', type: 'error' });
  } finally {
    checking.value = false;
  }
}

/** 下载已发现的更新，进度通过 update:download-progress 推送 */
async function downloadUpdate() {
  const api = window.desktop;
  if (!api?.downloadUpdate) return;
  downloading.value = true;
  progress.value = 0;
  try {
    const r = await api.downloadUpdate();
    if (!r || r.ok === false) {
      ElMessage({ message: r?.error || '下载失败', type: 'error' });
      return;
    }
    // 下载完成，询问是否立即重启安装
    try {
      await ElMessageBox.confirm('更新已下载完成，是否立即重启并安装？', '安装更新', {
        confirmButtonText: '立即重启安装',
        cancelButtonText: '稍后',
        type: 'success',
      });
      await installUpdate();
    } catch (e) { /* 用户选择稍后 */ }
  } catch (e) {
    ElMessage({ message: '下载失败，请检查网络', type: 'error' });
  } finally {
    downloading.value = false;
  }
}

async function installUpdate() {
  const api = window.desktop;
  if (!api?.installUpdate) return;
  try {
    await api.installUpdate();
  } catch (e) { }
}

/** 打开 GitHub Releases 页（自动更新不可用时的兜底入口） */
function openReleases() {
  try {
    window.desktop?.openExternal?.(releasesUrl.value);
  } catch (e) { }
}

onMounted(async () => {
  try {
    const api = window.desktop;
    // 本地版本信息（不联网）
    if (api?.getUpdateVersion) {
      const info = await api.getUpdateVersion();
      if (info) {
        version.value = info.currentVersion || '';
        platform.value = info.platform || '';
        if (info.releasesUrl) releasesUrl.value = info.releasesUrl;
      }
    } else if (api?.checkForUpdate) {
      const info = await api.checkForUpdate();
      if (info) {
        version.value = info.currentVersion || '';
        platform.value = info.platform || '';
      }
    }
    // 订阅下载进度
    _removeProgress = api?.onUpdateProgress?.((p) => {
      progress.value = Math.max(0, Math.min(100, Number(p?.percent) || 0));
    }) || null;
  } catch (e) { }
});

onBeforeUnmount(() => {
  try { if (_removeProgress) { _removeProgress(); _removeProgress = null; } } catch (e) { }
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
      <div
        class="info-row clickable"
        @click="checkUpdate">
        <span class="info-label">检查更新</span>
        <span class="info-value">
          <span v-if="checking" class="checking-text">检查中...</span>
          <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </span>
      </div>

      <!-- 发现新版本：提供下载 / 前往 Releases 两个入口 -->
      <template v-if="pendingUpdate">
        <div class="update-box">
          <div class="update-title">发现新版本 {{ pendingUpdate.latestVersion }}</div>
          <div class="update-sub">当前 {{ pendingUpdate.currentVersion }}</div>

          <div
            v-if="downloading"
            class="update-progress">
            <div
              class="update-progress-bar"
              :style="{ width: progress + '%' }"></div>
            <span class="update-progress-text">下载中 {{ progress }}%</span>
          </div>

          <div
            v-else
            class="update-actions">
            <el-button
              size="small"
              type="primary"
              @click="downloadUpdate">
              下载并安装
            </el-button>
            <el-button
              size="small"
              @click="openReleases">
              手动下载
            </el-button>
          </div>
        </div>
      </template>

      <!-- 兜底入口：自动更新不可用时（如平台不支持、权限问题）仍能拿到新版本 -->
      <div
        class="info-row clickable"
        @click="openReleases">
        <span class="info-label">GitHub Releases</span>
        <span class="info-value">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
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
  color: var(--text, var(--text));
}

.app-version {
  font-size: 13px;
  color: var(--primary);
  font-weight: 500;
}

.app-platform {
  font-size: 11px;
  color: var(--muted);
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
  border-bottom: 1px solid var(--fill-soft);
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.info-value {
  font-size: 13px;
  font-weight: 500;
  color: var(--text, var(--text));
}

.info-row.clickable {
  cursor: pointer;
  transition: background 0.12s;
}

.info-row.clickable:hover {
  background: var(--primary-faint);
}

.checking-text {
  font-size: 12px;
  color: var(--muted);
}

/* 新版本提示框 */
.update-box {
  margin-top: 6px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--primary-faint);
  border: 1px solid var(--line);
}

.update-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.update-sub {
  margin-top: 2px;
  font-size: 11px;
  color: var(--muted);
}

.update-actions {
  margin-top: 8px;
  display: flex;
  gap: 6px;
}

/* 下载进度条 */
.update-progress {
  position: relative;
  margin-top: 8px;
  height: 20px;
  border-radius: 4px;
  background: var(--fill-soft);
  overflow: hidden;
}

.update-progress-bar {
  height: 100%;
  background: var(--primary);
  transition: width 0.2s ease;
}

.update-progress-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--text);
  mix-blend-mode: difference;
}
</style>
