const STORAGE_KEY = 'glass_reader_site_rules'

import { matchesRule } from './matchRule.js'

let rules = []
let _loaded = false

// 从 src/rules/scripts 文件夹加载静态站点规则（由开发者以文件形式提供）
// 每个模块应导出默认对象：{ pattern, matchType, enabled, preventBlankTargets, removeImages, customCss, customJs }
// 也支持导出默认函数（返回规则对象）或直接导出对象。
// 静态规则分为两类：默认全局规则（来自 rule/default.js）与站点规则（其它文件）
let staticDefaults = []
let staticSiteRules = []
try {
    // 使用 Vite 的 import.meta.glob({ eager: true }) 在构建时加载规则模块
    const modules = import.meta.glob('./scripts/*.js', { eager: true });
    for (const key in modules) {
        const mod = modules[key];
        const name = key.split('/').pop().replace('.js', '');
        const isDefaultFile = name === 'default' || /\/default\.js$/.test(key);
        const base = {
            id: `static:${name}`,
            pattern: name,
            matchType: 'hostname',
            enabled: true,
            preventBlankTargets: true,
            removeImages: false,
            customCss: '',
            customJs: '',
        };

        if (!mod) continue;

        // 优先处理 default 导出
        if (mod.default) {
            if (typeof mod.default === 'function') {
                // 模块直接导出一个函数：视为 apply(helper)
                // 但也可能存在命名导出的 pattern / patterns / match，优先使用显式导出
                const p = mod.default.pattern ?? mod.pattern ?? mod.patterns ?? base.pattern;
                const ruleObj = Object.assign({}, base, { pattern: p, apply: mod.default });
                if (typeof mod.match === 'function') ruleObj.match = mod.match;
                if (isDefaultFile) ruleObj.isDefault = true;
                if (isDefaultFile) staticDefaults.push(ruleObj); else staticSiteRules.push(ruleObj);
                continue;
            }

            if (typeof mod.default === 'object') {
                const ruleObj = Object.assign({}, base, mod.default);
                // 如果对象内有 main 方法，将其视作 apply
                if (typeof ruleObj.apply !== 'function' && typeof ruleObj.main === 'function') ruleObj.apply = ruleObj.main;
                // 若模块同时存在命名导出的 pattern/patterns，且 default 未定义，则合并
                if ((!ruleObj.pattern || ruleObj.pattern === base.pattern) && mod.pattern) ruleObj.pattern = mod.pattern;
                if ((!ruleObj.pattern || ruleObj.pattern === base.pattern) && mod.patterns) ruleObj.pattern = mod.patterns;
                if (typeof mod.match === 'function' && typeof ruleObj.match !== 'function') ruleObj.match = mod.match;
                if (isDefaultFile) ruleObj.isDefault = true;
                if (isDefaultFile) staticDefaults.push(ruleObj); else staticSiteRules.push(ruleObj);
                continue;
            }
        }

        // 处理命名导出：支持 export function apply(...) / export function main(...)
        const named = Object.assign({}, base);
        let has = false;
        if (typeof mod.apply === 'function') { named.apply = mod.apply; has = true; }
        if (!named.apply && typeof mod.main === 'function') { named.apply = mod.main; has = true; }
        if (typeof mod.pattern === 'string' || Array.isArray(mod.pattern) || mod.pattern instanceof RegExp) { named.pattern = mod.pattern; }
        if (!named.pattern && Array.isArray(mod.patterns)) { named.pattern = mod.patterns; }
        if (typeof mod.match === 'function') { named.match = mod.match; has = true; }
        if (typeof mod.customCss === 'string') { named.customCss = mod.customCss; has = true; }
        if (typeof mod.customJs === 'string') { named.customJs = mod.customJs; has = true; }
        if (has || named.pattern !== base.pattern || named.apply) {
            if (isDefaultFile) {
                named.isDefault = true;
                staticDefaults.push(named);
            } else {
                staticSiteRules.push(named);
            }
        }
    }
} catch (e) {
    // ignore if import.meta.glob 不可用 或 在非 vite 环境下出错
    staticDefaults = [];
    staticSiteRules = [];
}

/**
 * 从 localStorage 加载用户持久化的站点规则
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
 * 将当前规则写入 localStorage 持久化
 */
function persistRules() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
    } catch (e) {
        // ignore
    }
}

/**
 * 返回合并后的规则列表（静态默认 -> 静态站点 -> 用户规则）
 */
function getRules() {
    loadRules()
    // 合并静态默认规则 -> 静态站点规则 -> 用户持久化规则（用户规则优先级最高）
    return staticDefaults.concat(staticSiteRules).concat(rules).slice()
}

/**
 * 根据 URL 返回匹配的规则集合（包含静态与用户规则）
 * 参数: rawUrl - 要匹配的 URL
 */
function getRulesForUrl(rawUrl) {
    loadRules()
    try {
        // 优先返回：静态默认规则（对所有 URL 生效） -> 静态站点规则（按 pattern 匹配） -> 用户持久化规则（按 pattern 匹配）
        const combined = staticDefaults.concat(staticSiteRules).concat(rules)
        return combined.filter(r => {
            if (!(r.enabled ?? true)) return false
            if (r.isDefault) return true
            return matchesRule(r, rawUrl)
        })
    } catch (e) {
        return []
    }
}

/**
 * 添加一条用户规则并持久化
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
        // 行为选项
        preventBlankTargets: true,
        removeImages: false,
        customCss: '',
        customJs: ''
    }, partial || {})
    rules.push(rule)
    persistRules()
    return rule
}

/**
 * 编辑指定的用户规则并持久化
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
 * 删除指定的用户规则并持久化
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

// 自动在模块加载时读取一次
loadRules()

export { addRule, editRule, getRules, getRulesForUrl, loadRules, persistRules, removeRule }

