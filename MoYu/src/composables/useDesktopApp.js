/**
 * useDesktopApp.js — 应用全局状态聚合层
 * 从子模块导入状态与方法，统一对外暴露，保持组件侧 API 不变。
 */
import { computed } from 'vue'
import * as ruleProviders from '../rules/providers'
import * as siteRules from '../rules'

// ─── 子模块 ───
import {
    settings, urlInput, searchKeyword, siteSearchKeyword, statusMessage,
    activeTabId, tabs, activeTab, localDocuments, recentVisits, updateInfo,
    leftToggleKeys, rightToggleKeys, desktopApi,
    displayInputUrlForUI,
} from './useAppState.js'

import { patchSetting, toggleSetting, clearSyncTimers } from './useSettings.js'

import {
    recentVisibleCount, RECENT_MAX,
    flushRecentVisits, clearRecentTimer,
    pushRecentVisit, loadMoreRecentVisits, resetRecentVisible,
} from './useRecentVisits.js'

import {
    createPageTab, handleOpenUrl, addNewTab, selectTab, updateTabMetadata,
    closeTab, closeTabsToLeft, closeTabsToRight, closeAllTabs,
} from './useTabManager.js'

import {
    recommendedSites, filteredRecommendedSites,
    useRecommendedSite, addRecommendedSite, editRecommendedSite, removeRecommendedSite,
} from './useRecommendedSites.js'

import { uploadLocalFiles, openLocalDocument } from './useLocalFiles.js'

// ─── 计算属性 ───
const filteredRecentVisits = computed(() => {
    const keyword = (searchKeyword.value || '').trim()
    if (!keyword) return recentVisits.value.slice(0, recentVisibleCount.value)
    const k = keyword.toLowerCase()
    return recentVisits.value.filter((item) => {
        try { return String(item.title || '').toLowerCase().includes(k) || String(item.url || '').toLowerCase().includes(k) }
        catch { return false }
    }).slice(0, RECENT_MAX)
})

const hasMoreRecentVisits = computed(() => {
    try { return recentVisits.value.length > recentVisibleCount.value && recentVisibleCount.value < RECENT_MAX }
    catch { return false }
})

const shellClasses = computed(() => ({
    'mode-grayscale': settings.grayscaleMode,
    'mode-mobile': settings.mobileMode,
    'mode-hover-header': settings.hoverHeaderMode,
    'mode-transparent-page': settings.pageTransparentMode,
    'mode-no-image': settings.noImageMode,
}))

const themeVars = computed(() => {
    const shellAlpha = settings.transparentBackground
        ? Math.max(0.05, 0.95 - settings.transparency / 90)
        : Math.max(0.70, 0.98 - settings.transparency / 130)
    const surfaceAlpha = settings.transparentBackground
        ? Math.max(0.08, 0.92 - settings.transparency / 95)
        : Math.max(0.75, 0.97 - settings.transparency / 140)

    if (settings.fullWindowTransparent) {
        return {
            '--header-tint': 'transparent', '--shell-alpha': '0', '--surface-alpha': '0',
            '--page-alpha': '0', '--reader-text-color': settings.readerTextColor,
            '--reader-font-scale': `${settings.readerFontScale}%`,
        }
    }
    if (!settings.fullWindowTransparent && !settings.pageTransparentMode) {
        return {
            '--header-tint': '#f5f5f7', '--shell-alpha': '1', '--surface-alpha': '1',
            '--page-alpha': '1', '--reader-text-color': settings.readerTextColor,
            '--reader-font-scale': `${settings.readerFontScale}%`, 'background': '#fff',
        }
    }
    const pageAlpha = settings.pageTransparentMode
        ? Math.max(0.04, 0.94 - settings.transparency / 88)
        : Math.max(0.72, 0.96 - settings.transparency / 145)
    return {
        '--header-tint': '#f5f5f7', '--shell-alpha': String(shellAlpha),
        '--surface-alpha': String(surfaceAlpha), '--page-alpha': String(pageAlpha),
        '--reader-text-color': settings.readerTextColor,
        '--reader-font-scale': `${settings.readerFontScale}%`,
    }
})

// ─── 最近访问打开 ───
function openRecentVisit(item) {
    if ((item.type ?? 'site') === 'file') {
        const documentItem = localDocuments.value.find((doc) => `local://${doc.fileName}` === item.url || doc.url === item.url)
        if (documentItem) { openLocalDocument(documentItem); return }
    }
    urlInput.value = displayInputUrlForUI(item.url)
    createPageTab(item.url, { title: item.title })
}

// ─── 窗口控制 ───
function handleMinimize() {
    if (!desktopApi?.minimizeWindow) { statusMessage.value = '当前环境不支持最小化窗口'; return }
    desktopApi.minimizeWindow().catch(() => { statusMessage.value = '最小化失败，请重试' })
}

function handleMaximize() {
    if (!desktopApi?.maximizeWindow) { statusMessage.value = '当前环境不支持最大化窗口'; return }
    desktopApi.maximizeWindow().catch(() => { statusMessage.value = '最大化失败，请重试' })
}

function handleClose() {
    if (!desktopApi?.quitWindow && !desktopApi?.closeWindow) { statusMessage.value = '当前环境不支持关闭窗口'; return }
    const closeAction = desktopApi.closeWindow ?? desktopApi.quitWindow
    closeAction().catch(() => { statusMessage.value = '关闭窗口失败，请重试' })
}

// ─── 生命周期 ───
let removeSettingsListener = null
let initialized = false

function initializeDesktopApp() {
    if (initialized) return
    initialized = true
    if (desktopApi?.getSettings) {
        desktopApi.getSettings().then((nextSettings) => {
            Object.assign(settings, nextSettings)
            urlInput.value = displayInputUrlForUI(settings.defaultUrl ?? '')
        })
    }
    try { siteRules.loadRules() } catch (e) { }
    try { ruleProviders.toolbar.loadRules(); ruleProviders.settings.loadRules() } catch (e) { }
    if (desktopApi?.onSettingsChanged) {
        removeSettingsListener = desktopApi.onSettingsChanged((nextSettings) => {
            Object.assign(settings, nextSettings)
        })
    }
}

function disposeDesktopApp() {
    flushRecentVisits()
    clearRecentTimer()
    clearSyncTimers()
    removeSettingsListener?.()
    removeSettingsListener = null
    initialized = false
}

// ─── 聚合导出 ───
export function useDesktopApp() {
    return {
        // 状态
        settings, urlInput, searchKeyword, siteSearchKeyword, statusMessage,
        activeTabId, tabs, activeTab, updateInfo,
        leftToggleKeys, rightToggleKeys,
        // 计算属性
        filteredRecentVisits, hasMoreRecentVisits, filteredRecommendedSites,
        shellClasses, themeVars, recentVisibleCount,
        recentVisits, recommendedSites,
        // 设置
        patchSetting, toggleSetting,
        // 标签
        handleOpenUrl, addNewTab, selectTab, closeTab, updateTabMetadata,
        createPageTab, closeTabsToLeft, closeTabsToRight, closeAllTabs,
        // 最近访问
        pushRecentVisit, loadMoreRecentVisits, resetRecentVisible, openRecentVisit,
        // 推荐站点
        useRecommendedSite, addRecommendedSite, editRecommendedSite, removeRecommendedSite,
        // 本地文件
        uploadLocalFiles, openLocalDocument,
        // 窗口
        handleMinimize, handleMaximize, handleClose,
        // 生命周期
        initializeDesktopApp, disposeDesktopApp,
        // 规则
        siteRules: {
            getRules: siteRules.getRules, getRulesForUrl: siteRules.getRulesForUrl,
            addRule: siteRules.addRule, editRule: siteRules.editRule,
            removeRule: siteRules.removeRule, persist: siteRules.persistRules,
        },
        ruleProviders: {
            getCombinedRulesForUrl: ruleProviders.getCombinedRulesForUrl,
            toolbar: ruleProviders.toolbar, settings: ruleProviders.settings, site: ruleProviders.site,
        },
    }
}
