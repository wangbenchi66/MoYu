# MoYu（摸鱼工作台）

一个基于 Electron + Vue 3 + Vite 构建的透明浮窗式网页浏览应用。

## 核心特性

- **透明窗口** — 窗口背景透明，可叠加在其他应用上方，隐蔽浏览
- **多标签页** — 支持多 webview 标签页，独立管理
- **站点规则注入** — 按站点自动注入自定义 CSS/JS，适配页面显示
- **老板键** — 全局快捷键（默认 `Alt+Q`）一键隐藏/恢复窗口
- **阅读器** — 内置 EPUB / TXT / Markdown / PDF 书架与连续滚动阅读器
- **摸鱼统计** — 自动统计使用时长，按天分组展示

## 技术栈

| 层面 | 技术 |
|------|------|
| 桌面框架 | Electron |
| 前端框架 | Vue 3（Composition API） |
| 构建工具 | Vite |
| UI 组件 | Element Plus |
| 路由 | vue-router（Hash 模式） |
| HTTP | Axios |
| 电子书解析 | epubjs |
| Markdown 解析 | marked |
| HTML 净化 | DOMPurify |

## 项目结构

```
electron/
  main.js               主进程：窗口管理、设置持久化、Tray、全局快捷键
  preload.js            预加载脚本：通过 contextBridge 暴露 desktop API

src/
  main.js               渲染进程入口：挂载 Vue 应用
  App.vue               根组件：快捷键处理、设置面板、热区悬停
  style.css             全局样式

  components/           公共组件
    BaseButton.vue      通用按钮
    BottomToolbar.vue   底部工具栏（后退/前进/缩放）
    ContextMenu.vue     右键菜单
    ShortcutRow.vue     快捷键设置行
    TabBar.vue          顶部标签栏
    TopBar.vue          顶部标题栏（窗口控制、透明度切换）

  composables/          状态管理层
    useAppState.js      共享状态与基础工具函数
    useDesktopApp.js    全局状态聚合层（统一对外暴露）
    useSettings.js      设置同步（防抖同步到主进程）
    useRecentVisits.js  最近访问记录
    useTabManager.js    标签页管理
    useRecommendedSites.js  推荐站点 CRUD
    useLocalFiles.js    本地文件管理
    mainpage/           MainPage 专用子模块
      useWebviewRefs.js     webview 引用与生命周期
      useWebviewExec.js     脚本/CSS 注入工具
      useWebviewSync.js     webview 样式同步
      useLocalReaderAutoScroll.js  本地阅读器自动滚动
      usePauseOnBlur.js     失焦时暂停媒体与滚动

  http/                 Axios 封装（拦截器、Loading 管理）

  pages/                页面组件
    ConsolePage.vue     控制台布局（底部 Tab + router-view）
    HomePage.vue        首页（推荐站点 + 最近访问）
    ProfilePage.vue     个人中心
    HistoryPage.vue     历史记录
    StatsPage.vue       摸鱼时间统计
    UpdatePage.vue      版本更新
    MainPage.vue        多 webview 管理与脚本注入
    LibraryPage.vue     书架（EPUB/PDF/TXT 导入）
    ReaderPage.vue      阅读器（连续滚动、章节加载）

  rules/                站点规则注入系统
    index.js            规则加载入口（import.meta.glob）
    matchRule.js        URL 匹配工具
    providers/          规则聚合层
      index.js          聚合导出
      settingsRules.js  按站点覆盖设置
      toolbarRules.js   按站点控制工具栏
    scripts/            站点规则脚本
      default.js        默认全局规则
      zhihu.com.js      知乎增强
      weread.qq.com.js  微信读书增强

  router/               路由配置（Hash 模式）

  shared/
    defaultSettings.js  主/渲染进程共享默认配置
```

## 架构概览

### 进程分工

- **主进程** (`electron/main.js`) — 窗口管理、设置持久化、Tray、全局快捷键（仅老板键）
- **预加载** (`electron/preload.js`) — 通过 `contextBridge` 向渲染进程暴露 desktop API
- **渲染进程** (`src/main.js`) — Vue 应用入口

主进程与渲染进程通过 IPC 通信：`settings:get/update`、`window:minimize/maximize/close`、`shell:open-external` 等。

### 状态管理

无 Pinia/Vuex，使用 `useDesktopApp.js` 作为唯一状态聚合层，内部按职责拆分为子模块：

```
useAppState          ← 共享 ref / reactive 对象
  ↑
useSettings          ← 设置同步（防抖 120ms）
useRecentVisits      ← 最近访问记录
useTabManager        ← 标签 CRUD
useRecommendedSites  ← 推荐站点
useLocalFiles        ← 本地文件
  ↑
useDesktopApp        ← 聚合导出
```

### 站点规则注入

规则位于 `src/rules/scripts/*.js`，构建时通过 `import.meta.glob` 自动加载。URL 匹配逻辑统一在 `matchRule.js`，支持正则、通配符、自定义函数等多种匹配方式。

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Alt+Q` | 老板键（隐藏/恢复窗口） |
| `Ctrl+Alt+T` | 切换透明度 |
| `=` / `-` | 调整透明度 |

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式（同时启动 Vite + Electron）
npm run dev

# 构建前端
npm run build

# 打包 Windows 安装包
npm run dist:win
```
