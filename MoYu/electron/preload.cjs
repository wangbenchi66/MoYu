// electron/preload.cjs — 预加载入口（同步注入，绝不延迟）
//
// ⚠️ 为什么不能用 `await import('./preload.js')`：
//
// 这个文件是 webPreferences.preload 的真实入口。旧实现是：
//     ;(async () => { await import(esm) })()
// 把 ESM 版 preload 的加载放进了 async 立即执行函数。
//
// 后果（实测数据）：
//   DOMContentLoaded : t=...203039   window.desktop === undefined
//   desktop-appeared : t=...204049   ← 晚了整整 1010ms
//
// preload 里的异步操作**不会阻塞页面脚本执行**。页面脚本（Vue 入口）先跑，
// 它在模块顶层求值 `const desktopApi = window.desktop`，这时还是 undefined，
// 于是 desktopApi 被永久固化成 null —— 之后所有 `desktopApi?.xxx` 全部跳过。
//
// 实际影响（不是 Hypothetical，是真跑出来的）：
//   - onUpdateAvailable 从未注册 → 启动更新提示永远不弹
//   - onOpenSettingsRequest 等同类监听同样可能失效
//   - 是否触发取决于竞态，属于「有时好有时坏」的隐蔽 bug
//
// 正确做法：**在 preload 顶层同步调用 exposeInMainWorld**，让 API 在
// DOMContentLoaded 之前就位。下面直接内联实现，与 preload.js 保持同步。
//
// 维护提示：改这里的 API 列表时，**必须同时改 preload.js**（两者内容要一致）。
// preload.js 保留是为了在支持 ESM preload 的场景下也能用，但**不要**在
// 这个 .cjs 里再走 import 路径。

const { contextBridge, ipcRenderer } = require('electron')

try {
    contextBridge.exposeInMainWorld('desktop', {
        platform: process.platform,

        // 窗口控制
        minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
        maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
        closeWindow: () => ipcRenderer.invoke('window:close'),
        quitWindow: () => ipcRenderer.invoke('window:quit'),
        openSettingsWindow: () => ipcRenderer.invoke('window:open-settings'),

        // 设置
        getSettings: () => ipcRenderer.invoke('settings:get'),
        updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),
        setTransparency: (percent) => ipcRenderer.invoke('settings:set-transparency', percent),
        onSettingsChanged: (callback) => {
            const handler = (_, next) => callback(next)
            ipcRenderer.on('settings:changed', handler)
            return () => ipcRenderer.removeListener('settings:changed', handler)
        },

        // 鼠标穿透
        setIgnoreMouseEvents: (ignore) => ipcRenderer.invoke('ui:set-ignore-mouse-events', !!ignore),

        // 日志
        log: (msg) => ipcRenderer.send('renderer:log', msg),
        logError: (msg, data) => ipcRenderer.send('renderer:log', `[ERROR] ${msg}${data ? ' | ' + JSON.stringify(data) : ''}`),

        // 打开设置（托盘触发）
        onOpenSettingsRequest: (callback) => {
            const handler = () => callback()
            ipcRenderer.on('ui:open-settings', handler)
            return () => ipcRenderer.removeListener('ui:open-settings', handler)
        },

        // 窗口被老板键/托盘唤出（用于一闪提示）
        onWindowRevealed: (callback) => {
            const handler = () => callback()
            ipcRenderer.on('window:revealed', handler)
            return () => ipcRenderer.removeListener('window:revealed', handler)
        },

        // webview 内右键
        onContextMenu: (callback) => {
            const handler = (_, payload) => callback(payload)
            ipcRenderer.on('contextmenu:show', handler)
            return () => ipcRenderer.removeListener('contextmenu:show', handler)
        },

        // 主题
        getTheme: () => ipcRenderer.invoke('theme:get'),
        onThemeChanged: (callback) => {
            const handler = (_, payload) => callback(payload)
            ipcRenderer.on('theme:changed', handler)
            return () => ipcRenderer.removeListener('theme:changed', handler)
        },

        // 外部链接
        openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),

        // 摸鱼统计
        getMoyuStats: () => ipcRenderer.invoke('moyu:get-stats'),
        clearMoyuStats: () => ipcRenderer.invoke('moyu:clear-stats'),

        // 版本更新
        getUpdateVersion: () => ipcRenderer.invoke('update:get-version'),
        checkForUpdate: () => ipcRenderer.invoke('update:check'),
        downloadUpdate: () => ipcRenderer.invoke('update:download'),
        installUpdate: () => ipcRenderer.invoke('update:install'),
        onUpdateProgress: (callback) => {
            const handler = (_, payload) => callback(payload)
            ipcRenderer.on('update:download-progress', handler)
            return () => ipcRenderer.removeListener('update:download-progress', handler)
        },
        onUpdateAvailable: (callback) => {
            const handler = (_, payload) => callback(payload)
            ipcRenderer.on('update:available', handler)
            return () => ipcRenderer.removeListener('update:available', handler)
        },
    })
} catch (e) {
    // exposeInMainWorld 失败（极罕见，如同名键已存在）时不阻断页面加载
}

// 自检信号：便于主进程日志确认 preload 已就绪
try {
    ipcRenderer.send('preload:loaded', {
        url: typeof window !== 'undefined' ? window.location.href : null,
        time: Date.now(),
    })
} catch (e) { }
