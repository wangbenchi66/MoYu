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
    // 将 renderer 的调试日志转发到主进程，方便在主进程终端查看
    log: (msg) => ipcRenderer.send('renderer:log', msg),
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
    // 在外部浏览器中打开链接
    openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
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
