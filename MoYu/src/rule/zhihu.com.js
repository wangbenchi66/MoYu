// 知乎 (zhihu.com) 增强注入规则
// 构建时由 `src/lib/siteRules.js` 通过 `import.meta.glob` 自动加载，无需手动注册。

/** 匹配的主机名 */
export const pattern = ['zhihu.com', 'www.zhihu.com'];

export const description = '知乎增强规则：隐藏登录弹窗/内容遮罩/广告/APP推广横幅，自定义滚轮灵敏度，透明模式弹出层修复。';

const ZHIHU_DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * 规则入口。
 * 参数: helper - { runWebviewCss, runWebviewJS, webview, settings, activeTab, rule }
 */
export default function main(helper) {
    const runCss = helper && helper.runWebviewCss;
    const runJs = helper && helper.runWebviewJS;
    const webview = helper && helper.webview;

    // 强制桌面 UA：知乎手机版会触发大量 App 推广弹窗
    // 若检测到当前 UA 含手机特征，覆写为桌面 UA 并重载一次（__zhihuUaForced 防止循环）
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

    // CSS：小窗口自适应（隐藏侧栏、主栏全宽、精简导航、防止横向溢出）
    try {
        runCss && runCss('zhihu-responsive', `
            /* ── 1. 隐藏所有右侧边栏 ─────────────────────── */
            .Topstory-sideColumn,
            .Question-sideColumn,
            .HotList-sideColumn,
            .ProfilePage-sideColumn,
            .Zhuanlan-sideColumn,
            .SearchPage-sideColumn,
            .CollectionDetailPage-sideColumn,
            [class$="-sideColumn"],
            [class*="-SideColumn"] { display: none !important; }

            /* ── 2. 外层页面容器：block + 全宽 ────────────── */
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

            /* ── 3. 主内容列：全宽、消除固定宽度 ──────────── */
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

            /* ── 4. 内容项/卡片自适应 ───────────────────── */
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

            /* ── 5. 回答/文章正文：全宽 + 自动换行 ──────────── */
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

            /* ── 5b. 图片/视频不超出容器 ────────────────── */
            .RichText img,
            .RichText video,
            .ContentItem img,
            .Post-content img {
                max-width: 100% !important;
                height: auto !important;
            }

            /* ── 5c. 隐藏溢出右侧的悬浮操作按钮 ──────────── */
            .ContentItem-rightButton,
            .RichContent-action,
            [class*="rightButton"] {
                display: none !important;
            }

            /* ── 6. 导航栏适配 ──────────────────────────── */
            .AppHeader-inner {
                padding-left: 8px !important;
                padding-right: 8px !important;
            }
            /* 隐藏导航栏内宽度撑开的功能区（写回答/提问按钮等） */
            .AppHeader-userInfo .Button.Button--blue {
                display: none !important;
            }

            /* ── 7. 防止横向溢出 ──────────────────────── */
            html, body {
                overflow-x: hidden !important;
                max-width: 100vw !important;
            }

            /* ── 8. 减少信息流卡片内边距（小窗口更紧凑） ── */
            .Topstory-mainColumn .Card,
            .Question-main .Card {
                padding-left: 8px !important;
                padding-right: 8px !important;
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

    // CSS：清理登录墙、广告、APP推广、热搜、页脚等干扰元素（含 zhihu-custom 插件规则）
    try {
        runCss && runCss('zhihu-clean', `
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

            /* APP 下载推广横幅（顶部 sticky 条 + 卡片） */
            .AppPromotionCard,
            .Topbar-cta,
            .OpenInAppButton,
            .Sticky .Banner,
            .AppBanner,
            [class*="AppBanner"],
            [class*="app-banner"],
            .zu-slide-up { display: none !important; }

            /* 信息流广告（含 zhihu-custom 补充选择器） */
            .NativeAdCard,
            [data-za-module="FeedAdCard"],
            .Ad-Card,
            .TopstoryItem--advertCard,
            .Pc-card,
            .Pc-word,
            .Pc-word-new,
            .RichText-ADLinkCardContainer,
            .Pc-Business-Card-PcTopFeedBanner,
            .ZhiGoodsCard,
            .css-e69dqy,
            .Card.css-15hh8yc { display: none !important; }

            /* 底部固定推广栏 */
            .CornerWidget { display: none !important; }

            /* "在 APP 中打开" / "唤起应用" 弹窗 */
            .ModalWrap-box:has(.OpenInAppButton),
            [class*="OpenApp"],
            [class*="openApp"],
            [class*="AppModal"],
            .zu-button-cover { display: none !important; }

            /* 顶部导航栏 Logo */
            .AppHeader-logo,
            .AppHeader-logoContainer { display: none !important; }

            /* 知乎热搜卡片 */
            .Topstory .HotSearchCard { display: none !important; }

            /* 首页全局分类侧边栏 / "更多分类" 入口卡片 */
            .Topstory .GlobalSideBar-category { display: none !important; }
            .Topstory .Card[aria-label="更多分类入口"] { display: none !important; }

            /* 首页和问题页页脚 */
            .Topstory .Footer,
            .Topstory footer { display: none !important; }

            /* 问题页：侧边栏 + 问题标题右侧区域 */
            .QuestionHeader-side { display: none !important; }
            .QuestionHeader-main { flex: 1 !important; }

            /* 问题主列和快捷列表宽度继承父容器 */
            .Question-main .Question-mainColumn,
            .ListShortcut { width: inherit !important; }

            /* 搜索页侧边栏 + 标签栏 + 容器宽度 */
            .SearchSideBar,
            .SearchTabs { display: none !important; }
            .SearchMain { width: 100% !important; margin: 0 !important; }
            .Search-container { width: auto !important; min-height: auto !important; }
            .SearchSections { width: auto !important; }

            /* 个人主页侧边栏 */
            .Profile-sideColumn { display: none !important; }

            /* 全局左侧导航栏（小窗口下节省宽度） */
            .GlobalSideBar { display: none !important; }

            /* 右下角悬浮按钮组 */
            .CornerButtons { display: none !important; }

            /* 信息流视频（小窗口下不适合播放） */
            .ZVideoItem-video,
            .VideoAnswerPlayer { display: none !important; }

            /* 回答底部操作栏：取消吸底定位，避免遮挡内容 */
            .RichContent-actions { bottom: auto !important; }

            /* 链接卡片：去除背景色，标题低调化 */
            .LinkCard { margin: auto !important; display: inline !important; }
            .LinkCard-content { background-color: transparent !important; }
            .LinkCard-title { color: #999 !important; }

            /* 点赞按钮：去除背景，低调灰色 */
            .VoteButton { color: #999 !important; background: none !important; }
        `);
    } catch (e) { }

    // CSS：极简模式（按用户导出配置调整，与 CONFIG_SIMPLE 默认有差异）
    try {
        runCss && runCss('zhihu-simple', `
            /* 顶部导航栏全部隐藏（hiddenHeader / hiddenHeaderScroll） */
            .AppHeader,
            .ColumnPageHeader-Wrapper { display: none !important; }
            .PubIndex-CategoriesHeader { top: 0 !important; }
            .AppHeader.is-fixed { display: none !important; }
            .zhuanlan .css-f2kkrj { top: 0; }

            /* 问答页面右侧信息栏（hiddenAnswerRightFooter） */
            .Question-sideColumn { display: none !important; }

            /* 问答操作栏：底部悬浮推出屏幕 / 非固定态隐藏（hiddenFixedActions / hiddenAnswerItemActions） */
            .Question-mainColumn .RichContent .ContentItem-actions.is-fixed { bottom: -60px !important; }
            .Question-mainColumn .RichContent .ContentItem-actions:not(.is-fixed) { visibility: hidden; height: 0; }

            /* 推荐/关注列表操作栏（hiddenItemActions） */
            #TopstoryContent .RichContent .ContentItem-actions:not(.is-fixed) { visibility: hidden; height: 0; padding: 0; }

            /* 问题分享按钮 / 话题标签 / 专题收录标签（hiddenQuestionShare / hiddenQuestionTag / hiddenQuestionSpecial） */
            .zhihu .QuestionHeaderActions .Popover.ShareMenu { display: none !important; }
            .QuestionHeader-tags,
            .QuestionHeader .css-wmwsyx { display: none !important; }
            .QuestionHeader .LabelContainer-wrapper { display: none; }

            /* 问题关注 / 写回答 / 邀请按钮（hiddenQuestionFollowing / hiddenQuestionAnswer / hiddenQuestionInvite） */
            .QuestionHeader .FollowButton { display: none; }
            .QuestionHeader .FollowButton ~ button { display: none; }
            .QuestionHeader .QuestionHeaderActions > button:first-child { display: none; }

            /* 文章：关联话题 / 标题图片 / 悬浮操作栏（hiddenZhuanlanTag / hiddenZhuanlanTitleImage / hiddenZhuanlanActions） */
            .Post-topicsAndReviewer { display: none !important; }
            .zhuanlan .Post-Row-Content-left-article .css-1ac3ifk { display: none !important; }
            .zhuanlan .RichContent-actions.is-fixed > .ContentItem-actions { display: none; }

            /* 列表图片 / "阅读全文"文字 / 折叠摘要（hiddenListImg / hiddenReadMoreText / hiddenAnswers） */
            .RichContent-cover,
            .HotItem-img,
            .TopstoryItem .Image-Wrapper-Preview { display: none !important; }
            .HotItem-metrics--bottom { position: initial !important; }
            .ContentItem-more { font-size: 0 !important; }
            /* 摘要/预览内容：多选择器全覆盖（折叠/未折叠/ContentItem-body 三种情况） */
            .Topstory-container .TopstoryItem .RichContent,
            .Topstory-container .TopstoryItem .ContentItem-body,
            .HotItem-excerpt--multiLine,
            .TopstoryQuestionAskItem .RichContent .RichContent-inner,
            .HotItem-content .HotItem-excerpt,
            .Topstory-recommend .ZVideoItem-video,
            .Topstory-recommend .VideoAnswerPlayer { display: none !important; }

            /* 列表"亲自答"标签（hiddenListAnswerInPerson） */
            .Topstory-mainColumn .LabelContainer { display: none; }

            /* 列表-标题类别标签（questionTitleTag）
               AnswerItem/QuestionAskItem 的 ContentItem-title 内部子元素（a / h2）被知乎设为 display:block，
               导致 ::before 和标题文本分两行。将容器和直接子元素均强制 inline。 */
            .AnswerItem .ContentItem-title,
            .TopstoryQuestionAskItem .ContentItem-title { display: block !important; }
            .AnswerItem .ContentItem-title > *,
            .TopstoryQuestionAskItem .ContentItem-title > * { display: inline !important; }
            .AnswerItem .ContentItem-title::before { content: '「问答」'; color: #ec7259; font-size: 14px; margin-right: 4px; }
            .ArticleItem .ContentItem-title::before { content: '「文章」'; color: #00965e; font-size: 14px; margin-right: 4px; }
            .ZvideoItem .ContentItem-title::before,
            .ZVideoItem .ContentItem-title::before { content: '「视频」'; color: #12c2e9; font-size: 14px; margin-right: 4px; }
            .TopstoryItem .PinItem::before { content: '「想法」'; color: #9c27b0; font-size: 14px; margin-right: 6px; font-weight: normal; }
            .TopstoryQuestionAskItem .ContentItem-title::before { content: '「提问」'; color: #533b77; font-size: 14px; margin-right: 4px; }
            .PinItem > .ContentItem-title { margin-top: 4px; }

            /* 热榜：热度值 / "新"标签（hiddenHotItemMetrics / hiddenHotItemLabel；hiddenHotItemIndex=false 故不隐藏编号） */
            .HotItem-content .HotItem-metrics { display: none; }
            .HotItem-label { display: none; }

            /* 回答作者：仅隐藏关注按钮（hiddenDetailFollow=true；头像/姓名/简介按用户配置保留） */
            .AnswerItem .AuthorInfo .FollowButton { display: none; }

            /* 知学堂推广商品（hiddenZhihuZhiShop） */
            .RichText-EduCardContainer { display: none; }

            /* 首页创作中心 / 圈子 / 推荐关注（hiddenHomeCreatorEntrance / hiddenHomeQuanzi / hiddenHomeRecommendFollow） */
            .Topstory .css-19idom { display: none; }
            .Card.css-18gpi2u { display: none; }
            .Topstory .css-173vipd { display: none; }

            /* 首页主列居中（侧边栏全隐后补充居中） */
            .Topstory-mainColumn { margin: 0 auto; }
        `);
    } catch (e) { }

    // JS：透明模式弹出层修复 + 自定义滚轮灵敏度
    try {
        runJs && runJs(`(function () {
            try {
                if (window.__zhihuGlassInjected) return true;
                window.__zhihuGlassInjected = true;

                // 在 JS 层覆写 Location.prototype，静默丢弃非 http(s) 协议跳转（如 zhihu://）
                // 必须最早执行，防止页面脚本抢先触发导航
                //try { (${fnToStr(blockCustomProtocol)})(); } catch (e) {}

                // 透明模式弹出层修复（500ms）
                try { window.__zhihuPopupFix = window.__zhihuPopupFix || ${fnToStr(installPopupVisibilityFix)}; } catch (e) {}
                try { setTimeout(function () { try { (window.__zhihuPopupFix || function () {})(); } catch (e) {} }, 500); } catch (e) {}

                // 顶部 App 推广横幅清除（300ms + MutationObserver 持续清理）
                try { window.__zhihuBannerKiller = window.__zhihuBannerKiller || ${fnToStr(killAppBanner)}; } catch (e) {}
                try { setTimeout(function () { try { (window.__zhihuBannerKiller || function () {})(); } catch (e) {} }, 300); } catch (e) {}

                // 高性能模式：推荐列表 ≤50 条、回答页 ≤30 条，超出删除最早节点并补偿滚动位置
                try { window.__zhihuHpMode = window.__zhihuHpMode || ${fnToStr(attachHighPerformance)}; } catch (e) {}
                try { setTimeout(function () { try { (window.__zhihuHpMode || function () {})(); } catch (e) {} }, 800); } catch (e) {}

                // 自定义滚轮灵敏度（600ms，默认 0.4，比微信读书宽松）
                try { window.__zhihuWheelHandler = window.__zhihuWheelHandler || ${fnToStr(attachWheelHandler)}; } catch (e) {}
                try { setTimeout(function () { try { (window.__zhihuWheelHandler || function () {})(); } catch (e) {} }, 600); } catch (e) {}
            } catch (e) {}
            return true;
        })();`);
    } catch (err) {
        try { console.error('[zhihu.rule] unexpected error', err); } catch (e) { }
    }
}

/**
 * 在捕获阶段拦截用户点击 <a href="zhihu://..."> 类自定义协议链接。
 * 主进程已通过 will-navigate/will-frame-navigate 拦截导航层，
 * 此处只补充用户点击路径，不覆写任何 Location/iframe 原型（避免干扰 SPA 导航）。
 */
function blockCustomProtocol() {
    try {
        if (window.__zhihuProtocolBlocked) return;
        window.__zhihuProtocolBlocked = true;

        function isCustomProtocol(url) {
            if (!url || typeof url !== 'string') return false;
            return !/^(https?:|file:|data:|blob:|about:|javascript:|mailto:|#|\/)/i.test(url.trim());
        }

        document.addEventListener('click', function (e) {
            try {
                var t = e.target;
                while (t && t !== document.body) {
                    if (t.tagName === 'A' || t.tagName === 'AREA') {
                        var href = t.getAttribute('href') || '';
                        if (href && isCustomProtocol(href)) {
                            e.preventDefault();
                            e.stopPropagation();
                            return;
                        }
                    }
                    t = t.parentElement;
                }
            } catch (err) { }
        }, true);

    } catch (e) { }
}

/**
 * 清除知乎所有"打开/唤起 App"相关 UI：
 * - 顶部横幅（打开App 按钮所在条）
 * - React Portal 弹窗（直接插入 body 的子节点）
 * - 拦截"确认"按钮点击，防止触发 zhihu:// 跳转
 */
function killAppBanner() {
    try {
        if (window.__zhihuBannerKillerInstalled) return;
        window.__zhihuBannerKillerInstalled = true;

        function isAppText(t) {
            if (!t) return false;
            // 常规 App 推广文字
            if (/打开App|打开APP|知乎\s*App|App\s*内|在App中|唤起App|下载App/i.test(t)) return true;
            // "是否在知乎 App 内阅读全文" 类型的短文本（弹窗标题特征，限长避免误匹配正文）
            if (t.length < 40 && /是否在.{0,8}阅读/.test(t)) return true;
            return false;
        }

        function getText(el) {
            try { return el.innerText || el.textContent || ''; } catch (e) { return ''; }
        }

        function kill(el) {
            try {
                if (!el || el.__zhihuKilled) return;
                el.__zhihuKilled = true;
                el.style.setProperty('display', 'none', 'important');
            } catch (e) { }
        }

        function getBodyDirectChild(el) {
            var cur = el;
            while (cur && cur.parentElement && cur.parentElement !== document.body) {
                cur = cur.parentElement;
            }
            return (cur && cur !== document.body) ? cur : null;
        }

        function checkEl(el) {
            try {
                if (!el || el.nodeType !== 1 || el.__zhihuKilled) return;
                var tag = (el.tagName || '').toUpperCase();
                if (tag === 'HTML' || tag === 'BODY' || tag === 'SCRIPT' || tag === 'STYLE') return;
                if (!isAppText(getText(el))) return;

                // 优先杀掉整个 portal 容器（body 直接子节点），而不是内部标题元素
                var portal = getBodyDirectChild(el);
                if (portal && portal !== el) {
                    kill(portal);
                    return;
                }

                // el 本身是 body 直接子节点（横幅条或弹窗容器），检查尺寸/定位
                var vw = window.innerWidth || 375;
                var rect = el.getBoundingClientRect();
                if (rect.width >= vw * 0.5 && rect.height > 0) {
                    kill(el);
                    return;
                }
                var cs = window.getComputedStyle(el);
                if (cs.position === 'fixed' || cs.position === 'absolute') {
                    kill(el);
                }
            } catch (e) { }
        }

        function deepScan(root) {
            try {
                checkEl(root);
                var all = root.querySelectorAll ? root.querySelectorAll('*') : [];
                for (var i = 0; i < all.length; i++) { checkEl(all[i]); }
            } catch (e) { }
        }

        function scanBody() {
            try {
                var children = document.body ? document.body.children : [];
                for (var i = 0; i < children.length; i++) { deepScan(children[i]); }
            } catch (e) { }
        }

        document.addEventListener('click', function (e) {
            try {
                var t = e.target;
                var depth = 0;
                while (t && t !== document.body && depth++ < 10) {
                    var tag = (t.tagName || '').toUpperCase();
                    var clickable = tag === 'A' || tag === 'BUTTON' ||
                        (t.getAttribute && (t.getAttribute('role') === 'button'));
                    if (clickable && isAppText(getText(t))) {
                        e.preventDefault(); e.stopPropagation(); return;
                    }
                    if (clickable) {
                        var bt = getText(t).trim();
                        if (bt === '确认' || bt === '确定' || bt === '打开') {
                            var portal = getBodyDirectChild(t);
                            if (portal && isAppText(getText(portal))) {
                                e.preventDefault(); e.stopPropagation();
                                kill(portal); return;
                            }
                        }
                    }
                    t = t.parentElement;
                }
            } catch (err) { }
        }, true);

        // 为 body 直接子节点设置子节点监听（持久 portal 容器后续插入弹窗时触发）
        function watchBodyChild(node) {
            try {
                var tag = (node.tagName || '').toUpperCase();
                if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK') return;
                var obs = new MutationObserver(function (muts) {
                    muts.forEach(function (m) {
                        m.addedNodes && m.addedNodes.forEach(function (n) { onNodeAdded(n); });
                    });
                });
                obs.observe(node, { childList: true });
            } catch (e) { }
        }

        function onNodeAdded(n) {
            if (n.nodeType !== 1) return;
            // 若新增节点是 body 直接子节点，也监听其子节点（为未来弹窗做准备）
            if (n.parentElement === document.body) watchBodyChild(n);
            [0, 100, 400].forEach(function (delay) {
                setTimeout(function () { try { deepScan(n); } catch (e) { } }, delay);
            });
        }

        scanBody();

        // 监听 body 直接子节点新增（React Portal 动态挂载场景）
        var bodyObs = new MutationObserver(function (muts) {
            muts.forEach(function (m) {
                m.addedNodes && m.addedNodes.forEach(function (n) { onNodeAdded(n); });
            });
        });
        bodyObs.observe(document.body || document.documentElement, { childList: true });

        // 监听已存在的 body 直接子节点内部变化
        try {
            var existing = document.body ? Array.from(document.body.children) : [];
            existing.forEach(function (child) { watchBodyChild(child); });
        } catch (e) { }

        // 滚动时扫描：立即扫一次 body 直接子节点，300ms 后补一次深度扫描
        var scrollTimer = null;
        window.addEventListener('scroll', function () {
            try { scanBody(); } catch (e) { }
            if (scrollTimer) return;
            scrollTimer = setTimeout(function () {
                scrollTimer = null;
                try { deepScan(document.body || document.documentElement); } catch (e) { }
            }, 300);
        }, { passive: true });

        // 定期深度扫描：前 20 秒高频（1s），之后低频（5s），确保延迟出现的弹窗也能被捕获
        var _sc = 0;
        var _st = setInterval(function () {
            try { deepScan(document.body || document.documentElement); } catch (e) { }
            if (++_sc >= 20) {
                clearInterval(_st);
                setInterval(function () { try { deepScan(document.body || document.documentElement); } catch (e) { } }, 5000);
            }
        }, 1000);
    } catch (e) { }
}

/**
 * 将渲染进程函数序列化为可注入 WebView 的字符串。
 * 参数: fn - 要序列化的函数
 */
function fnToStr(fn) {
    let str = fn.toString().trim();
    if (!str.startsWith('(')) str = '(' + str + ')';
    return str;
}

/**
 * 透明模式弹出层可见性修复：监听新增 DOM 节点，
 * 对被全局透明 CSS 清除背景的高层浮动元素恢复深色背景，
 * 确保评论框、分享弹窗等弹出层在透明模式下可见。
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

/**
 * 自定义鼠标滚轮灵敏度：知乎默认缩放系数 0.4（比微信读书宽松，适合信息流浏览）。
 * 可通过以下方式动态调整：
 *   window.dispatchEvent(new CustomEvent('zhihu-set-wheel-scale', { detail: { scale: 0.6 } }))
 */
function attachWheelHandler() {
    try {
        if (window.__zhihuWheelAttached) return;
        window.__zhihuWheelAttached = true;
        window.__zhihuWheelScale = window.__zhihuWheelScale || 0.4;

        try {
            window.addEventListener('zhihu-set-wheel-scale', function (ev) {
                try {
                    var s = ev && ev.detail && typeof ev.detail.scale === 'number' ? ev.detail.scale : null;
                    if (s !== null) window.__zhihuWheelScale = s;
                } catch (e) { }
            }, false);
        } catch (e) { }

        document.addEventListener('wheel', function (evt) {
            try {
                if (evt.ctrlKey || evt.metaKey) return;
                var delta = evt.deltaY || 0;
                if (Math.abs(delta) < 0.5) return;

                evt.preventDefault();
                evt.stopPropagation();

                var scale = typeof window.__zhihuWheelScale === 'number' ? window.__zhihuWheelScale : 0.4;

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
                if (!scrollEl) scrollEl = document.scrollingElement || document.documentElement || document.body;

                scrollEl.scrollTop += delta * scale;
            } catch (e) { }
        }, { passive: false, capture: true });
    } catch (e) { }
}

/**
 * 高性能模式（对应 zhihu-custom 插件默认开启的两项高性能模式）：
 * - 推荐列表超过 50 条时删除最早的节点并补偿滚动位置
 * - 回答页超过 30 条时删除最早的回答节点
 * 通过压缩 DOM 数量降低内存与重排开销。
 */
function attachHighPerformance() {
    try {
        if (window.__zhihuHpInstalled) return;
        window.__zhihuHpInstalled = true;

        var MAX_FEED = 50;
        var MAX_ANSWER = 30;

        function trimFeed() {
            try {
                var items = document.querySelectorAll('.Topstory-mainColumn .List-item');
                if (items.length <= MAX_FEED) return;
                var delCount = items.length - MAX_FEED;
                var lastItem = items[items.length - 1];
                var lastTopBefore = lastItem ? lastItem.offsetTop : 0;
                var scrollY = document.documentElement.scrollTop;
                for (var i = 0; i < delCount; i++) {
                    try { items[i].remove(); } catch (e) {}
                }
                if (lastItem) {
                    var lastTopAfter = lastItem.offsetTop;
                    window.scrollTo({ top: scrollY - (lastTopBefore - lastTopAfter) });
                }
            } catch (e) {}
        }

        function trimAnswers() {
            try {
                var items = document.querySelectorAll('.AnswersNavWrapper .List-item');
                if (items.length <= MAX_ANSWER) return;
                var delCount = items.length - MAX_ANSWER;
                for (var i = 0; i < delCount; i++) {
                    try { items[i].remove(); } catch (e) {}
                }
            } catch (e) {}
        }

        var hpTimer = null;
        window.addEventListener('scroll', function () {
            if (hpTimer) return;
            hpTimer = setTimeout(function () {
                hpTimer = null;
                trimFeed();
                trimAnswers();
            }, 100);
        }, { passive: true });

    } catch (e) {}
}
