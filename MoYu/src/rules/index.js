const STORAGE_KEY = 'glass_reader_site_rules'

import { matchesRule } from './matchRule.js'

let rules = []
let _loaded = false

// 从 src/rules/scripts 文件夹加载静态站点规则（由开发者以文件形式提供）
// 每个模块应导出默认对象：{ pattern, matchType, enabled, preventBlankTargets, removeImages, customCss, customJs }
// 也支持导出默认函数（返回规则对象）或直接导出对象。
// 静态规则分为两类：默认全局规则（来自 rule/default.js）与站点规则（其它文件）
// 内置油猴脚本：把 .user.js（或 .js）放进 src/rules/userscripts/ 即可自动注册。
// 构建时由 Vite 静态收集（?raw 读原始文本），运行时不需要为每个脚本写 wrapper，
// 统一交给 convertUserscriptToRule 去解析 @name / @description / @match / 正文。
//
// 用 *.js 而不是 *.user.js：有些脚本下载下来就叫 xxx.js，
// 是否真的是油猴脚本由 isUserscript 判断（必须有 ==UserScript== 元数据块），
// 普通 .js 会被 convertUserscriptToRule 拒绝并跳过，不会误加载。
const builtinUserScriptModules = import.meta.glob('./userscripts/*.js', {
    eager: true,
    query: '?raw',
    import: 'default',
});

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

// ─── 自动注册「内置油猴脚本」───
//
// 约定：src/rules/userscripts/*.user.js 里的脚本无需任何 wrapper，
// 构建后自动变成一条内置规则（默认启用，可在规则页停用）。
//
// 单个脚本解析失败（缺 @match、正文为空等）只跳过它自己，不影响其它脚本，
// 也不影响 scripts/*.js 里手写的规则。
try {
    for (const [path, raw] of Object.entries(builtinUserScriptModules || {})) {
        try {
            const fileName = String(path).split('/').pop().replace(/\.user\.js$/i, '')
            const res = convertUserscriptToRule(String(raw || ''))
            if (!res || !res.ok || !res.rule) continue

            const rule = res.rule
            // id 用文件名推导，跨版本稳定（禁用列表按 id 记录）
            rule.id = `builtin-userscript:${fileName}`
            rule.builtin = true
            rule.enabled = true
            staticSiteRules.push(rule)
        } catch (e) {
            // 单个脚本出错不影响其它
        }
    }
} catch (e) {
    // ignore
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

// ─── 内置规则的启用状态 ───
//
// 内置规则（scripts/*.js 和 userscripts/*.user.js）是代码的一部分，模块里的
// `enabled` 只是默认值 —— 每次构建都会重新生成，直接改它不会持久化。
//
// 所以另存一份「被用户关闭的内置规则 id」列表。id 形如：
//   static:weread.qq.com                 ← scripts/weread.qq.com.js
//   builtin-userscript:某站点净化         ← userscripts/某站点净化.user.js
//
// 存「禁用列表」而不是存全部状态：将来新增内置规则时默认就是启用，不用迁移。
const DISABLED_BUILTIN_KEY = 'glass_reader_disabled_builtin_rules'

let _disabledBuiltin = null

function loadDisabledBuiltin() {
    if (_disabledBuiltin) return _disabledBuiltin
    try {
        const raw = localStorage.getItem(DISABLED_BUILTIN_KEY)
        const parsed = raw ? JSON.parse(raw) : []
        _disabledBuiltin = new Set(Array.isArray(parsed) ? parsed : [])
    } catch (e) {
        _disabledBuiltin = new Set()
    }
    return _disabledBuiltin
}

function persistDisabledBuiltin() {
    try {
        localStorage.setItem(
            DISABLED_BUILTIN_KEY,
            JSON.stringify(Array.from(loadDisabledBuiltin())),
        )
    } catch (e) {
        // ignore
    }
}

/**
 * 设置某条内置规则的启用状态
 * 参数: id - 内置规则 id（static:xxx 或 builtin-userscript:xxx）
 *       enabled - true 启用 / false 停用
 */
function setBuiltinRuleEnabled(id, enabled) {
    if (!id) return
    const set = loadDisabledBuiltin()
    if (enabled) set.delete(id)
    else set.add(id)
    persistDisabledBuiltin()
}

/** 判断某条内置规则当前是否启用 */
function isBuiltinRuleEnabled(id) {
    if (!id) return true
    return !loadDisabledBuiltin().has(id)
}

/** 给内置规则套上当前的启用状态，并标记 builtin 供 UI 区分 */
function withBuiltinState(rule) {
    return Object.assign({}, rule, {
        enabled: isBuiltinRuleEnabled(rule.id),
        builtin: true,
    })
}

/**
 * 返回合并后的规则列表（静态默认 -> 静态站点 -> 用户规则）
 * 内置规则会带上当前的启用状态（来自禁用列表），用户规则原样返回。
 */
function getRules() {
    loadRules()
    // 合并静态默认规则 -> 静态站点规则 -> 用户持久化规则（用户规则优先级最高）
    const builtin = staticDefaults.concat(staticSiteRules).map(withBuiltinState)
    return builtin.concat(rules).slice()
}

/**
 * 根据 URL 返回匹配的规则集合（包含静态与用户规则）
 * 参数: rawUrl - 要匹配的 URL
 */
function getRulesForUrl(rawUrl) {
    loadRules()
    try {
        // 优先返回：静态默认规则（对所有 URL 生效） -> 静态站点规则（按 pattern 匹配） -> 用户持久化规则（按 pattern 匹配）
        const combined = staticDefaults
            .concat(staticSiteRules)
            .map(withBuiltinState)
            .concat(rules)
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

// ─── 导入 / 导出 ───

const EXPORT_FORMAT = 'moyu-site-rules'
const EXPORT_VERSION = 1

/**
 * 将用户规则导出为可分享的 JSON 对象。
 * 只导出用户规则（localStorage 中的），不含内置的静态规则。
 * 导出的 id 会被剔除 —— id 是本机生成的，导入方会重新分配，避免冲突。
 * 参数: options - { ids?: Array } 仅导出指定 id；缺省导出全部
 */
function exportRules(options = {}) {
    loadRules()
    const pick = Array.isArray(options.ids) && options.ids.length
        ? rules.filter(r => options.ids.includes(r.id))
        : rules

    return {
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        count: pick.length,
        rules: pick.map(r => {
            const copy = Object.assign({}, r)
            delete copy.id
            return copy
        }),
    }
}

/**
 * 校验单条待导入规则的结构。
 * 返回: { ok: boolean, reason?: string, rule?: object }
 */
function validateImportedRule(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { ok: false, reason: '不是合法的规则对象' }
    }
    const pattern = raw.pattern
    const patternOk = (typeof pattern === 'string' && pattern.trim() !== '')
        || Array.isArray(pattern)
        || pattern instanceof RegExp
    if (!patternOk) {
        return { ok: false, reason: '缺少有效的 pattern（需为非空字符串或数组）' }
    }
    // 只保留已知字段，避免把任意字段写进 localStorage
    return {
        ok: true,
        rule: {
            pattern,
            matchType: typeof raw.matchType === 'string' ? raw.matchType : 'hostname',
            enabled: raw.enabled !== false,
            preventBlankTargets: raw.preventBlankTargets !== false,
            removeImages: !!raw.removeImages,
            customCss: typeof raw.customCss === 'string' ? raw.customCss : '',
            customJs: typeof raw.customJs === 'string' ? raw.customJs : '',
            name: typeof raw.name === 'string' ? raw.name : '',
            description: typeof raw.description === 'string' ? raw.description : '',
            // 来自油猴脚本的规则：记录来源信息，便于界面区分与展示
            source: raw.source === 'userscript' ? 'userscript' : undefined,
            sourceVersion: typeof raw.sourceVersion === 'string' ? raw.sourceVersion : undefined,
            sourceAuthor: typeof raw.sourceAuthor === 'string' ? raw.sourceAuthor : undefined,
        },
    }
}

/**
 * 从导出对象或规则数组中导入规则。
 * 支持三种输入：本文档的导出格式、裸规则数组、单条规则对象。
 * 参数: payload - 解析后的 JSON 对象
 *        options - { overwrite?: boolean } 同 pattern 冲突时是否覆盖（默认跳过）
 * 返回: { imported: number, skipped: number, errors: string[] }
 */
function importRules(payload, options = {}) {
    loadRules()
    const errors = []
    let list = null

    if (Array.isArray(payload)) {
        list = payload
    } else if (payload && typeof payload === 'object') {
        if (Array.isArray(payload.rules)) {
            list = payload.rules
        } else if (payload.pattern !== undefined) {
            list = [payload]
        }
    }

    if (!list) {
        return { imported: 0, skipped: 0, errors: ['无法识别的文件格式：需要包含 rules 数组'] }
    }

    let imported = 0
    let skipped = 0

    for (let i = 0; i < list.length; i++) {
        const res = validateImportedRule(list[i])
        if (!res.ok) {
            errors.push(`第 ${i + 1} 条：${res.reason}`)
            skipped++
            continue
        }
        const next = res.rule
        const nextKey = Array.isArray(next.pattern) ? next.pattern.join(',') : String(next.pattern)
        const existsIdx = rules.findIndex(r => {
            const k = Array.isArray(r.pattern) ? r.pattern.join(',') : String(r.pattern)
            return k === nextKey
        })

        if (existsIdx !== -1) {
            if (options.overwrite) {
                rules[existsIdx] = Object.assign({}, rules[existsIdx], next)
                imported++
            } else {
                skipped++
            }
            continue
        }

        rules.push(Object.assign({ id: Date.now() + Math.floor(Math.random() * 1000) + i }, next))
        imported++
    }

    if (imported > 0) persistRules()
    return { imported, skipped, errors }
}

/**
 * 生成导出文件的建议文件名，例如 moyu-rules-20260708-1530.json
 */
function buildExportFileName() {
    const d = new Date()
    const p = (n) => String(n).padStart(2, '0')
    return `moyu-rules-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`
}

// ─── 油猴（Tampermonkey）用户脚本导入 ───

/**
 * 判断文本是否为一个用户脚本（含 ==UserScript== 元数据块）。
 * 参数: text - 文件内容
 */
function isUserscript(text) {
    return /\/\/\s*==UserScript==/i.test(String(text || '')) && /\/\/\s*==\/UserScript==/i.test(String(text || ''))
}

/**
 * 解析油猴脚本的元数据块。
 * 识别 @name / @namespace / @version / @description / @author /
 *      @match / @include / @exclude / @run-at / @grant / @icon。
 * 参数: text - 脚本文本
 * 返回: { meta: object, body: string, globals: string[] }
 */
function parseUserscript(text) {
    const src = String(text || '').replace(/\r\n/g, '\n')
    const meta = {}
    const globals = []
    const start = src.search(/\/\/\s*==UserScript==/i)
    const end = src.search(/\/\/\s*==\/UserScript==/i)
    let body = src

    if (start !== -1 && end !== -1 && end > start) {
        const header = src.slice(start, end)
        const lines = header.split('\n')
        for (const line of lines) {
            // 形如： // @name         脚本名称
            const m = /^\s*\/\/\s*@(\S+)\s*(.*)$/.exec(line)
            if (!m) continue
            const key = m[1].toLowerCase()
            const val = m[2].trim()
            if (key === 'match' || key === 'include') {
                if (val) (meta.match = meta.match || []).push(val)
            } else if (key === 'exclude') {
                if (val) (meta.exclude = meta.exclude || []).push(val)
            } else if (key === 'grant') {
                if (val) globals.push(val)
            } else if (['name', 'namespace', 'version', 'description', 'author', 'icon', 'run-at', 'license', 'homepage'].includes(key)) {
                if (val) meta[key] = val
            }
        }
        body = src.slice(end).replace(/^\s*\/\/\s*==\/UserScript==[^\n]*\n?/i, '')
    }

    return { meta, body: body.trim(), globals }
}

/**
 * 把油猴的 @match / @include 模式转换为规则可用的 pattern 列表。
 *
 * 支持的转换：
 *   *://*.example.com/*      →  *.example.com
 *   *://example.com/*        →  example.com
 *   https://a.com/b*         →  a.com        （丢弃路径部分，因为本应用按 hostname 匹配）
 *   /regex/                  →  原样保留（交给 matchType: 'regex'）
 *
 * 说明：本应用的 hostname 匹配已支持 `*` 通配符与子域后缀匹配，
 * 因此多数 @match 可直接降级为 hostname 模式。
 * 参数: patterns - @match/@include 原始数组
 * 返回: { patterns: string[], matchType: string, skipped: string[] }
 */
function convertUserscriptPatterns(patterns) {
    const out = []
    const skipped = []
    let sawRegex = false

    for (const raw of (patterns || [])) {
        const p = String(raw || '').trim()
        if (!p) continue

        // 形如 /^https?:\/\/example\.com\// 的正则写法
        if (p.length > 2 && p.startsWith('/') && p.endsWith('/')) {
            out.push(p)
            sawRegex = true
            continue
        }

        // 形如 *://*.example.com/*
        const m = /^(\*|https?|file|ftp):\/\/([^/]*)(\/.*)?$/i.exec(p)
        if (m) {
            let host = m[2]
            if (!host || host === '*') {
                // 全站匹配（*://*/*）：映射成 '*'。
                // matchRule 的通配符分支会把 '*' 编译成 ^.*$，命中所有 hostname。
                //
                // 早先这里直接跳过，理由是"会命中所有站点，以免误伤"——
                // 但像「屏蔽广告」「自动无缝翻页」这类脚本本来就该全站生效，
                // 跳过等于让它永远不生效。
                if (host === '*') out.push('*')
                else skipped.push(p)
                continue
            }
            // 去掉端口
            host = host.split(':')[0]
            // 去掉开头的 *. （hostname 模式本身已做子域后缀匹配）
            host = host.replace(/^\*\./, '')
            // 去掉末尾的点
            host = host.replace(/\.$/, '')
            if (host) out.push(host)
            else skipped.push(p)
            continue
        }

        // 已经是裸 hostname
        if (/^[a-z0-9.*-]+$/i.test(p)) {
            out.push(p.replace(/^\*\./, ''))
            continue
        }

        skipped.push(p)
    }

    // 去重
    const unique = Array.from(new Set(out))
    return { patterns: unique, matchType: sawRegex && unique.length === 1 ? 'regex' : 'hostname', skipped }
}

/**
 * 将一个油猴脚本转换为本应用的规则对象（不含 id，由调用方分配）。
 * 参数: text - 脚本文本
 * 返回: { ok: boolean, reason?: string, rule?: object, meta?: object, warned?: string[] }
 */
function convertUserscriptToRule(text) {
    if (!isUserscript(text)) {
        return { ok: false, reason: '不是有效的油猴脚本（缺少 ==UserScript== 元数据块）' }
    }
    const { meta, body, globals } = parseUserscript(text)
    const { patterns, matchType, skipped } = convertUserscriptPatterns(meta.match)

    if (!patterns.length) {
        return {
            ok: false,
            reason: '脚本没有可用于本应用的 @match / @include（可能只匹配了所有站点或使用了不支持的写法）',
        }
    }
    if (!body) {
        return { ok: false, reason: '脚本正文为空' }
    }

    const warned = []
    if (skipped.length) warned.push(`已忽略 ${skipped.length} 个无法转换的匹配模式：${skipped.join('、')}`)
    const gmGlobals = (globals || []).filter((g) => /^GM/i.test(g))
    if (gmGlobals.length) {
        warned.push(`脚本依赖 ${gmGlobals.join('、')} 等 API，本应用未提供，相关功能可能不可用`)
    }
    if ((meta['run-at'] || '') && !/document-(idle|end|start)/i.test(meta['run-at'])) {
        warned.push(`@run-at ${meta['run-at']} 不受支持，将按 dom-ready 时机注入`)
    }

    return {
        ok: true,
        meta,
        warned,
        rule: {
            pattern: patterns.length === 1 ? patterns[0] : patterns,
            matchType,
            enabled: true,
            preventBlankTargets: true,
            removeImages: false,
            customCss: '',
            customJs: body,
            name: meta.name || '未命名脚本',
            description: meta.description || '',
            source: 'userscript',
            sourceVersion: meta.version || '',
            sourceAuthor: meta.author || '',
        },
    }
}

/**
 * 批量把脚本文本转换为规则（支持一次导入多个 .user.js）。
 * 参数: texts - 脚本文本数组
 * 返回: { rules: object[], failures: {name, reason}[] }
 */
function convertUserscriptsToRules(texts) {
    const out = []
    const failures = []
    for (const t of (texts || [])) {
        const res = convertUserscriptToRule(t)
        if (res.ok) out.push(res)
        else failures.push({ name: '', reason: res.reason })
    }
    return { rules: out, failures }
}

// 自动在模块加载时读取一次
loadRules()

/**
 * GM API 垫片（注入到 webview 页面上下文）。
 *
 * 为什么需要：油猴脚本里大量调用 GM_getValue / GM_setValue / GM_addStyle 等
 * Tampermonkey 专有接口。本应用没有这些运行时，脚本执行到第一个 GM_ 调用就会
 * 抛 ReferenceError，整个 IIFE 中断 —— 更糟的是，在抛错**之前**已经改过的 DOM
 * 和 CSS 会留在页面上，页面直接崩掉（实测「今日热榜界面简化」会把内容全隐掉）。
 *
 * 所以注入脚本正文前先注入这份垫片，把常用的 GM 接口补齐：
 *   - 存储类：用 localStorage 模拟，加 __moyu_gm__ 前缀避免和站点数据冲突
 *   - 样式类：GM_addStyle 直接插 <style>
 *   - 菜单/通知/新标签：给空实现，保证不会因为缺函数而中断
 *   - GM_xmlhttpRequest：降级为 fetch（同源可用；跨域会被 CORS 拦下并走 onerror，
 *     至少不会中断脚本。真正的跨域代理需要主进程参与，后续再补）
 *
 * 用 window.__moyuGmShim 做幂等守卫，重复注入直接返回。
 */
const GM_SHIM_SOURCE = `(() => {
  try {
    if (window.__moyuGmShim) return true;
    window.__moyuGmShim = true;

    var PREFIX = '__moyu_gm__';

    if (typeof window.GM_getValue !== 'function') {
      window.GM_getValue = function (key, def) {
        try {
          var raw = localStorage.getItem(PREFIX + key);
          return raw === null ? def : JSON.parse(raw);
        } catch (e) { return def; }
      };
    }

    if (typeof window.GM_setValue !== 'function') {
      window.GM_setValue = function (key, val) {
        try { localStorage.setItem(PREFIX + key, JSON.stringify(val)); } catch (e) {}
      };
    }

    if (typeof window.GM_deleteValue !== 'function') {
      window.GM_deleteValue = function (key) {
        try { localStorage.removeItem(PREFIX + key); } catch (e) {}
      };
    }

    if (typeof window.GM_listValues !== 'function') {
      window.GM_listValues = function () {
        var out = [];
        try {
          for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && k.indexOf(PREFIX) === 0) out.push(k.slice(PREFIX.length));
          }
        } catch (e) {}
        return out;
      };
    }

    if (typeof window.GM_addStyle !== 'function') {
      window.GM_addStyle = function (css) {
        try {
          var s = document.createElement('style');
          s.textContent = String(css || '');
          (document.head || document.documentElement).appendChild(s);
          return s;
        } catch (e) { return null; }
      };
    }

    // 本应用没有 Tampermonkey 的菜单栏：注册/注销给空实现，
    // 让脚本能继续执行（很多脚本开头就用返回值做后续判断）。
    if (typeof window.GM_registerMenuCommand !== 'function') {
      window.GM_registerMenuCommand = function () { return 0; };
    }
    if (typeof window.GM_unregisterMenuCommand !== 'function') {
      window.GM_unregisterMenuCommand = function () {};
    }

    if (typeof window.GM_openInTab !== 'function') {
      window.GM_openInTab = function (url) {
        try { window.open(url, '_blank'); } catch (e) {}
        return null;
      };
    }

    if (typeof window.GM_notification !== 'function') {
      window.GM_notification = function () {};
    }

    if (typeof window.GM_log !== 'function') {
      window.GM_log = function () {
        try { console.log.apply(console, arguments); } catch (e) {}
      };
    }

    // 跨域请求：降级为 fetch。
    // 同源请求正常；跨域会被浏览器的 CORS 拦下，回调 onerror，
    // 脚本要么降级处理、要么静默失败，至少不会卡死。
    if (typeof window.GM_xmlhttpRequest !== 'function') {
      window.GM_xmlhttpRequest = function (opts) {
        opts = opts || {};
        var aborted = false;
        try {
          var init = { method: opts.method || 'GET', headers: opts.headers || {} };
          if (opts.data) init.body = opts.data;
          fetch(opts.url, init)
            .then(function (r) {
              return r.text().then(function (t) {
                return { status: r.status, responseText: t, finalUrl: r.url, readyState: 4 };
              });
            })
            .then(function (res) {
              if (!aborted && typeof opts.onload === 'function') opts.onload(res);
            })
            .catch(function (e) {
              if (!aborted && typeof opts.onerror === 'function') opts.onerror(e);
            });
        } catch (e) {
          if (typeof opts.onerror === 'function') opts.onerror(e);
        }
        return { abort: function () { aborted = true; } };
      };
    }

    if (typeof window.unsafeWindow === 'undefined') window.unsafeWindow = window;
  } catch (e) {}
  return true;
})();`

export {
    addRule, editRule, getRules, getRulesForUrl, loadRules, persistRules, removeRule,
    setBuiltinRuleEnabled, isBuiltinRuleEnabled,
    exportRules, importRules, validateImportedRule, buildExportFileName,
    isUserscript, parseUserscript, convertUserscriptPatterns,
    convertUserscriptToRule, convertUserscriptsToRules,
    GM_SHIM_SOURCE,
}

