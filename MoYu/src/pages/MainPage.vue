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
import {
  localReaderRef,
  stopLocalReaderAutoScroll, syncLocalReaderAutoScroll, applyLocalReaderStyles,
} from '../composables/mainpage/useLocalReaderAutoScroll.js'
import { attachPauseListeners, detachPauseListeners } from '../composables/mainpage/usePauseOnBlur.js'

const { settings, activeTab, activeTabId, tabs, addNewTab, selectTab, closeTab, patchSetting, updateTabMetadata, siteRules, ruleProviders, pushRecentVisit } = useDesktopApp()

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
  syncWebviewTextColor(); applyLocalReaderStyles()
}
function onFontScaleInput(e) {
  const v = Number(e.target.value || 100); patchSetting('readerFontScale', v)
  if (!settings.forceReaderFont) patchSetting('forceReaderFont', true)
  syncWebviewFontSize(); applyLocalReaderStyles()
}
function onAutoScrollSpeedInput(e) {
  const v = Number(e.target.value || 22); patchSetting('autoScrollSpeed', v)
  if (!settings.autoScrollEnabled) patchSetting('autoScrollEnabled', true)
  syncWebviewAutoScroll(); syncLocalReaderAutoScroll()
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
    syncLocalReaderAutoScroll()
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
          if (typeof r.apply === 'function') {
            try {
              const maybe = r.apply({
                runWebviewCss: (idSuffix, css) => runWebviewCss(`site-custom-css-${r.id}${idSuffix ? `-${idSuffix}` : ''}`, css, tabId),
                runWebviewJS: (js) => runWebviewJS(js, tabId), webview: w, settings, activeTab: tabObj, rule: r
              })
              if (maybe && typeof maybe.then === 'function') maybe.catch(() => {})
            } catch (e) {}
          }
        } catch (e) {}
      }
    } catch (e) {}
  } catch (e) {}
}

// ─── Watchers ───
watch(() => settings.pageTransparentMode, () => scheduleSyncReaderEffects())
watch(() => settings.noImageMode, () => scheduleSyncReaderEffects())
watch(() => settings.autoScrollEnabled, () => scheduleSyncReaderEffects())
watch(() => settings.autoScrollSpeed, () => scheduleSyncReaderEffects())
watch(() => settings.readerTextColor, () => { syncWebviewTextColor(); applyLocalReaderStyles() })
watch(() => settings.forceReaderTextColor, () => { syncWebviewTextColor(); applyLocalReaderStyles() })
watch(() => settings.showScrollbars, () => syncWebviewScrollbars())
watch(() => settings.readerFontScale, () => { syncWebviewFontSize(); applyLocalReaderStyles() })
watch(() => settings.forceReaderFont, () => { syncWebviewFontSize(); applyLocalReaderStyles() })

watch(() => activeTabId.value, async (newId) => {
  try { stopLocalReaderAutoScroll() } catch (e) {}
  try { syncLocalReaderAutoScroll() } catch (e) {}
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

// ─── 生命周期 ───
defineExpose({ settings, siteZoom, patchSetting, webviewBack, webviewForward, webviewReload, zoomIn, zoomOut, resetZoom, toggleToolbarPinned, disableToolbar, effectiveToolbar })

onBeforeUnmount(() => {
  stopLocalReaderAutoScroll()
  try { detachPauseListeners() } catch (e) {}
  try { if (_forwardKeyHandler) { window.removeEventListener('keydown', _forwardKeyHandler, true); window.removeEventListener('keyup', _forwardKeyHandler, true); _forwardKeyHandler = null } } catch (e) {}
})

onMounted(() => {
  try { updateEffectiveToolbar() } catch (e) {}
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

            <!-- 仪表盘与本地阅读视图作为覆盖层显示：改为 v-if 以在非活跃时从 DOM 中移除，避免遮挡问题 -->
            <console-page
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
</style>
