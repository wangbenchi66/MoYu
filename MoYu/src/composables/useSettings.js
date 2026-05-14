/**
 * useSettings.js — 设置同步、patch、toggle
 */
import { desktopApi, settings, statusMessage } from './useAppState.js'

let syncTimer = null
let transparencySyncTimer = null

const immediateSyncKeys = new Set([
    'transparency', 'showInTaskbar', 'closeToTray', 'autoHide', 'showTabBar',
    'noImageMode', 'transparentBackground', 'antiScreenshotMode', 'alwaysOnTop',
    'mobileMode', 'hoverHeaderMode', 'pageTransparentMode', 'grayscaleMode',
    'clickThroughMode', 'autoScrollEnabled', 'autoScrollSpeed', 'readerTextColor',
    'forceReaderTextColor', 'forceReaderFont', 'readerFontScale', 'toolbarDocked',
    'toolbarPinned', 'toolbarVisible', 'toolbarDisabled', 'showScrollbars',
    'fullWindowTransparent', 'bossKey', 'decreaseTransparencyShortcut',
    'increaseTransparencyShortcut', 'clickThroughShortcut', 'autoToggleShortcut',
    'autoSpeedDownShortcut', 'autoSpeedUpShortcut',
])

function syncSettingsNow() {
    if (!desktopApi?.updateSettings) return Promise.resolve()
    return desktopApi.updateSettings({ ...settings }).then((nextSettings) => {
        Object.assign(settings, nextSettings)
    }).catch(() => {
        statusMessage.value = '设置同步失败，请重试'
    })
}

function scheduleSettingsSync() {
    window.clearTimeout(syncTimer)
    syncTimer = window.setTimeout(syncSettingsNow, 120)
}

function patchSetting(key, value) {
    if (key === 'transparency') {
        const nextVal = Math.max(0, Math.min(100, Number(value) || 0))
        settings[key] = nextVal
        if (desktopApi?.setTransparency) {
            desktopApi.setTransparency(nextVal).then((nextSettings) => {
                if (nextSettings && typeof nextSettings === 'object') {
                    const { transparency: _t, ...rest } = nextSettings
                    Object.assign(settings, rest)
                }
                window.clearTimeout(transparencySyncTimer)
                transparencySyncTimer = window.setTimeout(() => {
                    if (desktopApi?.updateSettings) {
                        desktopApi.updateSettings({ ...settings }).then((ns) => {
                            if (ns && typeof ns === 'object') {
                                const { transparency: _t2, ...rest2 } = ns
                                Object.assign(settings, rest2)
                            }
                        }).catch(() => { statusMessage.value = '设置同步失败，请重试' })
                    }
                }, 300)
            }).catch(() => { statusMessage.value = '设置同步失败，请重试' })
            return
        }
    } else if (key === 'autoScrollSpeed') {
        settings[key] = Math.max(5, Math.min(80, Number(value) || 5))
    } else if (key === 'readerFontScale') {
        settings[key] = Math.max(80, Math.min(160, Number(value) || 100))
    } else {
        settings[key] = value
    }

    if (key === 'clickThroughMode' && settings[key])
        statusMessage.value = `已开启鼠标穿透，可按 ${settings.clickThroughShortcut} 关闭`
    if (key === 'alwaysOnTop')
        statusMessage.value = settings[key] ? '窗口已置顶' : '窗口已取消置顶'
    if (key === 'closeToTray')
        statusMessage.value = settings[key] ? '关闭主窗口时将最小化到托盘' : '关闭主窗口时将直接退出应用'
    if (key === 'showInTaskbar')
        statusMessage.value = settings[key] ? '已显示任务栏图标' : '已隐藏任务栏图标'
    if (key === 'autoHide') {
        if (settings[key] === 'hover') statusMessage.value = '鼠标移出隐藏，移回显示'
        else if (settings[key]) statusMessage.value = '鼠标移出隐藏，移回不显示（用老板键恢复）'
        else statusMessage.value = '已关闭自动隐藏'
    }
    if (key === 'hoverHeaderMode')
        statusMessage.value = settings[key] ? '标题栏改为悬停显示' : '标题栏常驻显示'
    if (key === 'autoScrollEnabled')
        statusMessage.value = settings[key] ? '自动滚动已开启' : '自动滚动已关闭'
    if (key === 'pageTransparentMode') {
        try { settings.forcePageTransparent = !!settings.pageTransparentMode } catch (e) { }
    }

    if (immediateSyncKeys.has(key)) { syncSettingsNow(); return }
    scheduleSettingsSync()
}

function toggleSetting(key) {
    patchSetting(key, !settings[key])
}

function clearSyncTimers() {
    window.clearTimeout(syncTimer)
    window.clearTimeout(transparencySyncTimer)
}

export { patchSetting, toggleSetting, syncSettingsNow, scheduleSettingsSync, clearSyncTimers }
