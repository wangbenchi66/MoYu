/**
 * 地址栏输入 → 可加载 URL 的唯一转换入口。
 *
 * 只放行 http/https 与 about:blank。file: / javascript: / data: 等协议一律不当作
 * 地址，否则地址栏、历史记录或规则里的链接可以把本地文件或脚本塞进 webview。
 * 其余输入按搜索词处理（Bing）。
 *
 * 独立成模块是为了能被 Node 单元测试直接 import（useAppState 依赖 Vue）。
 */
export function normalizeUrl(rawUrl) {
    const trimmed = String(rawUrl || '').trim()
    if (!trimmed) return 'about:blank'
    if (trimmed === 'about:blank') return trimmed

    const scheme = /^([a-zA-Z][a-zA-Z\d+\-.]*):/.exec(trimmed)
    if (scheme) {
        const name = scheme[1].toLowerCase()
        if (name === 'http' || name === 'https') {
            try {
                const parsed = new URL(trimmed)
                if (parsed.hostname) return trimmed
            } catch (e) { }
        }
        return `https://www.bing.com/search?q=${encodeURIComponent(trimmed)}`
    }

    if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(trimmed)) return `http://${trimmed}`
    if (/^[\w-]+(\.[\w-]+)+/.test(trimmed)) return `https://${trimmed}`
    return `https://www.bing.com/search?q=${encodeURIComponent(trimmed)}`
}

export default normalizeUrl
