/**
 * useAppState.js — 共享状态与基础工具函数
 * 所有子模块从这里导入共享的 ref / reactive 对象，避免重复创建。
 */
import { computed, reactive, ref } from 'vue'
import defaultSettings from '../shared/defaultSettings.js'

const desktopApi = typeof window !== 'undefined' ? window.desktop : null

// ─── 共享状态 ───
const settings = reactive({ ...defaultSettings })
const urlInput = ref(defaultSettings.defaultUrl)
const searchKeyword = ref('')
const siteSearchKeyword = ref('')
const statusMessage = ref('Alt+Q 可快速隐藏或恢复窗口')
const activeTabId = ref(1)
const tabs = ref([
    { id: 0, title: '工作台', url: 'about:blank', subtitle: '新标签页', kind: 'dashboard' },
])
const recentVisits = ref([])
const updateInfo = ref(null)

const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeTabId.value) ?? tabs.value[0])

// ─── 快捷键配置 ───
const leftToggleKeys = [
    { key: 'showInTaskbar', label: '系统任务栏显示' },
    { key: 'closeToTray', label: '关闭时最小化到托盘' },
    { key: 'hoverHeaderMode', label: '悬停显示标题栏' },
    { key: 'showTabBar', label: '显示标签栏' },
    { key: 'autoHide', label: '鼠标移出隐藏窗口' },
    { key: 'pauseOnBlurHide', label: '隐藏时暂停媒体与滚动' },
    { key: 'toolbarVisible', label: '工具栏显示' },
    { key: 'toolbarDocked', label: '工具栏停靠底部' },
    { key: 'showScrollbars', label: '显示滚动条' },
]

const rightToggleKeys = [
    { key: 'alwaysOnTop', label: '窗口始终置顶' },
    { key: 'fullWindowTransparent', label: '软件背景透明' },
    { key: 'pageTransparentMode', label: '网页背景透明' },
    { key: 'forceReaderTextColor', label: '强制修改文字颜色' },
    { key: 'forceReaderFont', label: '强制阅读器字号' },
    { key: 'autoScrollEnabled', label: '自动滚动' },
    { key: 'grayscaleMode', label: '灰度模式' },
    { key: 'noImageMode', label: '无图模式' },
    { key: 'clickThroughMode', label: '鼠标穿透' },
    { key: 'mobileMode', label: '手机模式' },
    { key: 'antiScreenshotMode', label: '防截屏模式' },
]

// ─── 工具函数 ───
function normalizeUrl(rawUrl) {
    const trimmed = rawUrl.trim()
    if (!trimmed) return 'about:blank'
    if (trimmed === 'about:blank') return trimmed
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) return trimmed
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed)) return `http://${trimmed}`
    if (/^[\w-]+(\.[\w-]+)+/.test(trimmed)) return `https://${trimmed}`
    return `https://www.bing.com/search?q=${encodeURIComponent(trimmed)}`
}

function getTitleFromUrl(url) {
    if (url === 'about:blank') return '工作台'
    try { return new URL(url).hostname.replace(/^www\./, '') }
    catch { return '未命名页面' }
}

function displayInputUrlForUI(url) {
    return url === 'about:blank' ? '' : url
}

let _tabIdCounter = Date.now()
function generateUniqueTabId() {
    return ++_tabIdCounter
}

export {
    desktopApi,
    settings, urlInput, searchKeyword, siteSearchKeyword, statusMessage,
    activeTabId, tabs, activeTab, recentVisits, updateInfo,
    leftToggleKeys, rightToggleKeys,
    normalizeUrl, getTitleFromUrl, displayInputUrlForUI, generateUniqueTabId,
}
