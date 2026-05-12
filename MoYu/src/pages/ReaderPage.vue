<script setup>
import { ref, computed, onMounted, onBeforeUnmount, reactive, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

defineProps({ isTransparent: Boolean });

const book = ref(null);
const loading = ref(false);
const contentRef = ref(null);
const showToc = ref(false);
const showSettings = ref(false);

// 已加载的章节 Map<index, { index, title, html }>
const chapterMap = reactive(new Map());
const loadedChapters = computed(() => {
  return Array.from(chapterMap.values()).sort((a, b) => a.index - b.index);
});
const nextChapterToLoad = ref(0);
const minLoadedIdx = computed(() => chapterMap.size ? Math.min(...chapterMap.keys()) : -1);
const maxLoadedIdx = computed(() => chapterMap.size ? Math.max(...chapterMap.keys()) : -1);
const hasMore = computed(() => book.value && nextChapterToLoad.value < (book.value.chapters?.length || 0));

const currentVisibleChapter = ref(0);

// 滚动恢复管理
let scrollRestoreTimer = null;
const isRestoringScroll = ref(false);

function cancelScrollRestore() {
  if (scrollRestoreTimer) { clearInterval(scrollRestoreTimer); scrollRestoreTimer = null; }
  isRestoringScroll.value = false;
}

function startScrollRestore(chapterIdx, offset) {
  cancelScrollRestore();
  isRestoringScroll.value = true;
  scrollRestoreTimer = setInterval(() => {
    if (!contentRef.value) return;
    const el = contentRef.value.querySelector(`[data-chapter-index="${chapterIdx}"]`);
    if (el && el.offsetHeight > 0) {
      contentRef.value.scrollTop = el.offsetTop + offset;
      cancelScrollRestore();
    }
  }, 60);
  setTimeout(cancelScrollRestore, 5000);
}

// 阅读器设置
const readerSettings = reactive({
  fontSize: 16,
  fontFamily: 'system-ui',
  lineHeight: 1.9,
  marginX: 16,
  theme: 'light',
});

const themes = {
  light:  { bg: '#faf8f5', text: '#333', sub: '#999', border: '#eee', card: '#fff' },
  sepia:  { bg: '#f4ecd8', text: '#5b4636', sub: '#a08c76', border: '#e0d5c1', card: '#faf5eb' },
  dark:   { bg: '#1a1a2e', text: '#c8c8d0', sub: '#666', border: '#2a2a40', card: '#22223a' },
};

const themeStyle = computed(() => {
  const t = themes[readerSettings.theme] || themes.light;
  return {
    '--reader-bg': t.bg, '--reader-text': t.text, '--reader-sub': t.sub,
    '--reader-border': t.border, '--reader-card': t.card,
    '--margin-x': readerSettings.marginX + 'px',
  };
});

const totalChapters = computed(() => book.value?.chapters?.length || 0);
const progressPct = computed(() => {
  if (!book.value || totalChapters.value <= 1) return 100;
  return Math.round((currentVisibleChapter.value / (totalChapters.value - 1)) * 100);
});

let epubBookInstance = null;
const CHAPTER_LOAD_THRESHOLD = 600;

onMounted(() => {
  loadReaderSettings();
  loadBook();
  document.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  cancelScrollRestore();
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  saveProgress();
  saveReaderSettings();
  document.removeEventListener('keydown', handleKeydown);
  if (epubBookInstance) { try { epubBookInstance.destroy(); } catch (e) {} epubBookInstance = null; }
});

function loadBook() {
  try {
    const raw = localStorage.getItem('moyu_library_books');
    if (!raw) { router.back(); return; }
    const books = JSON.parse(raw);
    const id = Number(route.params.id);
    book.value = books.find(b => b.id === id);
    if (!book.value) { router.back(); return; }
    const startFrom = book.value.currentChapter || 0;
    nextChapterToLoad.value = startFrom;
    currentVisibleChapter.value = startFrom;
    const savedOffset = book.value.scrollOffset || 0;
    if (savedOffset) {
      startScrollRestore(startFrom, savedOffset);
    }
    loadNextChapter();
  } catch (e) { router.back(); }
}

async function loadChapterContent(idx) {
  if (!book.value || idx < 0 || idx >= (book.value.chapters?.length || 0)) return;
  if (chapterMap.has(idx)) return;
  if (loading.value) return;
  loading.value = true;
  const ch = book.value.chapters[idx];
  if (!ch) { loading.value = false; return; }

  try {
    let html = '';
    if (book.value.type === 'epub') {
      html = await loadEpubChapter(book.value, ch);
    } else if (book.value.type === 'markdown') {
      const { marked } = await import('marked');
      html = marked.parse(ch.content || '');
    } else if (book.value.type === 'pdf') {
      html = '';
    } else {
      html = `<pre style="white-space:pre-wrap;font-family:inherit;text-indent:0;">${escapeHtml(ch.content || '')}</pre>`;
    }
    chapterMap.set(idx, { index: idx, title: ch.title, html });
  } catch (e) {
    chapterMap.set(idx, { index: idx, title: ch.title, html: '<p style="color:#999">加载失败</p>' });
  }

  if (idx >= nextChapterToLoad.value) {
    nextChapterToLoad.value = idx + 1;
  }
  loading.value = false;
}

async function loadNextChapter() {
  if (!book.value || loading.value || !hasMore.value) return;
  await loadChapterContent(nextChapterToLoad.value);
}

async function loadPrevChapter() {
  if (!book.value || loading.value) return;
  const prevIdx = minLoadedIdx.value - 1;
  if (prevIdx < 0) return;
  await loadChapterContent(prevIdx);
}

function trimChapters() {
  if (chapterMap.size <= 5) return;
  const cur = currentVisibleChapter.value;
  const lo = Math.max(0, cur - 2);
  const hi = Math.min((book.value?.chapters?.length || 1) - 1, cur + 2);

  let savedScrollTop = null;
  if (contentRef.value) {
    const curEl = contentRef.value.querySelector(`[data-chapter-index="${cur}"]`);
    if (curEl) {
      savedScrollTop = contentRef.value.scrollTop - curEl.offsetTop;
    }
  }

  for (const key of chapterMap.keys()) {
    if (key < lo || key > hi) {
      chapterMap.delete(key);
    }
  }

  if (savedScrollTop !== null) {
    requestAnimationFrame(() => {
      if (!contentRef.value) return;
      const curEl = contentRef.value.querySelector(`[data-chapter-index="${cur}"]`);
      if (curEl) {
        contentRef.value.scrollTop = curEl.offsetTop + savedScrollTop;
      }
    });
  }
}

function preloadIfNeeded() {
  if (!contentRef.value || loading.value) return;
  const el = contentRef.value;

  if (hasMore.value) {
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceToBottom < CHAPTER_LOAD_THRESHOLD) {
      loadNextChapter();
      return;
    }
  }

  if (minLoadedIdx.value > 0) {
    const distanceToTop = el.scrollTop;
    if (distanceToTop < CHAPTER_LOAD_THRESHOLD) {
      loadPrevChapter();
    }
  }
}

async function loadEpubChapter(b, ch) {
  const { default: ePub } = await import('epubjs');
  if (!epubBookInstance || epubBookInstance.url !== b.epubUrl) {
    if (epubBookInstance) { try { epubBookInstance.destroy(); } catch (e) {} }
    epubBookInstance = ePub(b.epubUrl);
  }
  await epubBookInstance.ready;
  const section = await epubBookInstance.spine.get(ch.href);
  if (!section) return '';
  const contents = await section.load(epubBookInstance.load.bind(epubBookInstance));
  const body = contents?.document?.body;
  if (body) return body.innerHTML || body.textContent || '';
  return '';
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function onScroll() {
  if (!contentRef.value || !book.value) return;
  // 恢复滚动期间忽略滚动事件，防止覆盖进度
  if (isRestoringScroll.value) return;

  const el = contentRef.value;
  preloadIfNeeded();

  const chapterEls = el.querySelectorAll('[data-chapter-index]');
  for (let i = chapterEls.length - 1; i >= 0; i--) {
    if (chapterEls[i].getBoundingClientRect().top <= 120) {
      const idx = Number(chapterEls[i].dataset.chapterIndex);
      if (idx !== currentVisibleChapter.value) {
        currentVisibleChapter.value = idx;
        book.value.currentChapter = idx;
        trimChapters();
      }
      break;
    }
  }

  throttledSaveProgress();
}

function goToChapter(index) {
  showToc.value = false;
  cancelScrollRestore();
  chapterMap.clear();
  nextChapterToLoad.value = index;
  currentVisibleChapter.value = index;
  loadChapterContent(index);
  startScrollRestore(index, 0);
}

function handleKeydown(e) {
  if (showToc.value) return;
  if (e.key === 'Escape') { showToc.value = false; showSettings.value = false; }
}

watch(showToc, (val) => {
  if (!val) return;
  nextTick(() => {
    requestAnimationFrame(() => {
      const active = document.querySelector('.toc-item.active');
      active?.scrollIntoView({ block: 'center' });
    });
  });
});

function saveProgress() {
  if (!book.value || isRestoringScroll.value) return;
  try {
    const raw = localStorage.getItem('moyu_library_books');
    if (!raw) return;
    const books = JSON.parse(raw);
    const idx = books.findIndex(b => b.id === book.value.id);
    if (idx >= 0) {
      books[idx].currentChapter = currentVisibleChapter.value;
      if (contentRef.value) {
        const curEl = contentRef.value.querySelector(`[data-chapter-index="${currentVisibleChapter.value}"]`);
        if (curEl) {
          books[idx].scrollOffset = contentRef.value.scrollTop - curEl.offsetTop;
        }
      }
      localStorage.setItem('moyu_library_books', JSON.stringify(books));
    }
  } catch (e) {}
}

let saveTimer = null;
function throttledSaveProgress() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; saveProgress(); }, 2000);
}

function loadReaderSettings() {
  try { const raw = localStorage.getItem('moyu_reader_settings'); if (raw) Object.assign(readerSettings, JSON.parse(raw)); } catch (e) {}
}
function saveReaderSettings() {
  try { localStorage.setItem('moyu_reader_settings', JSON.stringify(readerSettings)); } catch (e) {}
}

const fontOptions = [
  { label: '系统默认', value: 'system-ui' },
  { label: '宋体', value: '"SimSun", serif' },
  { label: '楷体', value: '"KaiTi", serif' },
  { label: '黑体', value: '"SimHei", sans-serif' },
  { label: '等宽', value: '"Consolas", monospace' },
];

const currentChapterTitle = computed(() => {
  return book.value?.chapters?.[currentVisibleChapter.value]?.title || '';
});
</script>

<template>
  <div class="reader-page" v-if="book" :style="themeStyle" :class="{ 'transparent-page': isTransparent }">
    <!-- 章节信息 + 进度 -->
    <div class="chapter-bar">
      <button class="icon-btn" @click="router.push({ name: 'library' })" title="返回书架">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <span class="chapter-name" @click="showToc = true">{{ currentChapterTitle }}</span>
      <span class="chapter-pos">第 {{ currentVisibleChapter + 1 }}/{{ totalChapters }} 章 · {{ progressPct }}%</span>
      <button class="icon-btn" @click="showSettings = !showSettings" title="阅读设置">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
      </button>
    </div>
    <div class="progress-thin">
      <div class="progress-fill" :style="{ width: progressPct + '%' }"></div>
    </div>

    <!-- 连续滚动阅读区域 -->
    <div
      class="reader-body"
      ref="contentRef"
      @scroll="onScroll"
      :style="{ fontSize: readerSettings.fontSize + 'px', fontFamily: readerSettings.fontFamily, lineHeight: readerSettings.lineHeight }">
      <div
        v-for="ch in loadedChapters"
        :key="ch.index"
        class="chapter-block"
        :data-chapter-index="ch.index">
        <div class="reader-content" v-html="ch.html"></div>
      </div>
      <div v-if="loading" class="loading-tip">加载中...</div>
      <div v-if="!hasMore && loadedChapters.length" class="loading-tip">— 已读完全部 {{ totalChapters }} 章 —</div>
    </div>

    <!-- 目录 -->
    <transition name="slide-left">
      <div class="toc-overlay" v-if="showToc" @click.self="showToc = false">
        <div class="toc-panel">
          <div class="toc-header">
            <span>目录（{{ totalChapters }} 章）</span>
            <button class="icon-btn" @click="showToc = false">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="toc-list">
            <div
              v-for="(ch, i) in book.chapters"
              :key="i"
              class="toc-item"
              :class="{ active: i === currentVisibleChapter, loaded: chapterMap.has(i) }"
              @click="goToChapter(i)">
              <span class="toc-title">{{ ch.title }}</span>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- 设置 -->
    <transition name="fade">
      <div class="settings-overlay" v-if="showSettings" @click.self="showSettings = false">
        <div class="settings-panel">
          <div class="settings-header">
            <span>阅读设置</span>
            <button class="icon-btn" @click="showSettings = false">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="setting-group">
            <label>主题</label>
            <div class="theme-btns">
              <button v-for="(t, key) in themes" :key="key" class="theme-btn" :class="{ active: readerSettings.theme === key }"
                :style="{ background: t.bg, color: t.text, borderColor: t.border }" @click="readerSettings.theme = key">
                {{ key === 'light' ? '浅色' : key === 'sepia' ? '暖色' : '深色' }}
              </button>
            </div>
          </div>
          <div class="setting-group">
            <label>字号 <span class="val">{{ readerSettings.fontSize }}px</span></label>
            <input type="range" min="12" max="28" step="1" v-model.number="readerSettings.fontSize" class="slider" />
          </div>
          <div class="setting-group">
            <label>行高 <span class="val">{{ readerSettings.lineHeight }}</span></label>
            <input type="range" min="1.4" max="3" step="0.1" v-model.number="readerSettings.lineHeight" class="slider" />
          </div>
          <div class="setting-group">
            <label>边距 <span class="val">{{ readerSettings.marginX }}px</span></label>
            <input type="range" min="0" max="40" step="2" v-model.number="readerSettings.marginX" class="slider" />
          </div>
          <div class="setting-group">
            <label>字体</label>
            <select v-model="readerSettings.fontFamily" class="select-input">
              <option v-for="f in fontOptions" :key="f.value" :value="f.value">{{ f.label }}</option>
            </select>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.reader-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: var(--reader-text, #333);
}

.icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 6px; border: none;
  background: transparent; cursor: pointer;
  color: var(--reader-sub, #999); flex-shrink: 0;
  transition: background 0.12s, color 0.12s;
}
.icon-btn:hover { background: rgba(128,128,128,0.1); color: var(--reader-text); }

.chapter-bar {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 8px; font-size: 11px; color: var(--reader-sub, #999); flex-shrink: 0;
}
.chapter-name { cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%; }
.chapter-name:hover { opacity: 0.7; }
.chapter-pos { flex-shrink: 0; }

.progress-thin { height: 2px; background: var(--reader-border, #eee); flex-shrink: 0; }
.progress-fill { height: 100%; background: #409eff; transition: width 0.3s; }

/* 阅读区域 */
.reader-body {
  flex: 1; overflow-y: auto; padding: 0; cursor: default;
}

.reader-content {
  max-width: 680px; margin: 0 auto;
  padding: 0 var(--margin-x, 16px);
  box-sizing: border-box;
}

.reader-content :deep(h1), .reader-content :deep(h2), .reader-content :deep(h3) {
  color: inherit; margin: 1.2em 0 0.4em; opacity: 0.9;
}
.reader-content :deep(p) { margin: 0.6em 0; text-indent: 2em; }
.reader-content :deep(pre) {
  padding: 12px;
  border-radius: 6px; overflow-x: auto; text-indent: 0;
}
.reader-content :deep(img) { max-width: 100%; }

.loading-tip { text-align: center; color: var(--reader-sub, #999); padding: 20px; font-size: 13px; }

/* 目录 */
.toc-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 200; }
.toc-panel {
  position: fixed; left: 0; top: 0; bottom: 0;
  width: 300px; max-width: 80vw;
  background: var(--reader-card, #fff);
  display: flex; flex-direction: column;
  box-shadow: 4px 0 20px rgba(0,0,0,0.15);
  overflow: hidden;
  padding-top: var(--topbar-height, 28px);
}
.toc-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; font-size: 14px; font-weight: 600;
  border-bottom: 1px solid var(--reader-border, #eee);
  flex-shrink: 0;
}
.toc-list { flex: 1; overflow-y: auto; padding: 4px 0; }
.toc-item {
  padding: 8px 16px; font-size: 13px; color: var(--reader-sub, #666);
  cursor: pointer; transition: background 0.12s;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.toc-item:hover { background: rgba(128,128,128,0.06); }
.toc-item.active { color: #409eff; font-weight: 600; background: rgba(64,158,255,0.06); }
.toc-item.loaded { color: var(--reader-sub, #999); }

/* 设置 */
.settings-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 200;
  display: flex; justify-content: center; padding-top: 60px;
}
.settings-panel {
  background: var(--reader-card, #fff); border-radius: 12px;
  width: 300px; box-shadow: 0 4px 24px rgba(0,0,0,0.15);
  overflow-y: auto; max-height: 80vh;
}
.settings-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; font-size: 14px; font-weight: 600;
  border-bottom: 1px solid var(--reader-border, #eee);
}
.setting-group { padding: 10px 16px; border-bottom: 1px solid rgba(128,128,128,0.08); }
.setting-group:last-child { border-bottom: none; }
.setting-group label {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 12px; color: var(--reader-sub, #999); margin-bottom: 8px;
}
.setting-group .val { font-weight: 600; color: var(--reader-text, #333); }
.theme-btns { display: flex; gap: 6px; }
.theme-btn {
  flex: 1; padding: 6px 0; border-radius: 6px;
  border: 2px solid var(--reader-border, #eee);
  font-size: 12px; cursor: pointer; transition: border-color 0.15s;
  background: transparent; color: inherit;
}
.theme-btn.active { border-color: #409eff; }
.slider { width: 100%; accent-color: #409eff; }
.select-input {
  width: 100%; padding: 6px 10px;
  border: 1px solid var(--reader-border, #ddd); border-radius: 6px;
  font-size: 13px; background: transparent; color: inherit;
}

/* 透明模式 */
.transparent-page { background: transparent !important; }
.transparent-page .chapter-bar,
.transparent-page .progress-thin { background: transparent !important; border-color: transparent !important; }

/* 动画 */
.slide-left-enter-active, .slide-left-leave-active { transition: opacity 0.25s; }
.slide-left-enter-active .toc-panel, .slide-left-leave-active .toc-panel { transition: transform 0.25s ease; }
.slide-left-enter-from .toc-panel, .slide-left-leave-to .toc-panel { transform: translateX(-100%); }
.slide-left-enter-from, .slide-left-leave-to { opacity: 0; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
