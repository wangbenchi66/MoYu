// electron/preload.js — 预加载脚本：通过 contextBridge 暴露 desktop API（ESM 版本）
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('desktop', {
    platform: process.platform,
    minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
    maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
    closeWindow: () => ipcRenderer.invoke('window:close'),
    quitWindow: () => ipcRenderer.invoke('window:quit'),
    openSettingsWindow: () => ipcRenderer.invoke('window:open-settings'),
    getSettings: () => ipcRenderer.invoke('settings:get'),
    updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),
    setTransparency: (percent) => ipcRenderer.invoke('settings:set-transparency', percent),
    // 临时设置主窗口是否忽略鼠标事件（用于在启用鼠标穿透时恢复设置交互）
    setIgnoreMouseEvents: (ignore) => ipcRenderer.invoke('ui:set-ignore-mouse-events', !!ignore),
    // 将 renderer 的调试日志转发到主进程并写入日志文件
    log: (msg) => ipcRenderer.send('renderer:log', msg),
    logError: (msg, data) => ipcRenderer.send('renderer:log', `[ERROR] ${msg}${data ? ' | ' + JSON.stringify(data) : ''}`),
    onSettingsChanged: (callback) => {
        const handler = (_, settings) => callback(settings)
        ipcRenderer.on('settings:changed', handler)

        return () => {
            ipcRenderer.removeListener('settings:changed', handler)
        }
    },
    onOpenSettingsRequest: (callback) => {
        const handler = () => callback()
        ipcRenderer.on('ui:open-settings', handler)

        return () => {
            ipcRenderer.removeListener('ui:open-settings', handler)
        }
    },
    // 窗口被老板键/托盘唤出：用于短暂高亮，帮助用户在"全透明"状态下找到窗口
    onWindowRevealed: (callback) => {
        const handler = () => callback()
        ipcRenderer.on('window:revealed', handler)

        return () => {
            ipcRenderer.removeListener('window:revealed', handler)
        }
    },
    // webview 内的右键：主进程转发 params，渲染进程自行渲染菜单
    onContextMenu: (callback) => {
        const handler = (_, payload) => callback(payload)
        ipcRenderer.on('contextmenu:show', handler)

        return () => {
            ipcRenderer.removeListener('contextmenu:show', handler)
        }
    },
    // 主题：读取当前生效值，及订阅变化（含系统深浅色切换）
    getTheme: () => ipcRenderer.invoke('theme:get'),
    onThemeChanged: (callback) => {
        const handler = (_, payload) => callback(payload)
        ipcRenderer.on('theme:changed', handler)

        return () => {
            ipcRenderer.removeListener('theme:changed', handler)
        }
    },
    // 在外部浏览器中打开链接
    openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
    // 摸鱼时间统计
    getMoyuStats: () => ipcRenderer.invoke('moyu:get-stats'),
    clearMoyuStats: () => ipcRenderer.invoke('moyu:clear-stats'),
    // 版本更新（GitHub Releases）
    getUpdateVersion: () => ipcRenderer.invoke('update:get-version'),
    checkForUpdate: () => ipcRenderer.invoke('update:check'),
    downloadUpdate: () => ipcRenderer.invoke('update:download'),
    installUpdate: () => ipcRenderer.invoke('update:install'),
    onUpdateProgress: (callback) => {
        const handler = (_, payload) => callback(payload)
        ipcRenderer.on('update:download-progress', handler)

        return () => {
            ipcRenderer.removeListener('update:download-progress', handler)
        }
    },
    // 启动时后台检查到新版本 → 主进程推送，渲染进程弹窗询问「立即更新 / 稍后」
    onUpdateAvailable: (callback) => {
        const handler = (_, payload) => callback(payload)
        ipcRenderer.on('update:available', handler)

        return () => {
            ipcRenderer.removeListener('update:available', handler)
        }
    },
})

// 在 preload 加载时通知主进程，便于确认 preload 是否注入到渲染器
try {
    ipcRenderer.send('preload:loaded', {
        url: typeof window !== 'undefined' ? window.location.href : null,
        time: Date.now(),
    })
} catch (err) {
    // ignore
}
