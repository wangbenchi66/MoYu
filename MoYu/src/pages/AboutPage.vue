<!-- AboutPage.vue — 关于页面（显示软件版本信息、检查更新） -->
<script setup>
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
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
// 上次自动下载失败的原因（非空时提示用户改用手动下载）
const autoUpdateError = ref('');

let _removeProgress = null;

const isMac = computed(() => platform.value === 'mac');

/**
 * 手动下载时该找的文件名。
 *
 * 与 package.json 的 artifactName 对应：
 *   ${productName}-${version}-${os}-${arch}.${ext}
 * macOS CI 用 --universal，所以是 universal；Windows 是 win-x64。
 *
 * 没有检测到新版本时用占位符，避免显示一个不存在的具体版本号。
 */
const manualFileName = computed(() => {
  const v = pendingUpdate.value?.latestVersion || 'x.y.z';
  return isMac.value ? `MoYu-${v}-universal.dmg` : `MoYu-${v}-win-x64.exe`;
});

/** 手动更新的分步说明（按平台不同） */
const manualSteps = computed(() => {
  if (isMac.value) {
    return [
      `打开 Releases 页面，找到最新的版本`,
      `下载 ${manualFileName.value}`,
      '打开下载好的 dmg，把 MoYu 图标拖进「应用程序」文件夹',
      '在「应用程序」里重新打开 MoYu（第一次可能需要在图标上右键 → 打开）',
    ];
  }
  return [
    `打开 Releases 页面，找到最新的版本`,
    `下载 ${manualFileName.value}`,
    '运行下载好的安装包，按向导完成安装',
    '重新打开 MoYu',
  ];
});

/** 自动更新在 macOS 上可能因未签名而失败——需要提前告知用户 */
const showMacSigningHint = computed(() => isMac.value);

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
  autoUpdateError.value = '';
  try {
    const r = await api.downloadUpdate();
    if (!r || r.ok === false) {
      const msg = r?.error || '下载失败';
      // 记下失败原因：界面上会就地显示，并把「手动下载」作为主要出路
      autoUpdateError.value = msg;
      ElMessage({ message: msg + '，可改用手动下载', type: 'warning' });
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
    autoUpdateError.value = e?.message || '下载失败';
    ElMessage({ message: '下载失败，可改用手动下载', type: 'warning' });
  } finally {
    downloading.value = false;
  }
}

async function installUpdate() {
  const api = window.desktop;
  if (!api?.installUpdate) return;
  try {
    const r = await api.installUpdate();
    // quitAndInstall 在未签名的 macOS 上可能失败；这种情况也要指回手动安装
    if (r && r.ok === false) {
      autoUpdateError.value = r.error || '安装失败';
      ElMessage({ message: '自动安装失败，请手动下载安装', type: 'warning' });
    }
  } catch (e) {
    autoUpdateError.value = e?.message || '安装失败';
  }
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
              自动更新
            </el-button>
            <el-button
              size="small"
              :type="autoUpdateError ? 'primary' : ''"
              @click="openReleases">
              去手动下载
            </el-button>
          </div>

          <!-- 自动更新失败：就地说明原因，并把用户引导到手动下载 -->
          <div
            v-if="autoUpdateError"
            class="update-error">
            <span class="update-error-icon">!</span>
            <span>
              自动更新失败：{{ autoUpdateError }}。
              请点上方「去手动下载」，按下方「手动更新」步骤操作。
            </span>
          </div>

          <!-- macOS 已知限制：未签名时自动安装会失败，提前说明 -->
          <div
            v-else-if="showMacSigningHint"
            class="update-hint">
            macOS 的自动安装依赖代码签名，当前版本未签名时可能失败。
            若「自动更新」未能完成，请使用「去手动下载」。
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

    <!-- 手动更新指引：自动更新失败时的主要出路。
         只在**确认有新版本**时才显示 —— 已是最新版本时这块没有意义，
         白白占掉一屏空间。没有新版本时，底部的「GitHub Releases」
         一行仍然保留，用户想手动去看看也有入口。 -->
    <section v-if="pendingUpdate" class="manual-section">
      <div class="manual-head">
        <span class="manual-title">手动更新</span>
        <span class="manual-badge">{{ isMac ? 'macOS' : 'Windows' }}</span>
      </div>

      <ol class="manual-steps">
        <li
          v-for="(step, i) in manualSteps"
          :key="i"
          class="manual-step">
          <span class="manual-index">{{ i + 1 }}</span>
          <span class="manual-text">{{ step }}</span>
        </li>
      </ol>

      <div class="manual-file">
        <span class="manual-file-label">要下载的文件</span>
        <code class="manual-file-name">{{ manualFileName }}</code>
      </div>

      <div class="manual-actions">
        <el-button
          size="small"
          type="primary"
          @click="openReleases">
          打开 Releases 页面
        </el-button>
      </div>

      <div
        v-if="isMac"
        class="manual-note">
        提示：由于本应用未做 Apple 代码签名，系统可能提示「无法验证开发者」。
        在「应用程序」里对 MoYu 图标右键 → 打开，即可绕过（只需一次）。
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

/* ── 自动更新失败提示 ── */
.update-error {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  margin-top: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid rgba(240, 120, 94, 0.42);
  background: rgba(240, 120, 94, 0.12);
  font-size: 11px;
  line-height: 1.55;
  color: var(--text);
}

.update-error-icon {
  flex: 0 0 auto;
  width: 13px;
  height: 13px;
  margin-top: 1px;
  border-radius: 50%;
  background: #f0785e;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 13px;
  text-align: center;
}

/* ── macOS 未签名提示（比错误提示更轻） ── */
.update-hint {
  margin-top: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid rgba(240, 180, 94, 0.38);
  background: rgba(240, 180, 94, 0.10);
  font-size: 11px;
  line-height: 1.55;
  color: var(--text-secondary, var(--text));
}

/* ── 手动更新指引 ── */
.manual-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--line);
}

.manual-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.manual-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}

.manual-badge {
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--fill-soft);
  color: var(--muted);
  font-size: 10px;
}

.manual-steps {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.manual-step {
  display: flex;
  gap: 7px;
  align-items: flex-start;
  font-size: 11px;
  line-height: 1.55;
  color: var(--text);
}

.manual-index {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  margin-top: 1px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  font-size: 9.5px;
  font-weight: 700;
  line-height: 15px;
  text-align: center;
}

.manual-text {
  flex: 1 1 auto;
  min-width: 0;
  word-break: break-word;
}

/* 要下载的文件名：单独一行，方便复制 */
.manual-file {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 5px 7px;
  border-radius: 6px;
  background: var(--fill-soft);
}

.manual-file-label {
  flex: 0 0 auto;
  font-size: 10.5px;
  color: var(--muted);
}

.manual-file-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 11px;
  color: var(--primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  word-break: break-all;
  user-select: all;
}

.manual-actions {
  display: flex;
  gap: 6px;
}

.manual-note {
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid rgba(240, 180, 94, 0.38);
  background: rgba(240, 180, 94, 0.10);
  font-size: 10.5px;
  line-height: 1.55;
  color: var(--text);
}
</style>
