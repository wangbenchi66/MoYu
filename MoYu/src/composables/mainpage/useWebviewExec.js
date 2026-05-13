/**
 * useWebviewExec.js — webview 脚本/CSS 注入工具
 */
import { activeTabId, tabs } from '../useAppState.js'
import {
  webviewRefs, webviewReadyMap, insertedCssKeysByTab, lastExecutedScripts,
  getWebview,
} from './useWebviewRefs.js'

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
  })();`
}

function buildAutoScrollScript(enabled, speed) {
  const pxPerSecond = Math.max(12, Math.round((speed || 22) * 3))
  const uid = Date.now()
  return `(() => {
    const __glassReaderAutoScrollUID = ${uid};
    try {
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
  })(); /* uid:${uid} */`
}

const BLANK_TARGET_SCRIPT = `(() => {
  try {
    window.open = function(url) {
      if (!url) return null;
      try { location.assign(url); } catch(e) {}
      return null;
    };
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
    try {
      document.querySelectorAll && document.querySelectorAll('a[target="_blank"]').forEach(a => { try { a.removeAttribute('target'); } catch(e) {} });
    } catch(e) {}
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
})();`

function runWebviewJS(script, tabId) {
  const execOn = async (w, tid) => {
    if (!w) return Promise.resolve()
    const tab = tabs.value.find((t) => String(t.id) === String(tid))
    if (!tab || tab.kind === 'dashboard' || tab.kind === 'local-text') return Promise.resolve()
    if (!webviewReadyMap[String(tid)]) return Promise.resolve()

    try {
      const sig = String(script || '').slice(0, 512)
      lastExecutedScripts[String(tid)] = lastExecutedScripts[String(tid)] || {}
      const lastMap = lastExecutedScripts[String(tid)]
      const now = Date.now()
      if (lastMap[sig] && now - lastMap[sig] < 1200) {
        try { console.log('[runWebviewJS] skipped duplicate script for', tid) } catch (e) {}
        return Promise.resolve()
      }
      lastMap[sig] = now
    } catch (e) {}
    try {
      const p = w.executeJavaScript(script)
      if (p && typeof p.then === 'function') {
        return p
          .then((r) => r)
          .catch((err) => {
            try { console.error('[runWebviewJS] executeJavaScript error', err) } catch (e) {}
          })
      }
      return Promise.resolve()
    } catch (err) {
      try { console.error('[runWebviewJS] executeJavaScript sync error', err) } catch (e) {}
      return Promise.resolve()
    }
  }

  if (tabId !== undefined && tabId !== null) {
    const w = getWebview(tabId)
    return execOn(w, tabId)
  }

  const promises = []
  for (const tid in webviewRefs) {
    promises.push(execOn(webviewRefs[tid], tid))
  }
  return Promise.all(promises)
}

async function runWebviewCss(styleId, css, tabId) {
  const applyTo = async (w, tid) => {
    if (!w) return
    const tab = tabs.value.find((t) => String(t.id) === String(tid))
    if (!tab || tab.kind === 'dashboard' || tab.kind === 'local-text') return
    if (!webviewReadyMap[String(tid)]) return

    try {
      const prevMap = insertedCssKeysByTab[String(tid)] || {}
      const prevKey = prevMap[styleId]
      try {
        const cssSig = `${styleId}::${String(css || '').slice(0, 512)}`
        lastExecutedScripts[String(tid)] = lastExecutedScripts[String(tid)] || {}
        const lastMap = lastExecutedScripts[String(tid)]
        const now = Date.now()
        if (lastMap[cssSig] && now - lastMap[cssSig] < 1200) {
          try { console.log('[runWebviewCss] skipped duplicate css for', tid, styleId) } catch (e) {}
          insertedCssKeysByTab[String(tid)] = prevMap
          return
        }
        lastMap[cssSig] = now
      } catch (e) {}
      if (prevKey && typeof w.removeInsertedCSS === 'function') {
        try { await w.removeInsertedCSS(prevKey) } catch (e) {}
        prevMap[styleId] = null
      }

      if (!css) {
        try {
          const rmScript = `(function(){ const n=document.getElementById(${JSON.stringify(styleId)}); if(n) n.remove(); })();`
          await w.executeJavaScript(rmScript)
        } catch (e) {}
        insertedCssKeysByTab[String(tid)] = prevMap
        return
      }

      if (typeof w.insertCSS === 'function') {
        try {
          const key = await w.insertCSS(css)
          prevMap[styleId] = key
          insertedCssKeysByTab[String(tid)] = prevMap
          return
        } catch (e) {}
      }

      const script = buildStyleScript(styleId, true, css)
      try { await w.executeJavaScript(script) } catch (e) {}
      insertedCssKeysByTab[String(tid)] = prevMap
    } catch (e) {}
  }

  if (tabId !== undefined && tabId !== null) {
    const w = getWebview(tabId)
    await applyTo(w, String(tabId))
    return
  }

  const promises = []
  for (const tid in webviewRefs) {
    promises.push(applyTo(webviewRefs[tid], tid))
  }
  await Promise.all(promises)
}

function forceDisableBlankTargets() {
  runWebviewJS(BLANK_TARGET_SCRIPT)
}

function forceDisableBlankTargetsFor(tabId) {
  runWebviewJS(BLANK_TARGET_SCRIPT, tabId)
}

export {
  buildStyleScript, buildAutoScrollScript, BLANK_TARGET_SCRIPT,
  runWebviewJS, runWebviewCss,
  forceDisableBlankTargets, forceDisableBlankTargetsFor,
}
