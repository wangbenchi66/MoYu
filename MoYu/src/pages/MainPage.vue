<!-- MainPage.vue — 多 webview 管理（标签渲染、脚本注入调度、本地阅读器、自动滚动） -->
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDesktopApp } from '../composables/useDesktopApp'
import ConsolePage from './ConsolePage.vue'

// ─── MainPage 子模块 ───
import {
  webviewRefs, webviewReadyMap, webviewDomReadyTs, webviewReady,
  webviewMountCount, lastExecutedScripts, getWebviewRefSetter, setWebviewRef,
  getWebview, getActiveWebview, setShortcutHandler,
} from '../composables/mainpage/useWebviewRefs.js'
import {
  runWebviewJS, runWebviewCss, buildAutoScrollScript,
  forceDisableBlankTargetsFor,
} from '../composables/mainpage/useWebviewExec.js'
import {
  syncWebviewTransparency, syncWebviewNoImage, syncWebviewScrollbars,
  syncWebviewTextColor, syncWebviewFontSize, syncWebviewAutoScroll,
  syncReaderEffects, scheduleSyncReaderEffects,
} from '../composables/mainpage/useWebviewSync.js'
import { attachPauseListeners, detachPauseListeners, reevaluatePauseState } from '../composables/mainpage/usePauseOnBlur.js'
import { isDark } from '../composables/useTheme.js'
import ContextMenu from '../components/ContextMenu.vue'

const { settings, activeTab, activeTabId, tabs, addNewTab, selectTab, closeTab, patchSetting, updateTabMetadata, siteRules, ruleProviders, pushRecentVisit, addRecommendedSite, toggleSetting, recommendedSites, statusMessage } = useDesktopApp()

const userAgent = ref('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36')
const siteZoom = ref(1)
let _forwardKeyHandler = null

const currentHost = computed(() => {
  try { const u = new URL(activeTab?.url || ''); return (u.hostname || '').replace(/^www\./i, '') } catch (e) { return '' }
})

const pageTabs = computed(() => {
  try { const arr = Array.isArray(tabs.value) ? tabs.value : []; return arr.filter((t) => t && t.kind === 'page') } catch (e) { return [] }
})

// ─── 快捷键处理（注入到 webview event listeners）───
function handleShortcutMessage(msg) {
  try {
    const payload = msg.slice('GLASS_SHORTCUT:'.length)
    const obj = JSON.parse(payload)
    if (!obj || !obj.action) return
    switch (obj.action) {
      case 'autoToggleShortcut':
        patchSetting('autoScrollEnabled', !settings.autoScrollEnabled); syncWebviewAutoScroll(); break
      case 'autoSpeedDownShortcut':
        patchSetting('autoScrollSpeed', Math.max(5, (settings.autoScrollSpeed || 22) - 5)); syncWebviewAutoScroll(activeTabId.value); break
      case 'autoSpeedUpShortcut':
        patchSetting('autoScrollSpeed', Math.min(80, (settings.autoScrollSpeed || 22) + 5)); syncWebviewAutoScroll(activeTabId.value); break
      case 'decreaseTransparencyShortcut':
        try { patchSetting('transparency', Math.max(0, (Number(settings.transparency) || 0) - 5)) } catch (e) {} break
      case 'increaseTransparencyShortcut':
        try { patchSetting('transparency', Math.min(85, (Number(settings.transparency) || 0) + 5)) } catch (e) {} break
      case 'clickThroughShortcut':
        patchSetting('clickThroughMode', !settings.clickThroughMode); break
      case 'bossKey':
        try { window.dispatchEvent(new CustomEvent('glass:boss-toggle')) } catch (e) {} break
    }
  } catch (e) {}
}
setShortcutHandler(handleShortcutMessage)

// ─── 工具栏状态 ───
const effectiveToolbar = ref({
  docked: settings.toolbarDocked, pinned: settings.toolbarPinned,
  visible: settings.toolbarVisible, disabled: settings.toolbarDisabled,
  hideHandle: false, iconOnly: false,
})

function updateEffectiveToolbar() {
  try {
    const w = getActiveWebview()
    let pageUrl = ''
    try { if (activeTab && activeTab.url) pageUrl = activeTab.url; else if (w) pageUrl = typeof w.getURL === 'function' ? w.getURL() || '' : w.src || '' } catch (e) { pageUrl = activeTab?.url || '' }
    const combined = ruleProviders && typeof ruleProviders.getCombinedRulesForUrl === 'function' ? ruleProviders.getCombinedRulesForUrl(pageUrl || '') : null
    const toolbarList = combined?.toolbar || []
    const override = toolbarList.length ? toolbarList[0] : null
    effectiveToolbar.value.docked = override?.toolbarDocked ?? settings.toolbarDocked
    effectiveToolbar.value.pinned = override?.toolbarPinned ?? settings.toolbarPinned
    effectiveToolbar.value.visible = override?.toolbarVisible ?? settings.toolbarVisible
    effectiveToolbar.value.disabled = override?.toolbarDisabled ?? settings.toolbarDisabled
    effectiveToolbar.value.hideHandle = override?.hideHandle ?? false
    effectiveToolbar.value.iconOnly = override?.iconOnly ?? false
  } catch (e) {}
}

function toggleToolbarPinned() {
  if (settings.toolbarPinned) { patchSetting('toolbarPinned', false); patchSetting('toolbarVisible', false) }
  else { patchSetting('toolbarPinned', true); patchSetting('toolbarVisible', true) }
}

function disableToolbar() {
  try { patchSetting('toolbarDisabled', true); patchSetting('toolbarVisible', false); patchSetting('toolbarPinned', false) } catch (e) {}
}

// ─── 导航与缩放 ───
function webviewBack() { const w = getActiveWebview(); try { if (w && typeof w.goBack === 'function') w.goBack() } catch (e) {} }
function webviewForward() { const w = getActiveWebview(); try { if (w && typeof w.goForward === 'function') w.goForward() } catch (e) {} }
function webviewReload() { const w = getActiveWebview(); try { if (w && typeof w.reload === 'function') w.reload() } catch (e) {} }

async function setSiteZoom(factor) {
  siteZoom.value = Math.max(0.3, Math.min(3, Number(factor) || 1))
  const w = getActiveWebview()
  try {
    if (w && typeof w.setZoomFactor === 'function') await w.setZoomFactor(siteZoom.value)
    else { const script = `window.__glass_reader_zoom = ${siteZoom.value}; document.body.style.zoom = ${siteZoom.value};`; runWebviewJS(script) }
  } catch (e) {}
}
function zoomIn() { setSiteZoom(siteZoom.value + 0.1) }
function zoomOut() { setSiteZoom(siteZoom.value - 0.1) }
function resetZoom() { setSiteZoom(1) }

function onWebviewNewWindow(e) {
  try { if (e && typeof e.preventDefault === 'function') e.preventDefault() } catch (err) {}
  const url = (e && (e.url || (e.detail && e.detail.url))) || ''
  if (!url) return
  const w = (e && e.target) || getActiveWebview()
  try { if (w && typeof w.loadURL === 'function') w.loadURL(url); else if (w) { try { w.src = url } catch (err) {} } } catch (err) {}
}

// ─── 输入处理 ───
function onReaderColorInput(e) {
  const v = e.target.value; patchSetting('readerTextColor', v)
  if (!settings.forceReaderTextColor) patchSetting('forceReaderTextColor', true)
  syncWebviewTextColor()
}
function onFontScaleInput(e) {
  const v = Number(e.target.value || 100); patchSetting('readerFontScale', v)
  if (!settings.forceReaderFont) patchSetting('forceReaderFont', true)
  syncWebviewFontSize()
}
function onAutoScrollSpeedInput(e) {
  const v = Number(e.target.value || 22); patchSetting('autoScrollSpeed', v)
  if (!settings.autoScrollEnabled) patchSetting('autoScrollEnabled', true)
  syncWebviewAutoScroll()
}

// ─── dom-ready 处理 ───
function handleWebviewDomReady(e) {
  const w = (e && e.target) || null
  if (!w) return
  const tabId = w.getAttribute && w.getAttribute('data-tab-id') ? w.getAttribute('data-tab-id') : w.dataset && w.dataset.tabId ? w.dataset.tabId : null
  if (!tabId) return

  try { const now = Date.now(); const prevTs = webviewDomReadyTs[tabId]; if (prevTs && now - prevTs < 1200) return; webviewDomReadyTs[tabId] = now } catch (e) {}

  try { setWebviewRef(w, tabId); webviewReadyMap[String(tabId)] = true; if (String(tabId) === String(activeTabId.value)) webviewReady.value = true } catch (e) {}

  const tabObj = tabs.value.find((t) => String(t.id) === String(tabId))
  let pageUrl = tabObj?.url || ''
  try { if (!pageUrl) { if (typeof w.getURL === 'function') { try { pageUrl = w.getURL() || '' } catch (e) { pageUrl = w.src || '' } } else { pageUrl = w.src || '' } } } catch (e) { pageUrl = tabObj?.url || '' }

  try { console.log('[webview] dom-ready', { tabId, url: pageUrl, kind: tabObj?.kind, webviewRefPresent: !!w, webviewReady: webviewReady.value, mountCount: webviewMountCount[tabId] }) } catch (e) {}

  // 同步 reader 效果
  try {
    syncWebviewTransparency(tabId); syncWebviewNoImage(tabId); syncWebviewScrollbars(tabId)
    syncWebviewTextColor(tabId); syncWebviewFontSize(tabId); syncWebviewAutoScroll(tabId)
  } catch (e) {}

  // 注入媒体播放状态监听
  try {
    const mediaMonitor = `(() => {
      try {
        if (window.__glassReaderMediaMonitor) return true;
        window.__glassReaderMediaMonitor = true;
        const check = () => {
          try {
            const all = document.querySelectorAll('video, audio');
            let playing = false;
            for (const m of all) { if (!m.paused && !m.ended) { playing = true; break; } }
            if (window.__glassReaderMediaPlaying !== playing) {
              window.__glassReaderMediaPlaying = playing;
              if (window.chrome && chrome.ipcRenderer && chrome.ipcRenderer.sendToHost) {
                chrome.ipcRenderer.sendToHost('media-status', { playing });
              }
            }
          } catch(e) {}
        };
        ['play', 'pause', 'ended', 'loadeddata'].forEach(evt => {
          document.addEventListener(evt, check, true);
        });
        check();
      } catch(e) {}
      return true;
    })();`
    runWebviewJS(mediaMonitor, tabId)
  } catch (e) {}

  // 手机模式 viewport 注入
  try {
    if (settings && settings.mobileMode) {
      const vpScript = `(function(){try{if(!document.querySelector('meta[name="viewport"]')){var m=document.createElement('meta');m.name='viewport';m.content='width=device-width, initial-scale=1.0, maximum-scale=1.0';document.head.appendChild(m);}return true;}catch(e){return false;}})();`
      try { runWebviewJS(vpScript, tabId) } catch (e) {}
    }
  } catch (e) {}

  // 同步页面缩放比例
  try {
    if (w && typeof w.getZoomFactor === 'function') {
      w.getZoomFactor().then((f) => { try { if (String(tabId) === String(activeTabId.value)) siteZoom.value = f || 1 } catch (e) {} }).catch(() => {})
    } else {
      try { w.executeJavaScript && w.executeJavaScript('window.__glass_reader_zoom || 1').then((f) => { try { if (String(tabId) === String(activeTabId.value)) siteZoom.value = f || 1 } catch (e) {} }).catch(() => {}) } catch (e) {}
    }
  } catch (e) {}

  // 站点规则注入
  try {
    let combined = null
    try { combined = ruleProviders && typeof ruleProviders.getCombinedRulesForUrl === 'function' ? ruleProviders.getCombinedRulesForUrl(pageUrl || '') : null } catch (e) { combined = null }
    const siteRulesList = combined?.site || []
    const toolbarRulesList = combined?.toolbar || []
    const allowNewWindow = toolbarRulesList.some((r) => r.toolbarDisabled === false) || siteRulesList.some((r) => r.preventBlankTargets === false)
    if (!allowNewWindow) { try { forceDisableBlankTargetsFor(tabId) } catch (e) {} }
    try {
      for (const r of siteRulesList) {
        try {
          // 两种规则形态都要处理：
          //   1) 函数型（内置 scripts/*.js、带 apply）—— 由规则自己决定注入什么
          //   2) 数据型（用户规则 / 油猴导入）—— 只有 customCss / customJs 字段，
          //      必须在这里显式注入，否则规则永远不生效
          if (typeof r.apply === 'function') {
            try {
              const maybe = r.apply({
                runWebviewCss: (idSuffix, css) => runWebviewCss(`site-custom-css-${r.id}${idSuffix ? `-${idSuffix}` : ''}`, css, tabId),
                runWebviewJS: (js) => runWebviewJS(js, tabId), webview: w, settings, activeTab: tabObj, rule: r
              })
              if (maybe && typeof maybe.then === 'function') maybe.catch(() => {})
            } catch (e) {}
          } else {
            // 数据型规则：直接注入其 CSS / JS 字段
            const ruleKey = r.id != null ? r.id : `idx-${siteRulesList.indexOf(r)}`
            const cssText = typeof r.customCss === 'string' ? r.customCss.trim() : ''
            const jsText = typeof r.customJs === 'string' ? r.customJs.trim() : ''
            if (cssText) {
              try {
                runWebviewCss(`site-custom-css-${ruleKey}`, r.customCss, tabId)
              } catch (e) {}
            }
            if (jsText) {
              try {
                runWebviewJS(r.customJs, tabId)
              } catch (e) {}
            }
            if (cssText || jsText) {
              try {
                console.log('[rules] injected data rule', {
                  tabId, name: r.name || '', pattern: r.pattern,
                  cssLen: (r.customCss || '').length, jsLen: (r.customJs || '').length,
                })
              } catch (e) {}
            }
          }
        } catch (e) {}
      }
    } catch (e) {}
  } catch (e) {}
}

// ─── Watchers ───
// pageTransparentMode 与 fullWindowTransparent 都会让网页变透明
// （见 useWebviewSync 里 `enabled = pageTransparentMode || fullWindowTransparent`），
// 所以两者都必须监听。曾经只监听前者，导致点「软件背景透明」时
// 已经打开的 webview 不会重新注入透明样式——用户看到的就是"点了没反应"。
watch(() => settings.pageTransparentMode, () => scheduleSyncReaderEffects())
watch(() => settings.fullWindowTransparent, () => scheduleSyncReaderEffects())
watch(() => settings.noImageMode, () => scheduleSyncReaderEffects())
watch(() => settings.autoScrollEnabled, () => scheduleSyncReaderEffects())
watch(() => settings.autoScrollSpeed, () => scheduleSyncReaderEffects())
watch(() => settings.readerTextColor, () => { syncWebviewTextColor() })
watch(() => settings.forceReaderTextColor, () => { syncWebviewTextColor() })
watch(() => settings.showScrollbars, () => syncWebviewScrollbars())
// 主题或「网页也变深」开关变化时，重新注入/移除深色 CSS
watch(() => settings.darkenWebPages, () => scheduleSyncReaderEffects())
watch(() => settings.themeMode, () => scheduleSyncReaderEffects())
// 跟随系统时，系统深浅色切换也要同步到已打开的 webview
watch(isDark, () => scheduleSyncReaderEffects())
watch(() => settings.readerFontScale, () => { syncWebviewFontSize() })
watch(() => settings.forceReaderFont, () => { syncWebviewFontSize() })

watch(() => activeTabId.value, async (newId) => {
  try {
    const clearPaused = `(() => { try { if (window.__glassReaderAutoScrollPaused) window.__glassReaderAutoScrollPaused = false; } catch(e) {}; return true; })();`
    runWebviewJS(clearPaused, newId)
  } catch (e) {}
  webviewReady.value = !!webviewReadyMap[String(newId)]
  await nextTick()
  syncReaderEffects(newId)
  try { updateEffectiveToolbar() } catch (e) {}
})

watch(() => settings.mobileMode, (v) => {
  try {
    userAgent.value = v ? 'Mozilla/5.0 (Linux; Android 10; Mobile; rv:109.0) Gecko/109.0 Firefox/109.0' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
    for (const tid in webviewRefs) {
      try {
        const w = webviewRefs[tid]; if (!w) continue
        try { if (typeof w.setAttribute === 'function') w.setAttribute('useragent', userAgent.value) } catch (e) {}
        try { if (typeof w.reload === 'function') w.reload(); else if (typeof w.loadURL === 'function') w.loadURL(w.getURL ? w.getURL() : w.src) } catch (e) {}
      } catch (e) {}
    }
  } catch (e) {}
})

watch(() => [settings.toolbarVisible, settings.toolbarPinned, settings.toolbarDisabled, settings.toolbarDocked], () => { try { updateEffectiveToolbar() } catch (e) {} })
watch(() => settings.pauseOnBlurHide, (v) => { try { if (v) attachPauseListeners(); else detachPauseListeners() } catch (e) {} })
// 「允许后台播音频」改动后立即重新评估当前暂停状态：
// 若正处在暂停中，先恢复上一轮（按旧策略留下的标记），再按新策略重新暂停，
// 避免新旧标记错位导致音频被误暂停或视频不被恢复。
watch(() => settings.keepAudioPlayingInBackground, () => {
  try { reevaluatePauseState() } catch (e) {}
})

// ─── 生命周期 ───
defineExpose({ settings, siteZoom, patchSetting, webviewBack, webviewForward, webviewReload, zoomIn, zoomOut, resetZoom, toggleToolbarPinned, disableToolbar, effectiveToolbar })

onBeforeUnmount(() => {
  try { detachPauseListeners() } catch (e) {}
  try { if (_removeContextMenuListener) { _removeContextMenuListener(); _removeContextMenuListener = null } } catch (e) {}
  try { if (_forwardKeyHandler) { window.removeEventListener('keydown', _forwardKeyHandler, true); window.removeEventListener('keyup', _forwardKeyHandler, true); _forwardKeyHandler = null } } catch (e) {}
})

// ─── webview 内右键菜单 ───
// 菜单分两层：主菜单以「摸鱼操作 + 导航」为主，其余常用项收进「更多操作」子菜单。
const ctxMenu = ref({ visible: false, x: 0, y: 0 })
let _removeContextMenuListener = null

/**
 * 把 guest 页面内的坐标换算成宿主窗口坐标。
 * 主进程传来的 x/y 相对于 webview 内容区，需要叠加 webview 元素的位置，
 * 还要考虑页面缩放（zoomFactor）——缩放后 DOM 坐标与实际像素不一致。
 */
function toWindowCoords(tabId, gx, gy) {
  try {
    const w = getWebview(tabId)
    if (!w || typeof w.getBoundingClientRect !== 'function') return { x: gx, y: gy }
    const r = w.getBoundingClientRect()
    return { x: Math.round(r.left + gx), y: Math.round(r.top + gy) }
  } catch (e) {
    return { x: gx, y: gy }
  }
}

function closeCtxMenu() {
  ctxMenu.value.visible = false
}

/** 当前站点是否已在推荐站点里 */
const currentHostInRecommended = computed(() => {
  try {
    const host = currentHost.value
    if (!host) return false
    return (recommendedSites?.value || []).some((s) => {
      try { return new URL(s.url).hostname.replace(/^www\./i, '') === host } catch (e) { return false }
    })
  } catch (e) { return false }
})

// 背景透明三档状态（与 TopBar 的 transparencyLevel 同义，顺序为「软件优先」）
const transparencyLevel = computed(() => {
  try {
    if (settings.fullWindowTransparent) return 2
    if (settings.shellOnlyTransparent) return 1
    return 0
  } catch (e) { return 0 }
})
const transparencyLabel = computed(() => {
  const lv = transparencyLevel.value
  return lv === 2 ? '软件+网页' : lv === 1 ? '软件透明' : '关闭'
})

const contextMenuItems = computed(() => {
  const tab = activeTab.value
  const canNav = !!(tab && tab.kind === 'page')

  return [    // ── 背景透明（三档，与顶栏按钮同一套语义）──
    {
      key: 'bgTransparent', label: '背景透明',
      hint: transparencyLabel.value,
      children: [
        {
          key: 'bg0', label: '关闭',
          hint: transparencyLevel.value === 0 ? '当前' : '',
          action: () => {
            patchSetting('shellOnlyTransparent', false)
            patchSetting('pageTransparentMode', false)
            patchSetting('fullWindowTransparent', false)
          },
        },
        {
          key: 'bg1', label: '软件透明',
          hint: transparencyLevel.value === 1 ? '当前' : '',
          action: () => {
            patchSetting('fullWindowTransparent', false)
            patchSetting('pageTransparentMode', false)
            patchSetting('shellOnlyTransparent', true)
          },
        },
        {
          key: 'bg2', label: '软件+网页都透明',
          hint: transparencyLevel.value === 2 ? '当前' : '',
          action: () => {
            patchSetting('shellOnlyTransparent', false)
            patchSetting('pageTransparentMode', true)
            patchSetting('fullWindowTransparent', true)
          },
        },
      ],
    },
    {
      key: 'transparency', label: '窗口透明度', hint: `${settings.transparency}%`,
      children: [
        { key: 't0', label: '不透明', hint: '0%', action: () => patchSetting('transparency', 0) },
        { key: 't20', label: '20%', action: () => patchSetting('transparency', 20) },
        { key: 't50', label: '50%', action: () => patchSetting('transparency', 50) },
        { key: 't85', label: '85%', action: () => patchSetting('transparency', 85) },
        { key: 't100', label: '全透明', hint: '100%', action: () => patchSetting('transparency', 100) },
      ],
    },
    {
      key: 'grayscale', label: '灰度模式',
      hint: settings.grayscaleMode ? '已开启' : '',
      action: () => toggleSetting('grayscaleMode'),
    },

    { type: 'separator' },

    // ── 站点相关 ──
    {
      key: 'addRecommended', label: '将本页加入推荐站点',
      disabled: !canNav || !tab?.url || currentHostInRecommended.value,
      action: () => {
        try {
          addRecommendedSite({ name: tab.title || currentHost.value, url: tab.url })
        } catch (e) { }
      },
    },

    { type: 'separator' },

    // ── 站点工具 ──
    // 注：后退/前进/刷新/无图/缩放 已移除——右下角工具栏已有等价入口，
    // 右键菜单只保留那边没有的「站点级」能力（排查规则、开 DevTools）。
    {
      key: 'rules', label: '查看本站生效的规则',
      disabled: !canNav,
      action: showEffectiveRules,
    },
    {
      key: 'devtools', label: '打开开发者工具',
      disabled: !canNav,
      action: () => {
        try {
          const w = getActiveWebview?.()
          if (w && typeof w.openDevTools === 'function') w.openDevTools()
        } catch (e) { }
      },
    },
  ]
})

/** 在状态栏列出当前 URL 命中的站点规则，便于确认规则/油猴脚本是否生效 */
function showEffectiveRules() {
  try {
    const url = activeTab.value?.url || ''
    const combined = ruleProviders?.getCombinedRulesForUrl
      ? ruleProviders.getCombinedRulesForUrl(url)
      : null
    const list = combined?.site || []
    if (!list.length) {
      statusMessageText('当前站点没有命中的规则')
      return
    }
    const names = list.map((r) => r.name || (Array.isArray(r.pattern) ? r.pattern.join('/') : r.pattern) || '未命名')
    statusMessageText(`生效规则（${list.length}）：${names.join('、')}`)
  } catch (e) {
    statusMessageText('读取规则失败')
  }
}

function statusMessageText(msg) {
  try { statusMessage.value = msg } catch (e) { }
}

function onContextMenuItem(item) {
  closeCtxMenu()
  try { item?.action?.() } catch (e) { }
}

function handleContextMenuFromMain(payload) {
  try {
    if (!payload) return
    const coords = toWindowCoords(activeTabId.value, Number(payload.x) || 0, Number(payload.y) || 0)
    ctxMenu.value = { visible: true, x: coords.x, y: coords.y }
  } catch (e) { }
}

onMounted(() => {
  try { updateEffectiveToolbar() } catch (e) {}
  try {
    if (window.desktop?.onContextMenu) {
      _removeContextMenuListener = window.desktop.onContextMenu(handleContextMenuFromMain)
    }
  } catch (e) {}
  try { if (settings.pauseOnBlurHide) attachPauseListeners() } catch (e) {}
  try {
    _forwardKeyHandler = (ev) => {
      try {
        const w = getActiveWebview()
        if (!w || typeof w.sendInputEvent !== 'function') return
        const buildModifiers = []
        if (ev.shiftKey) buildModifiers.push('shift'); if (ev.ctrlKey) buildModifiers.push('control')
        if (ev.altKey) buildModifiers.push('alt'); if (ev.metaKey) buildModifiers.push('meta')
        try { w.sendInputEvent({ type: ev.type === 'keydown' ? 'keyDown' : 'keyUp', keyCode: ev.key, modifiers: buildModifiers }) } catch (e) {}
      } catch (e) {}
    }
    window.addEventListener('keydown', _forwardKeyHandler, true)
    window.addEventListener('keyup', _forwardKeyHandler, true)
  } catch (e) {}
})
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

            <!-- 仪表盘作为覆盖层显示：改为 v-if 以在非活跃时从 DOM 中移除，避免遮挡问题 -->
            <console-page
              v-if="activeTab?.kind === 'dashboard'"
              class="overlay-panel" />

            <!-- 底部工具栏已移到父组件 App.vue 以避免覆盖页面底部内容 -->
          </div>
        </section>
      </div>
    </section>

    <!-- 站点规则快速编辑弹窗已移除（由自定义规则文件管理） -->

    <!-- webview 内右键菜单（由主进程转发触发） -->
    <ContextMenu
      :visible="ctxMenu.visible"
      :x="ctxMenu.x"
      :y="ctxMenu.y"
      :items="contextMenuItems"
      @select="onContextMenuItem"
      @close="closeCtxMenu" />
  </section>
</template>

<style scoped>
.page-frame {
  position: relative;
}
</style>
