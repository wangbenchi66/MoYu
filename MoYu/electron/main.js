import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, nativeTheme, screen, shell, Tray } from 'electron'
import { EventEmitter } from 'events'
import Store from 'electron-store'
import fs from 'node:fs'

// 多 webview tab 时 Electron 内部 guest WebContents 会超出默认 10 个监听器上限
EventEmitter.defaultMaxListeners = 100
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import defaultSettings from '../src/shared/defaultSettings.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = !app.isPackaged
const isDevServerRun = process.env.npm_lifecycle_event === 'dev' || process.env.npm_lifecycle_event === 'dev:electron'
let mainWindow = null
let tray = null
let isQuitting = false
let autoHideMonitor = null
let lastVisibleBounds = null
let currentSettings = { ...defaultSettings }
// 临时置顶计时器（用于 autoHide 自动显示时短暂将窗口置于顶层）
let _tempTopTimer = null
// 老板键主动隐藏标志：为 true 时 autoHide 监控不自动显示窗口
let bossKeyHidden = false

// 不持久化的临时字段（例如窗口透明度、临时 UI 状态等）
const nonPersistentKeys = new Set([
    'transparency',
    'autoHide',
    'transparentBackground',
    'hoverHeaderMode',
    'pageTransparentMode',
    'forcePageTransparent',
    'clickThroughMode',
    'alwaysOnTop',
    'autoScrollEnabled',
])

// 窗口尺寸持久化（使用 electron-store）
const store = new Store()
const DEFAULT_WIDTH = 820
const DEFAULT_HEIGHT = 860
const MIN_SAFE_WIDTH = 360
const MIN_SAFE_HEIGHT = 240

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
        forcePageTransparent: Boolean(partial.forcePageTransparent ?? defaultSettings.forcePageTransparent),
        forceReaderFont: Boolean(partial.forceReaderFont ?? defaultSettings.forceReaderFont),
        toolbarDocked: Boolean(partial.toolbarDocked ?? defaultSettings.toolbarDocked),
        forceReaderTextColor: Boolean(partial.forceReaderTextColor ?? defaultSettings.forceReaderTextColor),
        showScrollbars: Boolean(partial.showScrollbars ?? defaultSettings.showScrollbars),
        grayscaleMode: Boolean(partial.grayscaleMode ?? defaultSettings.grayscaleMode),
        clickThroughMode: Boolean(partial.clickThroughMode ?? defaultSettings.clickThroughMode),
        fullWindowTransparent: Boolean(partial.fullWindowTransparent ?? defaultSettings.fullWindowTransparent),
        closeToTray: Boolean(partial.closeToTray ?? defaultSettings.closeToTray),
        disableWindowShadow: Boolean(partial.disableWindowShadow ?? defaultSettings.disableWindowShadow),
        alwaysOnTop: Boolean(partial.alwaysOnTop ?? defaultSettings.alwaysOnTop),
        autoScrollEnabled: Boolean(partial.autoScrollEnabled ?? defaultSettings.autoScrollEnabled),
        autoScrollSpeed: clamp(Number(partial.autoScrollSpeed ?? defaultSettings.autoScrollSpeed), 5, 80),
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

// 接收来自 renderer 的调试日志，并在主进程终端打印，便于排查滑块事件
ipcMain.on('renderer:log', (event, msg) => {
    try {
        console.log('[renderer->main]', msg)
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
        await shell.openExternal(String(url))
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
        } catch (e) {}
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
 */
function rememberWindowBounds() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        return
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
 * 隐藏主窗口并刷新托盘菜单
 */
function hideMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) {
        return
    }

    rememberWindowBounds()
    mainWindow.hide()
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
        if (!focus && typeof mainWindow.showInactive === 'function') {
            mainWindow.showInactive()
        } else {
            mainWindow.show()
        }
    }

    if (focus) {
        mainWindow.focus()
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
        return
    }

    autoHideMonitor = setInterval(() => {
        if (!mainWindow || mainWindow.isDestroyed()) {
            return
        }

        // 窗口不可见时跳过轮询，节省功耗
        if (!mainWindow.isVisible() && !mainWindow.isMinimized()) return

        const cursorPoint = screen.getCursorScreenPoint()
        const trackedBounds = lastVisibleBounds ?? mainWindow.getBounds()

        if (mainWindow.isVisible()) {
            rememberWindowBounds()

            if (!isPointInsideBounds(cursorPoint, trackedBounds, 12)) {
                hideMainWindow()
            }

            return
        }

        if (isPointInsideBounds(cursorPoint, trackedBounds, 6)) {
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

    // 使用 nativeImage 实例创建托盘，避免路径解析差异
    tray = new Tray(trayImage)
    tray.setToolTip('MoYu')

    tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenuTemplate()))
    tray.on('double-click', () => toggleMainWindow())
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
        if (mainWindow && !mainWindow.isDestroyed()) {
            applyWindowSettings(mainWindow)
        }
        broadcastSettings()
        refreshTrayMenu()
    } catch (e) {
        console.warn('[tray] updateSettingsFromTray failed:', e)
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

    return [
        {
            label: isVisible ? '隐藏主窗口' : '显示主窗口',
            click: () => toggleMainWindow(),
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
                { label: '鼠标移出隐藏窗口', type: 'checkbox', checked: !!currentSettings.autoHide, click: (item) => updateSettingsFromTray({ autoHide: item.checked }) },
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
        if (typeof win.setBackgroundMaterial === 'function') {
            win.setBackgroundMaterial(enabled ? 'acrylic' : 'none')
        }
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
    const win = new BrowserWindow({
        // 在 Windows 上，通过 BrowserWindow.icon 可以控制任务栏/窗口图标。
        // 使用共享默认配置中的 appIconPath（若存在且文件可用）。
        icon: (() => {
            return getIconPath(defaultSettings.appIconPath)
        })(),
        //icon: './public/icon.png',
        width: initialW,
        height: initialH,
        minWidth: 280,
        minHeight: 200,
        frame: false,
        // 创建为透明窗口，页面透明区域将透出桌面（CSS 控制具体显示效果）
        transparent: true,
        hasShadow: false,
        backgroundColor: '#00000000',
        titleBarStyle: 'hidden',
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

    nativeTheme.themeSource = 'system'
    applyWindowSettings(win)

    win.loadURL(getWindowUrl('/'))

    rememberWindowBounds()

    win.on('move', () => {
        rememberWindowBounds()
    })

    win.on('resize', () => {
        rememberWindowBounds()
        try {
            const [w, h] = win.getSize()
            store.set('width', w)
            store.set('height', h)
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
                } catch (e) {}
            })

            // 拦截服务端 302/301 重定向到 zhihu:// 或 /oia/ 的情况
            wc.on('will-redirect', (navEvent, url) => {
                try {
                    if (isBlockedNavUrl(url)) {
                        console.log('[nav] blocked will-redirect:', url)
                        navEvent.preventDefault()
                    }
                } catch (e) {}
            })

            // 拦截所有 frame 的导航（包含 iframe，Electron 22+ 支持）
            try {
                wc.on('will-frame-navigate', (details) => {
                    try {
                        if (isBlockedNavUrl(details.url)) {
                            console.log('[nav] blocked will-frame-navigate:', details.url)
                            details.preventDefault()
                        }
                    } catch (e) {}
                })
            } catch (e) {}

            // 拦截 window.open() 打开自定义协议链接
            try {
                wc.setWindowOpenHandler(({ url }) => {
                    if (isBlockedNavUrl(url)) {
                        console.log('[nav] blocked window.open:', url)
                        return { action: 'deny' }
                    }
                    return { action: 'allow' }
                })
            } catch (e) {}

        } catch (e) {}
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

// ── 版本更新检测 ──

ipcMain.handle('update:check', () => ({
    currentVersion: app.getVersion(),
    platform: process.platform === 'darwin' ? 'mac' : 'win',
    isDev,
}))

ipcMain.handle('moyu:get-stats', () => getMoyuStats())

ipcMain.handle('moyu:clear-stats', () => {
    if (moyuEndTimer) { clearTimeout(moyuEndTimer); moyuEndTimer = null }
    store.set('moyuSessions', {})
    moyuStart = null
    return true
})

ipcMain.handle('settings:get', () => currentSettings)

ipcMain.handle('settings:update', (_, partial) => {
    //输出设置变更日志，帮助排查设置更新流程
    //console.log('[ipc] settings:update', { partial })
    currentSettings = normalizeSettings({
        ...currentSettings,
        ...partial,
    })

    saveSettings()
    registerGlobalShortcuts()
    refreshAutoHideMonitor()

    if (mainWindow && !mainWindow.isDestroyed()) {
        applyWindowSettings(mainWindow)
    }

    broadcastSettings()
    refreshTrayMenu()
    return currentSettings
})

app.whenReady().then(() => {
    loadSettings()

    createWindow()
    createTray()
    registerGlobalShortcuts()
    refreshAutoHideMonitor()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('will-quit', () => {
    endMoyuNow()
    isQuitting = true
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
