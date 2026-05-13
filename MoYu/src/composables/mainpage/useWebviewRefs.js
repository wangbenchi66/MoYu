/**
 * useWebviewRefs.js — webview 引用管理（实例生命周期、事件监听绑定）
 */
import { ref } from 'vue'
import { activeTabId, tabs } from '../useAppState.js'
import { pushRecentVisit } from '../useRecentVisits.js'

const webviewRefs = {}
const webviewReadyMap = {}
const webviewDomReadyTs = {}
const webviewReady = ref(false)
const insertedCssKeysByTab = {}
const webviewMountCount = {}
const lastExecutedScripts = {}
const webviewRefSetters = {}
const webviewEventListeners = {}
const webviewLastRecordedUrl = {}

let _shortcutHandler = null
function setShortcutHandler(fn) { _shortcutHandler = fn }

function getWebviewRefSetter(id) {
  const k = String(id)
  if (!webviewRefSetters[k]) {
    webviewRefSetters[k] = (el) => setWebviewRef(el, id)
  }
  return webviewRefSetters[k]
}

function setWebviewRef(el, id) {
  const tid = String(id)
  const prev = webviewRefs[tid]
  if (!el) {
    try {
      if (prev) {
        webviewMountCount[tid] = Math.max(0, (webviewMountCount[tid] || 1) - 1)
      }
      try {
        const listeners = webviewEventListeners[tid] || {}
        if (prev && typeof prev.removeEventListener === 'function') {
          for (const k in listeners) {
            try { prev.removeEventListener(k, listeners[k]) } catch (e) {}
          }
        }
      } catch (e) {}

      delete webviewRefs[tid]
      delete webviewReadyMap[tid]
      delete webviewDomReadyTs[tid]
      delete insertedCssKeysByTab[tid]
      delete webviewEventListeners[tid]
      delete webviewLastRecordedUrl[tid]
      delete lastExecutedScripts[tid]
      delete webviewRefSetters[tid]
    } catch (e) {}
    return
  }

  if (prev === el) return

  webviewRefs[tid] = el
  webviewMountCount[tid] = (webviewMountCount[tid] || 0) + 1
  try {
    console.log('[webview-ref] set', { tid, present: !!el, mountCount: webviewMountCount[tid] })
  } catch (e) {}

  try {
    const prevListeners = webviewEventListeners[tid]
    if (prev && prevListeners && typeof prev.removeEventListener === 'function') {
      for (const k in prevListeners) {
        try { prev.removeEventListener(k, prevListeners[k]) } catch (e) {}
      }
    }

    const listeners = {}
    listeners['did-finish-load'] = function (evt) {
      try {
        console.log('[webview.event] did-finish-load', { tid, src: el && typeof el.getURL === 'function' ? el.getURL() || el.src : el && el.src })
      } catch (e) {}
    }
    function recordNavigation(evt) {
      try {
        const url = (evt && evt.url) || (el && (typeof el.getURL === 'function' ? el.getURL() : el.src)) || ''
        if (!url) return
        const tabObj = tabs.value.find((t) => String(t.id) === String(tid))
        if (!tabObj || tabObj.kind === 'dashboard' || tabObj.kind === 'local-text') return
        if (String(url).startsWith('about:') || String(url).startsWith('local:')) return
        if (webviewLastRecordedUrl[tid] === url) return
        webviewLastRecordedUrl[tid] = url

        if (el && typeof el.executeJavaScript === 'function') {
          try {
            el.executeJavaScript('document.title || ""')
              .then((t) => {
                try {
                  const title = (t && String(t).trim()) || url
                  if (typeof pushRecentVisit === 'function') pushRecentVisit({ title, url, type: 'site' })
                } catch (e) {}
              })
              .catch(() => {
                if (typeof pushRecentVisit === 'function') pushRecentVisit({ title: url, url, type: 'site' })
              })
          } catch (e) {
            if (typeof pushRecentVisit === 'function') pushRecentVisit({ title: url, url, type: 'site' })
          }
        } else {
          if (typeof pushRecentVisit === 'function') pushRecentVisit({ title: url, url, type: 'site' })
        }
      } catch (e) {}
    }
    listeners['did-navigate'] = recordNavigation
    listeners['did-navigate-in-page'] = recordNavigation
    listeners['did-fail-load'] = function (evt) {
      try { console.warn('[webview.event] did-fail-load', { tid, details: evt }) } catch (e) {}
    }
    listeners['console-message'] = function (evt) {
      try {
        const msg = evt && evt.message ? evt.message : ''
        console.debug('[webview.console]', msg)
        // 快捷键消息转发给外部处理器（由 MainPage 注入）
        try {
          if (typeof msg === 'string' && msg.indexOf('GLASS_SHORTCUT:') === 0 && _shortcutHandler) {
            _shortcutHandler(msg)
          }
        } catch (e) {}
      } catch (e) {}
    }
    listeners['ipc-message'] = function (evt) {
      try {
        const channel = evt && evt.channel
        if (channel === 'media-status') {
          const playing = evt.args && evt.args[0] && evt.args[0].playing
          const wv = evt.target || el
          if (wv && wv.setAttribute) wv.setAttribute('data-media-playing', playing ? '1' : '0')
          return
        }
        console.debug('[webview.ipc]', channel, evt && evt.args ? evt.args : undefined)
      } catch (e) {}
    }

    for (const k in listeners) {
      try { el.addEventListener(k, listeners[k]) } catch (e) {}
    }
    webviewEventListeners[tid] = listeners
  } catch (e) {}
}

function getWebview(tabId) {
  if (tabId === undefined || tabId === null) tabId = activeTabId.value
  return webviewRefs[String(tabId)]
}

function getActiveWebview() {
  return getWebview(activeTabId.value)
}

export {
  webviewRefs, webviewReadyMap, webviewDomReadyTs, webviewReady,
  insertedCssKeysByTab, webviewMountCount, lastExecutedScripts,
  webviewRefSetters, webviewLastRecordedUrl,
  getWebviewRefSetter, setWebviewRef, getWebview, getActiveWebview,
  setShortcutHandler,
}
