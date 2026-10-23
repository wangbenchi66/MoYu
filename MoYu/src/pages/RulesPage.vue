<!-- RulesPage.vue — 站点规则备份/恢复（支持全部或单个，兼容油猴脚本导入） -->
<script setup>
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useDesktopApp } from '../composables/useDesktopApp';
import {
  exportRules, importRules, buildExportFileName,
  isUserscript, convertUserscriptToRule,
} from '../rules/index.js';

defineProps({ isTransparent: Boolean });

const router = useRouter();
const { statusMessage } = useDesktopApp();

const STORAGE_KEY = 'glass_reader_site_rules';

// 只展示「自定义规则」——内置静态规则随包提供，不在此处改动
const userRules = ref([]);
const selectedIds = ref([]);
const showImportBox = ref(false);
const importText = ref('');
const overwriteOnImport = ref(true);
const lastImportResult = ref(null);
const uscriptWarnings = ref([]);

function readAll() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (e) { return []; }
}

function writeAll(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function refresh() {
  userRules.value = readAll();
  // 清理已不存在的选中项
  const ids = new Set(userRules.value.map((r) => r.id));
  selectedIds.value = selectedIds.value.filter((id) => ids.has(id));
}
refresh();

const patternText = (r) => {
  try {
    if (Array.isArray(r.pattern)) return r.pattern.join('、');
    return String(r.pattern || '');
  } catch (e) { return ''; }
};

const isScript = (r) => r && r.source === 'userscript';

const allSelected = computed(() =>
  userRules.value.length > 0 && selectedIds.value.length === userRules.value.length);

function toggleSelectAll() {
  selectedIds.value = allSelected.value ? [] : userRules.value.map((r) => r.id);
}

function toggleSelect(id) {
  const i = selectedIds.value.indexOf(id);
  if (i === -1) selectedIds.value.push(id);
  else selectedIds.value.splice(i, 1);
}

// ─── 备份（导出）───

function downloadJson(obj, filename) {
  try {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => { try { URL.revokeObjectURL(url) } catch (e) {} }, 5000);
  } catch (e) {
    ElMessage({ message: '生成备份文件失败', type: 'error' });
  }
}

function safeName(s) {
  return String(s || 'rule').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
}

function handleBackupAll() {
  if (!userRules.value.length) {
    ElMessage({ message: '当前没有可备份的自定义规则', type: 'warning' });
    return;
  }
  downloadJson(exportRules(), buildExportFileName());
  ElMessage({ message: `已备份 ${userRules.value.length} 条规则`, type: 'success' });
}

function handleBackupOne(rule) {
  const data = exportRules({ ids: [rule.id] });
  if (!data.rules.length) {
    ElMessage({ message: '备份失败：未找到该规则', type: 'error' });
    return;
  }
  downloadJson(data, `moyu-rule-${safeName(rule.name || patternText(rule))}.json`);
  ElMessage({ message: '已备份 1 条规则', type: 'success' });
}

function handleBackupSelected() {
  if (!selectedIds.value.length) {
    ElMessage({ message: '请先勾选要备份的规则', type: 'warning' });
    return;
  }
  const data = exportRules({ ids: selectedIds.value });
  downloadJson(data, `moyu-rules-selected-${selectedIds.value.length}.json`);
  ElMessage({ message: `已备份 ${data.rules.length} 条规则`, type: 'success' });
}

// ─── 恢复（导入）───

const fileInputRef = ref(null);

function triggerFileSelect() {
  fileInputRef.value?.click();
}

async function onFilesPicked(event) {
  const files = Array.from(event.target?.files || []);
  if (event.target) event.target.value = '';
  if (!files.length) return;

  // 油猴脚本：直接转换后导入，不弹粘贴框
  const scripts = [];
  const jsons = [];
  for (const f of files) {
    try {
      const text = await f.text();
      if (isUserscript(text)) scripts.push({ name: f.name, text });
      else jsons.push({ name: f.name, text });
    } catch (e) {
      ElMessage({ message: `读取失败：${f.name}`, type: 'error' });
    }
  }

  if (scripts.length) importUserscripts(scripts);

  if (jsons.length) {
    // 备份文件可能一次选多个，这里逐个导入
    let imported = 0, skipped = 0, errors = [];
    for (const j of jsons) {
      try {
        const parsed = JSON.parse(j.text);
        const res = importRules(parsed, { overwrite: overwriteOnImport.value });
        imported += res.imported; skipped += res.skipped;
        errors = errors.concat(res.errors.map((e) => `${j.name}: ${e}`));
      } catch (e) {
        errors.push(`${j.name}: JSON 解析失败`);
      }
    }
    lastImportResult.value = { imported, skipped, errors };
    refresh();
    if (imported > 0) ElMessage({ message: `已恢复 ${imported} 条规则`, type: 'success' });
    else if (errors.length) ElMessage({ message: '没有可恢复的规则，详见提示', type: 'warning' });
    else ElMessage({ message: '规则均已存在，未做改动', type: 'info' });
  }
}

function importUserscripts(scripts) {
  const rules = [];
  const failures = [];
  const warns = [];
  for (const s of scripts) {
    const res = convertUserscriptToRule(s.text);
    if (res.ok) {
      rules.push(res.rule);
      if (res.warned && res.warned.length) {
        warns.push(`${res.meta?.name || s.name}：${res.warned.join('；')}`);
      }
    } else {
      failures.push(`${s.name}：${res.reason}`);
    }
  }

  uscriptWarnings.value = warns;

  if (!rules.length) {
    ElMessage({ message: failures[0] || '没有可导入的脚本', type: 'warning' });
    lastImportResult.value = { imported: 0, skipped: 0, errors: failures };
    return;
  }

  const res = importRules({ rules }, { overwrite: overwriteOnImport.value });
  lastImportResult.value = { imported: res.imported, skipped: res.skipped, errors: failures.concat(res.errors) };
  refresh();
  ElMessage({
    message: `已导入 ${res.imported} 个油猴脚本` + (warns.length ? '（有兼容性提示）' : ''),
    type: res.imported > 0 ? 'success' : 'info',
  });
}

function doImportFromText() {
  const raw = (importText.value || '').trim();
  if (!raw) {
    ElMessage({ message: '请先粘贴内容或选择文件', type: 'warning' });
    return;
  }

  // 粘贴的也可能是油猴脚本
  if (isUserscript(raw)) {
    importUserscripts([{ name: '粘贴的脚本', text: raw }]);
    closeImportBox(false);
    return;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    ElMessage({ message: 'JSON 解析失败，也不是油猴脚本', type: 'error' });
    return;
  }
  const res = importRules(parsed, { overwrite: overwriteOnImport.value });
  lastImportResult.value = res;
  refresh();
  if (res.imported > 0) ElMessage({ message: `已恢复 ${res.imported} 条规则`, type: 'success' });
  else if (res.errors.length) ElMessage({ message: '没有可恢复的规则，详见下方提示', type: 'warning' });
  else ElMessage({ message: `全部 ${res.skipped} 条已存在，未做改动`, type: 'info' });
}

function openImportBox() {
  showImportBox.value = true;
  importText.value = '';
  lastImportResult.value = null;
  uscriptWarnings.value = [];
}

function closeImportBox(clear = true) {
  showImportBox.value = false;
  if (clear) {
    importText.value = '';
    lastImportResult.value = null;
    uscriptWarnings.value = [];
  }
}

// ─── 启用 / 删除 ───

function toggleRule(rule) {
  try {
    const all = readAll();
    const i = all.findIndex((r) => r.id === rule.id);
    if (i === -1) return;
    all[i].enabled = !(all[i].enabled !== false);
    writeAll(all);
    refresh();
    statusMessage.value = '规则已更新，刷新网页后生效';
  } catch (e) {
    ElMessage({ message: '操作失败', type: 'error' });
  }
}

function deleteRule(rule) {
  ElMessageBox.confirm(`确定删除规则「${rule.name || patternText(rule)}」吗？`, '删除确认', { type: 'warning' })
    .then(() => {
      const all = readAll().filter((r) => r.id !== rule.id);
      writeAll(all);
      refresh();
      ElMessage({ message: '已删除', type: 'success' });
    })
    .catch(() => {});
}

function deleteSelected() {
  if (!selectedIds.value.length) return;
  ElMessageBox.confirm(`确定删除选中的 ${selectedIds.value.length} 条规则吗？`, '删除确认', { type: 'warning' })
    .then(() => {
      const ids = new Set(selectedIds.value);
      writeAll(readAll().filter((r) => !ids.has(r.id)));
      selectedIds.value = [];
      refresh();
      ElMessage({ message: '已删除选中规则', type: 'success' });
    })
    .catch(() => {});
}

const enabledCount = computed(() => userRules.value.filter((r) => r.enabled !== false).length);
</script>

<template>
  <div class="rules-page" :class="{ 'transparent-page': isTransparent }">
    <div class="page-header">
      <button class="back-btn" @click="router.back()">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <h2>站点规则备份</h2>
    </div>

    <div class="desc-card">
      <p>站点规则会在指定网站上注入自定义 CSS / JS（去广告、改排版等）。</p>
      <p class="hint">
        可备份全部或单条规则，也支持直接导入<strong>油猴（Tampermonkey）脚本</strong>——
        会读取其中的 <code>@name</code> / <code>@match</code> 等元数据，并支持通配符。
      </p>
    </div>

    <div class="action-bar">
      <button class="act-btn primary" @click="triggerFileSelect">恢复 / 导入</button>
      <button class="act-btn" @click="handleBackupAll">备份全部（{{ userRules.length }}）</button>
      <button class="act-btn" @click="openImportBox">粘贴导入</button>
      <input ref="fileInputRef" type="file" multiple accept=".json,.js,.user.js,application/json,text/javascript"
        class="hidden-input" @change="onFilesPicked" />
    </div>

    <div v-if="showImportBox" class="import-box">
      <div class="import-head">
        <strong>粘贴导入</strong>
        <button class="close-x" @click="closeImportBox()">✕</button>
      </div>
      <textarea
        v-model="importText"
        class="import-textarea"
        placeholder='可粘贴：备份文件 JSON，或完整的油猴脚本（含 ==UserScript== 元数据块）'></textarea>
      <label class="overwrite-row">
        <input type="checkbox" v-model="overwriteOnImport" />
        <span>同 pattern 的规则直接覆盖（取消勾选则跳过已存在的）</span>
      </label>
      <div v-if="lastImportResult" class="import-result">
        <div>导入 {{ lastImportResult.imported }} 条 · 跳过 {{ lastImportResult.skipped }} 条</div>
        <div v-for="(err, i) in lastImportResult.errors" :key="i" class="err-line">{{ err }}</div>
      </div>
      <div v-if="uscriptWarnings.length" class="warn-box">
        <div v-for="(w, i) in uscriptWarnings" :key="i" class="warn-line">{{ w }}</div>
      </div>
      <div class="import-actions">
        <button class="act-btn primary" @click="doImportFromText">导入</button>
        <button class="act-btn" @click="closeImportBox()">取消</button>
      </div>
    </div>

    <div v-if="lastImportResult && !showImportBox" class="result-panel">
      <div>上次导入：成功 {{ lastImportResult.imported }} 条 · 跳过 {{ lastImportResult.skipped }} 条</div>
      <div v-for="(err, i) in lastImportResult.errors" :key="i" class="err-line">{{ err }}</div>
    </div>

    <div v-if="uscriptWarnings.length && !showImportBox" class="warn-box">
      <div v-for="(w, i) in uscriptWarnings" :key="i" class="warn-line">{{ w }}</div>
    </div>

    <div class="list-head">
      <label class="select-all">
        <input type="checkbox" :checked="allSelected" @change="toggleSelectAll" />
        <span>自定义规则</span>
      </label>
      <span class="count">{{ enabledCount }} / {{ userRules.length }} 已启用</span>
    </div>

    <div v-if="selectedIds.length" class="sel-actions">
      <span class="sel-count">已选 {{ selectedIds.length }} 条</span>
      <button class="op-btn" @click="handleBackupSelected">备份选中</button>
      <button class="op-btn danger" @click="deleteSelected">删除选中</button>
    </div>

    <div v-if="!userRules.length" class="empty-tip">
      还没有自定义规则。<br />
      可以「恢复 / 导入」备份文件，或直接导入油猴脚本（<code>.user.js</code>）。
    </div>

    <div v-for="rule in userRules" :key="rule.id" class="rule-item">
      <input
        type="checkbox"
        class="row-check"
        :checked="selectedIds.includes(rule.id)"
        @change="toggleSelect(rule.id)" />
      <div class="rule-main">
        <div class="rule-title">
          <span :class="['dot', { off: rule.enabled === false }]"></span>
          <strong>{{ rule.name || patternText(rule) }}</strong>
          <span v-if="isScript(rule)" class="badge" :title="rule.sourceAuthor ? `作者：${rule.sourceAuthor}` : ''">
            油猴{{ rule.sourceVersion ? ' v' + rule.sourceVersion : '' }}
          </span>
        </div>
        <div class="rule-pattern">{{ patternText(rule) }} · {{ rule.matchType || 'hostname' }}</div>
        <!-- 描述默认只占一行（列表紧凑），完整内容通过悬停查看。
             title 属性用原生 tooltip：不需要额外组件，长文本也能看全。 -->
        <div
          v-if="rule.description"
          class="rule-desc"
          :title="rule.description"
        >{{ rule.description }}</div>
      </div>
      <div class="rule-ops">
        <button class="op-btn" @click="toggleRule(rule)">{{ rule.enabled === false ? '启用' : '停用' }}</button>
        <button class="op-btn" @click="handleBackupOne(rule)">备份</button>
        <button class="op-btn danger" @click="deleteRule(rule)">删除</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rules-page {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 8px 24px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

.page-header { display: flex; align-items: center; gap: 8px; }
.page-header h2 { font-size: 15px; margin: 0; color: var(--text, var(--text)); }

.back-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border: none; border-radius: 6px;
  background: transparent; color: var(--text-secondary); cursor: pointer;
}
.back-btn:hover { background: var(--overlay-weak); }

.desc-card {
  background: var(--surface, rgb(var(--bg-rgb))); border-radius: 8px; padding: 10px 12px;
  font-size: 12px; color: var(--text-secondary); line-height: 1.6;
}
.desc-card p { margin: 0; }
.desc-card .hint { color: var(--muted); font-size: 11px; margin-top: 4px; }
.desc-card code {
  background: var(--overlay-weak); padding: 0 3px; border-radius: 3px;
  font-size: 10px; font-family: ui-monospace, monospace;
}

.action-bar { display: flex; gap: 6px; }

.act-btn {
  flex: 1; padding: 7px 6px; font-size: 12px;
  border: 1px solid #e0e0e0; border-radius: 7px;
  background: var(--fill-soft); color: var(--text); cursor: pointer; white-space: nowrap;
}
.act-btn:hover { background: var(--fill-soft); }
.act-btn.primary { background: var(--primary); border-color: var(--primary); color: rgb(var(--bg-rgb)); font-weight: 500; }
.act-btn.primary:hover { background: #337ecc; }

.hidden-input { display: none; }

.import-box {
  background: var(--surface, rgb(var(--bg-rgb))); border-radius: 8px; padding: 10px 12px;
  display: flex; flex-direction: column; gap: 8px;
}
.import-head { display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: var(--text); }
.close-x { border: none; background: transparent; color: var(--muted); cursor: pointer; font-size: 13px; }

.import-textarea {
  width: 100%; min-height: 110px; resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px; line-height: 1.5; padding: 8px;
  border: 1px solid #e5e5e5; border-radius: 6px;
  box-sizing: border-box; background: #fcfcfc; color: var(--text);
}

.overwrite-row { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-secondary); cursor: pointer; }

.import-result, .result-panel { font-size: 12px; color: var(--text-secondary); line-height: 1.6; }
.result-panel { background: var(--surface, rgb(var(--bg-rgb))); border-radius: 8px; padding: 8px 12px; }
.err-line { color: var(--warning); }

.warn-box {
  background: #fdf6ec; border: 1px solid #f5dab1; border-radius: 8px;
  padding: 8px 12px; font-size: 11px; line-height: 1.6; color: #b88230;
}
.warn-line + .warn-line { margin-top: 4px; }

.import-actions { display: flex; gap: 8px; }

.list-head {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 12px; color: var(--text-secondary); padding: 2px 2px 0;
}
.select-all { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.list-head .count { color: var(--muted); font-size: 11px; }

.sel-actions {
  display: flex; align-items: center; gap: 6px;
  background: #ecf5ff; border-radius: 8px; padding: 6px 10px; font-size: 12px; color: var(--primary);
}
.sel-count { flex: 1; }

.empty-tip {
  background: var(--surface, rgb(var(--bg-rgb))); border-radius: 8px; padding: 20px 12px;
  text-align: center; font-size: 12px; color: var(--muted); line-height: 1.8;
}
.empty-tip code {
  background: var(--overlay-weak); padding: 0 3px; border-radius: 3px;
  font-size: 11px; font-family: ui-monospace, monospace;
}

.rule-item {
  display: flex; align-items: center; gap: 8px;
  background: var(--surface, rgb(var(--bg-rgb))); border-radius: 8px; padding: 9px 11px;
}

.row-check { flex-shrink: 0; cursor: pointer; }
.rule-main { flex: 1; min-width: 0; }
.rule-title { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text); }

.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--success); flex-shrink: 0; }
.dot.off { background: var(--muted); }

.badge {
  font-size: 9px; padding: 1px 5px; border-radius: 3px;
  background: #ecf5ff; color: var(--primary); border: 1px solid #d9ecff;
  flex-shrink: 0; white-space: nowrap;
}

.rule-pattern {
  font-size: 11px; color: var(--muted); margin-top: 2px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.rule-desc {
  font-size: 11px; color: var(--muted); margin-top: 2px;
  /* 列表里默认只占一行，保持紧凑；完整描述由模板上的 title 提供（悬停可见）。 */
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  cursor: help;
}

.rule-ops { display: flex; gap: 4px; flex-shrink: 0; }

.op-btn {
  padding: 4px 8px; font-size: 11px;
  border: 1px solid #e5e5e5; border-radius: 5px;
  background: transparent; color: var(--text-secondary); cursor: pointer; white-space: nowrap;
}
.op-btn:hover { background: var(--fill-soft); }
.op-btn.danger { color: var(--danger); border-color: #fbc4c4; }
.op-btn.danger:hover { background: #fef0f0; }

.rules-page.transparent-page .desc-card,
.rules-page.transparent-page .rule-item,
.rules-page.transparent-page .empty-tip,
.rules-page.transparent-page .import-box,
.rules-page.transparent-page .result-panel {
  background: transparent !important;
  box-shadow: none !important;
}
</style>
