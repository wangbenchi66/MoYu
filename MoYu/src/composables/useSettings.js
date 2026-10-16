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
    'fullWindowTransparent', 'shellOnlyTransparent', 'bossKey', 'decreaseTransparencyShortcut',
    'themeMode', 'darkenWebPages',
    'increaseTransparencyShortcut', 'clickThroughShortcut', 'autoToggleShortcut',
    'autoSpeedDownShortcut', 'autoSpeedUpShortcut',
    // 隐私 / 会话：改动需立刻同步到主进程（老板键静音、退出清缓存由主进程执行）
    'restoreTabsOnStartup', 'muteOnBossKey', 'clearCacheOnExit',
    'historyRetentionDays', 'autoCleanOnStartup',
    'keepAudioPlayingInBackground', 'pauseOnBlurHide',
])

/**
 * 同步请求序号：只接受「最后一次」请求的响应。
 *
 * 为什么需要：patchSetting 对 immediateSyncKeys 里的键会**每次都立即同步**，
 * 而像「背景透明三态」那样的操作会连续调用多次（一次改 2~3 个键），
 * 于是并发发出多个 updateSettings 请求。它们返回顺序不保证与发出顺序一致，
 * 而响应处理里是 Object.assign(settings, nextSettings) ——
 * **早发出的旧快照会覆盖刚设好的新值**，表现为「点了没反应、界面闪一下又回去」。
 *
 * 实测复现过：三连调用后最终 pageTransparentMode / fullWindowTransparent
 * 双双被回滚成 false。
 */
let syncSeq = 0

function syncSettingsNow() {
    if (!desktopApi?.updateSettings) return Promise.resolve()
    const seq = ++syncSeq
    const snapshot = { ...settings }
    return desktopApi.updateSettings(snapshot).then((nextSettings) => {
        // 已有更新的请求在路上：丢弃这次响应，避免用旧快照覆盖新值
        if (seq !== syncSeq) return
        if (nextSettings && typeof nextSettings === 'object') {
            // 再兜一层：只回填「本次请求发出后没有被本地改动过」的键，
            // 防止主进程归一化（如 clamp / 白名单）的结果被误当成权威值覆盖新输入
            const stale = new Set()
            for (const k of Object.keys(nextSettings)) {
                if (!(k in settings)) continue
                if (settings[k] !== snapshot[k]) stale.add(k)
            }
            const patch = { ...nextSettings }
            for (const k of stale) delete patch[k]
            Object.assign(settings, patch)
        }
    }).catch(() => {
        if (seq === syncSeq) statusMessage.value = '设置同步失败，请重试'
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
    // 仅外壳透明时不应强制改网页背景，否则「网页保持不透明」的语义会被破坏
    if (key === 'shellOnlyTransparent' && settings[key]) {
        try { settings.forcePageTransparent = false } catch (e) { }
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
