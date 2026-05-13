const STORAGE_KEY = 'glass_reader_settings_rules'

let rules = []
let _loaded = false

/**
 * 从 localStorage 加载 settings 规则
 */
function loadRules() {
    if (_loaded) return
    _loaded = true
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
            const parsed = JSON.parse(raw)
            if (Array.isArray(parsed)) rules = parsed
        }
    } catch (e) {
        rules = []
    }
}

/**
 * 将 settings 规则持久化到 localStorage
 */
function persistRules() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
    } catch (e) {
        // ignore
    }
}

/**
 * 获取当前的 settings 规则列表
 */
function getRules() {
    loadRules()
    return rules.slice()
}

/**
 * 判断 URL 是否匹配 settings 规则
 * 参数: rule - 规则对象；rawUrl - 待匹配的 URL
 */
function matchesRule(rule, rawUrl) {
    if (!rule || !rule.pattern) return false
    if (!rawUrl) return false

    try {
        const url = new URL(rawUrl)
        const pattern = (rule.pattern || '').trim()
        if (rule.matchType === 'regex') {
            try {
                const re = new RegExp(pattern)
                return re.test(rawUrl) || re.test(url.hostname)
            } catch (e) {
                return false
            }
        }

        if (rule.matchType === 'url') {
            return rawUrl.indexOf(pattern) !== -1
        }

        const p = pattern.replace(/\*/g, '.*')
        try {
            const re = new RegExp(`^${p}$`)
            return re.test(url.hostname) || re.test(rawUrl)
        } catch (e) {
            return url.hostname.indexOf(pattern) !== -1
        }
    } catch (e) {
        return rawUrl.indexOf(rule.pattern || '') !== -1
    }
}

/**
 * 根据 URL 返回匹配的 settings 规则
 * 参数: rawUrl - 待匹配的 URL
 */
function getRulesForUrl(rawUrl) {
    loadRules()
    try {
        return rules.filter(r => (r.enabled ?? true) && matchesRule(r, rawUrl))
    } catch (e) {
        return []
    }
}

/**
 * 添加 settings 规则并持久化
 * 参数: partial - 规则的部分字段
 */
function addRule(partial) {
    loadRules()
    const id = Date.now() + Math.floor(Math.random() * 1000)
    const rule = Object.assign({
        id,
        pattern: '',
        matchType: 'hostname',
        enabled: true,
        // custom settings overrides to merge into runtime settings
        customSettings: {},
    }, partial || {})
    rules.push(rule)
    persistRules()
    return rule
}

/**
 * 编辑 settings 规则并持久化
 * 参数: id - 规则 ID；partial - 更新字段
 */
function editRule(id, partial) {
    loadRules()
    const idx = rules.findIndex(r => r.id === id)
    if (idx === -1) return null
    rules[idx] = Object.assign({}, rules[idx], partial || {})
    persistRules()
    return rules[idx]
}

/**
 * 删除 settings 规则并持久化
 * 参数: id - 规则 ID
 */
function removeRule(id) {
    loadRules()
    const idx = rules.findIndex(r => r.id === id)
    if (idx === -1) return false
    rules.splice(idx, 1)
    persistRules()
    return true
}

loadRules()

export { addRule, editRule, getRules, getRulesForUrl, loadRules, persistRules, removeRule }

