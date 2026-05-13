<!-- LibraryPage.vue — 书架（导入/管理 EPUB/PDF/TXT 书籍） -->
<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

defineProps({ isTransparent: Boolean });

const router = useRouter();
const books = ref([]);
const importing = ref(false);
const importProgress = ref('');

onMounted(() => {
  loadBooks();
});

function loadBooks() {
  try {
    const raw = localStorage.getItem('moyu_library_books');
    if (raw) books.value = JSON.parse(raw) || [];
  } catch (e) {
    books.value = [];
  }
}

function saveBooks() {
  try {
    localStorage.setItem('moyu_library_books', JSON.stringify(books.value));
  } catch (e) {}
}

async function handleImport(event) {
  const files = Array.from(event.target?.files || []);
  if (!files.length) return;
  importing.value = true;
  for (const file of files) {
    try {
      importProgress.value = `正在导入: ${file.name}`;
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'epub') {
        await importEpub(file);
      } else if (['txt', 'log'].includes(ext)) {
        await importText(file);
      } else if (['md', 'markdown'].includes(ext)) {
        await importMarkdown(file);
      } else if (ext === 'pdf') {
        importPdf(file);
      }
    } catch (e) {
      console.warn('[library] 导入失败:', file.name, e);
    }
  }
  importing.value = false;
  importProgress.value = '';
  saveBooks();
  // 清空 input 以便重复导入同名文件
  if (event.target) event.target.value = '';
}

async function importEpub(file) {
  const { default: ePub } = await import('epubjs');
  const url = URL.createObjectURL(file);
  const book = ePub(url);
  await book.ready;
  const metadata = await book.loaded.metadata;
  const spine = await book.loaded.spine;
  const chapters = spine.spineItems.map((item, i) => ({
    title:
      item.href
        .split('/')
        .pop()
        ?.replace(/\.\w+$/, '') || `第${i + 1}章`,
    href: item.href,
    index: i
  }));
  const id = Date.now() + Math.floor(Math.random() * 100000);
  books.value.unshift({
    id,
    title: metadata?.title || file.name.replace(/\.epub$/i, ''),
    fileName: file.name,
    type: 'epub',
    epubUrl: url,
    chapters,
    currentChapter: 0,
    scrollProgress: 0,
    addedAt: new Date().toISOString()
  });
}

async function importText(file) {
  const content = await readFileAsync(file);
  importProgress.value = '正在解析章节...';
  const chapters = await extractChaptersAsync(content);
  const id = Date.now() + Math.floor(Math.random() * 100000);
  books.value.unshift({
    id,
    title: file.name.replace(/\.[^.]+$/, ''),
    fileName: file.name,
    type: 'text',
    chapters,
    currentChapter: 0,
    scrollProgress: 0,
    addedAt: new Date().toISOString()
  });
}

async function importMarkdown(file) {
  const content = await readFileAsync(file);
  importProgress.value = '正在解析章节...';
  const chapters = await extractChaptersAsync(content);
  const id = Date.now() + Math.floor(Math.random() * 100000);
  books.value.unshift({
    id,
    title: file.name.replace(/\.[^.]+$/, ''),
    fileName: file.name,
    type: 'markdown',
    chapters,
    currentChapter: 0,
    scrollProgress: 0,
    addedAt: new Date().toISOString()
  });
}

// 读取文件，自动检测编码（支持 UTF-8 / GBK / GB18030 / UTF-16 等）
function readFileAsync(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const buf = reader.result;
      resolve(decodeBuffer(buf));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

// 检测 BOM 并解码
function decodeBuffer(buf) {
  const u8 = new Uint8Array(buf);

  // BOM 检测
  if (u8.length >= 3 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buf);
  }
  if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buf);
  }
  if (u8.length >= 2 && u8[0] === 0xfe && u8[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buf);
  }

  // 无 BOM：依次尝试 UTF-8、GB18030
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  try {
    return utf8.decode(buf);
  } catch (e) {
    // UTF-8 解码失败，回退到 GB18030（GBK 超集，覆盖绝大部分中文编码）
    return new TextDecoder('gb18030').decode(buf);
  }
}

// 让出主线程的工具函数
function yieldToMain() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// 异步分章：逐行扫描，每批让出主线程
async function extractChaptersAsync(text) {
  const lines = text.split(/\r?\n/);
  const candidates = [];

  const patterns = [
    { regex: /^\s*第([一二三四五六七八九十零百千万0-9]+)([章节条款])\s*(.+)$/, level: 1, titleIdx: 3, filter: (m) => m[3] },
    { regex: /^\s*第([一二三四五六七八九十零百千万0-9]+)部分\s+(.+)$/, level: 1, titleIdx: 2, filter: (m) => m[2] },
    { regex: /^\s*(?:Chapter|Ch\.?)\s+(\d+|[IVXLCDM]+)\s*(.*)$/i, level: 1, titleIdx: 2, filter: (m) => m[2] },
    { regex: /^\s*(\d+)\.\s+(.+)$/, level: 1, titleIdx: 2, filter: (m) => m[2] },
    { regex: /^\s*(\d+)\.(\d+)\.?\s+(.+)$/, level: 2, titleIdx: 3, filter: (m) => m[3] },
    { regex: /^\s*(\d+)\.(\d+)\.(\d+)\.?\s+(.+)$/, level: 3, titleIdx: 4, filter: (m) => m[4] },
    { regex: /^\s*[（(](\d+)[）)]\s+(.+)$/, level: 2, titleIdx: 2, filter: (m) => m[2] },
    { regex: /^\s*([A-Z])\.\s+(.+)$/, level: 2, titleIdx: 2, filter: (m) => m[2] }
  ];

  function hasValidText(str) {
    return /[一-龥a-zA-Z]/.test(str);
  }

  function isNonChapter(title) {
    return /图|表|参考文献|附录|致谢|索引/i.test(title);
  }

  function matchAndPush(pat, line, lineIdx) {
    const m = line.match(pat.regex);
    if (!m) return false;
    let extracted = pat.filter(m);
    if (extracted !== undefined) extracted = extracted.trim();
    else extracted = '';
    if (extracted.length < 2 && !hasValidText(extracted)) return false;
    if (isNonChapter(extracted)) return false;
    if (/^\d+$/.test(extracted)) return false;
    candidates.push({ lineNo: lineIdx, level: pat.level, raw: line, title: line.trim(), marker: m[0] });
    return true;
  }

  const BATCH = 5000;
  let lockedPat = null;
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    if (!line.trim()) continue;
    // 优先用已锁定的模式
    if (lockedPat && matchAndPush(lockedPat, line, lineIdx)) {
      if (lineIdx % BATCH === 0 && lineIdx > 0) {
        importProgress.value = `已扫描 ${lineIdx}/${lines.length} 行...`;
        await yieldToMain();
      }
      continue;
    }
    // 尝试所有模式
    for (const pat of patterns) {
      if (matchAndPush(pat, line, lineIdx)) {
        if (!lockedPat) lockedPat = pat;
        break;
      }
    }
    if (lineIdx % BATCH === 0 && lineIdx > 0) {
      importProgress.value = `已扫描 ${lineIdx}/${lines.length} 行...`;
      await yieldToMain();
    }
  }

  candidates.sort((a, b) => a.lineNo - b.lineNo);

  // 没有找到章节标记，按字数分段
  if (candidates.length === 0) return splitBySize(text, 50000);

  // 第一个标记之前的内容不丢失：在最前面插入虚拟标记
  if (candidates[0].lineNo > 0) {
    candidates.unshift({ lineNo: -1, level: 0, raw: '', title: '开始', marker: '' });
  }

  const chapters = [];
  for (let i = 0; i < candidates.length; i++) {
    const cur = candidates[i];
    const startLine = cur.lineNo;
    const endLine = i + 1 < candidates.length ? candidates[i + 1].lineNo - 1 : lines.length - 1;

    const contentLines = lines.slice(startLine, endLine + 1);
    let content = contentLines.join('\n');
    content = content.replace(/\s+$/, '');

    chapters.push({
      level: cur.level,
      title: cur.title,
      startLine,
      endLine,
      content
    });
  }

  return chapters;
}

// 按字数分段，避免单章过大
function splitBySize(content, maxSize) {
  if (content.length <= maxSize) return [{ title: '全文', content }];
  const parts = [];
  let offset = 0;
  while (offset < content.length) {
    let end = offset + maxSize;
    // 尽量在换行处截断
    if (end < content.length) {
      const newlinePos = content.lastIndexOf('\n', end);
      if (newlinePos > offset + maxSize * 0.5) end = newlinePos + 1;
    }
    parts.push({
      title: '全文',
      content: content.slice(offset, end)
    });
    offset = end;
  }
  return parts;
}

function importPdf(file) {
  const url = URL.createObjectURL(file);
  const id = Date.now() + Math.floor(Math.random() * 100000);
  books.value.unshift({
    id,
    title: file.name.replace(/\.pdf$/i, ''),
    fileName: file.name,
    type: 'pdf',
    pdfUrl: url,
    chapters: [{ title: '全文', index: 0 }],
    currentChapter: 0,
    scrollProgress: 0,
    addedAt: new Date().toISOString()
  });
}

function openBook(book) {
  router.push({ name: 'reader', params: { id: book.id } });
}

function removeBook(book) {
  if (book.epubUrl) URL.revokeObjectURL(book.epubUrl);
  if (book.pdfUrl) URL.revokeObjectURL(book.pdfUrl);
  books.value = books.value.filter((b) => b.id !== book.id);
  saveBooks();
}

function formatProgress(book) {
  const total = book.chapters?.length || 1;
  const cur = (book.currentChapter || 0) + 1;
  return `${cur}/${total} 章`;
}

function typeLabel(type) {
  const map = { epub: 'EPUB', text: 'TXT', markdown: 'MD', pdf: 'PDF' };
  return map[type] || type;
}
</script>

<template>
  <div
    class="library-page"
    :class="{ 'transparent-page': isTransparent }">
    <div class="page-header">
      <button
        class="back-btn"
        @click="router.back()">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <h2>我的书架</h2>
    </div>

    <!-- 导入按钮 -->
    <div class="import-bar">
      <label
        class="import-btn"
        :class="{ disabled: importing }">
        <input
          type="file"
          accept=".epub,.txt,.log,.md,.markdown,.pdf"
          multiple
          @change="handleImport"
          :disabled="importing" />
        {{ importing ? importProgress : '导入书籍' }}
      </label>
      <span class="import-hint">支持 EPUB / TXT / Markdown / PDF</span>
    </div>

    <!-- 书架列表 -->
    <div
      class="book-list"
      v-if="books.length">
      <div
        v-for="book in books"
        :key="book.id"
        class="book-card"
        @click="openBook(book)">
        <div class="book-info">
          <span class="book-type">{{ typeLabel(book.type) }}</span>
          <h3 class="book-title">{{ book.title }}</h3>
          <div class="book-meta">
            <span>{{ book.fileName }}</span>
            <span>{{ formatProgress(book) }}</span>
          </div>
          <!-- 进度条 -->
          <div class="progress-bar">
            <div
              class="progress-fill"
              :style="{ width: ((book.currentChapter || 0) / Math.max(1, (book.chapters?.length || 1) - 1)) * 100 + '%' }"></div>
          </div>
        </div>
        <button
          class="remove-btn"
          @click.stop="removeBook(book)"
          title="移除">
          ×
        </button>
      </div>
    </div>
    <div
      v-else
      class="empty-tip">
      书架为空，点击上方按钮导入书籍
    </div>
  </div>
</template>

<style scoped>
.library-page {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 8px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.page-header h2 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text, #333);
  margin: 0;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #666;
  transition: background 0.12s;
}

.back-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}

.import-bar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.import-btn {
  padding: 6px 16px;
  border-radius: 6px;
  background: #409eff;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.import-btn:hover {
  background: #66b1ff;
}
.import-btn.disabled {
  background: #c0c4cc;
  cursor: wait;
}
.import-btn input {
  display: none;
}

.import-hint {
  font-size: 11px;
  color: #bbb;
}

.book-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.book-card {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--surface, #fff);
  border: 1px solid #f0f0f0;
  cursor: pointer;
  transition:
    background 0.12s,
    box-shadow 0.12s;
}

.book-card:hover {
  background: #fafafa;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.06);
}

.book-info {
  flex: 1;
  min-width: 0;
}

.book-type {
  font-size: 9px;
  font-weight: 700;
  color: #fff;
  background: #409eff;
  padding: 1px 5px;
  border-radius: 3px;
  margin-right: 6px;
}

.book-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text, #333);
  margin: 4px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.book-meta {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #999;
}

.progress-bar {
  height: 3px;
  background: #f0f0f0;
  border-radius: 2px;
  margin-top: 6px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #409eff;
  border-radius: 2px;
  transition: width 0.3s;
}

.remove-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: #ccc;
  font-size: 16px;
  cursor: pointer;
  border-radius: 4px;
  flex-shrink: 0;
  margin-left: 8px;
}

.remove-btn:hover {
  color: #f56c6c;
  background: rgba(245, 108, 108, 0.08);
}

.empty-tip {
  text-align: center;
  padding: 40px 0;
  color: rgba(0, 0, 0, 0.25);
  font-size: 12px;
}

.transparent-page .book-card {
  background: transparent;
  border-color: transparent;
}
</style>
