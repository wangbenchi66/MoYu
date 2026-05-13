/**
 * useRecentVisits.js — 最近访问记录管理
 */
import { ref } from 'vue'
import { recentVisits } from './useAppState.js'

const RECENT_STORAGE_KEY = 'glass_reader_recent_visits'
const RECENT_MAX = 200
const RECENT_PAGE_SIZE = 10
const recentVisibleCount = ref(RECENT_PAGE_SIZE)

// 从 localStorage 恢复
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
}
