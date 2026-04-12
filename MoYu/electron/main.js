import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, nativeTheme, screen, shell, Tray } from 'electron'
import Store from 'electron-store'
import fs from 'node:fs'
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

// 窗口尺寸持久化（使用 electron-store）
const store = new Store()
const DEFAULT_WIDTH = 820
const DEFAULT_HEIGHT = 860
const MIN_SAFE_WIDTH = 360
const MIN_SAFE_HEIGHT = 240

function getSettingsFilePath() {
    return path.join(app.getPath('userData'), 'glass-reader-settings.json')
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value))
}

function normalizeColor(color) {
    const DEFAULT_HEADER_TINT = '#f5f5f7'
    if (typeof color !== 'string') {
        return DEFAULT_HEADER_TINT
    }

    return /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_HEADER_TINT
}

function normalizeReaderColor(color) {
    if (typeof color !== 'string') {
        return defaultSettings.readerTextColor
    }

    return /^#[0-9a-fA-F]{6}$/.test(color) ? color : defaultSettings.readerTextColor
}

function normalizeSettings(partial = {}) {
    return {
        ...defaultSettings,
        ...partial,
        transparency: clamp(Number(partial.transparency ?? defaultSettings.transparency), 0, 85),
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

function loadSettings() {
    try {
        // 读取持久化设置，但仅保留快捷键相关项，其他全部使用默认值。
        // 这样每次启动时除了快捷键外其他设置都回到默认。
        const raw = fs.readFileSync(getSettingsFilePath(), 'utf-8')
        const parsed = JSON.parse(raw || '{}')

        const preservedShortcuts = {
            bossKey: parsed.bossKey ?? defaultSettings.bossKey,
            decreaseTransparencyShortcut: parsed.decreaseTransparencyShortcut ?? defaultSettings.decreaseTransparencyShortcut,
            increaseTransparencyShortcut: parsed.increaseTransparencyShortcut ?? defaultSettings.increaseTransparencyShortcut,
            clickThroughShortcut: parsed.clickThroughShortcut ?? defaultSettings.clickThroughShortcut,
            autoToggleShortcut: parsed.autoToggleShortcut ?? defaultSettings.autoToggleShortcut,
            autoSpeedDownShortcut: parsed.autoSpeedDownShortcut ?? defaultSettings.autoSpeedDownShortcut,
            autoSpeedUpShortcut: parsed.autoSpeedUpShortcut ?? defaultSettings.autoSpeedUpShortcut,
        }

        currentSettings = normalizeSettings({
            ...defaultSettings,
            ...preservedShortcuts,
        })
    } catch {
        currentSettings = { ...defaultSettings }
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

function saveSettings() {
    try {
        fs.writeFileSync(getSettingsFilePath(), JSON.stringify(currentSettings, null, 2), 'utf-8')
    } catch (error) {
        console.warn('[settings] save failed:', error)
    }
}

function broadcastSettings() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('settings:changed', currentSettings)
    }
}

function rememberWindowBounds() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        return
    }

    lastVisibleBounds = mainWindow.getBounds()
}

function isPointInsideBounds(point, bounds, margin = 0) {
    return point.x >= bounds.x - margin
        && point.x <= bounds.x + bounds.width + margin
        && point.y >= bounds.y - margin
        && point.y <= bounds.y + bounds.height + margin
}

function hideMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) {
        return
    }

    rememberWindowBounds()
    mainWindow.hide()
    refreshTrayMenu()
}

function showMainWindow(focus = true) {
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

    refreshTrayMenu()
}

function stopAutoHideMonitor() {
    if (autoHideMonitor) {
        clearInterval(autoHideMonitor)
        autoHideMonitor = null
    }
}

function refreshAutoHideMonitor() {
    stopAutoHideMonitor()

    if (!currentSettings.autoHide) {
        return
    }

    autoHideMonitor = setInterval(() => {
        if (!mainWindow || mainWindow.isDestroyed()) {
            return
        }

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
            showMainWindow(false)
        }
    }, 180)
}

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

function toggleMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        return
    }

    if (mainWindow.isVisible()) {
        hideMainWindow()
        return
    }

    showMainWindow(true)
}

function getWindowUrl(hash = '/') {
    const normalizedHash = hash.startsWith('/') ? hash : `/${hash}`
    if (isDev && isDevServerRun) {
        return `http://127.0.0.1:5173/#${normalizedHash}`
    }

    const indexPath = path.join(__dirname, '../dist/index.html')
    return `file://${indexPath.replace(/\\/g, '/')}#${normalizedHash}`
}

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

    const buildMenu = () => Menu.buildFromTemplate([
        {
            label: mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() ? '隐藏主窗口' : '显示主窗口',
            click: () => toggleMainWindow(),
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
    ])

    tray.setContextMenu(buildMenu())
    tray.on('double-click', () => toggleMainWindow())
}

function refreshTrayMenu() {
    if (!tray) {
        return
    }

    tray.setContextMenu(Menu.buildFromTemplate([
        {
            label: mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() ? '隐藏主窗口' : '显示主窗口',
            click: () => toggleMainWindow(),
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
    ]))
}

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

function registerGlobalShortcuts() {
    globalShortcut.unregisterAll()

    const registrations = [
        [currentSettings.bossKey, () => toggleMainWindow()],
        [currentSettings.decreaseTransparencyShortcut, () => updateTransparency(currentSettings.transparency - 8)],
        [currentSettings.increaseTransparencyShortcut, () => updateTransparency(currentSettings.transparency + 8)],
        [currentSettings.clickThroughShortcut, () => {
            currentSettings = normalizeSettings({
                ...currentSettings,
                clickThroughMode: !currentSettings.clickThroughMode,
            })
            saveSettings()
            if (mainWindow && !mainWindow.isDestroyed()) {
                applyWindowSettings(mainWindow)
            }
            broadcastSettings()
        }],
        // 自动滚动控制（通过修改 currentSettings 并广播，使渲染进程同步状态）
        [currentSettings.autoToggleShortcut, () => {
            try {
                currentSettings = normalizeSettings({ ...currentSettings, autoScrollEnabled: !currentSettings.autoScrollEnabled })
                saveSettings()
                broadcastSettings()
            } catch (e) { console.warn('[shortcut] autoToggle handler failed', e) }
        }],
        [currentSettings.autoSpeedDownShortcut, () => {
            try {
                const next = Math.max(5, Number(currentSettings.autoScrollSpeed || defaultSettings.autoScrollSpeed) - 5)
                currentSettings = normalizeSettings({ ...currentSettings, autoScrollSpeed: next })
                // 开启自动滚动以便立即生效
                currentSettings.autoScrollEnabled = true
                saveSettings()
                broadcastSettings()
            } catch (e) { console.warn('[shortcut] autoSpeedDown handler failed', e) }
        }],
        [currentSettings.autoSpeedUpShortcut, () => {
            try {
                const next = Math.min(80, Number(currentSettings.autoScrollSpeed || defaultSettings.autoScrollSpeed) + 5)
                currentSettings = normalizeSettings({ ...currentSettings, autoScrollSpeed: next })
                currentSettings.autoScrollEnabled = true
                saveSettings()
                broadcastSettings()
            } catch (e) { console.warn('[shortcut] autoSpeedUp handler failed', e) }
        }],
    ]

    registrations.forEach(([accelerator, handler]) => {
        if (!accelerator) {
            return
        }

        try {
            globalShortcut.register(accelerator, handler)
        } catch (error) {
            console.warn(`[shortcut] register failed for ${accelerator}:`, error)
        }
    })
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
        minHeight: 280,
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
    })

    win.on('blur', () => {
        if (currentSettings.autoHide) {
            hideMainWindow()
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
    isQuitting = true
    stopAutoHideMonitor()
    globalShortcut.unregisterAll()
})
