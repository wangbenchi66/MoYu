<script setup>
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useDesktopApp } from '../composables/useDesktopApp';

const router = useRouter();

const { useRecommendedSite, urlInput, handleOpenUrl, uploadLocalFiles, addRecommendedSite, editRecommendedSite, removeRecommendedSite, recommendedSites, settings } = useDesktopApp();

// isTransparent：与 syncWebviewTransparency 保持一致——pageTransparentMode 或 fullWindowTransparent 任一开启即触发透明样式
const isTransparent = computed(() => settings.pageTransparentMode || settings.fullWindowTransparent);

// 添加弹出表单状态
const addPopoverVisible = ref(false);
const addForm = reactive({ name: '', url: '' });

// 为每个站点维护一个临时编辑表单（按需创建）
const editForms = reactive({});
function ensureEditForm(site) {
  if (!editForms[site.id]) {
    editForms[site.id] = reactive({ name: site.name || '', url: site.url || '', visible: false });
  }
  return editForms[site.id];
}

function openAddPopover() {
  addForm.name = '';
  addForm.url = '';
  addPopoverVisible.value = true;
}

function doAddSite() {
  if (!addForm.name || !addForm.url) {
    ElMessage({ message: '请填写名称与网址', type: 'warning' });
    return;
  }

  const added = addRecommendedSite({ name: addForm.name, url: addForm.url });
  if (added) {
    ElMessage({ message: '已添加站点', type: 'success' });
    addPopoverVisible.value = false;
  } else {
    ElMessage({ message: '站点已存在或添加失败', type: 'warning' });
  }
}

function openEditPopover(site) {
  const f = ensureEditForm(site);
  f.name = site.name;
  f.url = site.url;
  f.visible = true;
}

function saveEditSite(site) {
  const f = ensureEditForm(site);
  if (!f.name || !f.url) {
    ElMessage({ message: '请填写名称与网址', type: 'warning' });
    return;
  }
  editRecommendedSite(site.id, { name: f.name, url: f.url });
  ElMessage({ message: '已更新站点', type: 'success' });
  f.visible = false;
}

function cancelEdit(site) {
  const f = ensureEditForm(site);
  f.visible = false;
}

function confirmDeleteSite(site) {
  ElMessageBox.confirm(`确定删除「${site.name}」吗？`, '删除确认', { type: 'warning' })
    .then(() => {
      removeRecommendedSite(site.id);
    })
    .catch(() => {});
}

const recommendedPreview = computed(() => recommendedSites.value.slice(0, 8));

const addPillRef = ref(null);
const fileInputRef = ref(null);

function triggerFileSelect() {
  fileInputRef.value?.click();
}

async function handleFileChange(event) {
  await uploadLocalFiles(event.target.files);
  event.target.value = '';
}

function getHost(rawUrl) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return rawUrl.replace(/^https?:\/\//, '').replace(/\/.*/, '');
  }
}

function avatarText(site) {
  const name = site?.name || '';
  if (name) return name.charAt(0).toUpperCase();
  const host = getHost(site?.url || '');
  return host ? host.charAt(0).toUpperCase() : '?';
}
</script>

<template>
  <div
    class="recommended-page"
    :class="{ 'transparent-page': isTransparent }">
    <div class="nav-row panel no-drag">
      <input
        v-model="urlInput"
        class="url-input"
        placeholder="输入网址，回车打开任意网站..."
        @keydown.enter="handleOpenUrl" />
      <el-button
        round
        type="primary"
        @click="handleOpenUrl">
        打开
      </el-button>
      <el-button
        round
        @click="triggerFileSelect">
        导入文件
      </el-button>
      <input
        ref="fileInputRef"
        class="hidden-input"
        type="file"
        multiple
        @change="handleFileChange" />
    </div>

    <!-- 站点统计 -->
    <!-- <section class="metrics">
      <div class="metric-grid">
        <article
          v-for="metric in dashboardMetrics"
          :key="metric.label"
          class="metric-card">
          <strong>{{ metric.value }}</strong>
          <span>{{ metric.label }}</span>
        </article>
      </div>
    </section> -->

    <section class="spotlight">
      <h2>推荐站点</h2>
      <div class="pill-list">
        <div
          v-for="site in recommendedPreview"
          :key="site.id"
          class="pill"
          @click="useRecommendedSite(site)">
          <el-avatar size="24">{{ avatarText(site) }}</el-avatar>
          <span class="pill-name">{{ site.name }}</span>
          <div
            class="pill-actions"
            v-if="!site.system">
            <el-popover
              v-model:visible="ensureEditForm(site).visible"
              placement="bottom"
              width="320"
              trigger="manual">
              <template #reference>
                <span
                  class="pill-icon-btn"
                  @click.stop="openEditPopover(site)"
                  title="编辑"
                  >✎</span
                >
              </template>
              <div class="popover-form">
                <el-form
                  :model="ensureEditForm(site)"
                  label-position="top">
                  <el-form-item label="名称">
                    <el-input
                      v-model="ensureEditForm(site).name"
                      size="small" />
                  </el-form-item>
                  <el-form-item label="网址">
                    <el-input
                      v-model="ensureEditForm(site).url"
                      size="small" />
                  </el-form-item>
                  <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px">
                    <el-button
                      size="small"
                      @click="cancelEdit(site)"
                      >取消</el-button
                    >
                    <el-button
                      type="primary"
                      size="small"
                      @click="saveEditSite(site)"
                      >保存</el-button
                    >
                  </div>
                </el-form>
              </div>
            </el-popover>
            <span
              class="pill-icon-btn danger"
              @click.stop="confirmDeleteSite(site)"
              title="删除"
              >✕</span
            >
          </div>
        </div>

        <div
          ref="addPillRef"
          class="pill add-pill"
          @click.stop="openAddPopover"
          title="添加站点">
          <el-avatar
            size="24"
            style="background: #fff; border: 1px dashed #dcdfe6; color: #409eff">
            +
          </el-avatar>
          <span
            class="pill-name"
            style="color: #409eff"
            >添加站点</span
          >
        </div>
      </div>

      <el-popover
        v-model:visible="addPopoverVisible"
        :virtual-ref="addPillRef"
        virtual-triggering
        placement="bottom"
        width="320"
        trigger="manual">
        <div class="popover-form">
          <el-form
            :model="addForm"
            label-position="top">
            <el-form-item label="名称">
              <el-input
                v-model="addForm.name"
                size="small" />
            </el-form-item>
            <el-form-item label="网址">
              <el-input
                v-model="addForm.url"
                size="small"
                placeholder="https://example.com" />
            </el-form-item>
            <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px">
              <el-button
                size="small"
                @click="addPopoverVisible = false"
                >取消</el-button
              >
              <el-button
                type="primary"
                size="small"
                @click="doAddSite"
                >保存</el-button
              >
            </div>
          </el-form>
        </div>
      </el-popover>
    </section>

    <section
      class="history-entry"
      @click="router.push({ name: 'history' })">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round">
        <circle
          cx="12"
          cy="12"
          r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <span>历史记录</span>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="arrow">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </section>

    <!-- <section class="history-entry" @click="router.push({ name: 'library' })">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
      </svg>
      <span>我的书架</span>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="arrow">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </section> -->
  </div>
</template>

<style scoped>
.recommended-page {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--page-surface);
  padding: 4px 6px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

.recommended-page.transparent-page {
  background: transparent !important;
}

.recommended-page.transparent-page .metrics,
.recommended-page.transparent-page .spotlight,
.recommended-page.transparent-page .history-entry,
.recommended-page.transparent-page .metric-card,
.recommended-page.transparent-page .pill,
.recommended-page.transparent-page .card,
.recommended-page.transparent-page .nav-row {
  background: transparent !important;
  box-shadow: none !important;
  border-color: transparent !important;
}

.recommended-page.transparent-page .url-input,
.recommended-page.transparent-page .mini-input {
  background: transparent !important;
  border-color: rgba(255, 255, 255, 0.2) !important;
  color: inherit;
}
.metrics .metric-grid {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.metric-card {
  background: var(--surface);
  padding: 8px;
  border-radius: 8px;
  min-width: 72px;
  text-align: center;
  box-sizing: border-box;
}
.spotlight,
.quicklinks {
  background: var(--surface);
  padding: 6px 8px;
  border-radius: 8px;
}
.spotlight {
  flex-shrink: 0;
}

/* 节区标题：小而低调 */
h2 {
  font-size: 10px;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.3);
  letter-spacing: 0.6px;
  text-transform: uppercase;
  margin: 0 0 5px 2px;
}
.grid {
  display: grid;
  gap: 6px;
}
.card {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 6px;
  border-radius: 6px;
  border: 1px solid #eee;
  background: var(--surface);
  cursor: pointer;
}
.tag {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-weight: 700;
}
.controls {
  margin-bottom: 4px;
}
.mini-input {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid #ddd;
  font-size: 12px;
  width: 100%;
  box-sizing: border-box;
}

.nav-row {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 4px;
}
.url-input {
  flex: 1;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid #ddd;
  font-size: 12px;
}
.open-btn,
.secondary-btn {
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
}
.hidden-input {
  display: none;
}

.card {
  position: relative;
}

/* 药丸自适应换行 */
.pill-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  width: 100%;
}
.pill {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 128px;
  padding: 4px 8px 4px 4px;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(16, 23, 32, 0.04);
  border: 1px solid #f0f0f0;
  cursor: pointer;
  transition: box-shadow 0.12s ease;
  position: relative;
  box-sizing: border-box;
}
.pill:hover {
  box-shadow: 0 4px 12px rgba(16, 23, 32, 0.08);
}
.pill-name {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pill-actions {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 1px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 999px;
  padding: 0 2px;
  opacity: 0;
  transition: opacity 0.12s ease;
  pointer-events: none;
}
.pill:hover .pill-actions {
  opacity: 1;
  pointer-events: auto;
}
.pill-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  font-size: 11px;
  cursor: pointer;
  color: #999;
  transition:
    color 0.12s,
    background 0.12s;
}
.pill-icon-btn:hover {
  color: #409eff;
  background: rgba(64, 158, 255, 0.1);
}
.pill-icon-btn.danger:hover {
  color: #f56c6c;
  background: rgba(245, 108, 108, 0.1);
}
.add-pill {
  border-style: dashed;
  border-color: #dcdfe6;
  background: linear-gradient(180deg, #fbfbfd, #fff);
}
.add-pill:hover {
  border-color: #b3d8ff;
  background: rgba(64, 158, 255, 0.04);
}

.popover-form {
  padding: 6px 0;
}
.popover-form .el-form-item {
  margin-bottom: 6px;
}
.popover-form .el-input__inner {
  font-size: 13px;
  padding: 6px 8px;
}

.el-button.danger {
  color: #f56c6c;
}

.history-entry {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid #f0f0f0;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  color: #666;
  transition: background 0.12s;
}

.history-entry:hover {
  background: rgba(64, 158, 255, 0.04);
  color: #409eff;
}

.history-entry .arrow {
  margin-left: auto;
  opacity: 0.4;
}

@media (max-width: 360px) {
  .nav-row {
    flex-wrap: wrap;
  }
  .url-input {
    width: 100%;
    flex: 1 1 100%;
  }
}

@media (max-width: 240px) {
  .nav-row {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>

<style scoped>
.load-more-sentinel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 0;
}
</style>
