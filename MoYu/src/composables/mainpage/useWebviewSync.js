/**
 * useWebviewSync.js — webview 样式/效果同步（透明、无图、滚动条、字号、自动滚动）
 */
import { nextTick } from 'vue'
import { activeTabId, settings } from '../useAppState.js'
import { webviewRefs, getWebview } from './useWebviewRefs.js'
import { runWebviewJS, runWebviewCss, buildAutoScrollScript } from './useWebviewExec.js'
import { syncLocalReaderAutoScroll, applyLocalReaderStyles } from './useLocalReaderAutoScroll.js'

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
`

const transparentPageCssAggressive = `
html, body, #app, #root, #__next, #__nuxt {
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
`

const noImageCss = `
img, picture, video, canvas, svg {
  visibility: hidden !important;
}
`

function syncWebviewTransparency(tabId) {
  const enabled = settings.pageTransparentMode || settings.fullWindowTransparent
  const css = settings.pageTransparentMode || settings.fullWindowTransparent ? transparentPageCssAggressive : transparentPageCss
  runWebviewCss('glass-transparent-style', enabled ? css : '', tabId)
}

function syncWebviewNoImage(tabId) {
  runWebviewCss('glass-no-image-style', settings.noImageMode ? noImageCss : '', tabId)
}

function syncWebviewScrollbars(tabId) {
  const enabled = !!settings.showScrollbars
  const css = `
    ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
    ::-webkit-scrollbar-thumb { background: transparent !important; }
    * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
  `
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
  })();`
  runWebviewJS(script, tabId)
}

function syncWebviewTextColor(tabId) {
  if (!settings.forceReaderTextColor) {
    runWebviewCss('glass-force-text-color', '', tabId)
    return
  }
  const color = settings.readerTextColor || '#283247'
  const css = `
    body, body * { color: ${color} !important; background: transparent !important; }
    a, a * { color: inherit !important; }
  `
  runWebviewCss('glass-force-text-color', css, tabId)
}

function syncWebviewFontSize(tabId) {
  if (!settings.forceReaderFont) {
    runWebviewCss('glass-force-font-size', '', tabId)
    return
  }
  const scale = settings.readerFontScale || 100
  const css = `html, body, body * { font-size: ${scale}% !important; }`
  runWebviewCss('glass-force-font-size', css, tabId)
}

function syncWebviewAutoScroll(tabId) {
  runWebviewJS(buildAutoScrollScript(settings.autoScrollEnabled, settings.autoScrollSpeed), tabId)
}

function syncReaderEffects(tabId) {
  const tid = tabId !== undefined && tabId !== null ? tabId : activeTabId.value
  syncWebviewTransparency(tid)
  syncWebviewNoImage(tid)
  syncWebviewScrollbars(tid)
  syncWebviewTextColor(tid)
  syncWebviewFontSize(tid)
  syncWebviewAutoScroll(tid)
  syncLocalReaderAutoScroll()
  applyLocalReaderStyles()
}

let _syncReaderPending = false
function scheduleSyncReaderEffects() {
  if (_syncReaderPending) return
  _syncReaderPending = true
  nextTick(() => {
    _syncReaderPending = false
    syncReaderEffects()
  })
}

export {
  transparentPageCss, transparentPageCssAggressive, noImageCss,
  syncWebviewTransparency, syncWebviewNoImage, syncWebviewScrollbars,
  syncWebviewTextColor, syncWebviewFontSize, syncWebviewAutoScroll,
  syncReaderEffects, scheduleSyncReaderEffects,
}
