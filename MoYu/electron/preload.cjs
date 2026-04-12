const path = require('path')
const { pathToFileURL } = require('url')

    ; (async () => {
        try {
            const esm = pathToFileURL(path.join(__dirname, 'preload.js')).href
            await import(esm)
        } catch (err) {
            // 如果动态导入失败，提供一个最小的降级实现以避免渲染器报错
            try {
                const { contextBridge, ipcRenderer } = require('electron')
                contextBridge.exposeInMainWorld('desktop', {
                    platform: process.platform,
                    log: (m) => ipcRenderer.send('renderer:log', m),
                    getSettings: () => ipcRenderer.invoke('settings:get'),
                    updateSettings: (s) => ipcRenderer.invoke('settings:update', s),
                    setTransparency: (p) => ipcRenderer.invoke('settings:set-transparency', p),
                    onSettingsChanged: (cb) => {
                        const h = (_, s) => cb(s)
                        ipcRenderer.on('settings:changed', h)
                        return () => ipcRenderer.removeListener('settings:changed', h)
                    },
                    onOpenSettingsRequest: (cb) => {
                        const h = () => cb()
                        ipcRenderer.on('ui:open-settings', h)
                        return () => ipcRenderer.removeListener('ui:open-settings', h)
                    },
                    setIgnoreMouseEvents: (ignore) => ipcRenderer.invoke('ui:set-ignore-mouse-events', !!ignore),
                    // 在外部浏览器中打开链接
                    openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
                })

                try {
                    ipcRenderer.send('preload:loaded', { url: typeof window !== 'undefined' ? window.location.href : null, time: Date.now() })
                } catch (e) { }
            } catch (e) {
                // 最后兜底：无操作
                // console.warn('preload shim fallback failed', e)
            }
        }
    })()
