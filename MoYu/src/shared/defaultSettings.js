/**
 * Shared default settings for GlassReader.
 *
 * 本文件为主进程与渲染进程提供统一的默认配置。
 * 每个字段旁给出简短的中文说明，方便维护与调整。
 */

const defaultSettings = {
    // 透明度滑块（0-85）: 数值越大窗口越透明（主进程会转换为实际不透明度）
    transparency: 0,

    // 是否在系统任务栏显示图标（true 显示，false 隐藏）
    showInTaskbar: true,

    // 鼠标移出窗口时自动隐藏（用于浮动/侧边窗口体验）
    autoHide: false,

    // 是否显示标签栏（标签页）
    showTabBar: true,

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

    // 强制网页背景透明（覆盖站点规则）
    forcePageTransparent: false,

    // 灰度渲染模式（将页面颜色变为灰色）
    grayscaleMode: false,

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
    pauseOnBlurHide: false,

    // 阅读器文字颜色（十六进制）
    readerTextColor: '#283247',

    // 阅读器字体缩放百分比（范围 80-160）
    readerFontScale: 100,

    // 是否强制在网页中使用阅读器字号
    forceReaderFont: false,

    // 工具栏停靠底部（true）或悬浮（false）
    toolbarDocked: true,

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

    // 自动滚动相关全局快捷键（默认留空以避免与系统冲突）
    // autoToggleShortcut: 切换自动滚动（例如 'Ctrl+Alt+='）
    // autoSpeedDownShortcut: 减慢自动滚动（例如 'Ctrl+Alt+['）
    // autoSpeedUpShortcut: 加快自动滚动（例如 'Ctrl+Alt+]'）
    autoToggleShortcut: '=',
    autoSpeedDownShortcut: '[',
    autoSpeedUpShortcut: ']',

    // 软件背景完全透明（使 shell / surface / page 都为透明）
    fullWindowTransparent: false,

    // 工具栏是否固定（固定=true 始终显示）
    toolbarPinned: true,

    // 工具栏是否可见（UI 状态控制）
    toolbarVisible: true,

    // 工具栏是否被用户禁用（禁用后不再通过移入显示）
    toolbarDisabled: false,
}

export default defaultSettings
