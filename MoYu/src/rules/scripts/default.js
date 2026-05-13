// 全局默认规则（default）
// 对所有站点生效的默认规则：注入快捷键设置到 webview，
// 使页面内按键能触发对应操作（自动滚动、透明度调节等）。

/**
 * 默认全局规则入口（针对所有站点生效）
 * 参数: helper - 提供 runWebviewCss/runWebviewJS/webview/settings/activeTab 等工具
 */
export default function main(helper) {
    const runJs = helper && helper.runWebviewJS;

    try {
        const s = (helper && helper.settings) || {};
        const map = {
            bossKey: s.bossKey || '',
            decreaseTransparencyShortcut: s.decreaseTransparencyShortcut || '',
            increaseTransparencyShortcut: s.increaseTransparencyShortcut || '',
            clickThroughShortcut: s.clickThroughShortcut || '',
            autoToggleShortcut: s.autoToggleShortcut || '',
            autoSpeedDownShortcut: s.autoSpeedDownShortcut || '',
            autoSpeedUpShortcut: s.autoSpeedUpShortcut || ''
        };

        const keyScript = `(() => {
            try {
                if (window.__glassReader_shortcuts_injected) return true;
                window.__glassReader_shortcuts_injected = true;
                const map = ${JSON.stringify(map)};
                function norm(k) { return String(k || '').toLowerCase().replace(/\\s+/g, ''); }
                const normMap = {};
                for (const key in map) { normMap[key] = norm(map[key]); }

                document.addEventListener('keydown', (e) => {
                    try {
                        const parts = [];
                        if (e.ctrlKey) parts.push('control');
                        if (e.altKey) parts.push('alt');
                        if (e.shiftKey) parts.push('shift');
                        if (e.metaKey) parts.push('meta');
                        parts.push((e.key || '').toLowerCase());
                        const token = parts.join('+');

                        for (const name in normMap) {
                            if (!normMap[name]) continue;
                            if (token === normMap[name]) {
                                const payload = { action: name };
                                try {
                                    if (window && window.top && window.top !== window && typeof window.top.postMessage === 'function') {
                                        try { window.top.postMessage({ type: 'GLASS_SHORTCUT', payload }, '*'); } catch (err) {}
                                    }
                                } catch (err) {}
                                try { console.log('GLASS_SHORTCUT:' + JSON.stringify(payload)); } catch (err) {}
                                e.preventDefault();
                                e.stopPropagation();
                                return;
                            }
                        }
                    } catch (e) {}
                }, true);
            } catch (e) {}
            return true;
        })();`;

        runJs && runJs(keyScript);
    } catch (e) {
        try { console.error('[rule:default] apply failed', e); } catch (err) { }
    }
}
