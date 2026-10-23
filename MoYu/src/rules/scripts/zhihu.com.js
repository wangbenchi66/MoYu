// zhihu.com.js — 知乎站点增强注入规则
// 构建时由 `src/rules/index.js` 通过 `import.meta.glob` 自动加载，无需手动注册。
// 直接注入知乎配置插件（zhihu-custom），通过 GM API shim 适配 webview 环境。

/** 匹配的主机名 */
export const pattern = ['zhihu.com', 'www.zhihu.com'];

export const description = '知乎增强规则：注入 zhihu-custom 插件（广告过滤/极简模式/内容管理），小窗口自适应，自定义滚轮灵敏度。';

const ZHIHU_DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// 插件本体：构建时通过 Vite raw import 读取（约 5000 行）
// 文件位于 vendors/ 目录，由用户提供并手动更新
import pluginRaw from './vendors/知乎配置插件-5.21.4.user.js?raw';

/**
 * 从完整 userscript 文件中提取 IIFE 函数体（去掉 ==UserScript== 注释头和外层 (() => { })(); 包裹）。
 * 提取后的代码以 "(function(){" 开头，可直接注入 webview。
 */
function extractPluginBody(raw) {
    if (!raw) return '';
    // 找到第一个 "(function(){" 或 "(() =>{" 的位置（IIFE 起始）
    const start = raw.search(/\(\s*(?:function\s*\(|\(\)\s*=>)/);
    if (start < 0) return raw;
    // 找到最后一个 "})();"（IIFE 结束）
    const end = raw.lastIndexOf('})();');
    if (end < 0) return raw.slice(start);
    return raw.slice(start, end + 5);
}

const PLUGIN_BODY = extractPluginBody(pluginRaw);

/**
 * 让知乎插件的设置齿轮（#CTZ_OPEN_CLOSE）可以自由拖动。
 *
 * 插件把齿轮写死在 position:fixed; bottom:0; right:0 —— 小窗口下经常压住正文，
 * 也容易和本应用自己的底栏重叠。这里接管它的定位：
 *
 *   - 拖动超过 3px 才算「拖动」，否则保持原有「点击打开面板」的行为
 *   - 拖完后把 left/top 存进 localStorage，刷新/换页后恢复
 *   - 在 capture 阶段掐掉拖动结束时的 click，避免松手误开面板
 *   - 拖动期间给 body 加 user-select:none，防止选中网页文字
 *   - 插件是异步渲染的，用轮询等齿轮出现（最多约 20 秒）
 *
 * 选择器或 DOM 结构变了也不会报错，只是这段拖动静默失效。
 */
const GEAR_DRAG_SCRIPT = `(() => {
  try {
    if (window.__moyuZhihuGearDrag) return true;
    window.__moyuZhihuGearDrag = true;

    var STORAGE_KEY = '__moyu_zhihu_gear_pos__';

    function applySaved(el) {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        var pos = JSON.parse(raw);
        if (!pos || typeof pos.left !== 'number' || typeof pos.top !== 'number') return;
        el.style.left = pos.left + 'px';
        el.style.top = pos.top + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
      } catch (e) {}
    }

    function bind(el) {
      if (!el || el.__moyuGearBound) return;
      el.__moyuGearBound = true;

      applySaved(el);

      var startX = 0, startY = 0, originX = 0, originY = 0;
      var dragging = false, moved = false;

      el.addEventListener('mousedown', function (e) {
        try {
          if (e.button !== 0) return;
          var r = el.getBoundingClientRect();
          startX = e.clientX; startY = e.clientY;
          originX = r.left; originY = r.top;
          dragging = true; moved = false;
        } catch (err) {}
      }, true);

      el.addEventListener('click', function (e) {
        if (moved) {
          try { e.stopPropagation(); e.preventDefault(); } catch (err) {}
          moved = false;
        }
      }, true);

      document.addEventListener('mousemove', function (e) {
        try {
          if (!dragging) return;
          var dx = e.clientX - startX;
          var dy = e.clientY - startY;
          if (!moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
            moved = true;
            try { document.body.style.userSelect = 'none'; } catch (err) {}
          }
          if (!moved) return;

          var maxX = window.innerWidth - el.offsetWidth;
          var maxY = window.innerHeight - el.offsetHeight;
          var nx = Math.min(Math.max(0, originX + dx), Math.max(0, maxX));
          var ny = Math.min(Math.max(0, originY + dy), Math.max(0, maxY));

          el.style.left = nx + 'px';
          el.style.top = ny + 'px';
          el.style.right = 'auto';
          el.style.bottom = 'auto';
        } catch (err) {}
      }, true);

      document.addEventListener('mouseup', function () {
        try {
          if (!dragging) return;
          dragging = false;
          try { document.body.style.userSelect = ''; } catch (err) {}
          if (moved) {
            var r = el.getBoundingClientRect();
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify({
                left: Math.round(r.left),
                top: Math.round(r.top)
              }));
            } catch (err) {}
          }
        } catch (err) {}
      }, true);
    }

    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      var el = document.getElementById('CTZ_OPEN_CLOSE');
      if (el) {
        clearInterval(timer);
        bind(el);
      } else if (tries > 100) {
        clearInterval(timer);
      }
    }, 200);
  } catch (e) {}
  return true;
})();`;

/**
 * 规则入口。
 * 参数: helper - { runWebviewCss, runWebviewJS, webview, settings, activeTab, rule }
 */
export default function main(helper) {
    const runCss = helper && helper.runWebviewCss;
    const runJs = helper && helper.runWebviewJS;
    const webview = helper && helper.webview;

    // 强制桌面 UA：知乎手机版会触发大量 App 推广弹窗
    if (webview && !webview.__zhihuUaForced) {
        try {
            const ua = typeof webview.getUserAgent === 'function' ? webview.getUserAgent() : '';
            if (/mobile|android|iphone|ipad/i.test(ua)) {
                webview.__zhihuUaForced = true;
                if (typeof webview.setUserAgent === 'function') webview.setUserAgent(ZHIHU_DESKTOP_UA);
                try { webview.setAttribute('useragent', ZHIHU_DESKTOP_UA); } catch (_) {}
                webview.reload();
                return;
            }
        } catch (_) {}
    }

    // CSS：小窗口自适应（隐藏侧栏、主栏全宽、防止横向溢出）
    // 这部分插件不处理，保留原有规则
    try {
        runCss && runCss('zhihu-responsive', `
            /* 隐藏所有右侧边栏 */
            .Topstory-sideColumn,
            .Question-sideColumn,
            .HotList-sideColumn,
            .ProfilePage-sideColumn,
            .Zhuanlan-sideColumn,
            .SearchPage-sideColumn,
            .CollectionDetailPage-sideColumn,
            [class$="-sideColumn"],
            [class*="-SideColumn"] { display: none !important; }

            /* 外层页面容器：全宽 */
            .Topstory-container,
            .Question-container,
            .HotList-container,
            .ProfilePage-container,
            .Zhuanlan-container,
            .SearchPage-container,
            .CollectionDetailPage-container,
            [class$="-container"] {
                display: block !important;
                max-width: 100% !important;
                width: 100% !important;
                padding-left: 0 !important;
                padding-right: 0 !important;
                box-sizing: border-box !important;
            }

            /* 主内容列：全宽 */
            .Topstory-mainColumn,
            .Question-main,
            .HotList-main,
            .ProfilePage-main,
            .Zhuanlan-main,
            .SearchPage-main,
            .CollectionDetailPage-main,
            [class$="-mainColumn"],
            [class$="-main"] {
                width: 100% !important;
                max-width: 100% !important;
                min-width: 0 !important;
                padding-right: 0 !important;
                box-sizing: border-box !important;
            }

            /* 内容项/卡片自适应 */
            .ContentItem,
            .List-item,
            .Card,
            .TopicFeedItem,
            .HotItem {
                width: 100% !important;
                max-width: 100% !important;
                min-width: 0 !important;
                box-sizing: border-box !important;
                overflow: hidden !important;
            }

            /* 回答/文章正文：全宽 + 自动换行 */
            .ContentItem-body,
            .ContentItem-title,
            .ContentItem-meta,
            .RichContent,
            .RichContent-inner,
            .RichText,
            .Post-content,
            .Post-body,
            .AnswerItem,
            .ArticleItem,
            .FeedItem,
            .SearchItem {
                width: 100% !important;
                max-width: 100% !important;
                min-width: 0 !important;
                box-sizing: border-box !important;
                overflow-wrap: break-word !important;
                word-break: break-word !important;
            }

            /* 图片/视频不超出容器 */
            .RichText img,
            .RichText video,
            .ContentItem img,
            .Post-content img {
                max-width: 100% !important;
                height: auto !important;
            }

            /* 防止横向溢出 */
            html, body {
                overflow-x: hidden !important;
                max-width: 100vw !important;
            }

            /* 减少信息流卡片内边距 */
            .Topstory-mainColumn .Card,
            .Question-main .Card {
                padding-left: 8px !important;
                padding-right: 8px !important;
            }

            /* 首页主列居中 */
            .Topstory-mainColumn { margin: 0 auto; }

            /* 配置插件齿轮按钮：缩小 + 边距 */
            #CTZ_OPEN_CLOSE {
                width: 32px !important;
                height: 32px !important;
                right: 8px !important;
                bottom: 100px !important;
                border-radius: 6px !important;
                font-size: 28px !important;
                border-width: 1.5px !important;
            }
            #CTZ_OPEN_CLOSE .gear {
                width: 16px !important;
                height: 16px !important;
                border-width: 4px !important;
            }
            #CTZ_OPEN_CLOSE .gear_line_1,
            #CTZ_OPEN_CLOSE .gear_line_2,
            #CTZ_OPEN_CLOSE .gear_line_3,
            #CTZ_OPEN_CLOSE .gear_line_4 {
                width: 20px !important;
                height: 4px !important;
                border-left-width: 4px !important;
                border-right-width: 4px !important;
            }
        `);
    } catch (e) { }

    // CSS：去除动画减少合成层开销
    try {
        runCss && runCss('zhihu-perf', `
            .ContentItem, .AnswerItem, .TopstoryItem, .FeedItem {
                transition: none !important;
                animation: none !important;
            }
        `);
    } catch (e) { }

    // CSS：登录弹窗与内容遮罩清理（插件不处理的部分）
    try {
        runCss && runCss('zhihu-login-wall', `
            /* 登录弹窗与背景遮罩 */
            .Modal-backdrop,
            .LoginV2Popup,
            .SignFlowModal,
            .signFlowModal { display: none !important; }

            /* 解除弹窗触发的 body 滚动锁定 */
            body.Modal-open,
            body.overflow-hidden { overflow: auto !important; }

            /* 内容折叠遮罩（登录墙）*/
            .ContentItem-CollapsedBlock,
            .GuestMainCard { display: none !important; }

            /* "在 APP 中打开" / "唤起应用" 弹窗 */
            .ModalWrap-box:has(.OpenInAppButton),
            [class*="OpenApp"],
            [class*="openApp"],
            [class*="AppModal"],
            .zu-button-cover { display: none !important; }

            /* APP 推广横幅 */
            .AppPromotionCard,
            .Topbar-cta,
            .OpenInAppButton,
            .Sticky .Banner,
            .AppBanner,
            [class*="AppBanner"],
            [class*="app-banner"],
            .zu-slide-up { display: none !important; }

            /* 链接卡片：去除背景色 */
            .LinkCard { margin: auto !important; display: inline !important; }
            .LinkCard-content { background-color: transparent !important; }
            .LinkCard-title { color: #999 !important; }

            /* 点赞按钮：去除背景 */
            .VoteButton { color: #999 !important; background: none !important; }
        `);
    } catch (e) { }

    // JS：注入知乎配置插件 + 透明模式弹出层修复
    try {
        // Step 1: GM API shim + 调试标记
        const initScript = '(function(){' +
            'console.log("[zhihu.rule] init, plugin body len: ' + (PLUGIN_BODY ? PLUGIN_BODY.length : 0) + '");' +
            'if (window.__zhihuGlassInjected) return true;' +
            'window.__zhihuGlassInjected = true;' +
            'if (typeof window.GM === "undefined") { window.GM = { setValue:function(k,v){ try{localStorage.setItem(k,typeof v==="string"?v:JSON.stringify(v));}catch(e){} return Promise.resolve(); }, getValue:function(k){ try{return Promise.resolve(localStorage.getItem(k)||undefined);}catch(e){return Promise.resolve();} }, deleteValue:function(k){ try{localStorage.removeItem(k);}catch(e){} return Promise.resolve(); } }; }' +
            'if (typeof window.unsafeWindow==="undefined") window.unsafeWindow = window;' +
            'if (typeof window.GM_info==="undefined") window.GM_info = { script:{ version:"5.21.4" } };' +
            'if (typeof window.GM_registerMenuCommand==="undefined") window.GM_registerMenuCommand = function(){};' +
            'console.log("[zhihu.rule] GM shim ready");' +
            'return true;' +
        '})();';
        runJs && runJs(initScript);

        // Step 2: 插件本体
        if (PLUGIN_BODY && PLUGIN_BODY.length > 100) {
            const pluginScript = '(function(){' +
                'if (window.__zhihuPluginLoaded) return true;' +
                'window.__zhihuPluginLoaded = true;' +
                'console.log("[zhihu.plugin] injecting, len: ' + PLUGIN_BODY.length + '");' +
                'try{' + PLUGIN_BODY + '}catch(e){ console.error("[zhihu.plugin] error", e && e.message, e && e.stack); }' +
                'console.log("[zhihu.plugin] done");' +
                'return true;' +
            '})();';
            runJs && runJs(pluginScript);
        } else {
            console.error('[zhihu.rule] PLUGIN_BODY empty or too short:', PLUGIN_BODY ? PLUGIN_BODY.length : 0);
        }

        // Step 3: 透明模式弹出层修复
        const popupFixStr = fnToStr(installPopupVisibilityFix);
        const popupScript = '(function(){ try{ window.__zhihuPopupFix = window.__zhihuPopupFix || ' + popupFixStr + '; setTimeout(function(){ try{(window.__zhihuPopupFix||function(){})(); }catch(e){} }, 500); }catch(e){} return true; })();';
        runJs && runJs(popupScript);

        // Step 4: 让设置齿轮（#CTZ_OPEN_CLOSE）可以自由拖动
        //
        // 插件把它写死在 position:fixed; bottom:0; right:0（右下角），
        // 小窗口下经常压住正文或和自己应用的底栏重叠。
        // 这里接管定位：拖到哪里就存到哪里，刷新后保持。
        runJs && runJs(GEAR_DRAG_SCRIPT);
    } catch (err) {
        try { console.error('[zhihu.rule] unexpected error', err); } catch (e) { }
    }
}

/**
 * 将渲染进程函数序列化为可注入 WebView 的字符串。
 */
function fnToStr(fn) {
    let str = fn.toString().trim();
    if (!str.startsWith('(')) str = '(' + str + ')';
    return str;
}

/**
 * 透明模式弹出层可见性修复：监听新增 DOM 节点，
 * 对被全局透明 CSS 清除背景的高层浮动元素恢复深色背景。
 */
function installPopupVisibilityFix() {
    try {
        if (window.__zhihuGlassPopupVis) return;
        window.__zhihuGlassPopupVis = true;

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
                var bg = cs.backgroundColor;
                if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return;
                var w = el.offsetWidth;
                var h = el.offsetHeight;
                if (w < 80 || h < 20) return;
                if (w > window.innerWidth * 0.9 || h > window.innerHeight * 0.6) return;

                el.__gPopFix = true;
                el.style.setProperty('background-color', 'rgba(255,255,255,.96)', 'important');
                el.style.setProperty('box-shadow', '0 4px 24px rgba(0,0,0,.18)', 'important');
            } catch (e) { }
        }

        var obs = new MutationObserver(function (muts) {
            muts.forEach(function (m) {
                if (!m.addedNodes) return;
                m.addedNodes.forEach(function (n) {
                    if (n.nodeType !== 1) return;
                    setTimeout(function () {
                        try { tryFix(n); } catch (e) { }
                        try {
                            for (var i = 0; i < (n.children || []).length; i++) {
                                try { tryFix(n.children[i]); } catch (e) { }
                            }
                        } catch (e) { }
                    }, 30);
                });
            });
        });

        obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
    } catch (e) { }
}
