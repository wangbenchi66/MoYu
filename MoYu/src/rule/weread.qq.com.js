
// 示例：为 weread.qq.com 提供多段 CSS 与多段 JS 注入示例
// 导出为默认函数 `main(helper)`，helper 提供：
// - helper.runWebviewCss(idSuffix, css)
// - helper.runWebviewJS(js)
// 你可以多次调用这些方法来注入多段样式或脚本，或将多个脚本合并为一个 IIFE
/**
 * 示例规则：weread.qq.com
 *
 * 目的：展示如何编写完整、可维护且可调试的站点注入脚本（CSS / JS），
 * 并示范常用场景：样式替换、移除广告或遮罩、等待内容加载后再修改 DOM、以及调试技巧。
 *
 * 位置：放在 `src/rule/` 下，构建时由 `src/lib/siteRules.js` 使用 `import.meta.glob` 自动加载。
 * 导出约定（推荐）：
 *  - `export const pattern = [...]` 或 `export const pattern = 'hostname'` 用于匹配站点；
 *  - `export default function main(helper) { ... }`：规则的单一入口，框架在匹配时会调用它并传入 `helper` 对象。
 *
 * 注意：注入脚本会在 WebView 的 `dom-ready` 事件触发时由渲染器调用。
 *       如需更晚的时机（页面脚本跑完或动态内容加载完成），请在注入的脚本内部使用 MutationObserver 或轮询。
 */

// 匹配被处理的主机名或路径：支持字符串、数组或 RegExp（loader 已支持）
export const pattern = ['weread.qq.com', 'book.weread.qq.com'];

// 可选的说明字段（不被 loader 使用，仅作开发者自述）
export const description = '微信读书（Weread）示例规则：清理页面并优化阅读体验。';

// 规则执行的入口
export default function main(helper) {
    // helper 常用字段：runWebviewCss(idSuffix, css), runWebviewJS(js), webview, settings, activeTab, rule
    const runCss = helper && helper.runWebviewCss;
    const runJs = helper && helper.runWebviewJS;
    const webview = helper && helper.webview;
    const settings = helper && helper.settings;
    const activeTab = helper && helper.activeTab;

    try {
        // // 便于在渲染器 Console 中追踪：WebView 的 console-message 被转发，输出会带上 [webview.console]
        // try { console.log('[weread.rule] apply start', activeTab && activeTab.url); } catch (e) { }

        // // -------------------------
        // // 1) 样式注入示例（分段）
        // // 分段注入的好处是可以针对不同功能分别启用/替换/移除，便于调试和维护。
        // // idSuffix 应短且不包含空格，例如 'base','layout','hide-ads' 等。
        // // -------------------------
        // try {
        //     // 基础重置：去除默认 margin、设置背景透明以便应用透明窗体效果
        //     runCss && runCss('base', `
        //             html, body { margin: 0 !important; padding: 0 !important; background: transparent !important; }
        //             * { box-sizing: border-box !important; }
        //         `);

        //     // 布局：限制阅读宽度、居中、增加左右内边距
        //     runCss && runCss('layout', `
        //             .reader-content, .chapter-content { max-width: 760px !important; margin: 0 auto !important; padding: 20px !important; }
        //             .chapter-title { font-size: 20px !important; font-weight: 700 !important; margin-bottom: 12px !important; }
        //         `);

        //     // 排版优化：行高、字号、图片自适应
        //     runCss && runCss('typography', `
        //             .reader-content p { line-height: 1.85 !important; font-size: 18px !important; color: #222 !important; }
        //             .reader-content img { max-width: 100% !important; height: auto !important; }
        //         `);

        //     // 隐藏页眉/页脚/侧边栏等非阅读区域
        //     runCss && runCss('hide-elements', `
        //             .site-header, .site-footer, .sidebar, .recommend-panel, .related { display: none !important; }
        //         `);
        // } catch (e) {
        //     try { console.error('[weread.rule] runCss error', e); } catch (err) { }
        // }

        // 参考 inject.js：注入页面函数以实现：切换下一章、监听选区、页面加载检测以及容器滚动监听
        // 说明：此注入把一组函数挂载到页面 `window` 下，便于在页面内直接调用或从渲染器触发。
        runJs && runJs(`(function(){
            try {
                if (window.__glassReaderInjected) return true;
                window.__glassReaderInjected = true;

                // 将函数暴露到页面全局（如已存在则不覆盖）
                try { window.isPageLoading = window.isPageLoading || ${fnToStr(isPageLoading)}; } catch (e) {}
                try { window.fireKeyEvent = window.fireKeyEvent || ${fnToStr(fireKeyEvent)}; } catch (e) {}
                try { window.nextChapter = window.nextChapter || ${fnToStr(nextChapter)}; } catch (e) {}
                try { window.installSelectionWatcher = window.installSelectionWatcher || ${fnToStr(installSelectionWatcher)}; } catch (e) {}
                try { window.getSelectionState = window.getSelectionState || ${fnToStr(getSelectionState)}; } catch (e) {}
                try { window.attachAutoNext = window.attachAutoNext || ${fnToStr(attachAutoNext)}; } catch (e) {}

                // 自动启用
                try { (window.installSelectionWatcher || function(){} )(); } catch (e) {}
                try { (window.attachAutoNext || function(){} )(); } catch (e) {}

                try { console.log('[glassreader] inject ok'); } catch (e) {}
            } catch (e) {
                try { console.error('[glassreader] inject error', e); } catch (e) {}
            }
            return true;
        })();`);

    } catch (err) {
        try { console.error('[weread.rule] unexpected error', err); } catch (e) { }
    }
}

function fnToStr(fn) {
    let str = fn.toString().trim();
    if (!str.startsWith('(')) {
        str = '(' + str + ')';
    }
    return str;
}

//页面是否正在加载（例如章节内容尚未加载完成时会有一个 loading 元素），如果正在加载则不执行下一章切换，以免触发错误或过早切换。
function isPageLoading() {
    try {
        if (document.readyState && document.readyState !== 'complete') return true;
        var spinner = document.querySelector('.chapter-loading, .loading, .spinner, .loading-mask, .reader-loading, .readerChapterContentLoading');
        if (spinner) return true;
        var bodyCl = (document.body && document.body.className) || '';
        if (/loading|is-loading|loading-mask/.test(bodyCl)) return true;
        return false;
    } catch (e) { return false; }
}

// 模拟键盘事件以触发下一章切换，优先使用键盘事件（如果页面有监听），其次尝试点击下一章按钮。
function fireKeyEvent(code) {
    try {
        var key = (code === 39) ? 'ArrowRight' : (code === 37) ? 'ArrowLeft' : String.fromCharCode(code);
        var ev = new KeyboardEvent('keydown', { key: key, keyCode: code, which: code, bubbles: true, cancelable: true });
        var target = document.activeElement || document.body || document;
        try { target.dispatchEvent(ev); } catch (e) { document.dispatchEvent(ev); }
        return true;
    } catch (e) { return false; }
}

// 执行切换下一章的逻辑：优先通过键盘事件触发（如果页面有监听），其次尝试点击下一章按钮，最后检查是否已到结尾。
function __performNextNow() {
    try {
        if (window.__glassReaderPerformingNext) return false;
        window.__glassReaderPerformingNext = true;
        try { if (typeof isPageLoading === 'function' && isPageLoading()) return false; } catch (e) { }

        var btn = document.querySelector('.readerFooter_button');
        if (btn) {
            try { if (typeof window.updateState === 'function') window.updateState('正在切换下一章'); } catch (e) { }
            try {
                if (typeof window.fireKeyEvent === 'function') {
                    window.fireKeyEvent(39);
                } else if (btn.click) {
                    btn.click();
                } else {
                    var ev = new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, which: 39, bubbles: true });
                    document.dispatchEvent(ev);
                }
            } catch (e) {
                try { btn.click(); } catch (e) { }
            }
            try { window.Cache = window.Cache || {}; window.Cache.HasSelection = false; } catch (e) { }
            return true;
        }

        var ending = document.querySelector('.readerFooter_ending');
        if (ending) {
            try { if (typeof window.updateState === 'function') window.updateState('全书完.'); } catch (e) { }
            try { window.dispatchEvent(new CustomEvent('glassreader-reading-finished')); } catch (e) { }
            return false;
        }

        var nextBtn = document.querySelector('.pager-next, .next-chapter');
        if (nextBtn) {
            try { nextBtn.click(); } catch (e) { }
            try { window.Cache = window.Cache || {}; window.Cache.HasSelection = false; } catch (e) { }
            return true;
        }
    } catch (e) { }
    finally { window.__glassReaderPerformingNext = false; }
    return false;
}

// 切换下一章的入口函数，支持可选的延迟参数以避免过快触发（例如章节内容尚未加载完成时），默认延迟 3 秒。
function nextChapter(opts) {
    try {
        if (window.__glassReaderNextPending) return false;
        var delay = (opts && typeof opts.delayMs === 'number') ? opts.delayMs : (window.__glassReaderNextDelayMs || 3000);
        if (delay && delay > 0) {
            window.__glassReaderNextPending = setTimeout(function () {
                try { __performNextNow(); } catch (e) { }
                finally { clearTimeout(window.__glassReaderNextPending); window.__glassReaderNextPending = null; window.__glassReaderAutoNextTimer = null; }
            }, delay);
        } else {
            try { __performNextNow(); } catch (e) { }
            finally { window.__glassReaderAutoNextTimer = null; }
        }
        return true;
    } catch (e) { }
    return false;
}

// 监听用户选区变化以优化交互体验，例如当有选区时暂不自动切换下一章，或在渲染器显示相关提示。
function installSelectionWatcher() {
    try {
        if (window.__glassReaderSelectionWatcherInstalled) return;
        window.__glassReaderSelectionWatcherInstalled = true;
        var lastHas = false;
        function check() {
            try {
                var s = '';
                if (window.getSelection) s = window.getSelection().toString();
                else if (document.selection && document.selection.createRange) s = document.selection.createRange().text;
                var has = !!s && s.trim().length > 0;
                if (has !== lastHas) {
                    lastHas = has;
                    try { window.Cache = window.Cache || {}; window.Cache.HasSelection = has; } catch (e) { }
                    try { window.dispatchEvent(new CustomEvent('glassreader-selection-change', { detail: { hasSelection: has } })); } catch (e) { }
                    try { console.log('[glassreader] selection', has); } catch (e) { }
                }
            } catch (e) { }
        }
        document.addEventListener('selectionchange', function () { try { check(); } catch (e) { } }, false);
        document.addEventListener('mouseup', function () { setTimeout(check, 10); }, false);
        document.addEventListener('keyup', function () { setTimeout(check, 10); }, false);
        setTimeout(check, 50);
    } catch (e) { }
}

// 获取当前选区状态，返回布尔值表示是否有选区。页面内的其他脚本或渲染器可以调用此函数以决定是否执行某些操作（例如自动切换下一章）。
function getSelectionState() { try { return !!(window.Cache && window.Cache.HasSelection); } catch (e) { return false; } }

// 监听滚动事件以实现自动切换下一章的功能：当用户滚动到接近底部时自动触发下一章切换，提升阅读流畅度。支持多个可能的滚动容器，并提供阈值设置以避免过早触发。
// 可能会隐藏滚动栏(隐藏滚动栏可能会导致无法触发 scroll 事件)，如果需要可以在 CSS 注入中覆盖相关样式以确保滚动事件能被监听到。
function attachAutoNext() {
    try {
        if (window.__glassReaderAutoNextAttached) {
            try { console.log('[glassreader] attachAutoNext: already attached'); } catch (e) { }
            return;
        }

        try { console.log('[glassreader] attachAutoNext: checking page load state'); } catch (e) { }

        // 如果页面仍在加载中，则延迟安装滚动监听器，等待加载完成或超时回退（约 30s）
        try {
            if (typeof isPageLoading === 'function' && isPageLoading()) {
                if (window.__glassReaderAutoNextWaiter) return;
                var attempts = 0;
                window.__glassReaderAutoNextWaiter = setInterval(function () {
                    try {
                        attempts++;
                        var loading = (typeof isPageLoading === 'function' && isPageLoading());
                        try { console.log('[glassreader] attachAutoNext: waiting, attempt', attempts, 'loading=', loading); } catch (e) { }
                        if (!loading) {
                            clearInterval(window.__glassReaderAutoNextWaiter);
                            window.__glassReaderAutoNextWaiter = null;
                            try { console.log('[glassreader] attachAutoNext: page loaded, installing handlers'); } catch (e) { }
                            attachAutoNext();
                            return;
                        }
                        // 超时回退（100 次 * 300ms = ~30s）
                        if (attempts >= 100) {
                            clearInterval(window.__glassReaderAutoNextWaiter);
                            window.__glassReaderAutoNextWaiter = null;
                            try { console.log('[glassreader] attachAutoNext: wait timeout, installing handlers anyway'); } catch (e) { }
                            attachAutoNext();
                            return;
                        }
                    } catch (e) { }
                }, 300);
                return;
            }
        } catch (e) { }

        try { console.log('[glassreader] attachAutoNext: installing scroll handlers now'); } catch (e) { }

        var targets = [window];
        var selectors = ['.chapter-content', '.reader-content', '.read-content', '.reader-main', '.book-content', '.read_view', '.readerWrapper', '.content-scroll'];
        selectors.forEach(function (s) { try { var el = document.querySelector(s); if (el && targets.indexOf(el) === -1) targets.push(el); } catch (e) { } });
        if (targets.length === 1) {
            try {
                var found = Array.prototype.slice.call(document.querySelectorAll('body *')).find(function (n) { try { var st = getComputedStyle(n); return (st.overflowY === 'auto' || st.overflowY === 'scroll') && (n.scrollHeight - n.clientHeight > 50); } catch (e) { return false; } });
                if (found && targets.indexOf(found) === -1) targets.push(found);
            } catch (e) { }
        }

        var minScrollable = (window.__glassReaderMinScrollable || 50);
        var threshold = 10;
        targets.forEach(function (t) {
            try {
                var handler = function (evt) {
                    try {
                        var el = (t === window) ? (document.scrollingElement || document.documentElement || document.body) : t;
                        var scrollTop = (el === document.scrollingElement || el === document.documentElement || el === document.body) ? (window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop) : el.scrollTop;
                        var scrollHeight = (el === document.scrollingElement || el === document.documentElement || el === document.body) ? (document.documentElement.scrollHeight || document.body.scrollHeight) : el.scrollHeight;
                        var clientHeight = (el === document.scrollingElement || el === document.documentElement || el === document.body) ? (document.documentElement.clientHeight || window.innerHeight) : el.clientHeight;

                        var delta = (scrollHeight - clientHeight) || 0;
                        var near = (scrollTop + clientHeight >= scrollHeight - threshold);
                        if (near) {
                            try { console.log('[glassreader] attachAutoNext: near bottom', { scrollTop: scrollTop, clientHeight: clientHeight, scrollHeight: scrollHeight, delta: delta, threshold: threshold }); } catch (e) { }
                        }

                        if (delta <= minScrollable) return;

                        if (near) {
                            if (window.__glassReaderAutoNextTimer) return;
                            window.__glassReaderAutoNextTimer = true;
                            try { if (typeof window.nextChapter === 'function') window.nextChapter(); } catch (e) { }
                        }
                    } catch (e) { }
                };
                if (t === window) window.addEventListener('scroll', handler, { passive: true }); else t.addEventListener('scroll', handler, { passive: true });
            } catch (e) { }
        });
        try { window.__glassReaderAutoNextTargets = targets; } catch (e) { }
        window.__glassReaderAutoNextAttached = true;
    } catch (e) { }
}