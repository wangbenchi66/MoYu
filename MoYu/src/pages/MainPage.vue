<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useDesktopApp } from '../composables/useDesktopApp';
import recommendedPage from './RecommendedPage.vue';

const { settings, activeTab, activeTabId, tabs, addNewTab, selectTab, closeTab, patchSetting, updateTabMetadata, siteRules, ruleProviders, pushRecentVisit } = useDesktopApp();

// 多个 tab 对应多份 webview：使用映射以保留每个 webview 实例，避免切换时重载
const webviewRefs = {}; // tabId (string) -> webview element
const webviewReadyMap = {}; // tabId (string) -> boolean
const webviewDomReadyTs = {}; // tabId -> last dom-ready timestamp (ms)
const webviewReady = ref(false); // 当前激活 tab 的 ready 状态
const insertedCssKeysByTab = {}; // tabId -> { styleId: insertedKey }
const webviewMountCount = {}; // tabId -> number of times ref assigned (mounts)
const lastExecutedScripts = {}; // tabId -> Set of script signatures (simple dedupe aid)
const webviewRefSetters = {}; // cache stable ref setter functions per tab id
const webviewEventListeners = {}; // tabId -> { eventName: handler }
const webviewLastRecordedUrl = {}; // tabId -> last recorded url for history

function getWebviewRefSetter(id) {
  const k = String(id);
  if (!webviewRefSetters[k]) {
    webviewRefSetters[k] = (el) => setWebviewRef(el, id);
  }
  return webviewRefSetters[k];
}

function setWebviewRef(el, id) {
  const tid = String(id);
  const prev = webviewRefs[tid];
  if (!el) {
    try {
      if (prev) {
        webviewMountCount[tid] = Math.max(0, (webviewMountCount[tid] || 1) - 1);
      }
      // remove any attached event listeners for this tab
      try {
        const listeners = webviewEventListeners[tid] || {};
        if (prev && typeof prev.removeEventListener === 'function') {
          for (const k in listeners) {
            try {
              prev.removeEventListener(k, listeners[k]);
            } catch (e) {}
          }
        }
      } catch (e) {}

      delete webviewRefs[tid];
      delete webviewReadyMap[tid];
      delete webviewDomReadyTs[tid];
      delete insertedCssKeysByTab[tid];
      delete webviewEventListeners[tid];
      delete webviewLastRecordedUrl[tid];
    } catch (e) {}
    return;
  }

  // 如果 ref 指向相同元素，则忽略（避免因渲染多次重复计数）
  if (prev === el) return;

  webviewRefs[tid] = el;
  webviewMountCount[tid] = (webviewMountCount[tid] || 0) + 1;
  try {
    console.log('[webview-ref] set', { tid, present: !!el, mountCount: webviewMountCount[tid] });
  } catch (e) {}

  // 统一在此处附加常用生命周期/导航事件，用于诊断重复加载/导航
  try {
    // 先清理旧的（如果存在）
    const prevListeners = webviewEventListeners[tid];
    if (prev && prevListeners && typeof prev.removeEventListener === 'function') {
      for (const k in prevListeners) {
        try {
          prev.removeEventListener(k, prevListeners[k]);
        } catch (e) {}
      }
    }

    const listeners = {};
    // 仅保留关键事件的日志，减少噪声：did-finish-load / did-fail-load / did-navigate
    listeners['did-finish-load'] = function (evt) {
      try {
        console.log('[webview.event] did-finish-load', { tid, src: el && typeof el.getURL === 'function' ? el.getURL() || el.src : el && el.src });
      } catch (e) {}
    };
    listeners['did-navigate'] = function (evt) {
      try {
        const url = (evt && evt.url) || (el && (typeof el.getURL === 'function' ? el.getURL() : el.src)) || '';
        if (!url) return;
        const tabObj = tabs.value.find((t) => String(t.id) === String(tid));
        if (!tabObj || tabObj.kind === 'dashboard' || tabObj.kind === 'local-text') return;
        // 忽略内部 scheme
        if (String(url).startsWith('about:') || String(url).startsWith('local:')) return;
        // 避免短时相同 url 重复记录
        if (webviewLastRecordedUrl[tid] === url) return;
        webviewLastRecordedUrl[tid] = url;

        // 尝试读取页面标题并记录 visit
        if (el && typeof el.executeJavaScript === 'function') {
          try {
            el.executeJavaScript('document.title || ""')
              .then((t) => {
                try {
                  const title = (t && String(t).trim()) || url;
                  if (typeof pushRecentVisit === 'function') pushRecentVisit({ title, url, type: 'site' });
                } catch (e) {}
              })
              .catch(() => {
                if (typeof pushRecentVisit === 'function') pushRecentVisit({ title: url, url, type: 'site' });
              });
          } catch (e) {
            if (typeof pushRecentVisit === 'function') pushRecentVisit({ title: url, url, type: 'site' });
          }
        } else {
          if (typeof pushRecentVisit === 'function') pushRecentVisit({ title: url, url, type: 'site' });
        }
      } catch (e) {}
    };
    listeners['did-navigate-in-page'] = function (evt) {
      try {
        const url = (evt && evt.url) || (el && (typeof el.getURL === 'function' ? el.getURL() : el.src)) || '';
        if (!url) return;
        const tabObj2 = tabs.value.find((t) => String(t.id) === String(tid));
        if (!tabObj2 || tabObj2.kind === 'dashboard' || tabObj2.kind === 'local-text') return;
        if (String(url).startsWith('about:') || String(url).startsWith('local:')) return;
        if (webviewLastRecordedUrl[tid] === url) return;
        webviewLastRecordedUrl[tid] = url;

        if (el && typeof el.executeJavaScript === 'function') {
          try {
            el.executeJavaScript('document.title || ""')
              .then((t) => {
                try {
                  const title = (t && String(t).trim()) || url;
                  if (typeof pushRecentVisit === 'function') pushRecentVisit({ title, url, type: 'site' });
                } catch (e) {}
              })
              .catch(() => {
                if (typeof pushRecentVisit === 'function') pushRecentVisit({ title: url, url, type: 'site' });
              });
          } catch (e) {
            if (typeof pushRecentVisit === 'function') pushRecentVisit({ title: url, url, type: 'site' });
          }
        } else {
          if (typeof pushRecentVisit === 'function') pushRecentVisit({ title: url, url, type: 'site' });
        }
      } catch (e) {}
    };
    listeners['did-fail-load'] = function (evt) {
      try {
        console.warn('[webview.event] did-fail-load', { tid, details: evt });
      } catch (e) {}
    };
    // 将较多输出的事件改为 debug 级别，开发时可在 DevTools 打开 Debug 过滤查看
    listeners['console-message'] = function (evt) {
      try {
        console.debug('[webview.console]', evt && evt.message ? evt.message : evt);
      } catch (e) {}
    };
    listeners['ipc-message'] = function (evt) {
      try {
        console.debug('[webview.ipc]', evt && evt.channel ? evt.channel : evt, evt && evt.args ? evt.args : undefined);
      } catch (e) {}
    };

    for (const k in listeners) {
      try {
        el.addEventListener(k, listeners[k]);
      } catch (e) {}
    }

    // keep reference for later removal
    webviewEventListeners[tid] = listeners;
  } catch (e) {}
}

function getWebview(tabId) {
  if (tabId === undefined || tabId === null) tabId = activeTabId.value;
  return webviewRefs[String(tabId)];
}

function getActiveWebview() {
  return getWebview(activeTabId.value);
}
// 覆盖 webview 的 User-Agent，部分站点会屏蔽 Electron UA 导致连接被关闭
const userAgent = ref('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
const localReaderRef = ref(null);
let localScrollTimer = null;
let localScrollRaf = null;
let localScrollLastTs = null;
let localScrollAcc = 0;
let localUserInteractingAt = null;
let localAutoHandlers = null;
const siteZoom = ref(1);
// bottom toolbar pop state is managed inside BottomToolbar component

const currentHost = computed(() => {
  try {
    const u = new URL(activeTab?.url || '');
    return (u.hostname || '').replace(/^www\./i, '');
  } catch (e) {
    return '';
  }
});

// 仅包含网页类型的 tab 列表（用于渲染保留的 webview 实例）
const pageTabs = computed(() => {
  try {
    const arr = Array.isArray(tabs.value) ? tabs.value : [];
    return arr.filter((t) => t && t.kind === 'page');
  } catch (e) {
    return [];
  }
});

const transparentPageCss = `
html,
body,
#app,
#root,
#__next,
#__nuxt {
  background: transparent !important;
  background-color: transparent !important;
}

html::before,
html::after,
body::before,
body::after {
  min-width: 180px;
  z-index: 1300;
}
`;

// 更强力的透明样式（保留图片/视频/canvas/svg）
const transparentPageCssAggressive = `
      }
.hover-pop .mini-range {
  width: 140px;
}
#root,
#__next,
  top: -34px;
  background: transparent !important;
  background-color: transparent !important;
}

html::before,
html::after,
body::before,
body::after {
  z-index: 1400;
  background: transparent !important;
}

*:not(img):not(picture):not(video):not(canvas):not(svg) {
  background: transparent !important;
  background-image: none !important;
  box-shadow: none !important;
}
`;

const noImageCss = `
img, picture, video, canvas, svg {
  visibility: hidden !important;
}
`;

function buildStyleScript(styleId, enabled, cssText) {
  return `(() => {
    const id = ${JSON.stringify(styleId)};
    const css = ${JSON.stringify(cssText)};
    let styleNode = document.getElementById(id);

    if (${enabled ? 'true' : 'false'}) {
      if (!styleNode) {
        styleNode = document.createElement('style');
        styleNode.id = id;
        document.documentElement.appendChild(styleNode);
      }

      styleNode.textContent = css;
      return true;
    }

    if (styleNode) {
      styleNode.remove();
    }

    return true;
  })();`;
}

function buildAutoScrollScript(enabled, speed) {
  // 将 UI speed 映射到像素/秒，用于 RAF 平滑滚动
  const pxPerSecond = Math.max(12, Math.round((speed || 22) * 3));
  // embed uid to avoid accidental dedupe by runWebviewJS
  const uid = Date.now();
  return `(() => {
    const __glassReaderAutoScrollUID = ${uid};
    try {
      // 清理旧的 interval/RAF/handler
      try { if (window.__glassReaderAutoScrollTimer) { window.clearInterval(window.__glassReaderAutoScrollTimer); window.__glassReaderAutoScrollTimer = null; } } catch(e) {}
      try { if (window.__glassReaderAutoScrollRAF) { window.cancelAnimationFrame(window.__glassReaderAutoScrollRAF); window.__glassReaderAutoScrollRAF = null; } } catch(e) {}
      try { if (window.__glassReaderAutoScrollUserHandler) { ['wheel','touchstart','pointerdown','keydown'].forEach(e=>{ try{ document.removeEventListener(e, window.__glassReaderAutoScrollUserHandler); }catch(e){} }); window.__glassReaderAutoScrollUserHandler = null; } } catch(e) {}

      if (!${enabled ? 'true' : 'false'}) {
        return true;
      }

      const speedPxPerSec = ${pxPerSecond};
      const root = document.scrollingElement || document.documentElement || document.body;
      let lastTs = performance.now();
      let acc = 0;
      window.__glassReaderAutoScrollUserInteractionAt = window.__glassReaderAutoScrollUserInteractionAt || 0;

      // user interaction handler: mark last interaction time
      window.__glassReaderAutoScrollUserHandler = function() {
        try { window.__glassReaderAutoScrollUserInteractionAt = performance.now(); } catch(e) {}
      };

      try {
        ['wheel','touchstart','pointerdown','keydown'].forEach((n) => {
          try { document.addEventListener(n, window.__glassReaderAutoScrollUserHandler, { passive: true }); } catch(e) { try { document.addEventListener(n, window.__glassReaderAutoScrollUserHandler); } catch(e) {} }
        });
      } catch(e) {}

      function step(ts) {
        try {
          const now = ts || performance.now();
          const delta = now - lastTs;
          lastTs = now;

          // 如果用户最近交互过，短暂停止自动滚动以避免冲突
          if (window.__glassReaderAutoScrollUserInteractionAt && (now - window.__glassReaderAutoScrollUserInteractionAt) < 300) {
            window.__glassReaderAutoScrollRAF = window.requestAnimationFrame(step);
            return;
          }

          acc += (speedPxPerSec * delta) / 1000;
          const toScroll = Math.floor(acc);
          if (toScroll >= 1) {
            if (root) {
              try { root.scrollBy(0, toScroll); } catch(e) {}
            }
            acc -= toScroll;
          }
        } catch(e) {}
        window.__glassReaderAutoScrollRAF = window.requestAnimationFrame(step);
      }

      window.__glassReaderAutoScrollRAF = window.requestAnimationFrame(step);
    } catch(e) {}
    return true;
  })(); /* uid:${uid} */`;
}

// computeLeft helpers moved into BottomToolbar

// （标签标题格式化已移至 App.vue）

// pop handlers moved into BottomToolbar

// default helpers moved into BottomToolbar

function toggleToolbarPinned() {
  if (settings.toolbarPinned) {
    // 切换到移入显示模式：取消固定并隐藏工具栏（由 hover/handle 控制显示）
    patchSetting('toolbarPinned', false);
    patchSetting('toolbarVisible', false);
  } else {
    // 切换到固定显示模式：固定并显示工具栏
    patchSetting('toolbarPinned', true);
    patchSetting('toolbarVisible', true);
  }
}

function disableToolbar() {
  // 永久关闭工具栏的显示（直到用户在设置中重新启用）
  try {
    patchSetting('toolbarDisabled', true);
    patchSetting('toolbarVisible', false);
    patchSetting('toolbarPinned', false);
  } catch (e) {}
}

// 原始的 JS 注入方法（用于自动滚动等需要执行脚本的场景）
function runWebviewJS(script, tabId) {
  const execOn = async (w, tid) => {
    if (!w) return Promise.resolve();
    const tab = tabs.value.find((t) => String(t.id) === String(tid));
    if (!tab || tab.kind === 'dashboard' || tab.kind === 'local-text') return Promise.resolve();
    if (!webviewReadyMap[String(tid)]) return Promise.resolve();

    // 简单去重：避免在极短时间内对同一 tab 执行相同脚本两次（通常由重复挂载/ready 导致）
    try {
      const sig = String(script || '').slice(0, 512);
      lastExecutedScripts[String(tid)] = lastExecutedScripts[String(tid)] || {};
      const lastMap = lastExecutedScripts[String(tid)];
      const now = Date.now();
      if (lastMap[sig] && now - lastMap[sig] < 1200) {
        try {
          console.log('[runWebviewJS] skipped duplicate script for', tid);
        } catch (e) {}
        return Promise.resolve();
      }
      lastMap[sig] = now;
    } catch (e) {}
    try {
      const p = w.executeJavaScript(script);
      if (p && typeof p.then === 'function') {
        return p.catch((err) => {
          try {
            console.error('[runWebviewJS] executeJavaScript error', err);
          } catch (e) {}
        });
      }
      return Promise.resolve();
    } catch (err) {
      try {
        console.error('[runWebviewJS] executeJavaScript sync error', err);
      } catch (e) {}
      return Promise.resolve();
    }
  };

  if (tabId !== undefined && tabId !== null) {
    const w = getWebview(tabId);
    return execOn(w, tabId);
  }

  const promises = [];
  for (const tid in webviewRefs) {
    promises.push(execOn(webviewRefs[tid], tid));
  }
  return Promise.all(promises);
}

// 拦截 webview 尝试打开新窗口的事件，强制在当前 webview 中打开链接
function onWebviewNewWindow(e) {
  try {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
  } catch (err) {}

  const url = (e && (e.url || (e.detail && e.detail.url))) || '';
  if (!url) return;

  // 尝试从事件 target 获取对应 webview，否则使用当前激活 webview
  const w = (e && e.target) || getActiveWebview();
  try {
    if (w && typeof w.loadURL === 'function') {
      w.loadURL(url);
    } else if (w) {
      try {
        w.src = url;
      } catch (err) {}
    }
  } catch (err) {
    // ignore
  }
}

// 有时页面会触发 will-navigate，确保在当前 webview 内部导航
function onWebviewWillNavigate(e) {
  // 这里不阻止导航，但可用于插入日志或同步 tab url
}

// 注入到 webview 内部，强制移除或拦截所有 target="_blank" 行为，确保在当前页面打开链接
function forceDisableBlankTargets() {
  const script = `(() => {
    try {
      // 覆盖 window.open，避免通过脚本打开新窗口
      window.open = function(url) {
        if (!url) return null;
        try { location.assign(url); } catch(e) {}
        return null;
      };

      // 捕获点击，优先处理 target="_blank" 的锚点
      document.addEventListener('click', function(evt) {
        try {
          const el = evt.target && evt.target.closest && evt.target.closest('a');
          if (!el) return;
          const href = el.getAttribute && (el.getAttribute('href') || el.href);
          if (!href) return;
          const targ = (el.getAttribute && el.getAttribute('target') || el.target || '').toLowerCase();
          if (targ === '_blank') {
            evt.preventDefault();
            try { el.removeAttribute('target'); } catch(e) {}
            try { location.assign(href); } catch(e) {}
          }
        } catch(e) {}
      }, true);

      // 初始移除已有的 target="_blank"
      try {
        document.querySelectorAll && document.querySelectorAll('a[target="_blank"]').forEach(a => { try { a.removeAttribute('target'); } catch(e) {} });
      } catch(e) {}

      // 监听动态插入或修改的元素，移除 target 属性
      try {
        const mo = new MutationObserver(function(muts) {
          try {
            muts.forEach(m => {
              if (m.addedNodes && m.addedNodes.length) {
                m.addedNodes.forEach(n => {
                  if (n && n.nodeType === 1) {
                    try {
                      if (n.tagName === 'A' && (n.target || '').toLowerCase() === '_blank') n.removeAttribute('target');
                      const inner = n.querySelectorAll && n.querySelectorAll('a[target="_blank"]');
                      inner && inner.forEach(a => { try { a.removeAttribute('target'); } catch(e) {} });
                    } catch(e) {}
                  }
                });
              }
              if (m.type === 'attributes' && m.target && m.target.tagName === 'A' && m.attributeName === 'target') {
                try { if ((m.target.getAttribute('target') || '').toLowerCase() === '_blank') m.target.removeAttribute('target'); } catch(e) {}
              }
            });
          } catch(e) {}
        });
        mo.observe(document.documentElement || document, { childList: true, subtree: true, attributes: true, attributeFilter: ['target'] });
      } catch(e) {}
    } catch(e) {}
    return true;
  })();`;

  runWebviewJS(script);
}

// 支持可选的 tabId，针对单个 webview 禁用 _blank 打开行为
function forceDisableBlankTargetsFor(tabId) {
  const script = `(() => {
    try {
      // 覆盖 window.open，避免通过脚本打开新窗口
      window.open = function(url) {
        if (!url) return null;
        try { location.assign(url); } catch(e) {}
        return null;
      };

      // 捕获点击，优先处理 target="_blank" 的锚点
      document.addEventListener('click', function(evt) {
        try {
          const el = evt.target && evt.target.closest && evt.target.closest('a');
          if (!el) return;
          const href = el.getAttribute && (el.getAttribute('href') || el.href);
          if (!href) return;
          const targ = (el.getAttribute && el.getAttribute('target') || el.target || '').toLowerCase();
          if (targ === '_blank') {
            evt.preventDefault();
            try { el.removeAttribute('target'); } catch(e) {}
            try { location.assign(href); } catch(e) {}
          }
        } catch(e) {}
      }, true);

      // 初始移除已有的 target="_blank"
      try {
        document.querySelectorAll && document.querySelectorAll('a[target="_blank"]').forEach(a => { try { a.removeAttribute('target'); } catch(e) {} });
      } catch(e) {}

      // 监听动态插入或修改的元素，移除 target 属性
      try {
        const mo = new MutationObserver(function(muts) {
          try {
            muts.forEach(m => {
              if (m.addedNodes && m.addedNodes.length) {
                m.addedNodes.forEach(n => {
                  if (n && n.nodeType === 1) {
                    try {
                      if (n.tagName === 'A' && (n.target || '').toLowerCase() === '_blank') n.removeAttribute('target');
                      const inner = n.querySelectorAll && n.querySelectorAll('a[target="_blank"]');
                      inner && inner.forEach(a => { try { a.removeAttribute('target'); } catch(e) {} });
                    } catch(e) {}
                  }
                });
              }
              if (m.type === 'attributes' && m.target && m.target.tagName === 'A' && m.attributeFilter && m.attributeFilter.indexOf && m.attributeFilter.indexOf('target') !== -1) {
                try { if ((m.target.getAttribute('target') || '').toLowerCase() === '_blank') m.target.removeAttribute('target'); } catch(e) {}
              }
            });
          } catch(e) {}
        });
        mo.observe(document.documentElement || document, { childList: true, subtree: true, attributes: true, attributeFilter: ['target'] });
      } catch(e) {}
    } catch(e) {}
    return true;
  })();`;

  runWebviewJS(script, tabId);
}

// 从当前 webview 读取页面元数据并更新对应 tab（标题 / 副标题）
async function updateTabFromWebview(tabId) {
  const tid = tabId !== undefined && tabId !== null ? tabId : activeTabId.value;
  const w = getWebview(tid);
  if (!w || !webviewReadyMap[String(tid)]) return;
  try {
    if (typeof w.executeJavaScript !== 'function') return;
    const script = `(function(){try{return {title:document.title||'',desc:(document.querySelector('meta[name="description"]')&&document.querySelector('meta[name="description"]').getAttribute('content'))||''}}catch(e){return {title:'',desc:''}}})();`;
    const res = await w.executeJavaScript(script);
    if (!res) return;
    try {
      updateTabMetadata(tid, { title: res.title || undefined, subtitle: res.desc || undefined });
    } catch (e) {}
  } catch (e) {}
}

function onPageTitleUpdated(e) {
  try {
    const w = (e && e.target) || null;
    const tid = w && w.getAttribute && w.getAttribute('data-tab-id') ? w.getAttribute('data-tab-id') : activeTabId.value;
    updateTabFromWebview(tid);
  } catch (e) {}
}

function onDidNavigate(e) {
  try {
    const w = (e && e.target) || null;
    const tid = w && w.getAttribute && w.getAttribute('data-tab-id') ? w.getAttribute('data-tab-id') : activeTabId.value;
    updateTabFromWebview(tid);
  } catch (e) {}
}

// 简单的 webview 导航与缩放辅助
function webviewBack() {
  const w = getActiveWebview();
  try {
    if (w && typeof w.goBack === 'function') w.goBack();
  } catch (e) {}
}

function webviewForward() {
  const w = getActiveWebview();
  try {
    if (w && typeof w.goForward === 'function') w.goForward();
  } catch (e) {}
}

function webviewReload() {
  const w = getActiveWebview();
  try {
    if (w && typeof w.reload === 'function') w.reload();
  } catch (e) {}
}

async function setSiteZoom(factor) {
  siteZoom.value = Math.max(0.3, Math.min(3, Number(factor) || 1));
  const w = getActiveWebview();
  try {
    if (w && typeof w.setZoomFactor === 'function') {
      await w.setZoomFactor(siteZoom.value);
    } else {
      const script = `window.__glass_reader_zoom = ${siteZoom.value}; document.body.style.zoom = ${siteZoom.value};`;
      runWebviewJS(script);
    }
  } catch (e) {}
}

function zoomIn() {
  setSiteZoom(siteZoom.value + 0.1);
}
function zoomOut() {
  setSiteZoom(siteZoom.value - 0.1);
}
function resetZoom() {
  setSiteZoom(1);
}

// 向 webview 注入或替换样式，优先使用 insertCSS（可绕过 CSP），无法使用时回退到 style 标签注入
async function runWebviewCss(styleId, css, tabId) {
  const applyTo = async (w, tid) => {
    if (!w) return;
    const tab = tabs.value.find((t) => String(t.id) === String(tid));
    if (!tab || tab.kind === 'dashboard' || tab.kind === 'local-text') return;
    if (!webviewReadyMap[String(tid)]) return;

    try {
      const prevMap = insertedCssKeysByTab[String(tid)] || {};

      const prevKey = prevMap[styleId];
      // 去重：相同 styleId+css 在短时内不用重复注入
      try {
        const cssSig = `${styleId}::${String(css || '').slice(0, 512)}`;
        lastExecutedScripts[String(tid)] = lastExecutedScripts[String(tid)] || {};
        const lastMap = lastExecutedScripts[String(tid)];
        const now = Date.now();
        if (lastMap[cssSig] && now - lastMap[cssSig] < 1200) {
          try {
            console.log('[runWebviewCss] skipped duplicate css for', tid, styleId);
          } catch (e) {}
          insertedCssKeysByTab[String(tid)] = prevMap;
          return;
        }
        lastMap[cssSig] = now;
      } catch (e) {}
      if (prevKey && typeof w.removeInsertedCSS === 'function') {
        try {
          await w.removeInsertedCSS(prevKey);
        } catch (e) {}
        prevMap[styleId] = null;
      }

      if (!css) {
        try {
          const rmScript = `(function(){ const n=document.getElementById(${JSON.stringify(styleId)}); if(n) n.remove(); })();`;
          await w.executeJavaScript(rmScript);
        } catch (e) {}
        insertedCssKeysByTab[String(tid)] = prevMap;
        return;
      }

      if (typeof w.insertCSS === 'function') {
        try {
          const key = await w.insertCSS(css);
          prevMap[styleId] = key;
          insertedCssKeysByTab[String(tid)] = prevMap;
          return;
        } catch (e) {
          // fallback to style injection
        }
      }

      const script = buildStyleScript(styleId, true, css);
      try {
        await w.executeJavaScript(script);
      } catch (e) {}
      insertedCssKeysByTab[String(tid)] = prevMap;
    } catch (e) {}
  };

  if (tabId !== undefined && tabId !== null) {
    const w = getWebview(tabId);
    await applyTo(w, String(tabId));
    return;
  }

  const promises = [];
  for (const tid in webviewRefs) {
    promises.push(applyTo(webviewRefs[tid], tid));
  }
  await Promise.all(promises);
}

// webview 加载失败处理（记录以便调试）
function onWebviewFailLoad(e) {
  try {
    console.warn('[webview] did-fail-load', e);
  } catch (err) {}
}

function syncWebviewTransparency() {
  const enabled = settings.pageTransparentMode || settings.fullWindowTransparent;
  const css = settings.pageTransparentMode || settings.fullWindowTransparent ? transparentPageCssAggressive : transparentPageCss;
  // 若传入 tabId 则会只针对该 webview 注入
  const tabId = arguments.length ? arguments[0] : undefined;
  runWebviewCss('glass-transparent-style', enabled ? css : '', tabId);
}
function syncWebviewNoImage() {
  const tabId = arguments.length ? arguments[0] : undefined;
  runWebviewCss('glass-no-image-style', settings.noImageMode ? noImageCss : '', tabId);
}

function syncWebviewScrollbars() {
  const tabId = arguments.length ? arguments[0] : undefined;
  const enabled = !!settings.showScrollbars;
  // 注入样式节点以隐藏滚动条视觉，但保留页面滚动行为
  const css = `
    /* 保留滚动但隐藏滚动条（Chrome/WebKit） */
    ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
    ::-webkit-scrollbar-thumb { background: transparent !important; }
    /* Firefox */
    * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
  `;

  const script = `(() => {
    try {
      const id = 'glass-scrollbar-style';
      const existing = document.getElementById(id);
      if (${enabled}) {
        if (existing) existing.remove();
        return true;
      }
      if (existing) {
        existing.textContent = ${JSON.stringify(css)};
        return true;
      }
      const style = document.createElement('style');
      style.id = id;
      style.textContent = ${JSON.stringify(css)};
      (document.head || document.documentElement || document.body).appendChild(style);
    } catch(e) {}
    return true;
  })();`;

  runWebviewJS(script, tabId);
}

function syncWebviewTextColor() {
  if (!settings.forceReaderTextColor) {
    const tabId = arguments.length ? arguments[0] : undefined;
    runWebviewCss('glass-force-text-color', '', tabId);
    return;
  }

  const color = settings.readerTextColor || '#283247';
  const css = `
    body, body * { color: ${color} !important; background: transparent !important; }
    a, a * { color: inherit !important; }
  `;

  const tabId = arguments.length ? arguments[0] : undefined;
  runWebviewCss('glass-force-text-color', css, tabId);
}

function syncWebviewFontSize() {
  if (!settings.forceReaderFont) {
    const tabId = arguments.length ? arguments[0] : undefined;
    runWebviewCss('glass-force-font-size', '', tabId);
    return;
  }

  const scale = settings.readerFontScale || 100;
  const css = `
    html, body, body * { font-size: ${scale}% !important; }
  `;

  const tabId = arguments.length ? arguments[0] : undefined;
  runWebviewCss('glass-force-font-size', css, tabId);
}

function syncWebviewAutoScroll() {
  const tabId = arguments.length ? arguments[0] : undefined;
  runWebviewJS(buildAutoScrollScript(settings.autoScrollEnabled, settings.autoScrollSpeed), tabId);
}

function stopLocalReaderAutoScroll() {
  if (localScrollTimer) {
    window.clearInterval(localScrollTimer);
    localScrollTimer = null;
  }
  if (localScrollRaf) {
    try {
      window.cancelAnimationFrame(localScrollRaf);
    } catch (e) {}
    localScrollRaf = null;
    localScrollLastTs = null;
  }
  // 移除本地阅读器上的交互监听器并重置累积器
  try {
    const el = localReaderRef && localReaderRef.value ? localReaderRef.value : null;
    if (el && localAutoHandlers) {
      try {
        el.removeEventListener('wheel', localAutoHandlers.wheel);
      } catch (e) {}
      try {
        el.removeEventListener('pointerdown', localAutoHandlers.pointerdown);
      } catch (e) {}
      try {
        el.removeEventListener('touchstart', localAutoHandlers.touchstart);
      } catch (e) {}
      try {
        el.removeEventListener('keydown', localAutoHandlers.keydown);
      } catch (e) {}
    }
  } catch (e) {}
  localAutoHandlers = null;
  localUserInteractingAt = null;
  localScrollAcc = 0;
}

function syncLocalReaderAutoScroll() {
  stopLocalReaderAutoScroll();

  if (!settings.autoScrollEnabled || activeTab.value?.kind !== 'local-text' || !localReaderRef.value) {
    return;
  }

  const speedPxPerSec = Math.max(12, Math.round((settings.autoScrollSpeed || 22) * 3));
  localScrollLastTs = performance.now();
  localScrollAcc = 0;

  // attach user interaction handlers to pause auto-scroll temporarily
  try {
    const el = localReaderRef.value;
    if (el) {
      const onUser = function () {
        localUserInteractingAt = performance.now();
      };
      const onKey = function (ev) {
        try {
          const k = ev && ev.key ? ev.key : '';
          if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' '].includes(k)) localUserInteractingAt = performance.now();
        } catch (e) {}
      };
      localAutoHandlers = { wheel: onUser, pointerdown: onUser, touchstart: onUser, keydown: onKey };
      try {
        el.addEventListener('wheel', onUser, { passive: true });
      } catch (e) {
        try {
          el.addEventListener('wheel', onUser);
        } catch (e) {}
      }
      try {
        el.addEventListener('pointerdown', onUser, { passive: true });
      } catch (e) {
        try {
          el.addEventListener('pointerdown', onUser);
        } catch (e) {}
      }
      try {
        el.addEventListener('touchstart', onUser, { passive: true });
      } catch (e) {
        try {
          el.addEventListener('touchstart', onUser);
        } catch (e) {}
      }
      try {
        el.addEventListener('keydown', onKey);
      } catch (e) {}
    }
  } catch (e) {}

  function localStep(ts) {
    try {
      const now = ts || performance.now();
      const delta = now - localScrollLastTs;
      localScrollLastTs = now;

      // 若用户近期交互则短暂停止自动滚动以避免冲突
      if (localUserInteractingAt && now - localUserInteractingAt < 300) {
        localScrollRaf = window.requestAnimationFrame(localStep);
        return;
      }

      localScrollAcc += (speedPxPerSec * delta) / 1000;
      const toScroll = Math.floor(localScrollAcc);
      if (toScroll >= 1) {
        try {
          if (localReaderRef.value) localReaderRef.value.scrollBy({ top: toScroll, behavior: 'auto' });
        } catch (e) {}
        localScrollAcc -= toScroll;
      }
    } catch (e) {}
    localScrollRaf = window.requestAnimationFrame(localStep);
  }

  localScrollRaf = window.requestAnimationFrame(localStep);
}

function syncReaderEffects(tabId) {
  syncWebviewTransparency(tabId);
  syncWebviewNoImage(tabId);
  syncWebviewScrollbars(tabId);
  syncWebviewTextColor(tabId);
  syncWebviewFontSize(tabId);
  syncWebviewAutoScroll(tabId);
  syncLocalReaderAutoScroll();
  // 同步本地阅读器样式以保证立即可见
  applyLocalReaderStyles();
}

// --- 失焦/隐藏时暂停媒体与自动滚动的实现 --- //
let _pauseListenerAttached = false;
let _pausedByHide = false;

function pauseMediaAndScroll() {
  try {
    // 停止本地阅读器自动滚动
    stopLocalReaderAutoScroll();
  } catch (e) {}

  try {
    const script = `(() => {
      try {
        const media = Array.from(document.querySelectorAll('video, audio'));
        media.forEach((el) => {
          try {
            // 记录之前的静音状态与播放状态
            el.__glass_reader_prev_muted = el.muted ? 1 : 0;
            el.__glass_reader_was_playing = el.paused ? 0 : 1;
            if (typeof el.pause === 'function') el.pause();
            try { el.muted = true; } catch(e) {}
          } catch(e) {}
        });
        // 如果存在注入的自动滚动计时器或 RAF，清除并标记为已被暂停
        try { if (window.__glassReaderAutoScrollTimer) { window.clearInterval(window.__glassReaderAutoScrollTimer); window.__glassReaderAutoScrollTimer = null; } } catch(e) {}
        try { if (window.__glassReaderAutoScrollRAF) { window.cancelAnimationFrame(window.__glassReaderAutoScrollRAF); window.__glassReaderAutoScrollRAF = null; } } catch(e) {}
        window.__glassReaderAutoScrollPausedByGlassReader = true;
      } catch(e) {}
      return true;
    })();`;
    runWebviewJS(script);
  } catch (e) {}
}

function resumeMediaAndScroll() {
  try {
    // 恢复本地阅读器自动滚动（根据当前设置决定是否启用）
    syncLocalReaderAutoScroll();
  } catch (e) {}

  try {
    const script = `(() => {
      try {
        const media = Array.from(document.querySelectorAll('video, audio'));
        media.forEach((el) => {
          try {
            if (el.__glass_reader_prev_muted !== undefined) {
              try { el.muted = !!el.__glass_reader_prev_muted; } catch(e) {}
              try { delete el.__glass_reader_prev_muted; } catch(e) {}
            }
            if (el.__glass_reader_was_playing === 1 || el.__glass_reader_was_playing === '1') {
              try { const p = el.play(); if (p && typeof p.catch === 'function') p.catch(() => {}); } catch(e) {}
            }
            try { delete el.__glass_reader_was_playing; } catch(e) {}
          } catch(e) {}
        });
        // 清理自动滚动暂停标记（host 侧会重新注入 autoScroll）
        if (window.__glassReaderAutoScrollPausedByGlassReader) {
          window.__glassReaderAutoScrollPausedByGlassReader = false;
        }
      } catch(e) {}
      return true;
    })();`;
    runWebviewJS(script);
    // 重新同步 webview 自动滚动（主机侧会根据 settings.autoScrollEnabled 决定是否启动）
    syncWebviewAutoScroll();
  } catch (e) {}
}

function handleHideEvent() {
  if (!settings.pauseOnBlurHide) return;
  if (_pausedByHide) return;
  _pausedByHide = true;
  pauseMediaAndScroll();
}

function handleShowEvent() {
  if (!settings.pauseOnBlurHide) return;
  if (!_pausedByHide) return;
  _pausedByHide = false;
  resumeMediaAndScroll();
}

function onVisibilityChange() {
  try {
    if (document.hidden) handleHideEvent();
    else handleShowEvent();
  } catch (e) {}
}

function onWindowBlur() {
  try {
    handleHideEvent();
  } catch (e) {}
}
function onWindowFocus() {
  try {
    handleShowEvent();
  } catch (e) {}
}

function attachPauseListeners() {
  if (_pauseListenerAttached) return;
  _pauseListenerAttached = true;
  try {
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('focus', onWindowFocus);
  } catch (e) {}
}

function detachPauseListeners() {
  if (!_pauseListenerAttached) return;
  _pauseListenerAttached = false;
  try {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('blur', onWindowBlur);
    window.removeEventListener('focus', onWindowFocus);
  } catch (e) {}
  _pausedByHide = false;
}

// 将样式立即应用到本地阅读视图（local-text），保证在滑动/选色时有即时反馈
function applyLocalReaderStyles() {
  try {
    if (!localReaderRef.value) return;

    // 文字颜色
    if (settings.forceReaderTextColor) {
      localReaderRef.value.style.color = settings.readerTextColor || '';
    } else {
      localReaderRef.value.style.color = '';
    }

    // 字号（通过根元素比例控制）
    if (settings.forceReaderFont) {
      localReaderRef.value.style.fontSize = `${settings.readerFontScale}%`;
    } else {
      localReaderRef.value.style.fontSize = '';
    }
  } catch (e) {
    // ignore
  }
}

function onReaderColorInput(e) {
  const v = e.target.value;
  patchSetting('readerTextColor', v);
  if (!settings.forceReaderTextColor) patchSetting('forceReaderTextColor', true);
  // 立即生效
  syncWebviewTextColor();
  applyLocalReaderStyles();
}

function onFontScaleInput(e) {
  const v = Number(e.target.value || 100);
  patchSetting('readerFontScale', v);
  if (!settings.forceReaderFont) patchSetting('forceReaderFont', true);
  // 立即生效
  syncWebviewFontSize();
  applyLocalReaderStyles();
  // 更新弹窗位置与值
  updatePopPosition(v, 80, 160);
}

function onAutoScrollSpeedInput(e) {
  const v = Number(e.target.value || 22);
  patchSetting('autoScrollSpeed', v);
  if (!settings.autoScrollEnabled) patchSetting('autoScrollEnabled', true);
  // 立即生效
  syncWebviewAutoScroll();
  syncLocalReaderAutoScroll();
  // 更新弹窗位置与值
  updatePopPosition(v, 5, 80);
}

function handleWebviewDomReady(e) {
  const w = (e && e.target) || null;
  if (!w) return;
  const tabId = w.getAttribute && w.getAttribute('data-tab-id') ? w.getAttribute('data-tab-id') : w.dataset && w.dataset.tabId ? w.dataset.tabId : null;
  if (!tabId) return;

  // 去重：短时间内重复的 dom-ready 忽略（许多站点或内嵌导航会触发多次）
  try {
    const now = Date.now();
    const prevTs = webviewDomReadyTs[tabId];
    if (prevTs && now - prevTs < 1200) {
      try {
        console.log('[webview] dom-ready skipped duplicate', { tabId, since: now - prevTs });
      } catch (e) {}
      return;
    }
    webviewDomReadyTs[tabId] = now;
  } catch (e) {}

  try {
    setWebviewRef(w, tabId);
    webviewReadyMap[String(tabId)] = true;
    if (String(tabId) === String(activeTabId.value)) webviewReady.value = true;
  } catch (e) {}

  const tabObj = tabs.value.find((t) => String(t.id) === String(tabId));
  let pageUrl = tabObj?.url || '';
  try {
    if (!pageUrl) {
      if (typeof w.getURL === 'function') {
        try {
          pageUrl = w.getURL() || '';
        } catch (e) {
          pageUrl = w.src || '';
        }
      } else {
        pageUrl = w.src || '';
      }
    }
  } catch (e) {
    pageUrl = tabObj?.url || '';
  }

  try {
    console.log('[webview] dom-ready', { tabId, url: pageUrl, kind: tabObj?.kind, webviewRefPresent: !!w, webviewReady: webviewReady.value, mountCount: webviewMountCount[tabId] });
  } catch (e) {}
  try {
    console.trace && console.trace('[webview] dom-ready trace', tabId);
  } catch (e) {}

  // Diagnostic: report element size and active tab info to help trace visibility issues
  try {
    const rect = typeof w.getBoundingClientRect === 'function' ? w.getBoundingClientRect() : { width: w.clientWidth || 0, height: w.clientHeight || 0 };
    const cls = w.className && typeof w.className === 'string' ? w.className : w.classList ? Array.from(w.classList).join(' ') : '';
    console.log('[webview.debug] dom-ready rect/class', {
      tabId,
      rect: { w: rect.width, h: rect.height },
      classList: cls,
      activeTabId: activeTabId && activeTabId.value !== undefined ? activeTabId.value : activeTabId
    });
  } catch (e) {}

  // 对该 webview 同步注入 reader 效果（只针对刚准备好的 tab）
  try {
    syncWebviewTransparency(tabId);
    syncWebviewNoImage(tabId);
    syncWebviewScrollbars(tabId);
    syncWebviewTextColor(tabId);
    syncWebviewFontSize(tabId);
    syncWebviewAutoScroll(tabId);
    syncLocalReaderAutoScroll();
  } catch (e) {}

  // 尝试读取并同步当前页面缩放比例（如果是激活 tab，则更新全局 siteZoom）
  try {
    if (w && typeof w.getZoomFactor === 'function') {
      w.getZoomFactor()
        .then((f) => {
          try {
            if (String(tabId) === String(activeTabId.value)) siteZoom.value = f || 1;
          } catch (e) {}
        })
        .catch(() => {});
    } else {
      try {
        w.executeJavaScript &&
          w
            .executeJavaScript('window.__glass_reader_zoom || 1')
            .then((f) => {
              try {
                if (String(tabId) === String(activeTabId.value)) siteZoom.value = f || 1;
              } catch (e) {}
            })
            .catch(() => {});
      } catch (e) {}
    }
  } catch (e) {}

  // 注册事件监听器（每个 webview 单独绑定）
  try {
    // 事件监听统一在 setWebviewRef 中处理，避免在 dom-ready 时重复附加
  } catch (e) {}

  // 处理站点规则：仅对当前 tab 的规则进行应用
  try {
    let combined = null;
    try {
      combined = ruleProviders && typeof ruleProviders.getCombinedRulesForUrl === 'function' ? ruleProviders.getCombinedRulesForUrl(pageUrl || '') : null;
    } catch (e) {
      combined = null;
    }

    const siteRulesList = combined?.site || [];
    const toolbarRulesList = combined?.toolbar || [];

    const allowNewWindow = toolbarRulesList.some((r) => r.toolbarDisabled === false) || siteRulesList.some((r) => r.preventBlankTargets === false);
    if (!allowNewWindow) {
      try {
        forceDisableBlankTargetsFor(tabId);
      } catch (e) {}
    }

    try {
      for (const r of siteRulesList) {
        try {
          if (typeof r.apply === 'function') {
            try {
              try {
                console.log('[site-rules] applying rule', r.id, r.pattern, 'tab', tabId);
              } catch (e) {}
              const maybe = r.apply({
                runWebviewCss: (idSuffix, css) => runWebviewCss(`site-custom-css-${r.id}${idSuffix ? `-${idSuffix}` : ''}`, css, tabId),
                runWebviewJS: (js) => runWebviewJS(js, tabId),
                webview: w,
                settings,
                activeTab: tabObj,
                rule: r
              });
              if (maybe && typeof maybe.then === 'function') maybe.catch(() => {});
            } catch (e) {}
          }
        } catch (e) {}
      }
    } catch (e) {}
  } catch (e) {}

  // 工具栏规则逻辑已移动至顶层，避免模板访问到未定义的变量
}

// 计算并维护对当前页面的工具栏覆盖规则（优先使用 toolbarRules）
const effectiveToolbar = ref({
  docked: settings.toolbarDocked,
  pinned: settings.toolbarPinned,
  visible: settings.toolbarVisible,
  disabled: settings.toolbarDisabled,
  hideHandle: false,
  iconOnly: false
});

function updateEffectiveToolbar() {
  try {
    const w = getActiveWebview();
    let pageUrl = '';
    try {
      if (activeTab && activeTab.url) pageUrl = activeTab.url;
      else if (w) pageUrl = typeof w.getURL === 'function' ? w.getURL() || '' : w.src || '';
    } catch (e) {
      pageUrl = activeTab?.url || '';
    }

    const combined = ruleProviders && typeof ruleProviders.getCombinedRulesForUrl === 'function' ? ruleProviders.getCombinedRulesForUrl(pageUrl || '') : null;
    const toolbarList = combined?.toolbar || [];
    const override = toolbarList.length ? toolbarList[0] : null;
    effectiveToolbar.value.docked = override?.toolbarDocked ?? settings.toolbarDocked;
    effectiveToolbar.value.pinned = override?.toolbarPinned ?? settings.toolbarPinned;
    effectiveToolbar.value.visible = override?.toolbarVisible ?? settings.toolbarVisible;
    effectiveToolbar.value.disabled = override?.toolbarDisabled ?? settings.toolbarDisabled;
    effectiveToolbar.value.hideHandle = override?.hideHandle ?? false;
    effectiveToolbar.value.iconOnly = override?.iconOnly ?? false;
  } catch (e) {
    // ignore
  }
}

// 监听强制网页透明开关，确保其变更能立即同步到 webview
// 注意：直接传入 syncReaderEffects 会让 Vue 把新值作为参数传入
// 从而误把布尔值当作 tabId；使用包裹函数以避免该问题
watch(
  () => settings.pageTransparentMode,
  () => syncReaderEffects()
);
// forcePageTransparent 已与 pageTransparentMode 功能合并，移除单独监听以避免重复触发
watch(
  () => settings.noImageMode,
  () => syncReaderEffects()
);
watch(
  () => settings.autoScrollEnabled,
  () => syncReaderEffects()
);
watch(
  () => settings.autoScrollSpeed,
  () => syncReaderEffects()
);
watch(
  () => settings.readerTextColor,
  (v) => {
    syncWebviewTextColor();
    applyLocalReaderStyles();
  }
);
watch(
  () => settings.forceReaderTextColor,
  (v) => {
    syncWebviewTextColor();
    applyLocalReaderStyles();
  }
);
// 单独监听滚动条显示设置，直接调用包装函数以避免 Vue 传参误用
watch(
  () => settings.showScrollbars,
  () => syncWebviewScrollbars()
);
watch(
  () => settings.readerFontScale,
  (v) => {
    syncWebviewFontSize();
    applyLocalReaderStyles();
  }
);
watch(
  () => settings.forceReaderFont,
  (v) => {
    syncWebviewFontSize();
    applyLocalReaderStyles();
  }
);

// 当工具栏相关设置变更时，重新计算 effectiveToolbar
watch(
  () => [settings.toolbarVisible, settings.toolbarPinned, settings.toolbarDisabled, settings.toolbarDocked],
  () => {
    try {
      updateEffectiveToolbar();
    } catch (e) {}
  }
);

watch(
  () => activeTabId.value,
  async () => {
    // 切换 tab 时根据目标 tab 的 readyMap 更新状态，并同步该 tab 的 reader 效果
    webviewReady.value = !!webviewReadyMap[String(activeTabId.value)];
    await nextTick();
    syncReaderEffects(activeTabId.value);
    try {
      updateEffectiveToolbar();
    } catch (e) {}
    try {
      // diagnostic: enumerate webview frames and report classes/sizes
      try {
        const nodes = document.querySelectorAll && document.querySelectorAll('.webview-frame');
        if (nodes && nodes.length) {
          for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            try {
              const r = n.getBoundingClientRect ? n.getBoundingClientRect() : { width: n.clientWidth || 0, height: n.clientHeight || 0 };
              console.log('[webview.debug] post-switch frame', { idx: i, class: n.className || (n.classList ? Array.from(n.classList).join(' ') : ''), size: { w: r.width, h: r.height } });
            } catch (e) {}
          }
        }
      } catch (e) {}
    } catch (e) {}
  }
);

// 监听用户是否启用失焦暂停行为，动态绑定/解绑事件监听器
watch(
  () => settings.pauseOnBlurHide,
  (v) => {
    try {
      if (v) attachPauseListeners();
      else detachPauseListeners();
    } catch (e) {}
  }
);

// 向父组件暴露必要方法和状态，以便将 BottomToolbar 移到 App.vue
defineExpose({
  settings,
  siteZoom,
  patchSetting,
  webviewBack,
  webviewForward,
  webviewReload,
  zoomIn,
  zoomOut,
  resetZoom,
  toggleToolbarPinned,
  disableToolbar,
  effectiveToolbar
});

onBeforeUnmount(() => {
  stopLocalReaderAutoScroll();
  try {
    detachPauseListeners();
  } catch (e) {}
});

onMounted(() => {
  try {
    updateEffectiveToolbar();
  } catch (e) {}
  // 如果用户已启用，初始化绑定隐藏/失焦监听
  try {
    if (settings.pauseOnBlurHide) attachPauseListeners();
  } catch (e) {}
});
</script>

<template>
  <section class="main-page">
    <section class="browser-stage">
      <div class="workspace-shell">
        <section class="reader-stage">
          <!-- <div class="reader-toolbar panel no-drag">
            <div>
              <strong>{{ activeTab.title }}</strong>
              <span>{{ activeTab.subtitle }}</span>
            </div>
            <div class="reader-badges">
              <span class="reader-badge">{{ activeTabMeta }}</span>
              <span class="reader-badge">透明度 {{ settings.transparency }}%</span>
              <span class="reader-badge">自动滚动 {{ settings.autoScrollEnabled ? '开启' : '关闭' }}</span>
            </div>
          </div> -->

          <div
            class="page-frame panel no-drag"
            :class="{ 'is-webview': activeTab?.kind === 'page' }">
            <webview
              v-for="tab in pageTabs"
              v-show="String(tab.id) === String(activeTabId)"
              :key="tab.id"
              :data-tab-id="tab.id"
              :ref="getWebviewRefSetter(tab.id)"
              :class="['webview-frame', { 'webview-active': String(tab.id) === String(activeTabId) }]"
              :src="tab.url"
              :useragent="userAgent"
              nodeintegration="false"
              enableblinkfeatures="ResizeObserver"
              @dom-ready="handleWebviewDomReady"
              allowpopups></webview>

            <!-- 仪表盘与本地阅读视图作为覆盖层显示：改为 v-if 以在非活跃时从 DOM 中移除，避免遮挡问题 -->
            <recommended-page
              v-if="activeTab?.kind === 'dashboard'"
              class="overlay-panel" />

            <article
              ref="localReaderRef"
              v-if="activeTab?.kind === 'local-text'"
              class="local-reader overlay-panel">
              <header class="local-reader-head">
                <strong>{{ activeTab?.fileName }}</strong>
                <span>本地文本阅读视图</span>
              </header>
              <pre class="local-reader-content">{{ activeTab?.content }}</pre>
            </article>
            <!-- 底部工具栏已移到父组件 App.vue 以避免覆盖页面底部内容 -->
          </div>
        </section>
      </div>
    </section>

    <!-- 站点规则快速编辑弹窗已移除（由自定义规则文件管理） -->
  </section>
</template>

<style scoped>
.page-frame {
  position: relative;
}
/* toolbar base: layout only - positioning moved to .overlay / .docked */
.bottom-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 0;
  z-index: 60;
  transition:
    transform 0.18s ease,
    opacity 0.18s ease;
}

/* overlay: positioned inside page frame, floats above webview */
.bottom-toolbar.overlay {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 8px;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(6px);
  box-shadow: 0 6px 18px rgba(16, 23, 32, 0.08);
}

/* docked: fixed to application bottom (outside webview), spans width */
.bottom-toolbar-container.overlay {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 8px;
}

/* docked: fixed to application bottom (outside webview), spans width */
.bottom-toolbar-container.docked {
  position: fixed;
  left: 8px;
  right: 8px;
  bottom: 8px;
  margin: 0 auto;
  max-width: calc(100% - 16px);
}

/* visual shell for the toolbar itself */
.bottom-toolbar {
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
  box-shadow: 0 6px 18px rgba(16, 23, 32, 0.08);
}

/* 当隐藏时移动到视图外，但容器保留小手柄触发悬浮显示 */
.bottom-toolbar.hidden {
  transform: translateY(calc(100% + 8px));
  opacity: 0;
  pointer-events: none;
}

/* 悬浮手柄：在工具栏隐藏时保留用于移入显示或点击展开 */
.toolbar-handle {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 4px;
  width: 56px;
  height: 8px;
  border-radius: 0;
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.03));
  border: 1px solid rgba(0, 0, 0, 0.06);
  cursor: pointer;
  z-index: 1300;
  box-shadow: 0 6px 18px rgba(16, 23, 32, 0.06);
  transition:
    transform 150ms ease,
    opacity 150ms;
}
.toolbar-handle:hover {
  transform: translateX(-50%) translateY(-3px);
  opacity: 0.98;
}
.bottom-toolbar-container:hover .bottom-toolbar.hidden {
  transform: translateY(0);
  opacity: 1;
  pointer-events: auto;
}

/* 当工具栏被用户关闭时，禁止通过移入显示 */
.bottom-toolbar-container.no-hover:hover .bottom-toolbar.hidden {
  transform: translateY(calc(100% + 8px));
  opacity: 0;
  pointer-events: none;
}

.close-toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 6px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.92);
  color: #e04842;
  transition:
    background 150ms ease,
    transform 120ms ease;
}
.close-toolbar-btn:hover {
  background: rgba(224, 72, 66, 0.06);
  transform: translateY(-2px);
}

.icon-btn {
  border: 0;
  background: transparent;
  padding: 6px 8px;
  border-radius: 0;
  cursor: pointer;
  font-size: 14px;
  transition:
    background 120ms ease,
    transform 120ms ease;
}

.icon-btn.on {
  background: rgba(64, 158, 255, 0.1);
  color: #409eff;
}

/* 站点规则编辑弹窗样式 */
.rule-modal-layer {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.32);
  z-index: 2400;
}
.rule-modal {
  width: 760px;
  max-width: calc(100% - 48px);
  max-height: calc(100% - 48px);
  overflow: auto;
  padding: 12px;
}
.rule-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.rule-modal-body {
  background: #fff;
  padding: 12px;
  border-radius: 8px;
}
.icon-btn:hover {
  background: rgba(16, 23, 32, 0.04);
  transform: translateY(-1px);
}
.hide-toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.zoom-label {
  min-width: 48px;
  text-align: center;
  font-weight: 600;
}

/* mini color input */
.mini-color {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 6px;
  cursor: pointer;
  background: none;
  -webkit-appearance: none;
  appearance: none;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.03);
}
.mini-color::-moz-color-swatch {
  border-radius: 6px;
  border: none;
}

/* mini range slider */
.mini-range {
  width: 110px;
  height: 28px;
  background: transparent;
  -webkit-appearance: none;
  appearance: none;
}
.mini-range::-webkit-slider-runnable-track {
  height: 6px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 6px;
}

/* Tabs: 保证标签只显示一行，超过 10 个字符截断显示省略号 */
.tabs {
  display: flex;
  gap: 8px;
  align-items: center;
}
.tab-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 8px;
  white-space: nowrap;
  cursor: pointer;
}
.tab-chip .tab-title {
  display: inline-block;
  max-width: 10ch; /* 近似 10 个字符宽度 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.range-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}
.range-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
}
.mini-reset-icon {
  border: 0;
  background: transparent;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0;
  cursor: pointer;
  font-size: 14px;
  color: #444;
}
.mini-reset-icon:hover {
  background: rgba(0, 0, 0, 0.06);
}

.close-toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 6px;
  border-radius: 10px;
  border: 1px solid rgba(224, 72, 66, 0.06);
  background: rgba(255, 255, 255, 0.92);
  color: #e04842;
  box-shadow: 0 2px 6px rgba(16, 23, 32, 0.04);
  transition:
    background 150ms ease,
    transform 120ms ease;
}
.close-toolbar-btn:hover {
  background: rgba(224, 72, 66, 0.06);
  transform: translateY(-2px);
}
.mini-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  margin-top: -4px;
  background: #409eff;
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  cursor: pointer;
}
.mini-range::-moz-range-track {
  height: 6px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 6px;
}
.mini-range::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: #409eff;
  border-radius: 50%;
  border: none;
}
.mini-range:focus {
  outline: none;
}
.mini-color:focus {
  outline: none;
  box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.12);
}

/* wrapper for inline small sliders */
.mini-range-wrap {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-left: 6px;
}
.range-default {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.46);
}

/* hover pop for toggles */
.toggle-with-pop {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.hover-pop {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%) translateY(6px);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
  background: rgba(255, 255, 255, 0.98);
  padding: 6px;
  border-radius: 0;
  box-shadow: 0 8px 24px rgba(16, 23, 32, 0.12);
  min-width: 140px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
}
.hover-pop.visible,
.toggle-with-pop:hover .hover-pop {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(-50%) translateY(0);
}
.hover-pop .mini-range {
  width: 160px;
}
.pop-value {
  position: absolute;
  top: -26px;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
  padding: 3px 6px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
}

/* default anchor on slider track */
.range-anchor {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 12px;
  height: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.range-anchor::before {
  content: '';
  display: block;
  width: 2px;
  height: 10px;
  background: rgba(64, 158, 255, 0.9);
  border-radius: 2px;
}
.range-anchor:hover::before {
  background: #2b88ff;
}

/* hide button in toolbar */
.hide-toolbar-btn {
  margin-left: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.75);
  font-weight: 600;
}
.hide-toolbar-btn:hover {
  background: rgba(0, 0, 0, 0.08);
}

/* 纯图标样式（工具栏内使用） */
.bottom-toolbar .icon-only {
  background: transparent;
  border: none;
  padding: 4px;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0;
  box-shadow: none;
  transition:
    background 120ms ease,
    transform 120ms ease,
    color 120ms ease;
}
.bottom-toolbar .icon-only:hover {
  background: rgba(16, 23, 32, 0.04);
  transform: translateY(-1px);
}
.bottom-toolbar .icon-only.on {
  color: #409eff;
  background: rgba(64, 158, 255, 0.06);
}
.bottom-toolbar .close-toolbar-btn.icon-only {
  color: #e04842;
}
.bottom-toolbar .close-toolbar-btn.icon-only:hover {
  background: rgba(224, 72, 66, 0.08);
  color: #c0392b;
}
</style>
