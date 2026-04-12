import * as site from '../siteRules'
import * as settings from './settingsRules'
import * as toolbar from './toolbarRules'

function getCombinedRulesForUrl(url) {
    return {
        site: site.getRulesForUrl(url),
        toolbar: toolbar.getRulesForUrl(url),
        settings: settings.getRulesForUrl(url),
    }
}

export { getCombinedRulesForUrl, settings, site, toolbar }
export default { toolbar, settings, site, getCombinedRulesForUrl }
