/**
 * MoYu 默认配置（主进程与渲染进程共享）
 *
 * 本文件为主进程与渲染进程提供统一的默认配置。
 * 每个字段旁给出简短的中文说明，方便维护与调整。
 */

const defaultSettings = {
    // 透明度滑块（0-85）: 数值越大窗口越透明（主进程会转换为实际不透明度）
    transparency: 0,

    // 是否在系统任务栏显示图标（true 显示，false 隐藏）
    showInTaskbar: true,

    // 鼠标移出窗口时自动隐藏（false=关闭, 'hover'=移入显示, 'hide'=移入不显示）
    autoHide: false,

    // 是否显示标签栏（标签页）
    showTabBar: false,

    // 无图模式：在网页中尽量隐藏或不加载图片资源
    noImageMode: false,

    // 软件背景透明：影响 shell/surface/page 的 CSS 透明度
    transparentBackground: false,

    // 防截屏模式（启用后开启 content protection，防止录屏/截屏）
    antiScreenshotMode: false,

    // 移动模式（界面在小屏/仿移动下的展示优化）
    mobileMode: false,

    // 悬停标题栏：只有光标靠近顶部时显示标题栏
    hoverHeaderMode: false,

    // 网页区域透明（仅影响页面内容区）
    pageTransparentMode: false,

    // 仅软件外壳透明：shell/surface 归零，但网页区域保持不透明。
    // 与 fullWindowTransparent 的区别：后者连网页一起透明。
    shellOnlyTransparent: false,

    // 强制网页背景透明（覆盖站点规则）
    forcePageTransparent: false,

    // 灰度渲染模式（将页面颜色变为灰色）
    grayscaleMode: false,

    // 主题模式：'light' | 'dark' | 'system'（默认跟随系统）
    themeMode: 'system',

    // 深色模式下是否让网页也变深（注入 CSS，仅对未自适应深色的站点生效）
    darkenWebPages: true,

    // 鼠标穿透（窗口忽略鼠标事件，允许点击穿透到桌面或下层窗口）
    clickThroughMode: false,

    // 关闭时是否最小化到托盘（true = 最小化到托盘，false = 直接退出）
    closeToTray: true,

    // 是否禁用窗口阴影（常用于无阴影的透明窗口风格）
    disableWindowShadow: false,

    // 窗口是否始终置顶
    alwaysOnTop: false,

    // 是否启用自动滚动功能（在阅读模式下）
    autoScrollEnabled: false,

    // 自动滚动速度（范围 5-80，数值越大滚动越快）
    autoScrollSpeed: 22,

    // 失焦或隐藏时暂停所有媒体（视频/音频）并停止自动滚动，恢复时再恢复
    // true = 启用该行为，false = 不做任何自动暂停/恢复
    pauseOnBlurHide: true,

    // 窗口失焦/隐藏时是否允许音频继续在后台播放。
    // 默认 true —— 听播客/音乐时切走不该被掐断。
    // 开启后：音频（<audio> 或没有画面的播放）不暂停、不静音；
    //        视频仍会被暂停；自动滚动仍会停止。
    // 注意：仅影响「失焦/隐藏」路径。老板键静音（muteOnBossKey）是紧急隐藏，
    //       无论此项如何设置都会静音。
    keepAudioPlayingInBackground: true,

    // 阅读器文字颜色（十六进制）
    readerTextColor: '#283247',

    // 阅读器字体缩放百分比（范围 80-160）
    readerFontScale: 100,

    // 是否强制在网页中使用阅读器字号
    forceReaderFont: false,

    // 工具栏停靠底部（true）或悬浮（false）
    toolbarDocked: false,

    // 是否强制替换网页文字颜色为 `readerTextColor`
    forceReaderTextColor: false,



    // 是否显示滚动条
    showScrollbars: false,

    // 启动默认 URL（空字符串或 'about:blank' 表示空白页）
    defaultUrl: '',

    // 托盘图标路径：请把你要显示的图片放在此路径（相对于项目根或者绝对路径）
    // 例如：'public/tray.png'
    trayIconPath: 'public/icon.ico',
    // 软件图标路径：用于应用程序窗口 / 任务栏等显示的图标
    appIconPath: 'public/icon.png',

    // 全局快捷键：老板键（示例 'Alt+Q'）用于快速隐藏/恢复窗口
    bossKey: 'Alt+Q',

    // 快捷键：降低透明度（示例 'Alt+Up'）
    decreaseTransparencyShortcut: 'Alt+Up',

    // 快捷键：提高透明度（示例 'Alt+Down'）
    increaseTransparencyShortcut: 'Alt+Down',

    // 快捷键：切换鼠标穿透（示例 'Ctrl+Alt+T'）
    clickThroughShortcut: 'Ctrl+Alt+T',

    // 自动滚动相关全局快捷键
    // autoToggleShortcut: 切换自动滚动（=）
    // autoSpeedDownShortcut: 减慢自动滚动（[）
    // autoSpeedUpShortcut: 加快自动滚动（]）
    autoToggleShortcut: '=',
    autoSpeedDownShortcut: '[',
    autoSpeedUpShortcut: ']',

    // 软件背景完全透明（使 shell / surface / page 都为透明）
    fullWindowTransparent: false,

    // 工具栏是否固定（固定=true 始终显示）
    toolbarPinned: false,

    // 工具栏是否可见（UI 状态控制）
    toolbarVisible: true,

    // 工具栏是否被用户禁用（禁用后不再通过移入显示）
    toolbarDisabled: false,

    // ── 隐私 / 痕迹清理 ──
    // 历史记录保留天数：0 表示永久保留；其它值（1/3/7/30）表示只保留最近 N 天
    historyRetentionDays: 0,

    // 是否在应用启动时自动清理过期痕迹
    autoCleanOnStartup: true,

    // ── 会话与痕迹 ──

    // 启动时是否恢复上次的标签页。
    // 默认开启（符合浏览器预期）；在意痕迹可关掉。
    restoreTabsOnStartup: true,

    // 老板键隐藏窗口时是否静音所有网页音频（恢复显示时还原）。
    // 摸鱼场景下建议开启——否则藏了窗口声音还在放。
    muteOnBossKey: true,

    // 老板键/托盘唤出窗口时，是否短暂高亮一次（临时恢复不透明 + 显示顶栏 + 画描边）。
    //
    // 为什么需要：开启「软件背景透明 + 网页背景透明 + 标题栏悬停隐藏」后，
    // 窗口虽然显示了，但视觉上和桌面没有区别，连按几次老板键就会找不到窗口。
    // 高亮只是视觉提示，2 秒后自动褪去，**不会修改用户的透明设置**。
    //
    // 默认开启（这是防止用户"把自己锁在外面"的兜底）；
    // 如果觉得高亮打扰，可以关掉——关掉后仍有设置页的警告提示与托盘菜单可用。
    revealHintOnShow: true,

    // 退出应用时是否清理 webview 的浏览数据（缓存 / Cookie / 本地存储等）。
    // 属于强隐私选项，会清掉所有网站的登录态，默认关闭。
    clearCacheOnExit: false,

    // 注：匿名设备上报（POST /api/MoYu/ReportDevice）与首次启动的隐私同意弹窗
    // 已整体移除，相关设置项 backendEnabled 一并删除。
    // window.desktop.checkForUpdate() 是**本地 IPC**（只返回版本号/平台），
    // 不属于网络请求，仍被「关于」页的检查更新使用。
}

export default defaultSettings
