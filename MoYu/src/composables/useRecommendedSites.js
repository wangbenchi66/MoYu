/**
 * useRecommendedSites.js — 推荐站点数据与 CRUD
 */
import { ref, computed } from 'vue'
import { urlInput, statusMessage, siteSearchKeyword, normalizeUrl, getTitleFromUrl } from './useAppState.js'
import { createPageTab } from './useTabManager.js'

const DEFAULT_RECOMMENDED_SITES = [
    { name: '微信读书', url: 'https://weread.qq.com', system: true },
    { name: '番茄小说', url: 'https://fanqienovel.com', system: true },
    { name: 'Bilibili', url: 'https://www.bilibili.com', system: true },
    { name: '抖音', url: 'https://www.douyin.com', system: true },
    { name: '小红书', url: 'https://www.xiaohongshu.com', system: true },
    { name: '知乎', url: 'https://www.zhihu.com', system: true },
    { name: '今日热榜', url: 'https://tophub.today/', system: true },
]

function buildDefaultRecommendedSites() {
    return DEFAULT_RECOMMENDED_SITES.map((site, idx) => ({
        id: idx + 1, name: site.name, url: site.url, system: true,
    }))
}

const recommendedSites = ref(buildDefaultRecommendedSites())
const RECOMMENDED_STORAGE_KEY = 'glass_reader_recommended_sites'

// 从 localStorage 恢复用户自定义站点
try {
    const raw = localStorage.getItem(RECOMMENDED_STORAGE_KEY)
    if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length) {
            const defaults = buildDefaultRecommendedSites()
            const existsInDefaults = (site) => defaults.some((d) => {
                try { return d.url === site.url || (d.name && site.name && d.name.toLowerCase() === site.name.toLowerCase()) }
                catch { return false }
            })
            const userSites = parsed
                .filter((it) => it && !it.system && it.url)
                .map((it, idx) => ({ id: it.id ?? (Date.now() + idx), name: it.name || '', url: it.url, system: false }))
                .filter((it) => !existsInDefaults(it))
            recommendedSites.value = defaults.concat(userSites)
        }
    }
} catch (e) { }

const filteredRecommendedSites = computed(() => {
    const keyword = siteSearchKeyword.value.trim().toLowerCase()
    if (!keyword) return recommendedSites.value
    return recommendedSites.value.filter((site) => [site.name, site.url].join(' ').toLowerCase().includes(keyword))
})

function persistRecommendedSites() {
    try {
        const customSites = recommendedSites.value
            .filter((site) => !site.system)
            .map((site) => ({ id: site.id, name: site.name, url: site.url, system: false }))
        localStorage.setItem(RECOMMENDED_STORAGE_KEY, JSON.stringify(customSites))
    } catch (e) { }
}

function useRecommendedSite(site) {
    urlInput.value = site.url
    createPageTab(site.url, { title: site.name, subtitle: getTitleFromUrl(site.url) })
}

function addRecommendedSite(site) {
    const normalizedUrl = normalizeUrl((site.url || '').trim())
    const name = (site.name || '').trim() || getTitleFromUrl(normalizedUrl)
    const exists = recommendedSites.value.some((s) => {
        try { return s.url === normalizedUrl || (s.name && s.name.toLowerCase() === name.toLowerCase()) }
        catch { return false }
    })
    if (exists) { statusMessage.value = '推荐站点已存在'; return null }
    const next = { id: Date.now() + Math.floor(Math.random() * 1000), name, url: normalizedUrl, system: false }
    const sysCount = recommendedSites.value.filter((s) => s.system).length
    recommendedSites.value.splice(sysCount, 0, next)
    persistRecommendedSites()
    statusMessage.value = `已添加推荐站点：${name}`
    return next
}

function editRecommendedSite(id, site) {
    const idx = recommendedSites.value.findIndex((s) => s.id === id)
    if (idx === -1) return
    if (recommendedSites.value[idx].system) { statusMessage.value = '系统站点不可编辑'; return }
    const existing = recommendedSites.value[idx]
    const normalizedUrl = normalizeUrl(site.url ?? existing.url)
    const name = site.name ?? existing.name
    recommendedSites.value[idx] = { ...existing, name, url: normalizedUrl }
    persistRecommendedSites()
}

function removeRecommendedSite(id) {
    const idx = recommendedSites.value.findIndex((s) => s.id === id)
    if (idx === -1) return
    if (recommendedSites.value[idx].system) return
    recommendedSites.value.splice(idx, 1)
    persistRecommendedSites()
}

export {
    recommendedSites, filteredRecommendedSites,
    useRecommendedSite, addRecommendedSite, editRecommendedSite, removeRecommendedSite,
}
