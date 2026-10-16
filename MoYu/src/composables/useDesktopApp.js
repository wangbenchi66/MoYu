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
    activeTabId, tabs, activeTab, recentVisits, updateInfo,
    leftToggleKeys, rightToggleKeys, desktopApi,
    displayInputUrlForUI,
} from './useAppState.js'

import { patchSetting, toggleSetting, clearSyncTimers } from './useSettings.js'

import {
    recentVisibleCount, RECENT_MAX,
    flushRecentVisits, clearRecentTimer,
    pushRecentVisit, loadMoreRecentVisits, resetRecentVisible,
    pruneExpiredVisits,
} from './useRecentVisits.js'

import {
    createPageTab, handleOpenUrl, addNewTab, selectTab, updateTabMetadata,
    closeTab, closeTabsToLeft, closeTabsToRight, closeAllTabs,
    flushSession, restoreSession, clearSavedSession,
} from './useTabManager.js'

import {
    recommendedSites, filteredRecommendedSites,
    useRecommendedSite, addRecommendedSite, editRecommendedSite, removeRecommendedSite,
} from './useRecommendedSites.js'

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
    // 仅软件外壳透明：shell/surface 全透明，但网页区域保持原样（--page-alpha: 1）。
    // 注意必须放在 fullWindowTransparent 之后判断——后者优先级更高。
    if (settings.shellOnlyTransparent) {
        return {
            '--header-tint': '#f5f5f7', '--shell-alpha': '0', '--surface-alpha': '0',
            '--page-alpha': '1', '--reader-text-color': settings.readerTextColor,
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

// ─── 隐私：痕迹清理 ───

/** 会被「清除所有痕迹」清空的 localStorage 键（只含本应用自己的键） */
const TRACE_KEYS = [
    'glass_reader_recent_visits',      // 最近访问 / 历史记录
    'glass_reader_recommended_sites',  // 推荐站点（用户自定义）
    'moyu_tabs_session',               // 标签会话（重启恢复用）
]

/**
 * 立即清除所有本地痕迹。
 * 范围：历史记录 + 最近访问 + 自定义推荐站点。
 * 返回: { cleared: string[] } 实际清理的项目名
 */
function clearAllTraces(options = {}) {
    const cleared = []
    try {
        recentVisits.value = []
        recentVisibleCount.value = 10
        flushRecentVisits()
        cleared.push('历史记录')
    } catch (e) { }

    try {
        localStorage.removeItem('glass_reader_recommended_sites')
        cleared.push('自定义推荐站点')
    } catch (e) { }

    try {
        clearSavedSession()
        cleared.push('标签会话')
    } catch (e) { }

    return { cleared }
}

/**
 * 按「保留最近 N 天」清理过期的历史记录。
 * 返回: 被移除的条数
 */
function cleanExpiredTraces() {
    return pruneExpiredVisits()
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
            // 启动时按保留策略清理一次过期痕迹
            if (settings.autoCleanOnStartup) {
                try { cleanExpiredTraces() } catch (e) { }
            }
            // 恢复上次标签会话。必须放在 settings 加载之后 ——
            // restoreTabsOnStartup 在拿到主进程设置前仍是默认值，提前恢复会判断错误。
            try { restoreSession() } catch (e) { }
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
    // 退出前把当前标签会话落盘，下次启动恢复
    try { flushSession() } catch (e) { }
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
        flushSession,
        // 最近访问
        pushRecentVisit, loadMoreRecentVisits, resetRecentVisible, openRecentVisit,
        // 隐私：痕迹清理
        clearAllTraces, cleanExpiredTraces, TRACE_KEYS,
        // 推荐站点
        useRecommendedSite, addRecommendedSite, editRecommendedSite, removeRecommendedSite,
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
