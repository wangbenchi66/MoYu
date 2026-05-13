// weread.qq.com.js — 微信读书站点增强注入规则
// 构建时由 `src/rules/index.js` 通过 `import.meta.glob` 自动加载，无需手动注册。

/** 匹配的主机名（支持数组） */
export const pattern = ['weread.qq.com', 'book.weread.qq.com'];

export const description = '微信读书增强规则：自定义滚动灵敏度、自动翻章、选区保护、透明模式弹出层修复。';

/**
 * 规则入口：将辅助函数注入到 WebView 页面全局，并延迟启动各功能监听器。
 * 运行时机：框架在 `dom-ready` 后调用本函数，传入 helper 工具对象。
 * 参数: helper - { runWebviewCss, runWebviewJS, webview, settings, activeTab, rule }
 */
export default function main(helper) {
    const runJs = helper && helper.runWebviewJS;

    try {
        runJs && runJs(`(function () {
            try {
                if (window.__glassReaderInjected) return true;
                window.__glassReaderInjected = true;

                // --- 辅助函数：被其他函数内部调用，不需要显式启动 ---
                try { window.isPageLoading = window.isPageLoading || ${fnToStr(isPageLoading)}; } catch (e) {}
                try { window.fireKeyEvent = window.fireKeyEvent || ${fnToStr(fireKeyEvent)}; } catch (e) {}
                try { window.__performNextNow = window.__performNextNow || ${fnToStr(__performNextNow)}; } catch (e) {}
                try { window.nextChapter = window.nextChapter || ${fnToStr(nextChapter)}; } catch (e) {}
                try { window.getSelectionState = window.getSelectionState || ${fnToStr(getSelectionState)}; } catch (e) {}

                // --- 透明模式弹出层修复（500ms）：最先启动，确保选区菜单出现时已就绪 ---
                try { window.installPopupVisibilityFix = window.installPopupVisibilityFix || ${fnToStr(installPopupVisibilityFix)}; } catch (e) {}
                try { setTimeout(function(){ try { (window.installPopupVisibilityFix || function() {})(); } catch (e) {} }, 500); } catch (e) {}

                // --- 选区变化监听（600ms）：同步 window.Cache.HasSelection，供翻章逻辑读取 ---
                try { window.installSelectionWatcher = window.installSelectionWatcher || ${fnToStr(installSelectionWatcher)}; } catch (e) {}
                try { setTimeout(function(){ try { (window.installSelectionWatcher || function() {})(); } catch (e) {} }, 600); } catch (e) {}

                // --- 选区期间暂停自动滚动（700ms）：防止选中文字被自动滚动打断 ---
                try { window.installSelectionAutoScrollPause = window.installSelectionAutoScrollPause || ${fnToStr(installSelectionAutoScrollPause)}; } catch (e) {}
                try { setTimeout(function(){ try { (window.installSelectionAutoScrollPause || function() {})(); } catch (e) {} }, 700); } catch (e) {}

                // --- 滚动到底部自动翻章（800ms）：等待选区监听器就绪后再启动 ---
                try { window.attachAutoNext = window.attachAutoNext || ${fnToStr(attachAutoNext)}; } catch (e) {}
                try { setTimeout(function(){ try { (window.attachAutoNext || function() {})(); } catch (e) {} }, 800); } catch (e) {}

                // --- 自定义鼠标滚轮灵敏度（900ms）：最后安装，避免过早干预页面初始化 ---
                try { window.attachWheelHandler = window.attachWheelHandler || ${fnToStr(attachWheelHandler)}; } catch (e) {}
                try { setTimeout(function(){ try { (window.attachWheelHandler || function() {})(); } catch (e) {} }, 900); } catch (e) {}
            } catch (e) {}
            return true;
        })();`);
    } catch (err) {
        try { console.error('[weread.rule] unexpected error', err); } catch (e) { }
    }
}

/**
 * 将渲染进程侧的函数序列化为可注入 WebView 页面的字符串。
 * WebView 运行在独立的 JS 上下文中，无法访问渲染进程的任何闭包变量。
 * 参数: fn - 要序列化的函数
 */
function fnToStr(fn) {
    let str = fn.toString().trim();
    if (!str.startsWith('(')) {
        str = '(' + str + ')';
    }
    return str;
}

/**
 * 检查页面内容是否仍在加载中，通过 readyState 与常见 Loading 元素/类名判断。
 * 用于在章节内容未就绪时延迟执行翻章逻辑，避免误触或空指针。
 * 返回: boolean — true 表示仍在加载
 */
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

/**
 * 向焦点元素或 document 派发键盘事件，模拟用户按键以触发页面内置按键响应（如翻章快捷键）。
 * 参数: code - 键盘 keyCode（如 39 = ArrowRight，37 = ArrowLeft）
 */
function fireKeyEvent(code) {
    try {
        var key = (code === 39) ? 'ArrowRight' : (code === 37) ? 'ArrowLeft' : String.fromCharCode(code);
        var ev = new KeyboardEvent('keydown', { key: key, keyCode: code, which: code, bubbles: true, cancelable: true });
        var target = document.activeElement || document.body || document;
        try { target.dispatchEvent(ev); } catch (e) { document.dispatchEvent(ev); }
        return true;
    } catch (e) { return false; }
}

/**
 * 立即执行下一章切换：优先触发键盘事件（利用页面自身快捷键逻辑），
 * 其次点击 .readerFooter_button，若检测到 .readerFooter_ending 则派发完成事件。
 * 通过 __glassReaderPerformingNext 标志防止并发重入。
 */
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

/**
 * 带防抖的下一章切换入口：通过延迟调用 __performNextNow 避免章节内容未加载时误触。
 * __glassReaderNextPending 标志防止短时间内重复触发。
 * 参数: opts - 可选 { delayMs: number }，默认延迟由 window.__glassReaderNextDelayMs 控制（默认 1000ms）
 */
function nextChapter(opts) {
    try {
        if (window.__glassReaderNextPending) return false;
        var delay = (opts && typeof opts.delayMs === 'number') ? opts.delayMs : (window.__glassReaderNextDelayMs || 1000);
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

/**
 * 监听选区变化，将当前是否有文字选中的状态同步到 window.Cache.HasSelection，
 * 并派发 glassreader-selection-change 自定义事件，供翻章逻辑等模块读取。
 * 同时监听 selectionchange / mouseup / keyup，确保鼠标拖拽和键盘选区都能被捕获。
 */
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
                }
            } catch (e) { }
        }
        document.addEventListener('selectionchange', function () { try { check(); } catch (e) { } }, false);
        document.addEventListener('mouseup', function () { setTimeout(check, 10); }, false);
        document.addEventListener('keyup', function () { setTimeout(check, 10); }, false);
        setTimeout(check, 50);
    } catch (e) { }
}

/**
 * 读取当前页面选区状态（通过 window.Cache.HasSelection）。
 * 返回: boolean — true 表示有文字选中
 */
function getSelectionState() { try { return !!(window.Cache && window.Cache.HasSelection); } catch (e) { return false; } }

/**
 * 监听页面滚动，当滚动到接近底部时自动调用 nextChapter 切换下一章。
 * 支持通过已知类名查找滚动容器，若未匹配则自动搜索第一个可滚动子元素。
 * 若页面仍在加载中，则通过轮询（每 300ms，最多 30s）等待就绪后再完成安装。
 */
function attachAutoNext() {
    try {
        if (window.__glassReaderAutoNextAttached) return;

        // 页面仍在加载：轮询等待，就绪（或超时）后重新调用自身完成安装
        try {
            if (typeof isPageLoading === 'function' && isPageLoading()) {
                if (window.__glassReaderAutoNextWaiter) return;
                var attempts = 0;
                window.__glassReaderAutoNextWaiter = setInterval(function () {
                    try {
                        attempts++;
                        var stillLoading = (typeof isPageLoading === 'function' && isPageLoading());
                        if (!stillLoading || attempts >= 100) {
                            clearInterval(window.__glassReaderAutoNextWaiter);
                            window.__glassReaderAutoNextWaiter = null;
                            attachAutoNext();
                        }
                    } catch (e) { }
                }, 300);
                return;
            }
        } catch (e) { }

        var targets = [window];
        var selectors = ['.chapter-content', '.reader-content', '.read-content', '.reader-main', '.book-content', '.read_view', '.readerWrapper', '.content-scroll'];
        selectors.forEach(function (s) {
            try { var el = document.querySelector(s); if (el && targets.indexOf(el) === -1) targets.push(el); } catch (e) { }
        });
        // 所有已知选择器都未命中：自动搜索 DOM 中第一个可滚动子元素
        if (targets.length === 1) {
            try {
                var found = Array.prototype.slice.call(document.querySelectorAll('body *')).find(function (n) {
                    try {
                        var st = getComputedStyle(n);
                        return (st.overflowY === 'auto' || st.overflowY === 'scroll') && (n.scrollHeight - n.clientHeight > 50);
                    } catch (e) { return false; }
                });
                if (found && targets.indexOf(found) === -1) targets.push(found);
            } catch (e) { }
        }

        var minScrollable = (window.__glassReaderMinScrollable || 50);
        var threshold = 10;
        targets.forEach(function (t) {
            try {
                var handler = function () {
                    try {
                        var el = (t === window) ? (document.scrollingElement || document.documentElement || document.body) : t;
                        var isDocEl = (el === document.scrollingElement || el === document.documentElement || el === document.body);
                        var scrollTop = isDocEl ? (window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop) : el.scrollTop;
                        var scrollHeight = isDocEl ? (document.documentElement.scrollHeight || document.body.scrollHeight) : el.scrollHeight;
                        var clientHeight = isDocEl ? (document.documentElement.clientHeight || window.innerHeight) : el.clientHeight;

                        if ((scrollHeight - clientHeight) <= minScrollable) return;
                        if (scrollTop + clientHeight >= scrollHeight - threshold) {
                            if (window.__glassReaderAutoNextTimer) return;
                            window.__glassReaderAutoNextTimer = true;
                            try { if (typeof window.nextChapter === 'function') window.nextChapter(); } catch (e) { }
                        }
                    } catch (e) { }
                };
                if (t === window) window.addEventListener('scroll', handler, { passive: true });
                else t.addEventListener('scroll', handler, { passive: true });
            } catch (e) { }
        });
        try { window.__glassReaderAutoNextTargets = targets; } catch (e) { }
        window.__glassReaderAutoNextAttached = true;
    } catch (e) { }
}

/**
 * 透明模式弹出层可见性修复：通过 MutationObserver 监听新增 DOM 节点，
 * 检测到高层浮动元素（position: fixed/absolute + z-index ≥ 100）的背景被全局透明 CSS
 * 强制清除时，通过内联 style !important 恢复深色背景，确保选区工具栏等弹出层可见。
 * 若透明模式未开启，元素背景色不为透明，修复不会触发。
 */
function installPopupVisibilityFix() {
    try {
        if (window.__glassReaderPopupVis) return;
        window.__glassReaderPopupVis = true;

        function tryFix(el) {
            try {
                if (!el || el.nodeType !== 1 || el.__gPopFix) return;
                var tag = (el.tagName || '').toUpperCase();
                if (tag === 'HTML' || tag === 'BODY' || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IFRAME') return;
                var cs = window.getComputedStyle(el);
                var zi = parseInt(cs.zIndex) || 0;
                if (zi < 100) return;
                var pos = cs.position;
                if (pos !== 'fixed' && pos !== 'absolute') return;
                // 仅修复背景已被透明化的元素（透明模式关闭时不触发）
                var bg = cs.backgroundColor;
                if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return;
                // 排除过小的元素和全屏遮罩
                var w = el.offsetWidth;
                var h = el.offsetHeight;
                if (w < 80 || h < 20) return;
                if (w > window.innerWidth * 0.9 || h > window.innerHeight * 0.6) return;

                el.__gPopFix = true;
                el.style.setProperty('background-color', 'rgba(28,28,30,.95)', 'important');
                el.style.setProperty('box-shadow', '0 4px 24px rgba(0,0,0,.45)', 'important');
            } catch (e) {}
        }

        var obs = new MutationObserver(function (muts) {
            muts.forEach(function (m) {
                if (!m.addedNodes) return;
                m.addedNodes.forEach(function (n) {
                    if (n.nodeType !== 1) return;
                    // 延迟以确保元素完成布局（offsetWidth/zIndex 在此之前可能未就绪）
                    setTimeout(function () {
                        try { tryFix(n); } catch (e) {}
                        try {
                            for (var i = 0; i < (n.children || []).length; i++) {
                                try { tryFix(n.children[i]); } catch (e) {}
                            }
                        } catch (e) {}
                    }, 30);
                });
            });
        });

        obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
}

/**
 * 选区期间暂停自动滚动：用户选中文字时，每 80ms 刷新自动滚动的交互时间戳，
 * 使 step() 函数"近期有交互"判断持续成立，从而暂停自动滚动直到选区清除。
 * 通过 selectionchange 和 mouseup 双重监听确保鼠标拖拽选区也能被捕获。
 */
function installSelectionAutoScrollPause() {
    try {
        if (window.__glassReaderSelectionPauseInstalled) return;
        window.__glassReaderSelectionPauseInstalled = true;

        var pauseInterval = null;

        function startPause() {
            if (pauseInterval) return;
            pauseInterval = setInterval(function () {
                try { window.__glassReaderAutoScrollUserInteractionAt = performance.now(); } catch (e) {}
            }, 80);
        }

        function stopPause() {
            if (pauseInterval) {
                clearInterval(pauseInterval);
                pauseInterval = null;
            }
        }

        function check() {
            try {
                var sel = window.getSelection ? window.getSelection() : null;
                var hasText = sel && sel.toString().trim().length > 0;
                if (hasText) { startPause(); } else { stopPause(); }
            } catch (e) {}
        }

        document.addEventListener('selectionchange', function () { try { check(); } catch (e) {} }, false);
        // mouseup 确保拖拽结束后能立即检测到最终选区状态
        document.addEventListener('mouseup', function () { setTimeout(check, 20); }, false);
    } catch (e) {}
}

/**
 * 自定义鼠标滚轮灵敏度：在捕获阶段（capture: true）拦截所有 wheel 事件，
 * 阻止原生滚动与页面自带的 wheel 监听器，改用 window.__glassReaderWheelScale 比例
 * 重新计算滚动量，并自动向上查找最近的可滚动祖先元素执行滚动。
 * 默认缩放系数 0.1（原始滚动距离的 10%），可通过以下方式动态调整：
 *   window.dispatchEvent(new CustomEvent('glassreader-set-wheel-scale', { detail: { scale: 0.3 } }))
 */
function attachWheelHandler() {
    try {
        if (window.__glassReaderWheelAttached) return;
        window.__glassReaderWheelAttached = true;
        window.__glassReaderWheelScale = window.__glassReaderWheelScale || 0.1;

        // 允许通过自定义事件在运行时调整缩放系数
        try {
            window.addEventListener('glassreader-set-wheel-scale', function (ev) {
                try { var s = ev && ev.detail && typeof ev.detail.scale === 'number' ? ev.detail.scale : null; if (s !== null) window.__glassReaderWheelScale = s; } catch (e) { }
            }, false);
        } catch (e) { }

        // 捕获阶段优先于页面自身的 wheel 监听器执行
        document.addEventListener('wheel', function (evt) {
            try {
                // 不干预 Ctrl/Meta 缩放手势
                if (evt.ctrlKey || evt.metaKey) return;
                var delta = evt.deltaY || 0;
                if (Math.abs(delta) < 0.5) return;

                evt.preventDefault();
                evt.stopPropagation();

                var scale = (typeof window.__glassReaderWheelScale === 'number') ? window.__glassReaderWheelScale : 0.1;

                // 从事件目标向上查找最近的可滚动祖先
                var scrollEl = null;
                var node = evt.target;
                while (node && node !== document.documentElement) {
                    try {
                        var st = getComputedStyle(node);
                        if ((st.overflowY === 'auto' || st.overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
                            scrollEl = node;
                            break;
                        }
                    } catch (e) { }
                    node = node.parentElement;
                }
                if (!scrollEl) {
                    scrollEl = document.scrollingElement || document.documentElement || document.body;
                }

                scrollEl.scrollTop += delta * scale;
            } catch (e) { }
        }, { passive: false, capture: true });
    } catch (e) { }
}
