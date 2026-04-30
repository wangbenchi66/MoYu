/**
 * useDesktopApp.js
 * 应用全局状态与工具集合（组合式 API），在渲染进程中作为单一来源管理：
 * - 映射并维护 `settings`、`tabs`、`recentVisits` 等共享状态
 * - 提供对设置的 patch/同步（patchSetting / scheduleSettingsSync / syncSettingsNow）
 * - 提供 tab 管理、打开/关闭/导航、最近访问记录与推荐站点的操作接口
 * 暴露给组件：settings、tabs、patchSetting、createPageTab、initializeDesktopApp 等。
 */
import { computed, reactive, ref } from 'vue'
import * as ruleProviders from '../lib/ruleProviders'
import * as siteRules from '../lib/siteRules'
import defaultSettings from '../shared/defaultSettings.js'

const desktopApi = typeof window !== 'undefined' ? window.desktop : null

const recommendedSites = ref([
    //{ id: 1, name: '2', url: 'https://weread.qq.com', system: true },
    { id: 1, name: '微信读书', url: 'https://weread.qq.com', system: true },
    { id: 2, name: '番茄小说', url: 'https://fanqienovel.com', system: true },
    { id: 3, name: 'Bilibili', url: 'https://www.bilibili.com', system: true },
    { id: 4, name: '抖音', url: 'https://www.douyin.com', system: true },
    { id: 5, name: '小红书', url: 'https://www.xiaohongshu.com', system: true },
])

const RECOMMENDED_STORAGE_KEY = 'glass_reader_recommended_sites'

// 尝试从 localStorage 或者持久化设置中恢复推荐站点
try {
    const raw = localStorage.getItem(RECOMMENDED_STORAGE_KEY)
    if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length) {
            // 保证每项都有 id
            recommendedSites.value = parsed.map((it, idx) => ({ id: it.id ?? (Date.now() + idx), ...it }))
        }
    }
} catch (e) {
    // ignore
}
const localDocuments = ref([])

// 初始最近访问保持空，使用真实浏览行为填充
const recentVisits = ref([])
const RECENT_STORAGE_KEY = 'glass_reader_recent_visits'
// 最近访问记录的最大条数，以及分页加载的页大小
const RECENT_MAX = 200
// 最近访问列表初始显示条数，滚动加载更多，每次增加 RECENT_PAGE_SIZE 条
const RECENT_PAGE_SIZE = 10
const recentVisibleCount = ref(RECENT_PAGE_SIZE)

// 从 localStorage 恢复最近访问（限制为 RECENT_MAX）
try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY)
    if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length) {
            recentVisits.value = parsed.slice(0, RECENT_MAX)
        }
    }
} catch (e) {
    // ignore
}

/**
 * 将最近访问列表持久化到 localStorage
 */
function persistRecentVisits() {
    try {
        localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recentVisits.value.slice(0, RECENT_MAX)))
    } catch (e) {
        // ignore
    }
}

// 使用共享默认配置（由 electron/main.js 与渲染端共同维护）

const settings = reactive({ ...defaultSettings })
const urlInput = ref(defaultSettings.defaultUrl)
const searchKeyword = ref('')
const siteSearchKeyword = ref('')
const statusMessage = ref('Alt+Q 可快速隐藏或恢复窗口')
const activeTabId = ref(1)
const tabs = ref([
    {
        id: 0,
        title: '工作台',
        url: 'about:blank',
        subtitle: '新标签页',
        kind: 'dashboard',
    },
])

const leftToggleKeys = [
    // 窗口与标题/标签相关行为（把标题栏与标签的可见性放在一起）
    { key: 'showInTaskbar', label: '系统任务栏显示' },
    { key: 'closeToTray', label: '关闭时最小化到托盘' },
    { key: 'hoverHeaderMode', label: '悬停显示标题栏' },
    { key: 'showTabBar', label: '显示标签栏' },
    { key: 'autoHide', label: '鼠标移出隐藏窗口' },
    { key: 'pauseOnBlurHide', label: '隐藏时暂停媒体与滚动' },
    // 工具栏相关
    { key: 'toolbarVisible', label: '工具栏显示' },
    { key: 'toolbarDocked', label: '工具栏停靠底部' },
    { key: 'showScrollbars', label: '显示滚动条' },
]

const rightToggleKeys = [
    // 渲染 / 显示 类：置顶、透明和页面渲染相关
    { key: 'alwaysOnTop', label: '窗口始终置顶' },
    { key: 'fullWindowTransparent', label: '软件背景透明' },
    { key: 'pageTransparentMode', label: '网页背景透明' },
    // 阅读渲染相关（已从“阅读控制”移入此列）
    { key: 'forceReaderTextColor', label: '强制修改文字颜色' },
    { key: 'forceReaderFont', label: '强制阅读器字号' },
    { key: 'autoScrollEnabled', label: '自动滚动' },
    { key: 'grayscaleMode', label: '灰度模式' },
    { key: 'noImageMode', label: '无图模式' },
    { key: 'clickThroughMode', label: '鼠标穿透' },
    { key: 'mobileMode', label: '手机模式' },
    // 安全 / 行为
    { key: 'antiScreenshotMode', label: '防截屏模式' },
]

// controlToggleKeys 已移除为导出项，UI 不再直接引用该集合

const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeTabId.value) ?? tabs.value[0])

const filteredRecentVisits = computed(() => {
    const keyword = (searchKeyword.value || '').trim()
    if (!keyword) {
        // 非搜索状态下使用分页（初始 10 条，滚动加载更多）
        return recentVisits.value.slice(0, recentVisibleCount.value)
    }

    const k = keyword.toLowerCase()
    const matches = recentVisits.value.filter((item) => {
        try {
            return (String(item.title || '').toLowerCase().includes(k) || String(item.url || '').toLowerCase().includes(k))
        } catch (e) {
            return false
        }
    })

    // 搜索情况下返回匹配结果（限制到 RECENT_MAX）
    return matches.slice(0, RECENT_MAX)
})

const filteredRecommendedSites = computed(() => {
    const keyword = siteSearchKeyword.value.trim().toLowerCase()
    if (!keyword) {
        return recommendedSites.value
    }

    return recommendedSites.value.filter((site) => [site.name, site.url].join(' ').toLowerCase().includes(keyword))
})

const hasMoreRecentVisits = computed(() => {
    try {
        return recentVisits.value.length > recentVisibleCount.value && recentVisibleCount.value < RECENT_MAX
    } catch (e) {
        return false
    }
})

const dashboardMetrics = computed(() => ([
    { label: '推荐站点', value: String(recommendedSites.value.length).padStart(2, '0') },
    { label: '最近访问', value: String(recentVisits.value.length).padStart(2, '0') },
]))

const shellClasses = computed(() => ({
    'mode-grayscale': settings.grayscaleMode,
    'mode-mobile': settings.mobileMode,
    'mode-hover-header': settings.hoverHeaderMode,
    'mode-transparent-page': settings.pageTransparentMode,
    'mode-no-image': settings.noImageMode,
}))

const themeVars = computed(() => {
    // 计算不同区域（shell / surface / page）的透明度
    const shellAlpha = settings.transparentBackground
        ? Math.max(0.05, 0.95 - settings.transparency / 90)
        : Math.max(0.70, 0.98 - settings.transparency / 130)

    const surfaceAlpha = settings.transparentBackground
        ? Math.max(0.08, 0.92 - settings.transparency / 95)
        : Math.max(0.75, 0.97 - settings.transparency / 140)

    // 当启用“软件背景完全透明”时，页面与窗口都设为完全透明
    if (settings.fullWindowTransparent) {
        return {
            // 当软件背景完全透明时，header tint 也设为透明，避免 color-mix 产生可见色
            '--header-tint': 'transparent',
            '--shell-alpha': '0',
            '--surface-alpha': '0',
            '--page-alpha': '0',
            '--reader-text-color': settings.readerTextColor,
            '--reader-font-scale': `${settings.readerFontScale}%`,
        }
    }

    // 如果“软件背景透明”（fullWindowTransparent）和“网页背景透明”（pageTransparentMode）
    // 都未开启，则默认使用不透明颜色（alpha = 1），避免半透明效果
    if (!settings.fullWindowTransparent && !settings.pageTransparentMode) {
        return {
            '--header-tint': '#f5f5f7',
            '--shell-alpha': '1',
            '--surface-alpha': '1',
            '--page-alpha': '1',
            '--reader-text-color': settings.readerTextColor,
            '--reader-font-scale': `${settings.readerFontScale}%`,
            'background': '#fff',
        }
    }

    const pageAlpha = settings.pageTransparentMode
        ? Math.max(0.04, 0.94 - settings.transparency / 88)
        : Math.max(0.72, 0.96 - settings.transparency / 145);

    return {
        '--header-tint': '#f5f5f7',
        '--shell-alpha': String(shellAlpha),
        '--surface-alpha': String(surfaceAlpha),
        '--page-alpha': String(pageAlpha),
        '--reader-text-color': settings.readerTextColor,
        '--reader-font-scale': `${settings.readerFontScale}%`,
    }
})

let syncTimer = null
let removeSettingsListener = null
let initialized = false
// 当 fullWindowTransparent 启用时，我们可能会临时打开 pageTransparentMode


const immediateSyncKeys = new Set([
    'transparency',
    'showInTaskbar',
    'closeToTray',
    'autoHide',
    'showTabBar',
    'noImageMode',
    'transparentBackground',
    'antiScreenshotMode',
    'alwaysOnTop',
    'mobileMode',
    'hoverHeaderMode',
    'pageTransparentMode',
    'grayscaleMode',
    'clickThroughMode',
    'autoScrollEnabled',
    'autoScrollSpeed',
    'readerTextColor',
    'forceReaderTextColor',
    'forceReaderFont',
    'readerFontScale',
    'toolbarDocked',
    'toolbarPinned',
    'toolbarVisible',
    'toolbarDisabled',
    'showScrollbars',
    'fullWindowTransparent',
    // 全局快捷键需要立即同步并在主进程重新注册
    'bossKey',
    'decreaseTransparencyShortcut',
    'increaseTransparencyShortcut',
    'clickThroughShortcut',
    'autoToggleShortcut',
    'autoSpeedDownShortcut',
    'autoSpeedUpShortcut',
])

/**
 * 对用户输入的 URL 进行规范化处理，支持以下几种情况：
 * - 以 http:// 或 https:// 开头的完整 URL，直接使用
 * - 以其他协议开头的 URL（如 file://、ftp:// 等），直接使用
 * - 纯 IP 地址，自动加上 http:// 前缀
 * - 其他文本，视为搜索关键词，使用必应搜索
 * @param {*} rawUrl 
 * @returns 
 */
/**
 * 对用户输入的 URL 进行规范化处理（支持完整 URL、IP、域名与搜索关键词）
 * 参数: rawUrl - 原始输入字符串
 */
function normalizeUrl(rawUrl) {
    const trimmed = rawUrl.trim()
    if (!trimmed) {
        return 'about:blank'
    }

    if (trimmed === 'about:blank') {
        return trimmed
    }

    //return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    //如果不是http或https的链接或者网址就当做搜索关键词处理，默认使用必应搜索
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) {
        return trimmed
    }
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed)) {
        return `http://${trimmed}`
    }
    if (/^[\w-]+(\.[\w-]+)+/.test(trimmed)) {
        return `https://${trimmed}`
    }
    // 其他情况当做搜索关键词处理，默认使用必应搜索
    return `https://www.bing.com/search?q=${encodeURIComponent(trimmed)}`

}

/**
 * 从 URL 中提取主机名作为标题，失败时返回默认标题
 * 参数: url - 页面 URL
 */
function getTitleFromUrl(url) {
    if (url === 'about:blank') {
        return '工作台'
    }

    try {
        return new URL(url).hostname.replace(/^www\./, '')
    } catch {
        return '未命名页面'
    }
}

/** getSiteTag removed — recommendedSites now only store `name` and `url`. */

/**
 * 将内部 URL 转换为输入框展示形式（about:blank -> ''）
 * 参数: url - 原始 URL
 */
function displayInputUrlForUI(url) {
    return url === 'about:blank' ? '' : url
}

// 生成不会与现有 tabs 冲突的唯一 id
/**
 * 生成不会与现有 tabs 冲突的唯一 ID
 */
function generateUniqueTabId() {
    let id
    let attempts = 0
    do {
        id = Date.now() + Math.floor(Math.random() * 1000)
        attempts++
        if (attempts > 50) {
            // 兜底，扩大随机范围以避免极端重复
            id = Date.now() + Math.floor(Math.random() * 1000000)
        }
    } while (tabs.value.some((t) => t && t.id === id))
    return id
}

/**
 * 立即向主进程同步当前设置（若支持）
 */
function syncSettingsNow() {
    if (!desktopApi?.updateSettings) {
        return Promise.resolve()
    }

    return desktopApi.updateSettings({ ...settings }).then((nextSettings) => {
        Object.assign(settings, nextSettings)
    }).catch(() => {
        statusMessage.value = '设置同步失败，请重试'
    })
}

/**
 * 安排延迟同步设置（防抖）
 */
function scheduleSettingsSync() {
    window.clearTimeout(syncTimer)
    syncTimer = window.setTimeout(syncSettingsNow, 120)
}

/**
 * 更新本地设置并根据键触发必要的副作用与同步
 * 参数: key - 设置键名；value - 要写入的值
 */
function patchSetting(key, value) {
    if (key === 'transparency') {
        const nextVal = Math.max(0, Math.min(100, Number(value) || 0))
        settings[key] = nextVal
        console.log('[renderer] patchSetting transparency ->', nextVal, { hasSetTransparency: !!desktopApi?.setTransparency })
        if (desktopApi?.log) {
            try {
                desktopApi.log(`[renderer] patchSetting transparency -> ${nextVal}`)
            } catch (e) { }
        }
        // 优先调用主进程的快捷接口立即应用透明度，保证滑块有即时视觉反馈
        if (desktopApi?.setTransparency) {
            desktopApi.setTransparency(nextVal).then((nextSettings) => {
                if (nextSettings && typeof nextSettings === 'object') {
                    // 不用主进程返回值覆盖 transparency，避免异步回调把本地状态回退
                    const { transparency: _t, ...rest } = nextSettings
                    Object.assign(settings, rest)
                }
                if (desktopApi?.updateSettings) {
                    desktopApi.updateSettings({ ...settings }).then((ns) => {
                        if (ns && typeof ns === 'object') {
                            const { transparency: _t2, ...rest2 } = ns
                            Object.assign(settings, rest2)
                        }
                    }).catch(() => {
                        statusMessage.value = '设置同步失败，请重试'
                    })
                }
            }).catch(() => {
                statusMessage.value = '设置同步失败，请重试'
            })
            return
        }
    } else if (key === 'autoScrollSpeed') {
        settings[key] = Math.max(5, Math.min(80, Number(value) || 5))
    } else if (key === 'readerFontScale') {
        settings[key] = Math.max(80, Math.min(160, Number(value) || 100))
    } else {
        settings[key] = value
    }

    if (key === 'clickThroughMode' && settings[key]) {
        statusMessage.value = `已开启鼠标穿透，可按 ${settings.clickThroughShortcut} 关闭`
    }

    if (key === 'alwaysOnTop') {
        statusMessage.value = settings[key] ? '窗口已置顶' : '窗口已取消置顶'
    }

    if (key === 'closeToTray') {
        statusMessage.value = settings[key] ? '关闭主窗口时将最小化到托盘' : '关闭主窗口时将直接退出应用'
    }

    if (key === 'showInTaskbar') {
        statusMessage.value = settings[key] ? '已显示任务栏图标' : '已隐藏任务栏图标'
    }

    if (key === 'autoHide') {
        statusMessage.value = settings[key] ? '鼠标移出后会自动隐藏，移回原区域自动恢复' : '已关闭自动隐藏'
    }

    if (key === 'hoverHeaderMode') {
        statusMessage.value = settings[key] ? '标题栏改为悬停显示' : '标题栏常驻显示'
    }

    if (key === 'autoScrollEnabled') {
        statusMessage.value = settings[key] ? '自动滚动已开启' : '自动滚动已关闭'
    }

    // 当用户切换网页背景透明开关时，同时同步“强制网页背景透明”设置以合并为一个按钮行为
    if (key === 'pageTransparentMode') {
        try {
            settings.forcePageTransparent = !!settings.pageTransparentMode
        } catch (e) { }
    }

    if (immediateSyncKeys.has(key)) {
        syncSettingsNow()
        return
    }

    scheduleSettingsSync()
}

/**
 * 切换布尔类型的设置（代理到 patchSetting）
 * 参数: key - 设置键名
 */
function toggleSetting(key) {
    patchSetting(key, !settings[key])
}

/**
 * 将访问记录添加到最近访问列表并持久化
 * 参数: entry - 记录对象（包含 title/url 等）
 */
function pushRecentVisit(entry) {
    // 将新访问放到最前面，允许重复地址重复记录，记录时间，保留最新 RECENT_MAX 条
    try {
        const now = new Date().toISOString()
        const rec = Object.assign({}, entry || {})
        if (!rec.time) rec.time = now
        recentVisits.value.unshift(rec)
        if (recentVisits.value.length > RECENT_MAX) {
            recentVisits.value = recentVisits.value.slice(0, RECENT_MAX)
        }
        persistRecentVisits()
    } catch (e) {
        // ignore
    }
}

/**
 * 增加最近访问的可见条数以支持滚动加载
 */
function loadMoreRecentVisits() {
    try {
        if (recentVisibleCount.value < RECENT_MAX) {
            recentVisibleCount.value = Math.min(RECENT_MAX, recentVisibleCount.value + RECENT_PAGE_SIZE)
        }
    } catch (e) { }
}

/**
 * 重置最近访问的可见数量到初始页大小
 */
function resetRecentVisible() {
    recentVisibleCount.value = RECENT_PAGE_SIZE
}

/**
 * 打开一个 tab（保证 id 唯一），并将其设为活动 tab
 * 参数: tab - tab 对象
 */
function openTab(tab) {
    // 确保插入的 tab.id 唯一，避免 v-for key 冲突导致 DOM 重用/错误行为
    const next = Object.assign({}, tab)
    if (next.id === undefined || next.id === null) {
        next.id = generateUniqueTabId()
    } else {
        // 若已存在相同 id，则重新分配并记录日志
        if (tabs.value.some((t) => t && t.id === next.id)) {
            try { console.warn('[tabs] 发现重复 tab.id，正在重新分配', next.id) } catch (e) { }
            next.id = generateUniqueTabId()
        }
    }

    tabs.value.push(next)
    activeTabId.value = next.id
}

/**
 * 创建一个页面 tab（处理工作台复用与最近访问记录）
 * 参数: url - 页面地址；options - 可选参数（title/subtitle/kind 等）
 */
function createPageTab(url, options = {}) {
    const normalizedUrl = normalizeUrl(url)
    const nextId = Date.now() + Math.floor(Math.random() * 1000)
    const title = options.title ?? getTitleFromUrl(normalizedUrl)

    // 当是工作台页（about:blank / dashboard）时，复用已存在的工作台 tab 而不是重复创建
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

/**
 * 创建本地文本类型的 tab 并加入最近访问
 * 参数: fileName, content, documentId
 */
function createLocalTextTab(fileName, content, documentId) {
    const nextId = Date.now() + Math.floor(Math.random() * 1000)

    openTab({
        id: nextId,
        title: fileName.replace(/\.[^.]+$/, ''),
        url: `local://${fileName}`,
        subtitle: fileName,
        kind: 'local-text',
        content,
        fileName,
        documentId,
    })

    pushRecentVisit({ title: fileName, url: `local://${fileName}`, type: 'file' })
    statusMessage.value = `已打开本地文档 ${fileName}`
}

/**
 * 使用输入框的 URL 打开页面
 */
function handleOpenUrl() {
    createPageTab(urlInput.value)
}

/**
 * 新建一个工作台页面（about:blank）
 */
function addNewTab() {
    // 使用 createPageTab 来复用已存在的工作台（避免重复创建）
    createPageTab('about:blank', { kind: 'dashboard' })
    urlInput.value = ''
}

/**
 * 选择指定 tab 并同步 URL 到输入框
 * 参数: tabId - 要激活的 tab ID
 */
function selectTab(tabId) {
    activeTabId.value = tabId
    const currentTab = tabs.value.find((tab) => tab.id === tabId)
    if (currentTab) {
        urlInput.value = displayInputUrlForUI(currentTab.url)
    }
}

// 更新指定 tab 的元数据（标题 / 副标题 / url）
/**
 * 更新指定 tab 的元数据（标题 / 副标题 / url）
 * 参数: tabId, meta
 */
function updateTabMetadata(tabId, meta = {}) {
    const idx = tabs.value.findIndex((t) => t.id === tabId)
    if (idx === -1) return
    const tab = tabs.value[idx]
    if (meta.title !== undefined && meta.title !== null) tab.title = String(meta.title)
    if (meta.subtitle !== undefined && meta.subtitle !== null) tab.subtitle = String(meta.subtitle)
    if (meta.url !== undefined && meta.url !== null) tab.url = String(meta.url)
    if (meta.pinned !== undefined) tab.pinned = !!meta.pinned
}

/**
 * 关闭指定的 tab，回收 objectUrl 并调整活动 tab
 * 参数: tabId - 要关闭的 tab ID
 */
function closeTab(tabId) {
    const closingTab = tabs.value.find((tab) => tab.id === tabId)
    if (closingTab?.objectUrl) {
        URL.revokeObjectURL(closingTab.objectUrl)
    }

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

/**
 * 关闭指定 tab 左侧的所有 tab
 * 参数: tabId - 参考的 tab ID
 */
function closeTabsToLeft(tabId) {
    try {
        const idx = tabs.value.findIndex((t) => t.id === tabId)
        if (idx <= 0) return
        const toClose = tabs.value.slice(0, idx)
        // 回收 objectUrl
        for (const t of toClose) {
            try { if (t && t.objectUrl) URL.revokeObjectURL(t.objectUrl) } catch (e) { }
        }
        tabs.value = tabs.value.slice(idx)
        if (!tabs.value.some((t) => t.id === activeTabId.value)) {
            activeTabId.value = tabs.value[0]?.id ?? 0
        }
    } catch (e) { }
}

/**
 * 关闭指定 tab 右侧的所有 tab
 * 参数: tabId - 参考的 tab ID
 */
function closeTabsToRight(tabId) {
    try {
        const idx = tabs.value.findIndex((t) => t.id === tabId)
        if (idx === -1) return
        if (idx >= tabs.value.length - 1) return
        const toClose = tabs.value.slice(idx + 1)
        for (const t of toClose) {
            try { if (t && t.objectUrl) URL.revokeObjectURL(t.objectUrl) } catch (e) { }
        }
        tabs.value = tabs.value.slice(0, idx + 1)
        if (!tabs.value.some((t) => t.id === activeTabId.value)) {
            activeTabId.value = tabs.value[0]?.id ?? 0
        }
    } catch (e) { }
}

/**
 * 关闭所有 tab 并恢复默认工作台状态
 */
function closeAllTabs() {
    try {
        // 回收所有对象 URL
        for (const t of tabs.value) {
            try { if (t && t.objectUrl) URL.revokeObjectURL(t.objectUrl) } catch (e) { }
        }
        tabs.value = [{ id: 0, title: '工作台', url: 'about:blank', subtitle: '新标签页', kind: 'dashboard' }]
        activeTabId.value = 0
        urlInput.value = ''
    } catch (e) { }
}



/**
 * 打开推荐站点
 * 参数: site - 推荐站点对象
 */
function useRecommendedSite(site) {
    urlInput.value = site.url
    createPageTab(site.url, { title: site.name, subtitle: getTitleFromUrl(site.url) })
}

/**
 * 打开最近访问项（支持文件与站点）
 * 参数: item - 最近访问记录对象
 */
function openRecentVisit(item) {
    if ((item.type ?? 'site') === 'file') {
        const documentItem = localDocuments.value.find((doc) => `local://${doc.fileName}` === item.url || doc.url === item.url)
        if (documentItem) {
            openLocalDocument(documentItem)
            return
        }
    }
    urlInput.value = displayInputUrlForUI(item.url)
    createPageTab(item.url, { title: item.title })
}

/**
 * 处理本地文件上传并创建相应的 tab
 * 参数: fileList - 文件列表
 */
async function uploadLocalFiles(fileList) {
    const files = Array.from(fileList ?? [])
    if (!files.length) {
        return
    }

    for (const file of files) {
        const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
        const documentId = Date.now() + Math.floor(Math.random() * 1000)

        if (['txt', 'md', 'markdown', 'log', 'json'].includes(extension) || file.type.startsWith('text/')) {
            const content = await file.text()
            localDocuments.value.unshift({
                id: documentId,
                fileName: file.name,
                type: 'local-text',
                content,
                size: file.size,
            })
            createLocalTextTab(file.name, content, documentId)
            continue
        }

        const objectUrl = URL.createObjectURL(file)
        localDocuments.value.unshift({
            id: documentId,
            fileName: file.name,
            type: 'local-file',
            url: objectUrl,
            objectUrl,
            mimeType: file.type,
            size: file.size,
        })
        createPageTab(objectUrl, {
            title: file.name.replace(/\.[^.]+$/, ''),
            subtitle: file.name,
            kind: 'page',
            objectUrl,
            fileName: file.name,
            mimeType: file.type,
            documentId,
        })
    }

    localDocuments.value = localDocuments.value.slice(0, 12)
}

/**
 * 打开本地文档（文本或其他），并创建 tab
 * 参数: documentItem - 本地文档对象
 */
function openLocalDocument(documentItem) {
    if (documentItem.type === 'local-text') {
        createLocalTextTab(documentItem.fileName, documentItem.content, documentItem.id)
        return
    }

    createPageTab(documentItem.url, {
        title: documentItem.fileName.replace(/\.[^.]+$/, ''),
        subtitle: documentItem.fileName,
        objectUrl: documentItem.objectUrl,
        fileName: documentItem.fileName,
        mimeType: documentItem.mimeType,
        documentId: documentItem.id,
    })
}

/**
 * 删除本地文档并回收对象 URL，同时移除相关 tab
 * 参数: documentId - 文档 ID
 */
function removeLocalDocument(documentId) {
    const documentItem = localDocuments.value.find((item) => item.id === documentId)
    if (documentItem?.objectUrl) {
        URL.revokeObjectURL(documentItem.objectUrl)
    }
    // removeLocalDocument 已移除为导出函数（UI 未直接调用），保留对对象 URL 的回收逻辑
    localDocuments.value = localDocuments.value.filter((item) => item.id !== documentId)
    tabs.value = tabs.value.filter((tab) => tab.documentId !== documentId)

    if (!tabs.value.length) {
        tabs.value = [{ id: 0, title: '工作台', url: 'about:blank', subtitle: '新标签页', kind: 'dashboard' }]
        activeTabId.value = 0
    } else if (!tabs.value.some((tab) => tab.id === activeTabId.value)) {
        activeTabId.value = tabs.value[0].id
    }
}

/**
 * 将推荐站点持久化到 localStorage 并尝试同步到主进程
 */
function persistRecommendedSites() {
    try {
        localStorage.setItem(RECOMMENDED_STORAGE_KEY, JSON.stringify(recommendedSites.value))
    } catch (e) {
        // ignore
    }

    if (desktopApi?.updateSettings) {
        try {
            desktopApi.updateSettings({ recommendedSites: recommendedSites.value }).catch(() => { })
        } catch (e) { }
    }
}

/**
 * 添加一个推荐站点（去重并持久化）
 * 参数: site - 包含 url/name 的对象
 */
function addRecommendedSite(site) {
    const normalizedUrl = normalizeUrl((site.url || '').trim())
    const name = (site.name || '').trim() || getTitleFromUrl(normalizedUrl)

    // 重复检测（按 URL 或 名称）
    const exists = recommendedSites.value.some((s) => {
        try {
            return s.url === normalizedUrl || (s.name && s.name.toLowerCase() === name.toLowerCase())
        } catch {
            return false
        }
    })

    if (exists) {
        statusMessage.value = '推荐站点已存在'
        return null
    }

    const next = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        name,
        url: normalizedUrl,
        system: false,
    }

    // 将自定义站点插入到 system 站点之后，保持系统推荐靠前
    const sysCount = recommendedSites.value.filter((s) => s.system).length
    recommendedSites.value.splice(sysCount, 0, next)
    persistRecommendedSites()
    statusMessage.value = `已添加推荐站点：${name}`
    return next
}

/**
 * 编辑指定的推荐站点（禁止修改 system 站点）
 * 参数: id - 站点 ID；site - 新站点数据
 */
function editRecommendedSite(id, site) {
    const idx = recommendedSites.value.findIndex((s) => s.id === id)
    if (idx === -1) return

    // 不允许编辑标记为 system 的内置站点
    if (recommendedSites.value[idx].system) {
        statusMessage.value = '系统站点不可编辑'
        return
    }

    const existing = recommendedSites.value[idx]
    const normalizedUrl = normalizeUrl(site.url ?? existing.url)
    const name = site.name ?? existing.name

    recommendedSites.value[idx] = {
        ...existing,
        name,
        url: normalizedUrl,
    }

    persistRecommendedSites()
}

/**
 * 移除指定的推荐站点（禁止删除 system 站点）
 * 参数: id - 站点 ID
 */
function removeRecommendedSite(id) {
    const idx = recommendedSites.value.findIndex((s) => s.id === id)
    if (idx === -1) return
    // 不允许删除标记为 system 的内置站点
    if (recommendedSites.value[idx].system) {
        return
    }
    recommendedSites.value.splice(idx, 1)
    persistRecommendedSites()
}

/**
 * 请求最小化窗口（通过 desktop API）
 */
function handleMinimize() {
    if (!desktopApi?.minimizeWindow) {
        statusMessage.value = '当前环境不支持最小化窗口'
        return
    }

    desktopApi.minimizeWindow().catch(() => {
        statusMessage.value = '最小化失败，请重试'
    })
}

/**
 * 请求最大化或还原窗口（通过 desktop API）
 */
function handleMaximize() {
    if (!desktopApi?.maximizeWindow) {
        statusMessage.value = '当前环境不支持最大化窗口'
        return
    }

    desktopApi.maximizeWindow().catch(() => {
        statusMessage.value = '最大化失败，请重试'
    })
}

/**
 * 请求关闭窗口（优先使用 closeWindow 保留主进程 close 事件语义）
 */
function handleClose() {
    if (!desktopApi?.quitWindow && !desktopApi?.closeWindow) {
        statusMessage.value = '当前环境不支持关闭窗口'
        return
    }

    // 优先使用 closeWindow，这样主进程的 `close` 事件能正确触发并遵循
    // `closeToTray` 等设置；仅当 closeWindow 不可用时才使用 quitWindow
    const closeAction = desktopApi.closeWindow ?? desktopApi.quitWindow
    closeAction().catch(() => {
        statusMessage.value = '关闭窗口失败，请重试'
    })
}

/**
 * 请求打开独立的设置窗口（若支持）
 */
function openSettingsWindow() {
    // openSettingsWindow 保留实现但不再作为导出（设置通过内置 modal 控制）
    if (!desktopApi?.openSettingsWindow) {
        statusMessage.value = '当前环境不支持打开设置'
        return
    }

    desktopApi.openSettingsWindow().catch(() => {
        statusMessage.value = '打开设置失败，请重试'
    })
}

/**
 * 初始化渲染端的桌面应用环境，加载设置与规则提供器
 */
function initializeDesktopApp() {
    if (initialized) {
        return
    }

    initialized = true

    if (desktopApi?.getSettings) {
        desktopApi.getSettings().then((nextSettings) => {
            Object.assign(settings, nextSettings)
            urlInput.value = displayInputUrlForUI(settings.defaultUrl ?? '')
            if (Array.isArray(nextSettings.recommendedSites) && nextSettings.recommendedSites.length) {
                recommendedSites.value = nextSettings.recommendedSites.map((it, idx) => ({ id: it.id ?? (Date.now() + idx), ...it }))
            }
        })
    }

    // 加载站点级规则（若存在），以及各类规则提供器，供 webview 注入或个性化配置使用
    try {
        siteRules.loadRules()
    } catch (e) { }
    try {
        ruleProviders.toolbar.loadRules()
        ruleProviders.settings.loadRules()
    } catch (e) { }

    if (desktopApi?.onSettingsChanged) {
        removeSettingsListener = desktopApi.onSettingsChanged((nextSettings) => {
            Object.assign(settings, nextSettings)
        })
    }
}

/**
 * 清理渲染端的桌面应用资源与监听器
 */
function disposeDesktopApp() {
    window.clearTimeout(syncTimer)
    removeSettingsListener?.()
    removeSettingsListener = null
    initialized = false
}

export function useDesktopApp() {
    return {
        filteredRecommendedSites,
        recommendedSites,
        settings,
        urlInput,
        searchKeyword,
        siteSearchKeyword,
        statusMessage,
        activeTabId,
        tabs,
        leftToggleKeys,
        rightToggleKeys,
        activeTab,
        filteredRecentVisits,
        recentVisibleCount,
        loadMoreRecentVisits,
        resetRecentVisible,
        hasMoreRecentVisits,
        dashboardMetrics,
        shellClasses,
        themeVars,
        patchSetting,
        toggleSetting,
        handleOpenUrl,
        addNewTab,
        selectTab,
        closeTab,
        useRecommendedSite,
        openRecentVisit,
        pushRecentVisit,
        uploadLocalFiles,
        openLocalDocument,
        addRecommendedSite,
        editRecommendedSite,
        removeRecommendedSite,
        handleMinimize,
        handleMaximize,
        handleClose,
        closeTabsToLeft,
        closeTabsToRight,
        closeAllTabs,
        initializeDesktopApp,
        disposeDesktopApp,
        updateTabMetadata,
        createPageTab,
        siteRules: {
            getRules: siteRules.getRules,
            getRulesForUrl: siteRules.getRulesForUrl,
            addRule: siteRules.addRule,
            editRule: siteRules.editRule,
            removeRule: siteRules.removeRule,
            persist: siteRules.persistRules,
        },
        ruleProviders: {
            getCombinedRulesForUrl: ruleProviders.getCombinedRulesForUrl,
            toolbar: ruleProviders.toolbar,
            settings: ruleProviders.settings,
            site: ruleProviders.site,
        },
    }
}
