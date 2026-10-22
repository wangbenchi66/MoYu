// electron/main.js — 主进程：窗口管理、设置持久化、Tray、全局快捷键、IPC 处理
import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, nativeTheme, screen, session, shell, Tray, webContents } from 'electron'
import Store from 'electron-store'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import defaultSettings from '../src/shared/defaultSettings.js'

// 本文件是 ESM，而 electron-updater 是 CJS，需借助 createRequire 加载
const require = createRequire(import.meta.url)

// 多 webview tab 时 Electron 内部 guest WebContents 会超出默认 10 个监听器上限
// 仅在需要时按实例设置，而非全局覆盖
function safeSetMaxListeners(emitter, count) {
    try { emitter.setMaxListeners(count) } catch (e) { }
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = !app.isPackaged
const isDevServerRun = process.env.npm_lifecycle_event === 'dev' || process.env.npm_lifecycle_event === 'dev:electron'
let mainWindow = null
let tray = null
let isQuitting = false
let autoHideMonitor = null
let lastVisibleBounds = null
let autoHideAwaitingEnter = false  // hide 模式下老板键恢复后，等待鼠标进入窗口
let currentSettings = { ...defaultSettings }
// 临时置顶计时器（用于 autoHide 自动显示时短暂将窗口置于顶层）
let _tempTopTimer = null
// 老板键主动隐藏标志：为 true 时 autoHide 监控不自动显示窗口
let bossKeyHidden = false

// F11 全屏状态与进入前的窗口 bounds。
//
// ⚠️ 为什么需要自己维护 `_isFullScreen`，而不是查 win.isFullScreen()：
//
// 本窗口是 `transparent: true` + `frame: false`，在 Windows 上这类窗口
// **全屏后 win.isFullScreen() 仍返回 false**（实测：bounds 已变成整屏 2048×1152、
// 窗口确实全屏了，但 isFullScreen() 是 false）。
//
// 后果：若用 isFullScreen() 判断该进还是该退，两次 F11 都会走"进入全屏"分支，
// 永远退不出来 —— 这正是「按 F11 全屏后再按一下没恢复」的根因。
//
// 所以这里自己记状态，只把它当作唯一真相来源。
let _isFullScreen = false
let _boundsBeforeFullScreen = null

// 不持久化的临时字段（例如窗口透明度、临时 UI 状态等）
// 每次启动从 defaultSettings 重置——这些属于「本次会话」状态，不该跨重启保留。
const nonPersistentKeys = new Set([
    'transparency',
    'autoHide',
    'transparentBackground',
    'hoverHeaderMode',
    'pageTransparentMode',
    'forcePageTransparent',
    // 顶栏「背景透明」三态按钮操作的键。此前遗漏 fullWindowTransparent，
    // 导致重启后仍保留上次的透明状态。
    'fullWindowTransparent',
    'shellOnlyTransparent',
    'clickThroughMode',
    'alwaysOnTop',
    'autoScrollEnabled',
])

// 窗口尺寸持久化（使用 electron-store）
const store = new Store()
const DEFAULT_WIDTH = 820
const DEFAULT_HEIGHT = 860
const MIN_SAFE_WIDTH = 360
const MIN_SAFE_HEIGHT = 80

// ─── 主题 ───
// 三态：light / dark / system（默认 system）
const THEME_MODES = ['light', 'dark', 'system']

function normalizeThemeMode(v) {
    return THEME_MODES.includes(v) ? v : 'system'
}

/** 把设置项同步到 nativeTheme，并广播实际生效的主题给渲染进程 */
function applyThemeSource() {
    try {
        const mode = normalizeThemeMode(currentSettings?.themeMode)
        nativeTheme.themeSource = mode
        broadcastTheme()
    } catch (e) { }
}

/** 当前"实际生效"的主题（system 时解析为系统当前值） */
function effectiveTheme() {
    try {
        return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    } catch (e) {
        return 'light'
    }
}

function broadcastTheme() {
    try {
        const payload = {
            mode: normalizeThemeMode(currentSettings?.themeMode),
            effective: effectiveTheme(),
        }
        for (const w of BrowserWindow.getAllWindows()) {
            try {
                if (!w.isDestroyed()) w.webContents.send('theme:changed', payload)
            } catch (e) { }
        }
    } catch (e) { }
}

// 摸鱼时间统计
let moyuStart = null
let moyuEndTimer = null

function getTodayKey() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function startMoyu() {
    // 有 pending 的延迟结束，取消它
    if (moyuEndTimer) {
        clearTimeout(moyuEndTimer)
        moyuEndTimer = null
    }
    if (moyuStart) return
    moyuStart = Date.now()
}

function endMoyu() {
    // 延迟 5 秒执行，快速切换窗口时不会反复启停
    if (moyuEndTimer) clearTimeout(moyuEndTimer)
    moyuEndTimer = setTimeout(endMoyuNow, 5000)
}

function endMoyuNow() {
    moyuEndTimer = null
    if (!moyuStart) return
    const now = Date.now()
    if (now - moyuStart < 2000) {
        moyuStart = null
        return
    }
    const sessions = store.get('moyuSessions', {})
    const key = getTodayKey()
    if (!sessions[key]) sessions[key] = []
    sessions[key].push({ start: moyuStart, end: now })
    store.set('moyuSessions', sessions)
    moyuStart = null
}

function getMoyuStats() {
    return {
        sessions: store.get('moyuSessions', {}),
        activeStart: moyuStart,
    }
}

// ── 日志系统 ──
const LOG_MAX_SIZE = 2 * 1024 * 1024 // 2MB

function getLogFilePath() {
    return path.join(app.getPath('userData'), 'app.log')
}

function writeLog(level, msg, data) {
    try {
        const logPath = getLogFilePath()
        // 超过限制时截断为一半
        try {
            const stat = fs.statSync(logPath)
            if (stat.size > LOG_MAX_SIZE) {
                const content = fs.readFileSync(logPath, 'utf-8')
                let half = Math.floor(content.length / 2)
                // 从换行符后开始截断，避免拆开多字节字符和日志行
                const newlinePos = content.indexOf('\n', half)
                if (newlinePos > 0) half = newlinePos + 1
                fs.writeFileSync(logPath, content.substring(half), 'utf-8')
            }
        } catch (e) { }
        const ts = new Date().toISOString()
        const line = `[${ts}] [${level}] ${msg}${data ? ' | ' + JSON.stringify(data) : ''}\n`
        fs.appendFileSync(logPath, line, 'utf-8')
    } catch (e) { }
}

/**
 * 获取设置文件的完整路径
 */
function getSettingsFilePath() {
    return path.join(app.getPath('userData'), 'glass-reader-settings.json')
}

/**
 * 将数值限制在指定范围内
 * 参数: value, min, max
 */
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value))
}

/**
 * 校验并规范化颜色字符串，若无效返回默认颜色
 * 参数: color - 16 进制颜色字符串，例如 #rrggbb
 */
function normalizeColor(color) {
    const DEFAULT_HEADER_TINT = '#f5f5f7'
    if (typeof color !== 'string') {
        return DEFAULT_HEADER_TINT
    }

    return /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_HEADER_TINT
}

/**
 * 规范化阅读器文字颜色，若无效返回默认颜色
 * 参数: color - 16 进制颜色字符串
 */
function normalizeReaderColor(color) {
    if (typeof color !== 'string') {
        return defaultSettings.readerTextColor
    }

    return /^#[0-9a-fA-F]{6}$/.test(color) ? color : defaultSettings.readerTextColor
}

/**
 * 合并并规范化设置对象（包含默认值和范围限制）
 * 参数: partial - 部分设置对象
 */
function normalizeSettings(partial = {}) {
    return {
        ...defaultSettings,
        ...partial,
        transparency: clamp(Number(partial.transparency ?? defaultSettings.transparency), 0, 100),
        showInTaskbar: Boolean(partial.showInTaskbar ?? defaultSettings.showInTaskbar),
        autoHide: Boolean(partial.autoHide ?? defaultSettings.autoHide),
        showTabBar: Boolean(partial.showTabBar ?? defaultSettings.showTabBar),
        noImageMode: Boolean(partial.noImageMode ?? defaultSettings.noImageMode),
        transparentBackground: Boolean(partial.transparentBackground ?? defaultSettings.transparentBackground),
        antiScreenshotMode: Boolean(partial.antiScreenshotMode ?? defaultSettings.antiScreenshotMode),
        mobileMode: Boolean(partial.mobileMode ?? defaultSettings.mobileMode),
        hoverHeaderMode: Boolean(partial.hoverHeaderMode ?? defaultSettings.hoverHeaderMode),
        pageTransparentMode: Boolean(partial.pageTransparentMode ?? defaultSettings.pageTransparentMode),
        shellOnlyTransparent: Boolean(partial.shellOnlyTransparent ?? defaultSettings.shellOnlyTransparent),
        forcePageTransparent: Boolean(partial.forcePageTransparent ?? defaultSettings.forcePageTransparent),
        forceReaderFont: Boolean(partial.forceReaderFont ?? defaultSettings.forceReaderFont),
        toolbarDocked: Boolean(partial.toolbarDocked ?? defaultSettings.toolbarDocked),
        forceReaderTextColor: Boolean(partial.forceReaderTextColor ?? defaultSettings.forceReaderTextColor),
        showScrollbars: Boolean(partial.showScrollbars ?? defaultSettings.showScrollbars),
        grayscaleMode: Boolean(partial.grayscaleMode ?? defaultSettings.grayscaleMode),
        themeMode: normalizeThemeMode(partial.themeMode ?? defaultSettings.themeMode),
        darkenWebPages: Boolean(partial.darkenWebPages ?? defaultSettings.darkenWebPages),
        clickThroughMode: Boolean(partial.clickThroughMode ?? defaultSettings.clickThroughMode),
        fullWindowTransparent: Boolean(partial.fullWindowTransparent ?? defaultSettings.fullWindowTransparent),
        closeToTray: Boolean(partial.closeToTray ?? defaultSettings.closeToTray),
        disableWindowShadow: Boolean(partial.disableWindowShadow ?? defaultSettings.disableWindowShadow),
        alwaysOnTop: Boolean(partial.alwaysOnTop ?? defaultSettings.alwaysOnTop),
        autoScrollEnabled: Boolean(partial.autoScrollEnabled ?? defaultSettings.autoScrollEnabled),
        autoScrollSpeed: clamp(Number(partial.autoScrollSpeed ?? defaultSettings.autoScrollSpeed), 5, 80),
        // 隐私相关：保留天数只接受白名单值，其它输入一律回落到默认（0 = 永久）
        historyRetentionDays: [0, 1, 3, 7, 30].includes(Number(partial.historyRetentionDays))
            ? Number(partial.historyRetentionDays)
            : Number(defaultSettings.historyRetentionDays),
        autoCleanOnStartup: Boolean(partial.autoCleanOnStartup ?? defaultSettings.autoCleanOnStartup),
        keepAudioPlayingInBackground: Boolean(partial.keepAudioPlayingInBackground ?? defaultSettings.keepAudioPlayingInBackground),
        restoreTabsOnStartup: Boolean(partial.restoreTabsOnStartup ?? defaultSettings.restoreTabsOnStartup),
        muteOnBossKey: Boolean(partial.muteOnBossKey ?? defaultSettings.muteOnBossKey),
        revealHintOnShow: Boolean(partial.revealHintOnShow ?? defaultSettings.revealHintOnShow),
        clearCacheOnExit: Boolean(partial.clearCacheOnExit ?? defaultSettings.clearCacheOnExit),
        readerTextColor: normalizeReaderColor(partial.readerTextColor ?? defaultSettings.readerTextColor),
        readerFontScale: clamp(Number(partial.readerFontScale ?? defaultSettings.readerFontScale), 80, 160),
        statusBarColor: normalizeColor(partial.statusBarColor),
        defaultUrl: String(partial.defaultUrl ?? defaultSettings.defaultUrl),
        bossKey: String(partial.bossKey ?? defaultSettings.bossKey),
        autoToggleShortcut: String(partial.autoToggleShortcut ?? defaultSettings.autoToggleShortcut),
        autoSpeedDownShortcut: String(partial.autoSpeedDownShortcut ?? defaultSettings.autoSpeedDownShortcut),
        autoSpeedUpShortcut: String(partial.autoSpeedUpShortcut ?? defaultSettings.autoSpeedUpShortcut),
        decreaseTransparencyShortcut: String(partial.decreaseTransparencyShortcut ?? defaultSettings.decreaseTransparencyShortcut),
        increaseTransparencyShortcut: String(partial.increaseTransparencyShortcut ?? defaultSettings.increaseTransparencyShortcut),
        clickThroughShortcut: String(partial.clickThroughShortcut ?? defaultSettings.clickThroughShortcut),
    }
}

/**
 * 从磁盘加载持久化设置（仅保留快捷键相关项）
 */
function loadSettings() {
    const filePath = getSettingsFilePath()
    const backupPath = filePath + '.bak'
    try {
        const raw = fs.readFileSync(filePath, 'utf-8')
        const parsed = JSON.parse(raw || '{}')

        // 移除不应持久化的临时字段
        for (const k of Object.keys(parsed)) {
            if (nonPersistentKeys.has(k)) delete parsed[k]
        }

        // 将磁盘上的所有（允许持久化的）字段视为用户自定义值，交由 normalizeSettings 校验并合并默认值。
        currentSettings = normalizeSettings({
            ...defaultSettings,
            ...parsed,
        })
    } catch (err) {
        // 主文件损坏，尝试读取备份
        try {
            console.warn('[settings] 主设置文件读取失败，尝试恢复备份:', err.message)
            const backupRaw = fs.readFileSync(backupPath, 'utf-8')
            const backupParsed = JSON.parse(backupRaw || '{}')
            for (const k of Object.keys(backupParsed)) {
                if (nonPersistentKeys.has(k)) delete backupParsed[k]
            }
            currentSettings = normalizeSettings({ ...defaultSettings, ...backupParsed })
            // 用备份恢复主文件
            fs.writeFileSync(filePath, JSON.stringify(currentSettings, null, 2), 'utf-8')
            console.log('[settings] 已从备份恢复设置')
        } catch {
            currentSettings = { ...defaultSettings }
            console.warn('[settings] 备份也无法读取，已重置为默认设置')
        }
    }
}

ipcMain.handle('settings:set-transparency', (_, percent) => {
    console.log('[ipc] settings:set-transparency received percent=', percent)
    const next = normalizeSettings({ ...currentSettings, transparency: Number(percent || 0) })
    currentSettings = next

    try {
        saveSettings()
    } catch (e) {
        console.warn('[settings] save failed when set-transparency:', e)
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
        applyWindowSettings(mainWindow)
    }

    broadcastSettings()
    return currentSettings
})

// 接收来自 renderer 的调试日志，写入日志文件并打印到终端
ipcMain.on('renderer:log', (event, msg) => {
    try {
        console.log('[renderer->main]', msg)
        writeLog('INFO', String(msg))
    } catch (e) {
        console.warn('[renderer->main] log failed', e)
    }
})

// 收到 preload 的就绪信号，帮助确认 preload 是否被注入
ipcMain.on('preload:loaded', (event, info) => {
    try {
        console.log('[preload] loaded in webContents id=', event.sender.id, 'info=', info)
    } catch (e) {
        console.warn('[preload] log failed', e)
    }
})

// 在主进程中处理请求在外部浏览器打开链接
ipcMain.handle('shell:open-external', async (_, url) => {
    try {
        if (!url) return { success: false, error: 'empty url' }
        const str = String(url)
        if (!str.startsWith('http://') && !str.startsWith('https://')) {
            return { success: false, error: 'only http/https allowed' }
        }
        await shell.openExternal(str)
        return { success: true }
    } catch (err) {
        console.warn('[ipc] shell:open-external failed', err)
        return { success: false, error: String(err) }
    }
})

// 允许 renderer 临时设置窗口是否忽略鼠标事件（不改变持久设置）
ipcMain.handle('ui:set-ignore-mouse-events', (_, ignore) => {
    try {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.setIgnoreMouseEvents(Boolean(ignore), Boolean(ignore) ? { forward: true } : undefined)
            console.log('[main] setIgnoreMouseEvents applied=', Boolean(ignore))
        }
    } catch (e) {
        console.warn('[main] setIgnoreMouseEvents failed', e)
    }

    return { applied: true }
})

/**
 * 将当前设置写入磁盘持久化文件
 */
function saveSettings() {
    try {
        const filePath = getSettingsFilePath()
        // 写入前先备份旧文件
        try {
            if (fs.existsSync(filePath)) {
                fs.copyFileSync(filePath, filePath + '.bak')
            }
        } catch (e) { }
        fs.writeFileSync(filePath, JSON.stringify(currentSettings, null, 2), 'utf-8')
    } catch (error) {
        console.warn('[settings] save failed:', error)
    }
}

/**
 * 将当前设置广播到渲染进程
 */
function broadcastSettings() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('settings:changed', currentSettings)
    }
}

/**
 * 记录当前可见窗口的边界（用于自动隐藏逻辑）
 *
 * ⚠️ 全屏时不记录：此时 getBounds() 返回整个屏幕，
 * 会把 lastVisibleBounds 撑成屏幕大小，影响「鼠标是否在窗口内」的判断。
 */
function rememberWindowBounds() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        return
    }
    try {
        if (mainWindow.isFullScreen()) {
            return
        }
    } catch (e) {
        // isFullScreen 不可用时按原逻辑继续
    }

    lastVisibleBounds = mainWindow.getBounds()
}

/**
 * 判断点是否在给定边界内（可带 margin）
 * 参数: point, bounds, margin
 */
function isPointInsideBounds(point, bounds, margin = 0) {
    return point.x >= bounds.x - margin
        && point.x <= bounds.x + bounds.width + margin
        && point.y >= bounds.y - margin
        && point.y <= bounds.y + bounds.height + margin
}

/**
 * 静音/取消静音所有 webContents（含各 webview 的 guest 实例）。
 * 老板键隐藏窗口时使用——否则窗口藏了、声音还在放。
 * 参数: muted - true 静音，false 还原
 */
function setAllAudioMuted(muted) {
    try {
        const all = webContents.getAllWebContents()
        for (const wc of all) {
            try {
                if (wc && !wc.isDestroyed()) wc.setAudioMuted(Boolean(muted))
            } catch (e) { }
        }
    } catch (e) {
        console.warn('[audio] setAllAudioMuted failed:', e)
    }
}

/**
 * 隐藏主窗口并刷新托盘菜单
 */
function hideMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) {
        return
    }

    rememberWindowBounds()
    mainWindow.hide()
    // 老板键/自动隐藏时静音，避免「窗口藏了但声音还在放」
    if (currentSettings.muteOnBossKey) {
        setAllAudioMuted(true)
    }
    refreshTrayMenu()
}

/**
 * 显示主窗口，可选择是否获取焦点
 * 参数: focus - 是否获取焦点（默认 true）
 */
/**
 * 显示主窗口，可选择是否获取焦点；可传入 { tempTop: true } 实现短暂置顶
 * 参数: focus - 是否获取焦点（默认 true）
 *       opts.tempTop - 若为 true，则短暂将窗口置于顶层（不持久化 alwaysOnTop 设置）
 */
function showMainWindow(focus = true, opts = {}) {
    if (!mainWindow || mainWindow.isDestroyed()) {
        return
    }

    if (mainWindow.isMinimized()) {
        mainWindow.restore()
    }

    if (!mainWindow.isVisible()) {
        // macOS 上 showInactive() 无法恢复 hide() 后的窗口，始终使用 show()
        if (!focus && process.platform !== 'darwin' && typeof mainWindow.showInactive === 'function') {
            mainWindow.showInactive()
        } else {
            mainWindow.show()
        }
    }

    if (focus) {
        mainWindow.focus()
    }

    // 窗口重新可见时还原音频（与 hideMainWindow 的静音配对）
    if (currentSettings.muteOnBossKey) {
        setAllAudioMuted(false)
    }

    // 如果要求短暂置顶：在显示时先临时置顶一小段时间，然后恢复到当前设置的 alwaysOnTop
    try {
        if (opts && opts.tempTop) {
            // 清理之前的计时器
            if (_tempTopTimer) {
                clearTimeout(_tempTopTimer)
                _tempTopTimer = null
            }
            try {
                // 先将窗口临时置顶
                mainWindow.setAlwaysOnTop(true, 'screen-saver')
            } catch (e) { }
            // 在短时间后恢复为用户配置的置顶状态
            _tempTopTimer = setTimeout(() => {
                try {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.setAlwaysOnTop(currentSettings.alwaysOnTop, 'screen-saver')
                    }
                } catch (e) { }
                _tempTopTimer = null
            }, 800)
        }
    } catch (e) { }

    refreshTrayMenu()

    // 通知渲染进程「窗口刚被唤出」。
    //
    // 为什么需要：当「软件背景透明 + 网页背景透明 + 标题栏悬停隐藏」同时开启时，
    // 窗口虽然显示了，但视觉上和桌面背景几乎无从区分——用户连按几次老板键后
    // 会完全不知道窗口在哪。渲染进程收到后会短暂高亮一次，让用户一眼看到位置，
    // 几秒后自动恢复原来的透明设置。
    try {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('window:revealed')
        }
    } catch (e) { }
}

/**
 * 停止自动隐藏窗口的轮询监控
 */
function stopAutoHideMonitor() {
    if (autoHideMonitor) {
        clearInterval(autoHideMonitor)
        autoHideMonitor = null
    }
}

/**
 * 刷新并启动/停止自动隐藏窗口的监控轮询
 */
function refreshAutoHideMonitor() {
    stopAutoHideMonitor()

    if (!currentSettings.autoHide) {
        autoHideAwaitingEnter = false
        return
    }

    autoHideMonitor = setInterval(() => {
        if (!mainWindow || mainWindow.isDestroyed()) {
            return
        }

        // 最小化时不处理（用户主动操作，不自动干预）
        if (mainWindow.isMinimized()) return

        const cursorPoint = screen.getCursorScreenPoint()
        const trackedBounds = lastVisibleBounds ?? mainWindow.getBounds()

        if (mainWindow.isVisible()) {
            rememberWindowBounds()

            const inside = isPointInsideBounds(cursorPoint, trackedBounds, 0)
            if (autoHideAwaitingEnter) {
                if (inside) autoHideAwaitingEnter = false
                return
            }

            if (!inside && !isPointInsideBounds(cursorPoint, trackedBounds, 12)) {
                hideMainWindow()
            }

            return
        }

        // 窗口已隐藏（非最小化）：仅 hover 模式下检查光标是否回到窗口区域
        if (currentSettings.autoHide === 'hover' && isPointInsideBounds(cursorPoint, trackedBounds, 6)) {
            // 老板键主动隐藏时不自动显示
            if (bossKeyHidden) return
            // 使用短暂置顶以确保在层级切换时能被用户看到（不持久化 alwaysOnTop）
            showMainWindow(false, { tempTop: true })
        }
    }, 250)
}

/**
 * 打开设置面板（确保主窗口存在并显示）
 */
function openSettingsPanel() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow()
    }

    if (!mainWindow || mainWindow.isDestroyed()) {
        return
    }

    showMainWindow(true)
    mainWindow.webContents.send('ui:open-settings')
}

/**
 * 将当前设置应用到指定窗口（透明度、置顶、忽略鼠标等）
 * 参数: win - BrowserWindow 实例
 */
function applyWindowSettings(win) {
    win.setSkipTaskbar(!currentSettings.showInTaskbar)
    win.setAlwaysOnTop(currentSettings.alwaysOnTop, 'screen-saver')
    win.setContentProtection(currentSettings.antiScreenshotMode)
    win.setIgnoreMouseEvents(currentSettings.clickThroughMode, currentSettings.clickThroughMode ? { forward: true } : undefined)
    try {
        // 透明度处理：无论是否启用“软件背景透明”，都将根据透明度滑块计算窗口整体不透明度。
        // 区别在于：启用“软件背景透明”时，页面背景由前端 CSS 控制（shell/surface 设为透明），
        // 而透明度滑块会影响整个窗口（主进程通过 setOpacity），实现用户期望的“整体透明度”效果。
        const opacity = clamp(1 - currentSettings.transparency / 100, 0.12, 1)
        // 输出当前透明度设置与计算结果，帮助排查透明度调整问题
        //console.log(`[applyWindowSettings] transparency=${currentSettings.transparency} fullWindowTransparent=${currentSettings.fullWindowTransparent} -> opacity=${opacity}`)
        win.setOpacity(opacity)
    } catch (e) {
        console.warn('[applyWindowSettings] setOpacity failed:', e)
    }

    if (typeof win.setHasShadow === 'function') {
        win.setHasShadow(!currentSettings.disableWindowShadow)
    }

    if (process.platform === 'win32') {
        applyWindowsAcrylic(win, currentSettings.transparentBackground)
    }
}

/**
 * 切换全屏（F11 用）。
 *
 * ⚠️ 与 Chromium 内建 F11 的两点不同，都是被透明窗口的实测行为逼出来的：
 *
 * 1. **用自维护的 `_isFullScreen` 判断方向，不查 `win.isFullScreen()`**。
 *    透明 + 无边框窗口在 Windows 上全屏后 `isFullScreen()` 仍返回 false，
 *    若据此判断，两次 F11 都会执行"进入全屏"，用户永远退不出来。
 *
 * 2. **退出时用进入前记录的 bounds 精确还原**，而不是依赖 Electron 自己恢复。
 *
 * 参数: win - BrowserWindow
 */
function toggleFullScreen(win) {
    if (!win || win.isDestroyed()) {
        return
    }

    try {
        if (_isFullScreen) {
            // ── 退出全屏 ──
            _isFullScreen = false
            win.setFullScreen(false)

            // 用进入前的 bounds 还原。setTimeout(0) 让全屏状态先提交，
            // 否则紧随其后的 setBounds 可能被忽略。
            const restore = _boundsBeforeFullScreen
            _boundsBeforeFullScreen = null
            if (restore) {
                setTimeout(() => {
                    try {
                        if (!win.isDestroyed()) {
                            win.setBounds(restore)
                            // 回到窗口态后重新记录，供自动隐藏逻辑使用
                            rememberWindowBounds()
                            // 把还原后的尺寸同步到 store，避免下次启动沿用旧值
                            const [w, h] = win.getSize()
                            store.set('width', w)
                            store.set('height', h)
                        }
                    } catch (e) {
                        console.warn('[fullscreen] restore bounds failed:', e)
                    }
                }, 0)
            }
        } else {
            // ── 进入全屏 ──
            _isFullScreen = true
            _boundsBeforeFullScreen = win.getBounds()
            win.setFullScreen(true)
        }
    } catch (e) {
        // 出错时回滚状态，避免卡在"以为在全屏"的假象里
        _isFullScreen = false
        console.warn('[fullscreen] toggle failed:', e)
    }
}

/**
 * 切换主窗口的显示/隐藏状态
 */
function toggleMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        return
    }

    if (mainWindow.isVisible()) {
        bossKeyHidden = true
        hideMainWindow()
        return
    }

    bossKeyHidden = false
    if (currentSettings.autoHide && currentSettings.autoHide !== 'hover') {
        autoHideAwaitingEnter = true
    }
    showMainWindow(true)
}

/**
 * 构建主窗口要加载的 URL（支持 dev server 或 file://）
 * 参数: hash - 路由哈希，默认为 '/'
 */
function getWindowUrl(hash = '/') {
    const normalizedHash = hash.startsWith('/') ? hash : `/${hash}`
    if (isDev && isDevServerRun) {
        return `http://127.0.0.1:5173/#${normalizedHash}`
    }

    const indexPath = path.join(__dirname, '../dist/index.html')
    return `file://${indexPath.replace(/\\/g, '/')}#${normalizedHash}`
}

/**
 * 根据配置创建托盘并绑定菜单与事件
 */
function createTray() {
    if (tray) {
        return
    }

    // 仅从共享默认配置指定的路径加载托盘图标（不读取用户上传路径）
    const configured = defaultSettings.trayIconPath || ''
    if (!configured) {
        console.warn('[tray] default trayIconPath not set; skipping tray creation')
        return
    }

    const resolvedPath = resolveResourcePath(configured)
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
        console.warn('[tray] specified trayIconPath does not exist (checked multiple locations):', resolvedPath)
        return
    }

    let trayImage = null
    try {
        trayImage = nativeImage.createFromPath(resolvedPath)
    } catch (e) {
        console.warn('[tray] createFromPath failed for', resolvedPath, e)
        return
    }

    if (!trayImage || (typeof trayImage.isEmpty === 'function' && trayImage.isEmpty())) {
        console.warn('[tray] nativeImage is empty for', resolvedPath)
        return
    }

    // macOS 菜单栏图标需要缩小到 16x16，且设为 template 以适配深色/浅色模式
    if (process.platform === 'darwin') {
        trayImage = trayImage.resize({ width: 16, height: 16 })
        trayImage.setTemplateImage(true)
    }

    // 使用 nativeImage 实例创建托盘，避免路径解析差异
    tray = new Tray(trayImage)
    tray.setToolTip('MoYu')

    tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenuTemplate()))
    // macOS 菜单栏图标单击即可响应，Windows/Linux 需要双击
    if (process.platform === 'darwin') {
        tray.on('click', () => toggleMainWindow())
    } else {
        tray.on('double-click', () => toggleMainWindow())
    }
}

/**
 * 刷新托盘菜单（根据当前设置重建）
 */
function refreshTrayMenu() {
    if (!tray) {
        return
    }

    tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenuTemplate()))
}

/**
 * 更新透明度设置并应用到窗口
 * 参数: nextTransparency - 下一个透明度值（0-100）
 */
function updateTransparency(nextTransparency) {
    currentSettings = normalizeSettings({
        ...currentSettings,
        transparency: nextTransparency,
    })

    saveSettings()

    if (mainWindow && !mainWindow.isDestroyed()) {
        applyWindowSettings(mainWindow)
    }

    broadcastSettings()
    refreshAutoHideMonitor()
}

function updateSettingsFromTray(partial) {
    try {
        currentSettings = normalizeSettings({ ...currentSettings, ...partial })
        saveSettings()
        registerGlobalShortcuts()
        refreshAutoHideMonitor()
        // 从托盘改主题时也要同步 nativeTheme 并广播
        if (partial && 'themeMode' in partial) applyThemeSource()
        if (mainWindow && !mainWindow.isDestroyed()) {
            applyWindowSettings(mainWindow)
        }
        broadcastSettings()
        refreshTrayMenu()
    } catch (e) {
        console.warn('[tray] updateSettingsFromTray failed:', e)
    }
}

// ─── 极简模式（托盘）───
//
// 与顶栏的极简模式保持一致：一键打开「软件背景透明 + 网页背景透明 +
// 窗口置顶 + 悬停显示标题栏 + 透明度 50%」，关闭时五项一并还原、透明度回 0。
//
// 状态判断同样是**派生**的（五项全满足才算开），不额外存 minimalMode，
// 这样用户在别处（顶栏 / 设置页）手动改动任意一项后，托盘里的勾选会跟着变。
const MINIMAL_OPACITY = 50

function isMinimalModeActive() {
    return !!currentSettings.fullWindowTransparent
        && !!currentSettings.pageTransparentMode
        && !!currentSettings.alwaysOnTop
        && !!currentSettings.hoverHeaderMode
        && Number(currentSettings.transparency) === MINIMAL_OPACITY
}

function toggleMinimalModeFromTray() {
    if (isMinimalModeActive()) {
        updateSettingsFromTray({
            fullWindowTransparent: false,
            pageTransparentMode: false,
            alwaysOnTop: false,
            hoverHeaderMode: false,
            transparency: 0,
        })
    } else {
        updateSettingsFromTray({
            fullWindowTransparent: true,
            pageTransparentMode: true,
            alwaysOnTop: true,
            hoverHeaderMode: true,
            transparency: MINIMAL_OPACITY,
        })
    }
}

function buildTrayMenuTemplate() {
    const isVisible = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()
    const transparencyOptions = [0, 10, 20, 30, 40, 50, 60, 70, 80]
    const transparencySubmenu = transparencyOptions.map((v) => ({
        label: `${v}%`,
        type: 'radio',
        checked: Number(currentSettings.transparency) === v,
        click: () => updateTransparency(v),
    }))

    const autoScrollSpeeds = [5, 10, 20, 30, 40, 60, 80]
    const autoScrollSubmenu = autoScrollSpeeds.map((v) => ({
        label: `${v}`,
        type: 'radio',
        checked: Number(currentSettings.autoScrollSpeed) === v,
        click: () => updateSettingsFromTray({ autoScrollSpeed: v }),
    }))

    const fontScaleOptions = [80, 100, 120, 140, 160]
    const fontScaleSubmenu = fontScaleOptions.map((v) => ({
        label: `${v}%`,
        type: 'radio',
        checked: Number(currentSettings.readerFontScale) === v,
        click: () => updateSettingsFromTray({ readerFontScale: v }),
    }))

    // 主题：三态单选（跟随系统 / 浅色 / 深色）
    const themeSubmenu = [
        { label: '跟随系统', type: 'radio', checked: currentSettings.themeMode === 'system', click: () => updateSettingsFromTray({ themeMode: 'system' }) },
        { label: '浅色', type: 'radio', checked: currentSettings.themeMode === 'light', click: () => updateSettingsFromTray({ themeMode: 'light' }) },
        { label: '深色', type: 'radio', checked: currentSettings.themeMode === 'dark', click: () => updateSettingsFromTray({ themeMode: 'dark' }) },
        { type: 'separator' },
        {
            label: '深色模式下让网页也变深',
            type: 'checkbox',
            checked: !!currentSettings.darkenWebPages,
            click: (item) => updateSettingsFromTray({ darkenWebPages: item.checked }),
        },
    ]

    return [
        {
            label: isVisible ? '隐藏主窗口' : '显示主窗口',
            click: () => toggleMainWindow(),
        },
        // 极简模式：一级菜单，一项顶五项，摸鱼时常用
        {
            label: '极简模式',
            type: 'checkbox',
            checked: isMinimalModeActive(),
            click: () => toggleMinimalModeFromTray(),
        },
        // 主题放在顶层便于快速切换（高频操作）
        {
            label: `主题：${currentSettings.themeMode === 'dark' ? '深色' : currentSettings.themeMode === 'light' ? '浅色' : '跟随系统'}`,
            submenu: themeSubmenu,
        },
        {
            label: '快速设置',
            submenu: [
                // 与设置页保持一致的顺序：透明度 -> 左侧开关（顺序与 leftToggleKeys）-> toolbarDisabled -> 右侧开关（顺序与 rightToggleKeys）
                { label: '透明度', submenu: transparencySubmenu },
                { type: 'separator' },
                // 左侧开关（窗口行为）
                { label: '系统任务栏显示', type: 'checkbox', checked: !!currentSettings.showInTaskbar, click: (item) => updateSettingsFromTray({ showInTaskbar: item.checked }) },
                { label: '关闭时最小化到托盘', type: 'checkbox', checked: !!currentSettings.closeToTray, click: (item) => updateSettingsFromTray({ closeToTray: item.checked }) },
                { label: '悬停显示标题栏', type: 'checkbox', checked: !!currentSettings.hoverHeaderMode, click: (item) => updateSettingsFromTray({ hoverHeaderMode: item.checked }) },
                { label: '显示标签栏', type: 'checkbox', checked: !!currentSettings.showTabBar, click: (item) => updateSettingsFromTray({ showTabBar: item.checked }) },
                { label: '鼠标移出隐藏', type: 'checkbox', checked: !!currentSettings.autoHide, click: (item) => updateSettingsFromTray({ autoHide: item.checked ? 'hide' : false }) },
                { label: '隐藏时暂停媒体与滚动', type: 'checkbox', checked: !!currentSettings.pauseOnBlurHide, click: (item) => updateSettingsFromTray({ pauseOnBlurHide: item.checked }) },
                { label: '工具栏显示', type: 'checkbox', checked: !!currentSettings.toolbarVisible, click: (item) => updateSettingsFromTray({ toolbarVisible: item.checked }) },
                { label: '工具栏停靠底部', type: 'checkbox', checked: !!currentSettings.toolbarDocked, click: (item) => updateSettingsFromTray({ toolbarDocked: item.checked }) },
                { label: '显示滚动条', type: 'checkbox', checked: !!currentSettings.showScrollbars, click: (item) => updateSettingsFromTray({ showScrollbars: item.checked }) },
                // settings 中单独显示的禁用工具栏项
                { label: '禁用工具栏（不再移入显示）', type: 'checkbox', checked: !!currentSettings.toolbarDisabled, click: (item) => updateSettingsFromTray({ toolbarDisabled: item.checked }) },
                { type: 'separator' },
                // 右侧开关（显示与渲染）
                { label: '窗口始终置顶', type: 'checkbox', checked: !!currentSettings.alwaysOnTop, click: (item) => updateSettingsFromTray({ alwaysOnTop: item.checked }) },
                { label: '软件背景透明', type: 'checkbox', checked: !!currentSettings.fullWindowTransparent, click: (item) => updateSettingsFromTray({ fullWindowTransparent: item.checked }) },
                { label: '网页背景透明', type: 'checkbox', checked: !!currentSettings.pageTransparentMode, click: (item) => updateSettingsFromTray({ pageTransparentMode: item.checked }) },
                { label: '强制修改文字颜色', type: 'checkbox', checked: !!currentSettings.forceReaderTextColor, click: (item) => updateSettingsFromTray({ forceReaderTextColor: item.checked }) },
                { label: '强制阅读器字号', type: 'checkbox', checked: !!currentSettings.forceReaderFont, click: (item) => updateSettingsFromTray({ forceReaderFont: item.checked }) },
                { label: '自动滚动', type: 'checkbox', checked: !!currentSettings.autoScrollEnabled, click: (item) => updateSettingsFromTray({ autoScrollEnabled: item.checked }) },
                { label: '灰度模式', type: 'checkbox', checked: !!currentSettings.grayscaleMode, click: (item) => updateSettingsFromTray({ grayscaleMode: item.checked }) },
                { label: '无图模式', type: 'checkbox', checked: !!currentSettings.noImageMode, click: (item) => updateSettingsFromTray({ noImageMode: item.checked }) },
                { label: '鼠标穿透', type: 'checkbox', checked: !!currentSettings.clickThroughMode, click: (item) => updateSettingsFromTray({ clickThroughMode: item.checked }) },
                { label: '手机模式', type: 'checkbox', checked: !!currentSettings.mobileMode, click: (item) => updateSettingsFromTray({ mobileMode: item.checked }) },
                { label: '防截屏模式', type: 'checkbox', checked: !!currentSettings.antiScreenshotMode, click: (item) => updateSettingsFromTray({ antiScreenshotMode: item.checked }) },
                { type: 'separator' },
                // 额外控制项：自动滚动速度 & 阅读器字体缩放
                { label: '自动滚动速度', submenu: autoScrollSubmenu },
                { label: '阅读器字体缩放', submenu: fontScaleSubmenu },
            ],
        },
        {
            label: '打开设置',
            click: () => openSettingsPanel(),
        },
        { type: 'separator' },
        {
            label: '退出',
            click: () => {
                isQuitting = true
                app.quit()
            },
        },
    ]
}

/**
 * 注册全局快捷键（目前仅注册老板键 bossKey 为全局，其它快捷键在渲染进程中处理）
 */
function registerGlobalShortcuts() {
    globalShortcut.unregisterAll()
    // 仅将老板键注册为全局快捷键，其它快捷键应仅在应用聚焦时生效（由渲染进程处理）
    try {
        if (currentSettings.bossKey) {
            globalShortcut.register(currentSettings.bossKey, () => toggleMainWindow())
        }
    } catch (error) {
        console.warn(`[shortcut] register failed for bossKey ${currentSettings.bossKey}:`, error)
    }
}

function applyWindowsAcrylic(win, enabled) {
    if (process.platform !== 'win32') return

    try {
        if (typeof win.setBackgroundMaterial !== 'function') return

        if (enabled) {
            win.setBackgroundMaterial('acrylic')
            return
        }

        // ⚠️ 关闭亚克力时**不能**调用 setBackgroundMaterial('none')。
        //
        // 实测（Electron 45 / Windows 11）：对 transparent: true 的窗口调用
        // 'none' 会把整个窗口变成完全不透明 —— capturePage 的 alpha 平均值
        // 从 0 直接跳到 255，「软件背景透明」彻底失效。
        // Electron 31 上没有这个问题，是升级后才出现的。
        //
        // 正确做法：用 'auto' 回到默认状态，再把窗口背景色重置成全透明。
        // 两者各自都能把 alpha 拉回 0（实测），一起用更稳妥。
        win.setBackgroundMaterial('auto')
        win.setBackgroundColor('#00000000')
    } catch (error) {
        console.warn('[blur] setBackgroundMaterial failed:', error)
    }
}
// 资源解析：开发时从源码目录（__dirname/..）获取；打包时优先尝试从 app.asar 获取
const resolveResourcePath = (relativePath) => {
    if (!relativePath) return ''

    // 1) 绝对路径直接返回
    if (path.isAbsolute(relativePath) && fs.existsSync(relativePath)) {
        return relativePath
    }

    const devCandidate = path.join(__dirname, '..', relativePath)

    // 开发模式：直接使用源码目录下的文件（便于热重载与调试）
    if (!app.isPackaged) {
        return devCandidate
    }

    // 打包模式：优先从 app.asar 中读取资源（如果资源被打包进 asar）
    try {
        const appAsarCandidate = path.join(process.resourcesPath, 'app.asar', relativePath)
        if (fs.existsSync(appAsarCandidate)) {
            return appAsarCandidate
        }

        // 若未打包进 asar，则检查 resourcesPath 下的 extraResources（例如 resources/public/...）
        const resourcesCandidate = path.join(process.resourcesPath, relativePath)
        if (fs.existsSync(resourcesCandidate)) {
            return resourcesCandidate
        }

        // 最后尝试 exe 所在目录的 resources 子目录（兼容不同打包结构）
        const exeResourcesCandidate = path.join(path.dirname(app.getPath('exe')), 'resources', relativePath)
        if (fs.existsSync(exeResourcesCandidate)) {
            return exeResourcesCandidate
        }
    } catch (e) {
        console.warn('[resolveResourcePath] packaged check failed:', e)
    }

    // 若以上都未命中，回退到开发候选（某些 asar/asar.unpacked 场景下仍可用）
    return devCandidate
}

const getIconPath = (relativePath) => {
    const resolved = resolveResourcePath(relativePath)
    console.log('[getIconPath] relative=', relativePath, 'resolved=', resolved, 'exists=', resolved ? fs.existsSync(resolved) : false)
    return resolved
}

function createWindow() {
    const preloadPath = path.join(__dirname, 'preload.cjs')
    console.log('[main] creating BrowserWindow. preloadPath=', preloadPath, 'exists=', fs.existsSync(preloadPath))
    // 读取持久化的窗口尺寸，若过小或超出屏幕则使用安全默认
    const savedW = Number(store.get('width', DEFAULT_WIDTH)) || DEFAULT_WIDTH
    const savedH = Number(store.get('height', DEFAULT_HEIGHT)) || DEFAULT_HEIGHT
    const primary = screen.getPrimaryDisplay()
    const maxW = primary && primary.workAreaSize ? primary.workAreaSize.width : DEFAULT_WIDTH * 2
    const maxH = primary && primary.workAreaSize ? primary.workAreaSize.height : DEFAULT_HEIGHT * 2
    const initialW = clamp(savedW, MIN_SAFE_WIDTH, maxW)
    const initialH = clamp(savedH, MIN_SAFE_HEIGHT, maxH)
    //创建窗口
    const isMac = process.platform === 'darwin'
    const win = new BrowserWindow({
        // Windows 使用自定义图标；macOS 使用应用包自带图标（不需要传 icon）
        ...(!isMac ? { icon: getIconPath(defaultSettings.appIconPath) } : {}),
        //icon: './public/icon.png',
        width: initialW,
        height: initialH,
        minWidth: 280,
        minHeight: 80,
        // macOS 使用 titleBarStyle + trafficLightPosition 隐藏原生交通灯按钮
        // Windows 使用 frame: false 隐藏原生标题栏
        ...(isMac
            ? { titleBarStyle: 'hidden' }
            : { frame: false }),
        // 创建为透明窗口，页面透明区域将透出桌面（CSS 控制具体显示效果）
        transparent: true,
        hasShadow: false,
        backgroundColor: '#00000000',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: true,
            // 临时禁用 sandbox 以确保 preload 的 contextBridge 能正常注入（用于调试）
            sandbox: false,
            enableRemoteModule: false,
            devTools: true,
        },
    })

    mainWindow = win

    // 每个 webview tab 会在此 WebContents 上注册内部代理监听器，多 tab 时超出默认上限 10
    win.webContents.setMaxListeners(100)

    console.log('[main] created BrowserWindow id=', win.id, 'webContentsId=', win.webContents.id)

    // 主题来源跟随设置项（'light' / 'dark' / 'system'）。
    // nativeTheme.themeSource 会影响 Chromium 的 prefers-color-scheme，
    // 因此设成 'dark' 时，webview 里的网站也会收到深色偏好（配合 shouldUseDarkColors 生效）。
    applyThemeSource()
    applyWindowSettings(win)

    win.loadURL(getWindowUrl('/'))

    rememberWindowBounds()

    win.on('move', () => {
        rememberWindowBounds()
    })

    // ── F11 全屏接管 ──────────────────────────────────────────────
    //
    // 为什么要接管而不是用 Chromium 内建的 F11：
    //   本窗口是 `transparent: true` + `frame: false` + `backgroundColor: #00000000`。
    //   在 Windows 上，这类窗口由 DWM 合成器处理，退出全屏时**不保证**恢复原尺寸
    //   （实测会出现停在屏幕大小、或透明度失效）。内建 F11 是为标准窗口设计的。
    //
    // 做法：拦截 F11 → 自己记录进入前的 bounds → setFullScreen
    //       → 退出时用记录的 bounds 精确还原。
    win.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return
        if (input.key !== 'F11') return
        // 输入框里按 F11 也应触发全屏（F11 本身不是文本输入键），无需额外判断
        event.preventDefault()
        toggleFullScreen(win)
    })

    win.on('resize', () => {
        // ⚠️ 全屏/最大化时必须跳过。
        //
        // F11 会触发 resize，此时 getBounds() 返回的是**整个屏幕**尺寸
        // （实测：窗口 901×600 → 全屏时 2048×1152）。
        // 若照单全收，store 里存的"窗口尺寸"就变成了屏幕分辨率，
        // 下次启动（或恢复）窗口会按屏幕大小打开 ——
        // 用户看到的现像就是「按 F11 全屏后，再按一下没有恢复原尺寸」。
        if (win.isFullScreen() || win.isMaximized()) {
            return
        }
        rememberWindowBounds()
        try {
            const [w, h] = win.getSize()
            store.set('width', w)
            store.set('height', h)
        } catch (e) {
            // ignore
        }
    })

    // 退出全屏时补记一次尺寸：因为全屏期间的 resize 都被上面跳过了，
    // 若用户在退出全屏后又拖动窗口，正常路径会记到；但若直接关闭窗口，
    // 需要这里兜底，避免把全屏尺寸留成最后一次记录。
    win.on('leave-full-screen', () => {
        try {
            if (!win.isMaximized()) {
                rememberWindowBounds()
                const [w, h] = win.getSize()
                store.set('width', w)
                store.set('height', h)
            }
        } catch (e) {
            // ignore
        }
    })

    win.on('show', () => {
        rememberWindowBounds()
        refreshTrayMenu()
        startMoyu()
    })

    win.on('hide', () => {
        endMoyu()
    })

    win.on('minimize', () => {
        endMoyu()
    })

    win.on('restore', () => {
        startMoyu()
    })

    win.on('focus', () => {
        startMoyu()
    })

    win.on('blur', () => {
        if (currentSettings.autoHide) {
            // hide 模式下老板键恢复后等待鼠标进入，期间不因 blur 隐藏
            if (autoHideAwaitingEnter) return
            // autoHide 时 hideMainWindow 会触发 hide 事件，由 hide 事件处理 endMoyu
            hideMainWindow()
            return
        }
        // 非 autoHide 时：检查是否有媒体播放或自动滚动，有则继续计时
        try {
            win.webContents.executeJavaScript('!!(window.__moyuShouldKeepTracking && window.__moyuShouldKeepTracking())')
                .then((shouldKeep) => {
                    if (!shouldKeep) endMoyu()
                })
                .catch(() => endMoyu())
        } catch (e) {
            endMoyu()
        }
    })

    win.on('close', (event) => {
        if (currentSettings.closeToTray && !isQuitting) {
            event.preventDefault()
            win.hide()
            refreshTrayMenu()
        }
    })

    win.webContents.on('did-finish-load', () => {
        broadcastSettings()
    })

    // 拦截 webview 内 zhihu:// 和 /oia/ 中转跳转，防止白屏和系统弹窗
    const _handledWvc = new WeakSet()

    function isBlockedNavUrl(url) {
        try {
            if (!url || typeof url !== 'string') return false
            // 非 http(s)/file/data/blob 协议（如 zhihu://）一律拦截
            if (!/^(https?:|file:|data:|blob:)/i.test(url)) return true
            // 知乎 OIA（Open In App）中转页：会导致白屏然后再触发 zhihu://
            if (/zhihu\.com\/oia\//i.test(url)) return true
            return false
        } catch (e) { return false }
    }

    win.webContents.on('did-attach-webview', (_event, wc) => {
        try {
            if (_handledWvc.has(wc)) return
            _handledWvc.add(wc)

            // 拦截主框架发起的导航（location.href / location.assign 等）
            wc.on('will-navigate', (navEvent, url) => {
                try {
                    if (isBlockedNavUrl(url)) {
                        console.log('[nav] blocked will-navigate:', url)
                        navEvent.preventDefault()
                    }
                } catch (e) { }
            })

            // 拦截服务端 302/301 重定向到 zhihu:// 或 /oia/ 的情况
            wc.on('will-redirect', (navEvent, url) => {
                try {
                    if (isBlockedNavUrl(url)) {
                        console.log('[nav] blocked will-redirect:', url)
                        navEvent.preventDefault()
                    }
                } catch (e) { }
            })

            // 拦截所有 frame 的导航（包含 iframe，Electron 22+ 支持）
            try {
                wc.on('will-frame-navigate', (details) => {
                    try {
                        if (isBlockedNavUrl(details.url)) {
                            console.log('[nav] blocked will-frame-navigate:', details.url)
                            details.preventDefault()
                        }
                    } catch (e) { }
                })
            } catch (e) { }

            // 拦截 window.open() 打开自定义协议链接
            try {
                wc.setWindowOpenHandler(({ url }) => {
                    if (isBlockedNavUrl(url)) {
                        console.log('[nav] blocked window.open:', url)
                        return { action: 'deny' }
                    }
                    return { action: 'allow' }
                })
            } catch (e) { }

            // 接管 webview 内的右键菜单。
            // guest 是独立 webContents，渲染进程拿不到它的 contextmenu DOM 事件，
            // 只能由主进程监听并转发；同时拦掉 Chromium 默认的英文菜单。
            try {
                wc.on('context-menu', (ctxEvent, params) => {
                    try {
                        if (ctxEvent && typeof ctxEvent.preventDefault === 'function') ctxEvent.preventDefault()
                    } catch (e) { }
                    try {
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('contextmenu:show', {
                                x: params.x,
                                y: params.y,
                                isEditable: !!params.isEditable,
                                linkURL: params.linkURL || '',
                                selectionText: params.selectionText || '',
                                mediaType: params.mediaType || '',
                                pageURL: params.pageURL || '',
                            })
                        }
                    } catch (e) { }
                })
            } catch (e) { }

        } catch (e) { }
    })

    win.on('closed', () => {
        if (mainWindow === win) {
            mainWindow = null
        }
    })
}

ipcMain.handle('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && !win.isDestroyed()) {
        win.minimize()
    }
})

ipcMain.handle('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && !win.isDestroyed()) {
        if (win.isMaximized()) {
            win.unmaximize()
        } else {
            win.maximize()
        }
    }
})

ipcMain.handle('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && !win.isDestroyed()) {
        win.close()
    }
})

ipcMain.handle('window:quit', () => {
    isQuitting = true
    app.quit()
})

ipcMain.handle('window:open-settings', () => {
    openSettingsPanel()
})

// ── 版本更新（GitHub Releases + electron-updater）──
//
// 更新源来自 package.json 的 build.publish（provider: github, owner, repo），
// electron-updater 会去读 GitHub Release 里的 latest.yml 比对版本。
// 不使用任何自建后端地址。

let autoUpdater = null
let updaterInitError = null

function getAutoUpdater() {
    if (autoUpdater || updaterInitError) return autoUpdater
    try {
        // 延迟 require：dev 环境下未打包时也能安全加载
        const { autoUpdater: u } = require('electron-updater')
        u.autoDownload = false            // 由用户确认后再下载
        u.autoInstallOnAppQuit = true
        u.logger = null
        autoUpdater = u
    } catch (e) {
        updaterInitError = e?.message || String(e)
        console.warn('[updater] 加载 electron-updater 失败:', updaterInitError)
    }
    return autoUpdater
}

/** 返回本地版本信息（纯本地，不联网） */
function getLocalVersionInfo() {
    return {
        currentVersion: app.getVersion(),
        platform: process.platform === 'darwin' ? 'mac' : 'win',
        isDev,
        releasesUrl: 'https://github.com/wangbenchi66/MoYu/releases',
    }
}

/**
 * 检查更新（联网，仅在用户主动点击时调用）。
 * 返回统一结构，便于渲染进程展示：
 *   { ok, hasUpdate, currentVersion, latestVersion, releaseNotes, releasesUrl, error }
 */
async function checkForUpdates() {
    const base = getLocalVersionInfo()
    if (isDev) {
        return { ok: false, hasUpdate: false, ...base, error: '开发环境不支持检查更新' }
    }
    const u = getAutoUpdater()
    if (!u) {
        return { ok: false, hasUpdate: false, ...base, error: '更新组件不可用：' + (updaterInitError || '未知原因') }
    }
    try {
        const r = await u.checkForUpdates()
        const info = r?.updateInfo || {}
        const hasUpdate = !!info.version && info.version !== base.currentVersion
        return {
            ok: true,
            hasUpdate,
            currentVersion: base.currentVersion,
            latestVersion: info.version || base.currentVersion,
            releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : '',
            releasesUrl: base.releasesUrl,
        }
    } catch (e) {
        const msg = e?.message || String(e)
        // GitHub API 有速率限制，未登录时约 60 次/小时，这里给出可读提示
        const friendly = /rate limit|403/i.test(msg)
            ? 'GitHub 访问频率超限，请稍后再试'
            : /net|ENOTFOUND|ETIMEDOUT|ECONNREFUSED/i.test(msg)
                ? '网络不可用，请检查连接'
                : msg
        return { ok: false, hasUpdate: false, ...base, error: friendly }
    }
}

/** 下载更新；进度通过 'update:download-progress' 广播 */
async function downloadUpdate() {
    const u = getAutoUpdater()
    if (!u) return { ok: false, error: '更新组件不可用' }
    try {
        const r = await u.downloadUpdate()
        return { ok: true, files: (r || []).length }
    } catch (e) {
        return { ok: false, error: e?.message || String(e) }
    }
}

/** 退出并安装已下载的更新 */
function installUpdate() {
    const u = getAutoUpdater()
    if (!u) return { ok: false, error: '更新组件不可用' }
    try {
        u.quitAndInstall(false, true)
        return { ok: true }
    } catch (e) {
        return { ok: false, error: e?.message || String(e) }
    }
}

function initUpdaterEvents() {
    const u = getAutoUpdater()
    if (!u) return
    try {
        u.on('download-progress', (p) => {
            for (const w of BrowserWindow.getAllWindows()) {
                try {
                    if (!w.isDestroyed()) {
                        w.webContents.send('update:download-progress', {
                            percent: Math.round(p?.percent || 0),
                            transferred: p?.transferred || 0,
                            total: p?.total || 0,
                            bytesPerSecond: p?.bytesPerSecond || 0,
                        })
                    }
                } catch (e) { }
            }
        })
    } catch (e) { }
}

// ── 旧的自建后端版本检测 IPC 已移除（改为上面的 GitHub 方案）──

ipcMain.handle('update:get-version', () => getLocalVersionInfo())
ipcMain.handle('update:check', () => checkForUpdates())
ipcMain.handle('update:download', () => downloadUpdate())
ipcMain.handle('update:install', () => installUpdate())

// ── 启动时自动检查更新 ──
//
// 行为约定（与用户确认过）：
//   - 不做设置开关，每次启动都检查
//   - 选「稍后再说」→ 本次运行不再提示，下次启动重新检查
//     （所以这里**不持久化**任何"已跳过"标记，重启即重置）
//   - 提示用应用内弹窗，不抢焦点、不弹系统对话框
//
// 为什么要延迟：启动瞬间窗口还在加载（preload 未就绪、Vue 未挂载），
// 此时 send 过去渲染进程收不到。等窗口 ready-to-show / 内容加载完再发。
const STARTUP_UPDATE_CHECK_DELAY_MS = 5000

// 本次运行是否已经提示过（选「稍后」后置 true，避免重复弹）
let _startupUpdateNotified = false

/**
 * 启动后台检查更新，有新版则通知渲染进程弹窗。
 *
 * 这是「尽力而为」的检查：网络失败、GitHub 限流、开发环境等
 * 一律静默忽略 —— 启动流程不该因为检查更新而卡住或被错误打断。
 */
async function checkUpdateOnStartup() {
    if (isDev) return
    if (_startupUpdateNotified) return

    let result
    try {
        result = await checkForUpdates()
    } catch (e) {
        return
    }

    // 只在「确认有新版本」时才提示。
    // ok === false 的情况（网络错误/限流/开发环境）一律静默。
    if (!result || !result.ok || !result.hasUpdate) return

    _startupUpdateNotified = true

    try {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update:available', {
                currentVersion: result.currentVersion,
                latestVersion: result.latestVersion,
                releaseNotes: result.releaseNotes || '',
                releasesUrl: result.releasesUrl || '',
            })
        }
    } catch (e) { }
}

// ── 匿名设备 ID 已随匿名上报功能一起移除 ──

ipcMain.handle('moyu:get-stats', () => getMoyuStats())

ipcMain.handle('moyu:clear-stats', () => {
    if (moyuEndTimer) { clearTimeout(moyuEndTimer); moyuEndTimer = null }
    store.set('moyuSessions', {})
    moyuStart = null
    return true
})

ipcMain.handle('settings:get', () => currentSettings)

// 主题：返回设置模式与当前实际生效的深浅色
ipcMain.handle('theme:get', () => ({
    mode: normalizeThemeMode(currentSettings?.themeMode),
    effective: effectiveTheme(),
}))

ipcMain.handle('settings:update', (_, partial) => {    //输出设置变更日志，帮助排查设置更新流程
    //console.log('[ipc] settings:update', { partial })
    currentSettings = normalizeSettings({
        ...currentSettings,
        ...partial,
    })

    saveSettings()
    registerGlobalShortcuts()
    refreshAutoHideMonitor()
    // 主题可能变化：同步 nativeTheme 并广播
    applyThemeSource()

    if (mainWindow && !mainWindow.isDestroyed()) {
        applyWindowSettings(mainWindow)
    }

    broadcastSettings()
    refreshTrayMenu()
    return currentSettings
})

app.whenReady().then(() => {
    loadSettings()

    // 系统深浅色变化时通知渲染进程（仅在 themeMode = 'system' 时视觉上会变，
    // 但effective 值始终广播，便于渲染进程保持状态一致）
    try {
        nativeTheme.on('updated', () => { broadcastTheme() })
    } catch (e) { }

    createWindow()
    createTray()
    registerGlobalShortcuts()
    refreshAutoHideMonitor()
    // 注册更新下载进度等事件（不触发联网，仅挂监听）
    initUpdaterEvents()

    // 启动后延迟一段时间再检查更新：等窗口加载完，渲染进程才收得到 'update:available'。
    // 失败一律静默（见 checkUpdateOnStartup 的注释）。
    setTimeout(() => { checkUpdateOnStartup() }, STARTUP_UPDATE_CHECK_DELAY_MS)

    app.on('activate', () => {
        // macOS 点击 Dock 图标时：有隐藏窗口则显示，没有则新建
        const existing = BrowserWindow.getAllWindows()
        if (existing.length > 0) {
            const win = existing[0]
            if (win.isMinimized()) win.restore()
            if (!win.isVisible()) win.show()
            win.focus()
        } else {
            createWindow()
        }
    })
})

/**
 * 清理 webview 的浏览数据（缓存 / Cookie / 本地存储 / IndexedDB 等）。
 * 只在设置开启时于退出阶段调用。属于强隐私选项——会清掉所有网站的登录态。
 * 返回: Promise<boolean> 是否成功
 */
async function clearAllWebviewData() {
    const storages = [
        'cookies',
        'filesystem',
        'indexdb',
        'localstorage',
        'shadercache',
        'websql',
        'serviceworkers',
        'cachestorage',
    ]
    try {
        // webview 默认使用 default session（项目未配置 partition）
        await session.defaultSession.clearStorageData({ storages })
        await session.defaultSession.clearCache()
        console.log('[privacy] webview 浏览数据已清理')
        return true
    } catch (e) {
        console.warn('[privacy] 清理 webview 数据失败:', e)
        return false
    }
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

let _privacyCleanupDone = false

app.on('will-quit', (event) => {
    isQuitting = true

    // 退出时清理 webview 浏览数据：这是异步操作，必须先拦住退出，清理完再放行。
    // 用 _privacyCleanupDone 防止二次进入造成死循环。
    if (currentSettings.clearCacheOnExit && !_privacyCleanupDone) {
        _privacyCleanupDone = true
        event.preventDefault()
        clearAllWebviewData().finally(() => {
            endMoyuNow()
            stopAutoHideMonitor()
            globalShortcut.unregisterAll()
            app.quit()
        })
        return
    }

    endMoyuNow()
    stopAutoHideMonitor()
    globalShortcut.unregisterAll()
})

// OS 关机或进程被要求终止时，确保 closeToTray 不阻止退出
app.on('before-quit', () => {
    isQuitting = true
})

app.on('session-end', () => {
    isQuitting = true
    app.quit()
})
