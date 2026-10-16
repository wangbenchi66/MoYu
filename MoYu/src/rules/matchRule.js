/**
 * matchRule.js — 规则 URL 匹配工具
 * 统一的 matchesRule 实现，供 siteRules / settingsRules / toolbarRules 共用。
 * 支持自定义 match 函数、RegExp pattern、数组 pattern、通配符、regex/url/hostname 匹配类型。
 */

function escapeForRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchesRule(rule, rawUrl) {
    if (!rule) return false
    if (!rawUrl) return false

    // 支持自定义匹配函数
    if (typeof rule.match === 'function') {
        try { return !!rule.match(rawUrl) } catch (e) { return false }
    }

    const patternVal = rule.pattern

    // 支持数组 pattern：任一匹配即算匹配
    if (Array.isArray(patternVal)) {
        for (const p of patternVal) {
            try {
                // 数组内允许混入 "/正则/" 形式的字符串：这类条目应走 regex 判定，
                // 否则会被当成字面 hostname，永远不会命中（静默失效）。
                const isSlashRegex = typeof p === 'string' && p.length > 2 && p.startsWith('/') && p.endsWith('/')
                const override = isSlashRegex ? { pattern: p, matchType: 'regex' } : { pattern: p }
                if (matchesRule(Object.assign({}, rule, override), rawUrl)) return true
            } catch (e) { }
        }
        return false
    }

    // 支持 RegExp 直接作为 pattern
    if (patternVal instanceof RegExp) {
        try {
            const u = new URL(rawUrl)
            return patternVal.test(rawUrl) || patternVal.test((u.hostname || '').toLowerCase())
        } catch (e) {
            return patternVal.test(rawUrl)
        }
    }

    if (!patternVal && patternVal !== 0) return false
    const pattern = String(patternVal).trim()
    const matchType = rule.matchType || 'hostname'

    try {
        const url = new URL(rawUrl)
        const hostname = (url.hostname || '').toLowerCase()
        const raw = rawUrl || ''

        if (matchType === 'regex') {
            try { return new RegExp(pattern).test(raw) || new RegExp(pattern).test(hostname) } catch (e) { return false }
        }

        if (matchType === 'url') {
            try { return raw.toLowerCase().indexOf(pattern.toLowerCase()) !== -1 } catch (e) { return false }
        }

        // hostname 或默认：支持通配符
        if (pattern.indexOf('*') !== -1) {
            const parts = pattern.split('*').map(p => escapeForRegex(p)).join('.*')
            try { return new RegExp(`^${parts}$`, 'i').test(hostname) } catch (e) {
                return hostname.indexOf(pattern.replace('*', '')) !== -1
            }
        }

        const esc = escapeForRegex(pattern)
        try { return new RegExp(`(^|\\.)${esc}$`, 'i').test(hostname) } catch (e) {
            return hostname === pattern.toLowerCase() || hostname.indexOf(pattern.toLowerCase()) !== -1
        }
    } catch (e) {
        try { return (rawUrl || '').toLowerCase().indexOf(pattern.toLowerCase()) !== -1 } catch (err) { return false }
    }
}

export { matchesRule }
