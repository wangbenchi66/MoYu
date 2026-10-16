/**
 * useTabManager.js — 标签页管理（打开/关闭/选择/导航）
 */
import {
    settings, urlInput, statusMessage, tabs, activeTabId,
    normalizeUrl, getTitleFromUrl, displayInputUrlForUI, generateUniqueTabId,
} from './useAppState.js'
import { pushRecentVisit } from './useRecentVisits.js'
import { scheduleSettingsSync } from './useSettings.js'

function openTab(tab) {
    const next = Object.assign({}, tab)
    if (next.id === undefined || next.id === null) {
        next.id = generateUniqueTabId()
    } else if (tabs.value.some((t) => t && t.id === next.id)) {
        try { console.warn('[tabs] 发现重复 tab.id，正在重新分配', next.id) } catch (e) { }
        next.id = generateUniqueTabId()
    }
    tabs.value.push(next)
    activeTabId.value = next.id
    persistSession()
}

function createPageTab(url, options = {}) {
    const normalizedUrl = normalizeUrl(url)
    const nextId = generateUniqueTabId()
    const title = options.title ?? getTitleFromUrl(normalizedUrl)

    const isDashboard = (options.kind === 'dashboard') || (normalizedUrl === 'about:blank')
    if (isDashboard) {
        const existing = tabs.value.find((t) => (t && (t.kind === 'dashboard' || t.url === 'about:blank')))
        if (existing) {
            activeTabId.value = existing.id
            urlInput.value = ''
            statusMessage.value = '已切换到工作台'
            return
        }
    }

    openTab({
        id: nextId,
        title: title === '工作台' ? '新' : title,
        url: normalizedUrl,
        subtitle: options.subtitle ?? normalizedUrl,
        kind: options.kind ?? (normalizedUrl === 'about:blank' ? 'dashboard' : 'page'),
        documentId: options.documentId,
        objectUrl: options.objectUrl,
        fileName: options.fileName,
        mimeType: options.mimeType,
    })

    settings.defaultUrl = normalizedUrl
    scheduleSettingsSync()

    if (normalizedUrl !== 'about:blank') {
        pushRecentVisit({ title, url: normalizedUrl, type: 'site' })
    }
    statusMessage.value = `已打开 ${title}`
}

function handleOpenUrl() { createPageTab(urlInput.value) }

function addNewTab() {
    createPageTab('about:blank', { kind: 'dashboard' })
    urlInput.value = ''
}

function selectTab(tabId) {
    activeTabId.value = tabId
    const currentTab = tabs.value.find((tab) => tab.id === tabId)
    if (currentTab) urlInput.value = displayInputUrlForUI(currentTab.url)
    persistSession()
}

function updateTabMetadata(tabId, meta = {}) {
    const idx = tabs.value.findIndex((t) => t.id === tabId)
    if (idx === -1) return
    const tab = tabs.value[idx]
    if (meta.title !== undefined && meta.title !== null) tab.title = String(meta.title)
    if (meta.subtitle !== undefined && meta.subtitle !== null) tab.subtitle = String(meta.subtitle)
    if (meta.url !== undefined && meta.url !== null) tab.url = String(meta.url)
    if (meta.pinned !== undefined) tab.pinned = !!meta.pinned
    persistSession()
}

function closeTab(tabId) {
    const closingTab = tabs.value.find((tab) => tab.id === tabId)
    if (closingTab?.objectUrl) URL.revokeObjectURL(closingTab.objectUrl)

    if (tabs.value.length === 1) {
        tabs.value = [{ id: 0, title: '工作台', url: 'about:blank', subtitle: '新标签页', kind: 'dashboard' }]
        activeTabId.value = 0
        urlInput.value = ''
        persistSession()
        return
    }
    tabs.value = tabs.value.filter((tab) => tab.id !== tabId)
    if (activeTabId.value === tabId) {
        activeTabId.value = tabs.value[0].id
        urlInput.value = displayInputUrlForUI(tabs.value[0].url)
    }
    persistSession()
}

function closeTabsToLeft(tabId) {
    try {
        const idx = tabs.value.findIndex((t) => t.id === tabId)
        if (idx <= 0) return
        const toClose = tabs.value.slice(0, idx)
        for (const t of toClose) { try { if (t?.objectUrl) URL.revokeObjectURL(t.objectUrl) } catch (e) { } }
        tabs.value = tabs.value.slice(idx)
        if (!tabs.value.some((t) => t.id === activeTabId.value))
            activeTabId.value = tabs.value[0]?.id ?? 0
        persistSession()
    } catch (e) { }
}

function closeTabsToRight(tabId) {
    try {
        const idx = tabs.value.findIndex((t) => t.id === tabId)
        if (idx === -1 || idx >= tabs.value.length - 1) return
        const toClose = tabs.value.slice(idx + 1)
        for (const t of toClose) { try { if (t?.objectUrl) URL.revokeObjectURL(t.objectUrl) } catch (e) { } }
        tabs.value = tabs.value.slice(0, idx + 1)
        if (!tabs.value.some((t) => t.id === activeTabId.value))
            activeTabId.value = tabs.value[0]?.id ?? 0
        persistSession()
    } catch (e) { }
}

function closeAllTabs() {
    try {
        for (const t of tabs.value) { try { if (t?.objectUrl) URL.revokeObjectURL(t.objectUrl) } catch (e) { } }
        tabs.value = [{ id: 0, title: '工作台', url: 'about:blank', subtitle: '新标签页', kind: 'dashboard' }]
        activeTabId.value = 0
        urlInput.value = ''
        persistSession()
    } catch (e) { }
}

// ─── 标签会话（重启恢复）───

const SESSION_KEY = 'moyu_tabs_session'
const SESSION_MAX_TABS = 20

/** 只持久化可重建的字段：blob URL / objectUrl / 本地文本内容都是一次性的，跳过 */
function serializeSession() {
    try {
        const pageTabs = tabs.value
            .filter((t) => t && t.kind === 'page' && t.url && !String(t.url).startsWith('blob:') && !String(t.url).startsWith('local:'))
            .slice(0, SESSION_MAX_TABS)
            .map((t) => ({ url: t.url, title: t.title || '' }))
        const active = tabs.value.find((t) => t.id === activeTabId.value)
        const activeUrl = (active && active.kind === 'page' && !String(active.url).startsWith('blob:')) ? active.url : ''
        return { savedAt: new Date().toISOString(), tabs: pageTabs, activeUrl }
    } catch (e) {
        return { savedAt: new Date().toISOString(), tabs: [], activeUrl: '' }
    }
}

let _sessionTimer = null

/** 防抖保存会话，避免频繁写 localStorage */
function persistSession() {
    try {
        if (!settings.restoreTabsOnStartup) return
        if (_sessionTimer) clearTimeout(_sessionTimer)
        _sessionTimer = setTimeout(() => {
            _sessionTimer = null
            try {
                const data = serializeSession()
                if (!data.tabs.length) {
                    // 没有可恢复的标签页时清掉旧记录，避免下次恢复出已关闭的页面
                    localStorage.removeItem(SESSION_KEY)
                    return
                }
                localStorage.setItem(SESSION_KEY, JSON.stringify(data))
            } catch (e) { }
        }, 800)
    } catch (e) { }
}

/** 立即落盘（退出前调用） */
function flushSession() {
    try {
        if (_sessionTimer) { clearTimeout(_sessionTimer); _sessionTimer = null }
        if (!settings.restoreTabsOnStartup) return
        const data = serializeSession()
        if (!data.tabs.length) { localStorage.removeItem(SESSION_KEY); return }
        localStorage.setItem(SESSION_KEY, JSON.stringify(data))
    } catch (e) { }
}

/** 丢弃已保存的会话（"清除所有痕迹"时调用） */
function clearSavedSession() {
    try {
        if (_sessionTimer) { clearTimeout(_sessionTimer); _sessionTimer = null }
        localStorage.removeItem(SESSION_KEY)
    } catch (e) { }
}

/**
 * 启动时恢复上次会话。
 * 返回: { restored: number } 实际恢复的标签数
 */
function restoreSession() {
    try {
        if (!settings.restoreTabsOnStartup) return { restored: 0 }
        const raw = localStorage.getItem(SESSION_KEY)
        if (!raw) return { restored: 0 }
        const data = JSON.parse(raw)
        const list = Array.isArray(data?.tabs) ? data.tabs : []
        if (!list.length) return { restored: 0 }

        // 清理掉初始的空工作台（恢复后由第一个页面取代；用户仍可点主页图标回工作台）
        const dash = tabs.value.find((t) => t && t.kind === 'dashboard')
        if (dash) tabs.value = tabs.value.filter((t) => t !== dash)

        let restored = 0
        for (const item of list) {
            try {
                const url = String(item?.url || '')
                if (!url || url === 'about:blank') continue
                const id = generateUniqueTabId()
                tabs.value.push({
                    id,
                    title: item.title || getTitleFromUrl(url),
                    url,
                    subtitle: url,
                    kind: 'page',
                })
                restored++
            } catch (e) { }
        }

        if (!restored) {
            // 全部无效：补回工作台，避免出现空标签栏
            tabs.value = [{ id: 0, title: '工作台', url: 'about:blank', subtitle: '新标签页', kind: 'dashboard' }]
            activeTabId.value = 0
            return { restored: 0 }
        }

        // 恢复激活标签
        const wantActive = String(data.activeUrl || '')
        const match = wantActive ? tabs.value.find((t) => t.url === wantActive) : null
        activeTabId.value = (match || tabs.value[0]).id
        urlInput.value = displayInputUrlForUI((match || tabs.value[0]).url)
        return { restored }
    } catch (e) {
        return { restored: 0 }
    }
}

export {
    openTab, createPageTab,
    handleOpenUrl, addNewTab, selectTab, updateTabMetadata,
    closeTab, closeTabsToLeft, closeTabsToRight, closeAllTabs,
    persistSession, flushSession, restoreSession, clearSavedSession,
    SESSION_KEY,
}
