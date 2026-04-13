import * as site from '../siteRules'
import * as settings from './settingsRules'
import * as toolbar from './toolbarRules'

/**
 * 获取给定 URL 的合并规则集合（site / toolbar / settings）
 * 参数: url - 要匹配的 URL
 */
function getCombinedRulesForUrl(url) {
    return {
        site: site.getRulesForUrl(url),
        toolbar: toolbar.getRulesForUrl(url),
        settings: settings.getRulesForUrl(url),
    }
}

export { getCombinedRulesForUrl, settings, site, toolbar }
export default { toolbar, settings, site, getCombinedRulesForUrl }
