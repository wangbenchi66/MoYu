// 全局默认规则（default）
// 放在 src/rule/default.js 中的规则会被视为对所有站点生效的默认规则，
// 在加载站点规则之前注入（例如：全局样式、通用修复、辅助键盘事件等）。

// 推荐导出形式：export default function main(helper) { ... }
// helper 提供：runWebviewCss(idSuffix, css), runWebviewJS(js), webview, settings, activeTab, rule

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
        //         // 例如：Ctrl+Shift+F 聚焦到第一个可输入框（示例用途）
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
    } catch (e) {
        try { console.error('[rule:default] apply failed', e); } catch (err) { }
    }
}
