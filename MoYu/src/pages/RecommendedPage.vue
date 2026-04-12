<script setup>
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, onMounted, reactive, ref } from 'vue';
import ContextMenu from '../components/ContextMenu.vue';
import { useDesktopApp } from '../composables/useDesktopApp';

const {
  filteredRecentVisits,
  useRecommendedSite,
  openRecentVisit,
  searchKeyword,
  dashboardMetrics,
  urlInput,
  handleOpenUrl,
  uploadLocalFiles,
  addRecommendedSite,
  editRecommendedSite,
  removeRecommendedSite,
  recommendedSites,
  loadMoreRecentVisits,
  hasMoreRecentVisits
} = useDesktopApp();

// 直接获得 settings 以便根据 pageTransparentMode 切换样式
const { settings } = useDesktopApp();

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

const fileInputRef = ref(null);
const historyEndRef = ref(null);
const loadingMore = ref(false);

function formatTime(t) {
  try {
    if (!t) return '';
    const d = new Date(t);
    if (isNaN(d.getTime())) return String(t);
    return d.toLocaleString();
  } catch (e) {
    return t || '';
  }
}

function triggerFileSelect() {
  fileInputRef.value?.click();
}

async function handleFileChange(event) {
  await uploadLocalFiles(event.target.files);
  event.target.value = '';
}

// 下滑加载更多（IntersectionObserver）
onMounted(() => {
  try {
    if (!historyEndRef.value) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((ent) => {
          if (ent.isIntersecting && hasMoreRecentVisits.value && !loadingMore.value) {
            loadingMore.value = true;
            try {
              loadMoreRecentVisits();
            } catch (e) {}
            // 给渲染一点时间
            setTimeout(() => {
              loadingMore.value = false;
            }, 300);
          }
        });
      },
      { root: null, rootMargin: '200px', threshold: 0.1 }
    );
    io.observe(historyEndRef.value);
  } catch (e) {}
});

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

const menuVisible = ref(false);
const menuX = ref(0);
const menuY = ref(0);
const menuTarget = ref(null);

const menuItems = [
  { key: 'open', label: '打开链接' },
  { key: 'copy', label: '复制链接' }
];

function copyToClipboard(text) {
  if (!text) return Promise.reject(new Error('empty'));
  if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement('textarea');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) resolve();
      else reject(new Error('execCopyFailed'));
    } catch (e) {
      reject(e);
    }
  });
}

function showMenuForItem(e, item) {
  try {
    e.preventDefault();
    e.stopPropagation();
  } catch (e) {}
  menuTarget.value = item;
  menuX.value = e.clientX || 0;
  menuY.value = e.clientY || 0;
  menuVisible.value = true;
}

function onMenuSelect(item) {
  const target = menuTarget.value;
  menuVisible.value = false;
  menuTarget.value = null;
  if (!item || !target) return;
  if (item.key === 'open') {
    try {
      openRecentVisit(target);
    } catch (e) {}
  } else if (item.key === 'copy') {
    const url = target.url || '';
    if (!url) {
      ElMessage({ message: '没有可复制的链接', type: 'warning' });
      return;
    }
    copyToClipboard(url)
      .then(() => ElMessage({ message: '已复制链接', type: 'success' }))
      .catch(() => ElMessage({ message: '复制失败', type: 'error' }));
  }
}

// copyToClipboard / copyUrl 已在上方定义并用于菜单处理
</script>

<template>
  <div
    class="recommended-page"
    :class="{ 'transparent-page': settings.pageTransparentMode }">
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
      <div class="grid pills">
        <div
          v-for="site in recommendedPreview"
          :key="site.id"
          class="pill">
          <div class="pill-left">
            <el-avatar size="36">{{ avatarText(site) }}</el-avatar>
          </div>
          <div
            class="pill-center"
            @click="useRecommendedSite(site)">
            <div class="pill-name">{{ site.name }}</div>
            <div
              class="pill-sub"
              v-if="!site.system">
              {{ getHost(site.url) }}
            </div>
          </div>
          <div class="pill-actions">
            <el-popover
              v-if="!site.system"
              v-model:visible="ensureEditForm(site).visible"
              placement="bottom"
              width="320"
              trigger="manual">
              <template #reference>
                <el-button
                  type="text"
                  size="mini"
                  @click.stop="openEditPopover(site)"
                  >编辑</el-button
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

            <el-button
              v-if="!site.system"
              type="text"
              size="mini"
              class="danger"
              @click.stop="confirmDeleteSite(site)">
              删除
            </el-button>
          </div>
        </div>

        <el-popover
          v-model:visible="addPopoverVisible"
          placement="bottom"
          width="320"
          trigger="manual">
          <template #reference>
            <div
              class="pill add-pill"
              @click.stop="openAddPopover"
              title="添加站点">
              <el-avatar
                size="36"
                style="background: #fff; border: 1px dashed #dcdfe6; color: #409eff"
                >+</el-avatar
              >
            </div>
          </template>

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
      </div>
    </section>

    <section class="history">
      <h2>最近访问</h2>
      <div class="controls">
        <input
          v-model="searchKeyword"
          placeholder="搜索最近访问"
          class="mini-input" />
      </div>

      <div class="list">
        <BaseButton
          v-for="(item, idx) in filteredRecentVisits"
          :key="`${item.type}-${item.time || ''}-${idx}`"
          class="history-item"
          :title="item.url"
          @click="openRecentVisit(item)"
          @contextmenu.prevent.stop="showMenuForItem($event, item)">
          <strong>{{ item.title }}</strong>
          <span class="url">{{ item.url }}</span>
          <small style="display: block; color: var(--muted); font-size: 12px">{{ formatTime(item.time) }}</small>
        </BaseButton>
        <div
          ref="historyEndRef"
          class="load-more-sentinel"
          v-if="hasMoreRecentVisits">
          <small style="color: var(--muted)">下滑加载更多…</small>
        </div>
      </div>
    </section>
  </div>
  <ContextMenu
    :visible="menuVisible"
    :x="menuX"
    :y="menuY"
    :items="menuItems"
    @select="onMenuSelect"
    @close="menuVisible = false" />
</template>

<style scoped>
.recommended-page {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--page-surface);
  padding: 6px;
}

.recommended-page.transparent-page {
  background: transparent !important;
}

.recommended-page.transparent-page .metrics,
.recommended-page.transparent-page .spotlight,
.recommended-page.transparent-page .history,
.recommended-page.transparent-page .metric-card,
.recommended-page.transparent-page .pill,
.recommended-page.transparent-page .history-item,
.recommended-page.transparent-page .card {
  background: transparent !important;
  box-shadow: none !important;
  border-color: transparent !important;
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
.history,
.quicklinks {
  background: var(--surface);
  padding: 10px;
  border-radius: 8px;
}
.grid {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
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
.list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.history-item {
  text-align: left;
  padding: 6px;
  border-radius: 6px;
  border: 1px solid #f0f0f0;
  background: var(--surface);
  cursor: pointer;
}
.url {
  display: block;
  color: #666;
  font-size: 12px;
}
.controls {
  margin-bottom: 8px;
}
.mini-input {
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid #ddd;
}

.nav-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.url-input {
  flex: 1;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid #ddd;
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

/* 原型(pill) 风格（更紧凑） */
.pills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(16, 23, 32, 0.04);
  border: 1px solid #f0f0f0;
  min-width: 140px;
}
.pill-left {
  flex: 0 0 auto;
}
.pill-center {
  flex: 1 1 auto;
  cursor: pointer;
}
.pill-name {
  font-weight: 700;
}
.pill-sub {
  font-size: 12px;
  color: #8c8c8c;
}
.pill-actions {
  flex: 0 0 auto;
  display: flex;
  gap: 6px;
  align-items: center;
}
.add-pill {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border-radius: 999px;
  background: linear-gradient(180deg, #fbfbfd, #fff);
  border: 1px dashed #dcdfe6;
  min-width: 64px;
}

.icon-btn {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid #ddd;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
}
.icon-btn.danger {
  border-color: #f5c6c6;
  background: #fff3f3;
}
.card-actions {
  align-items: center;
}

/* 加号卡片样式（紧凑） */
.add-card {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 110px;
  height: 56px;
  border: 1px dashed #d9d9d9;
  background: linear-gradient(180deg, #fbfbfd, #fff);
  border-radius: 8px;
  cursor: pointer;
}
.add-inner {
  font-size: 26px;
  color: #409eff;
  font-weight: 700;
}

/* 悬停时显示操作按钮 */
.pill {
  transition: box-shadow 0.12s ease;
}
.pill:hover {
  box-shadow: 0 6px 18px rgba(16, 23, 32, 0.08);
}
.pill-actions {
  opacity: 0;
  transition: opacity 0.12s ease;
  pointer-events: none;
}
.pill:hover .pill-actions {
  opacity: 1;
  pointer-events: auto;
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

@media (max-width: 720px) {
  .pills {
    gap: 8px;
  }
  .pill {
    min-width: 100%;
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
