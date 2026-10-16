/**
 * useTheme.js — 主题管理（浅色 / 深色 / 跟随系统）
 *
 * 三态由设置项 themeMode 决定：
 *   'light'  → 强制浅色
 *   'dark'   → 强制深色
 *   'system' → 跟随系统（默认）
 *
 * 实际生效的深浅色写入 <html data-theme="light|dark">，
 * style.css 里的 :root[data-theme='dark'] 负责变量切换。
 *
 * 数据来源有两个，互为兜底：
 *   1. 主进程的 theme:get / theme:changed（权威，含 nativeTheme 解析结果）
 *   2. 渲染进程的 matchMedia('(prefers-color-scheme: dark)')（浏览器环境降级）
 */
import { ref, computed, watch } from 'vue'

// 当前设置的模式（'light' | 'dark' | 'system'）
const themeMode = ref('system')
// 实际生效的深浅色（'light' | 'dark'）
const effectiveTheme = ref('light')
// 是否处于"纯浏览器"环境（无 desktop API）
const isWebOnly = typeof window !== 'undefined' && !window.desktop

let _removeThemeListener = null
const _mediaQuery = (() => {
  try {
    return typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null
  } catch (e) { return null }
})()

function prefersDark() {
  try { return !!(_mediaQuery && _mediaQuery.matches) } catch (e) { return false }
}

/** 根据模式解析出实际主题 */
function resolveEffective(mode) {
  if (mode === 'dark') return 'dark'
  if (mode === 'light') return 'light'
  return prefersDark() ? 'dark' : 'light'
}

/** 写入 <html data-theme> 与 .dark 类，分别供自有 CSS 与 Element Plus 使用 */
function applyToDom(theme) {
  try {
    const root = document.documentElement
    if (!root) return
    // 自有变量体系用 data-theme 属性
    root.setAttribute('data-theme', theme)
    // Element Plus 的暗色主题选择器是 html.dark（见 theme-chalk/dark/css-vars.css）
    root.classList.toggle('dark', theme === 'dark')
    // 让浏览器原生控件（滚动条、表单）也跟随
    root.style.colorScheme = theme
  } catch (e) { }
}

/** 设置模式并立即生效 */
function setThemeMode(mode) {
  const next = ['light', 'dark', 'system'].includes(mode) ? mode : 'system'
  themeMode.value = next
  effectiveTheme.value = resolveEffective(next)
  applyToDom(effectiveTheme.value)
}

/** 从主进程同步一次（首次加载 / 重连时用） */
async function syncThemeFromMain() {
  try {
    if (window.desktop?.getTheme) {
      const r = await window.desktop.getTheme()
      if (r && typeof r === 'object') {
        themeMode.value = ['light', 'dark', 'system'].includes(r.mode) ? r.mode : 'system'
        // 主进程的 effective 是权威值（nativeTheme 已解析 system）
        effectiveTheme.value = r.effective === 'dark' ? 'dark' : resolveEffective(themeMode.value)
        applyToDom(effectiveTheme.value)
        return
      }
    }
  } catch (e) { }
  // 降级：纯浏览器环境
  effectiveTheme.value = resolveEffective(themeMode.value)
  applyToDom(effectiveTheme.value)
}

/** 订阅主题变化（含系统深浅色切换） */
function attachThemeListener() {
  if (_removeThemeListener) return
  try {
    if (window.desktop?.onThemeChanged) {
      _removeThemeListener = window.desktop.onThemeChanged((payload) => {
        try {
          if (!payload) return
          if (['light', 'dark', 'system'].includes(payload.mode)) themeMode.value = payload.mode
          if (payload.effective) effectiveTheme.value = payload.effective === 'dark' ? 'dark' : 'light'
          applyToDom(effectiveTheme.value)
        } catch (e) { }
      })
    }
  } catch (e) { }
  // 浏览器环境：直接监听媒体查询
  try {
    if (_mediaQuery && typeof _mediaQuery.addEventListener === 'function') {
      _mediaQuery.addEventListener('change', () => {
        if (themeMode.value !== 'system') return
        effectiveTheme.value = resolveEffective('system')
        applyToDom(effectiveTheme.value)
      })
    }
  } catch (e) { }
}

function detachThemeListener() {
  try { if (_removeThemeListener) { _removeThemeListener(); _removeThemeListener = null } } catch (e) { }
}

// 模式变化时立刻反映到 DOM（即使主进程广播还没回来）
watch(themeMode, (m) => {
  effectiveTheme.value = resolveEffective(m)
  applyToDom(effectiveTheme.value)
})

const isDark = computed(() => effectiveTheme.value === 'dark')

export {
  themeMode, effectiveTheme, isDark, isWebOnly,
  setThemeMode, syncThemeFromMain, attachThemeListener, detachThemeListener,
  resolveEffective, applyToDom,
}
