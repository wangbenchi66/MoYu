const STORAGE_KEY = 'glass_reader_toolbar_rules'

import { matchesRule } from '../matchRule.js'

let rules = []
let _loaded = false

/**
 * 从 localStorage 加载 toolbar 规则
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
 * 将 toolbar 规则持久化到 localStorage
 */
function persistRules() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
    } catch (e) {
        // ignore
    }
}

/**
 * 获取当前的 toolbar 规则列表
 */
function getRules() {
    loadRules()
    return rules.slice()
}

/**
 * 根据 URL 返回匹配的 toolbar 规则
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
 * 添加 toolbar 规则并持久化
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
        // toolbar overrides (null 表示不改变)
        toolbarDocked: null,
        toolbarPinned: null,
        toolbarVisible: null,
        toolbarDisabled: null,
        hideHandle: false,
        iconOnly: null,
    }, partial || {})
    rules.push(rule)
    persistRules()
    return rule
}

/**
 * 编辑 toolbar 规则并持久化
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
 * 删除 toolbar 规则并持久化
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

