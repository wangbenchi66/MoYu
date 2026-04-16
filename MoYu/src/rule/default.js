// 全局默认规则（default）
// 放在 src/rule/default.js 中的规则会被视为对所有站点生效的默认规则，
// 在加载站点规则之前注入（例如：全局样式、通用修复、辅助键盘事件等）。

// 推荐导出形式：export default function main(helper) { ... }
// helper 提供：runWebviewCss(idSuffix, css), runWebviewJS(js), webview, settings, activeTab, rule

/**
 * 默认全局规则入口（针对所有站点生效）
 * 参数: helper - 提供 runWebviewCss/runWebviewJS/webview/settings/activeTab 等工具
 */
export default function main(helper) {
    const runCss = helper && helper.runWebviewCss;
    const runJs = helper && helper.runWebviewJS;

    try {
        //全局基础样式：让页面在透明窗口下更友好
        // runCss && runCss('default-base', `
        //   html, body { background: transparent !important; }
        //   img, video { max-width: 100% !important; height: auto !important; }
        // `);

        // 全局 JS：安装一个轻量的 keybind（示例），避免重复安装
        // runJs && runJs(`(() => {
        //     try {
        //         if (window.__glassReaderGlobalInstalled) return true;
        //         window.__glassReaderGlobalInstalled = true;
        //         // 例如：Ctrl+Alt+F 聚焦到第一个可输入框（示例用途）
        //         window.addEventListener('keydown', (e) => {
        //             try {
        //                 if (e.ctrlKey && e.shiftKey && e.key && e.key.toLowerCase() === 'f') {
        //                     const el = document.querySelector('input, textarea, [contenteditable]');
        //                     if (el && el.focus) el.focus();
        //                 }
        //             } catch (err) { }
        //         }, false);
        //     } catch (err) { }
        //     return true;
        // })(); `);

        //全局提示一个弹框，测试全局 JS 是否生效
        //runJs && runJs(`(() => { alert('全局默认规则生效！'); })(); `);

        //全局广告移除示例：隐藏所有 class 包含 "ad" 的元素（仅示例，实际使用请针对特定站点优化选择器）
        //runJs && runJs(`(() => { document.querySelectorAll('[class*=ad]').forEach(n => { try { n.style.display = 'none'; } catch (e) { } }); })(); `);

        // 全局禁止新窗口打开：移除 target，覆盖 window.open，拦截点击，统一在当前窗口打开
        runJs && runJs(`(() => {
            try {
                // 移除已有的 target 属性
                try { document.querySelectorAll('a[target="_blank"]').forEach(a => { a.removeAttribute('target'); }); } catch (e) {}

                // 覆盖 window.open，使其在当前窗口导航而非打开新窗口
                try {
                    if (!window.__glassReader_window_open_overridden) {
                        window.__glassReader_window_open_overridden = true;
                        const _open = window.open;
                        window.open = function(url, name, specs) {
                            try {
                                if (!url) return null;
                                // 相对或绝对 URL 直接导航
                                window.location.href = String(url);
                                return window;
                            } catch (e) {
                                try { return _open.call(window, url, name, specs); } catch (err) { return null; }
                            }
                        };
                    }
                } catch (e) {}

                // 事件委托：拦截含 target="_blank" 的点击或具备外部打开意图的链接
                try {
                    if (!window.__glassReader_click_handler_installed) {
                        window.__glassReader_click_handler_installed = true;
                        document.addEventListener('click', (ev) => {
                            try {
                                const el = ev.target && (ev.target.closest ? ev.target.closest('a') : null);
                                if (!el || el.tagName !== 'A') return;
                                const target = (el.getAttribute && el.getAttribute('target')) || el.target;
                                const href = el.getAttribute && el.getAttribute('href');
                                if (!href) return;

                                // 若标记为在新窗口打开，阻止并在当前窗口打开
                                if (String(target || '').toLowerCase() === '_blank') {
                                    ev.preventDefault();
                                    try { el.removeAttribute('target'); } catch (e) {}
                                    window.location.href = href;
                                }
                            } catch (e) {}
                        }, true);
                    }
                } catch (e) {}
            } catch (err) { }
        })(); `);

        //同步注入我设置的快捷键
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
                    function norm(k) { return String(k || '').toLowerCase().replace(/\s+/g, ''); }
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
                                        // 发送到宿主：优先通过 postMessage，然后 fallback 到 console.log
                                        const payload = { action: name };
                                        try {
                                            // 尝试 postMessage 到宿主（某些宿主会监听该通道）
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
        } catch (e) { }


    } catch (e) {
        try { console.error('[rule:default] apply failed', e); } catch (err) { }
    }
}
