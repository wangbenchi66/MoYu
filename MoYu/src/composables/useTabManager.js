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
        pushRecentVisit({ title, url: normalizedUrl, type: options.kind === 'local-file' ? 'file' : 'site' })
    }
    statusMessage.value = `已打开 ${title}`
}

function createLocalTextTab(fileName, content, documentId) {
    const nextId = generateUniqueTabId()
    openTab({
        id: nextId,
        title: fileName.replace(/\.[^.]+$/, ''),
        url: `local://${fileName}`,
        subtitle: fileName,
        kind: 'local-text',
        content, fileName, documentId,
    })
    pushRecentVisit({ title: fileName, url: `local://${fileName}`, type: 'file' })
    statusMessage.value = `已打开本地文档 ${fileName}`
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
}

function updateTabMetadata(tabId, meta = {}) {
    const idx = tabs.value.findIndex((t) => t.id === tabId)
    if (idx === -1) return
    const tab = tabs.value[idx]
    if (meta.title !== undefined && meta.title !== null) tab.title = String(meta.title)
    if (meta.subtitle !== undefined && meta.subtitle !== null) tab.subtitle = String(meta.subtitle)
    if (meta.url !== undefined && meta.url !== null) tab.url = String(meta.url)
    if (meta.pinned !== undefined) tab.pinned = !!meta.pinned
}

function closeTab(tabId) {
    const closingTab = tabs.value.find((tab) => tab.id === tabId)
    if (closingTab?.objectUrl) URL.revokeObjectURL(closingTab.objectUrl)

    if (tabs.value.length === 1) {
        tabs.value = [{ id: 0, title: '工作台', url: 'about:blank', subtitle: '新标签页', kind: 'dashboard' }]
        activeTabId.value = 0
        urlInput.value = ''
        return
    }
    tabs.value = tabs.value.filter((tab) => tab.id !== tabId)
    if (activeTabId.value === tabId) {
        activeTabId.value = tabs.value[0].id
        urlInput.value = displayInputUrlForUI(tabs.value[0].url)
    }
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
    } catch (e) { }
}

function closeAllTabs() {
    try {
        for (const t of tabs.value) { try { if (t?.objectUrl) URL.revokeObjectURL(t.objectUrl) } catch (e) { } }
        tabs.value = [{ id: 0, title: '工作台', url: 'about:blank', subtitle: '新标签页', kind: 'dashboard' }]
        activeTabId.value = 0
        urlInput.value = ''
    } catch (e) { }
}

export {
    openTab, createPageTab, createLocalTextTab,
    handleOpenUrl, addNewTab, selectTab, updateTabMetadata,
    closeTab, closeTabsToLeft, closeTabsToRight, closeAllTabs,
}
