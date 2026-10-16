/**
 * useRecentVisits.js — 最近访问记录管理
 */
import { ref } from 'vue'
import { recentVisits, settings } from './useAppState.js'

const RECENT_STORAGE_KEY = 'glass_reader_recent_visits'
const RECENT_MAX = 200
const RECENT_PAGE_SIZE = 10
const recentVisibleCount = ref(RECENT_PAGE_SIZE)

/**
 * 按「保留最近 N 天」过滤掉过期条目。
 * historyRetentionDays 为 0 时表示永久保留，直接原样返回。
 * 条目缺少/无法解析 time 字段时保守保留（不因数据异常误删用户记录）。
 * 参数: list - 最近访问数组；days - 可选，覆盖设置值
 * 返回: 过滤后的新数组
 */
function pruneByRetention(list, days) {
    try {
        const d = (days === undefined || days === null) ? Number(settings.historyRetentionDays || 0) : Number(days)
        if (!d || d <= 0) return list
        const cutoff = Date.now() - d * 24 * 60 * 60 * 1000
        return list.filter((item) => {
            const t = Date.parse(item && item.time)
            if (Number.isNaN(t)) return true
            return t >= cutoff
        })
    } catch (e) {
        return list
    }
}

/**
 * 立即按保留策略清理内存与 localStorage 中的过期记录。
 * 返回: 被移除的条数
 */
function pruneExpiredVisits() {
    try {
        const before = recentVisits.value.length
        const next = pruneByRetention(recentVisits.value)
        if (next.length === before) return 0
        recentVisits.value = next
        flushRecentVisits()
        return before - next.length
    } catch (e) {
        return 0
    }
}

// 从 localStorage 恢复（恢复时即按保留策略过滤一次，避免过期数据回流）
try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY)
    if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length) {
            recentVisits.value = parsed.slice(0, RECENT_MAX)
        }
    }
} catch (e) { }

let _persistRecentTimer = null

function persistRecentVisits() {
    if (_persistRecentTimer) clearTimeout(_persistRecentTimer)
    _persistRecentTimer = setTimeout(() => {
        _persistRecentTimer = null
        try {
            localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recentVisits.value.slice(0, RECENT_MAX)))
        } catch (e) { }
    }, 2000)
}

function flushRecentVisits() {
    if (_persistRecentTimer) {
        clearTimeout(_persistRecentTimer)
        _persistRecentTimer = null
    }
    try {
        localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recentVisits.value.slice(0, RECENT_MAX)))
    } catch (e) { }
}

function pushRecentVisit(entry) {
    try {
        const now = new Date().toISOString()
        const rec = Object.assign({}, entry || {})
        if (!rec.time) rec.time = now
        const url = rec.url || ''
        if (url) {
            recentVisits.value = recentVisits.value.filter((v) => v.url !== url)
        }
        recentVisits.value.unshift(rec)
        // 先按保留策略淘汰过期项，再按硬上限截断
        recentVisits.value = pruneByRetention(recentVisits.value)
        if (recentVisits.value.length > RECENT_MAX) {
            recentVisits.value = recentVisits.value.slice(0, RECENT_MAX)
        }
        persistRecentVisits()
    } catch (e) { }
}

function loadMoreRecentVisits() {
    try {
        if (recentVisibleCount.value < RECENT_MAX) {
            recentVisibleCount.value = Math.min(RECENT_MAX, recentVisibleCount.value + RECENT_PAGE_SIZE)
        }
    } catch (e) { }
}

function resetRecentVisible() {
    recentVisibleCount.value = RECENT_PAGE_SIZE
}

function clearRecentTimer() {
    if (_persistRecentTimer) {
        clearTimeout(_persistRecentTimer)
        _persistRecentTimer = null
    }
}

export {
    recentVisibleCount, RECENT_MAX, RECENT_PAGE_SIZE,
    persistRecentVisits, flushRecentVisits, clearRecentTimer,
    pushRecentVisit, loadMoreRecentVisits, resetRecentVisible,
    pruneByRetention, pruneExpiredVisits,
}
