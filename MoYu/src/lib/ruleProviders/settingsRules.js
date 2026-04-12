const STORAGE_KEY = 'glass_reader_settings_rules'

let rules = []
let _loaded = false

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

function persistRules() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
    } catch (e) {
        // ignore
    }
}

function getRules() {
    loadRules()
    return rules.slice()
}

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

function getRulesForUrl(rawUrl) {
    loadRules()
    try {
        return rules.filter(r => (r.enabled ?? true) && matchesRule(r, rawUrl))
    } catch (e) {
        return []
    }
}

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

function editRule(id, partial) {
    loadRules()
    const idx = rules.findIndex(r => r.id === id)
    if (idx === -1) return null
    rules[idx] = Object.assign({}, rules[idx], partial || {})
    persistRules()
    return rules[idx]
}

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

