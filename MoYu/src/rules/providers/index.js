// rules/providers/index.js — 规则聚合层（合并 site / toolbar 规则，提供统一查询）
//
// 历史：这里曾聚合第三个 provider `settingsRules`（按站点覆盖设置），
// 但它的输出从未被消费 —— MainPage 只读 combined.toolbar，
// 而 settingsRules 的 CRUD 也没有任何 UI 入口，属于完整的死路径，已移除。
// 若将来要做「按站点覆盖设置」，需要同时：
//   1. 恢复本文件的 settings 聚合
//   2. 在 MainPage 里应用 combined.settings
//   3. 提供规则编辑 UI
import * as site from '../index.js'
import * as toolbar from './toolbarRules'

/**
 * 获取给定 URL 的合并规则集合（site / toolbar）
 * 参数: url - 要匹配的 URL
 */
function getCombinedRulesForUrl(url) {
    return {
        site: site.getRulesForUrl(url),
        toolbar: toolbar.getRulesForUrl(url),
    }
}

export { getCombinedRulesForUrl, site, toolbar }
export default { toolbar, site, getCombinedRulesForUrl }
