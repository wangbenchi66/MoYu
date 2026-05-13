# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介

**MoYu（摸鱼工作台）** 是一个 Electron + Vue 3 + Vite 构建的透明浮窗式网页浏览应用。核心特性：透明窗口、多标签页、站点级脚本注入、老板键（快速隐藏）。

## 常用命令

```bash
# 开发（同时启动 Vite dev server 和 Electron）
npm run dev

# 仅启动前端
npm run dev:web

# 构建前端资源到 dist/
npm run build

# 打包 Windows 安装包（NSIS）
npm run dist:win
```

没有测试框架。

## 架构概览

### 项目目录结构

```
electron/
  main.js               主进程：窗口管理、设置持久化、Tray、全局快捷键、IPC 处理
  preload.js            预加载脚本（ESM 版本）：通过 contextBridge 暴露 desktop API
  preload.cjs           预加载 CJS 包装器：动态导入 ESM preload，失败时回退

src/
  main.js               渲染进程入口：创建 Vue 应用、注册 Element Plus 和路由
  App.vue               根组件：快捷键处理、设置面板、热区悬停、窗口级 UI 布局
  style.css             全局样式（CSS 变量、基础排版、主题色）

  components/           公共组件
    BaseButton.vue      通用按钮（自动判断渲染为 el-button 或原生 button）
    BottomToolbar.vue   底部工具栏（后退/前进/缩放/透明度/自动滚动控制）
    ContextMenu.vue     右键菜单（支持图标、快捷键提示）
    ShortcutRow.vue     快捷键设置行（录制/显示/清除快捷键绑定）
    TabBar.vue          顶部标签栏（标签页切换/关闭/右键菜单）
    TopBar.vue          顶部标题栏（窗口控制、透明度快速切换、品牌图标）

  composables/          状态管理层
    useAppState.js      共享状态与基础工具函数（settings、tabs、refs、normalizeUrl 等）
    useDesktopApp.js    应用全局状态聚合层（从子模块导入，统一对外暴露）
    useSettings.js      设置同步、patch、toggle（防抖同步到主进程）
    useRecentVisits.js  最近访问记录管理（localStorage 持久化、分页）
    useTabManager.js    标签页管理（打开/关闭/选择/导航）
    useRecommendedSites.js  推荐站点 CRUD（默认站点 + 用户自定义）
    useLocalFiles.js    本地文件管理（上传、打开、删除本地文档）
    mainpage/           MainPage 专用子模块
      useWebviewRefs.js     webview 引用管理（实例生命周期、事件监听绑定）
      useWebviewExec.js     脚本/CSS 注入工具（runWebviewJS/runWebviewCss）
      useWebviewSync.js     webview 样式/效果同步（透明、无图、滚动条、字号）
      useLocalReaderAutoScroll.js  本地阅读器自动滚动
      usePauseOnBlur.js     失焦/隐藏时暂停媒体与自动滚动

  http/
    index.js            Axios 封装（拦截器、Loading 管理、GET/POST/PUT/DELETE）

  pages/                页面组件
    ConsolePage.vue     控制台布局（底部 Tab 栏 + <router-view>）
    HomePage.vue        首页（推荐站点 + 最近访问）
    ProfilePage.vue     个人中心（菜单导航）
    HistoryPage.vue     历史记录（搜索 + 分页）
    StatsPage.vue       摸鱼时间统计（今日/历史/累计）
    UpdatePage.vue      版本更新检查与更新日志
    MainPage.vue        多 webview 管理（标签渲染、脚本注入调度、本地阅读器）
    LibraryPage.vue     书架（导入/管理 EPUB/PDF/TXT 书籍）
    ReaderPage.vue      阅读器（连续滚动、章节加载、目录/设置面板）

  rules/                站点规则注入系统
    index.js            规则加载入口（import.meta.glob 加载 scripts/，提供 CRUD）
    matchRule.js        规则 URL 匹配工具（统一的 matchesRule 实现）
    providers/
      index.js          规则聚合层（合并 site / settings / toolbar 规则）
      settingsRules.js  设置类规则（按站点覆盖设置）
      toolbarRules.js   工具栏规则（按站点控制工具栏显隐）
    scripts/            站点规则脚本
      default.js        默认全局规则（注入快捷键到 webview）
      zhihu.com.js      知乎增强规则
      weread.qq.com.js  微信读书增强规则

  router/
    index.js            路由配置（Hash 模式，管理控制台区域页面切换）

  shared/
    defaultSettings.js  主进程与渲染进程共享的默认配置（单一来源）
```

### 进程分工

```
electron/main.js        主进程：窗口管理、设置持久化、Tray、全局快捷键（仅老板键）
electron/preload.js     预加载脚本：通过 contextBridge 向渲染进程暴露 ipcRenderer 接口
src/main.js             渲染进程入口：挂载 Vue 应用
```

**主进程 ↔ 渲染进程通信（IPC）**：
- `settings:get` / `settings:update` / `settings:set-transparency` — 设置读写
- `window:minimize` / `window:maximize` / `window:close` / `window:quit` — 窗口控制
- `ui:set-ignore-mouse-events` — 鼠标穿透
- `shell:open-external` — 外部浏览器打开链接（仅允许 http/https）
- `moyu:get-stats` / `moyu:clear-stats` — 摸鱼时间统计读取与清空

### 状态管理

`useDesktopApp.js` 是整个应用的唯一状态聚合层，无 Pinia/Vuex。内部拆分为子模块：

```
useAppState          ← 共享 ref / reactive 对象
  ↑
useSettings          ← 设置同步（防抖 120ms）
useRecentVisits      ← 最近访问记录
useTabManager        ← 标签 CRUD
useRecommendedSites  ← 推荐站点
useLocalFiles        ← 本地文件
  ↑
useDesktopApp        ← 聚合导出（对外 API 不变）
```

设置变更后通过防抖（120ms）同步到主进程；`immediateSyncKeys`（透明度、快捷键等）会立即同步。

### 路由系统（vue-router）

路由配置位于 `src/router/index.js`，使用 **Hash 模式**（`createWebHashHistory`），适配 Electron 的 `file://` 协议。

**路由仅管理控制台区域（dashboard 标签页）的页面切换**，webview 标签页由 `MainPage.vue` 独立管理。

**路由表：**

| 路径 | name | 组件 | 说明 |
|---|---|---|---|
| `/` | `home` | HomePage | 首页（推荐站点 + 最近访问） |
| `/profile` | `profile` | ProfilePage | 个人中心菜单 |
| `/profile/history` | `history` | HistoryPage | 完整历史记录 |
| `/profile/stats` | `stats` | StatsPage | 摸鱼时间统计 |
| `/library` | `library` | LibraryPage | 书架 |
| `/library/:id` | `reader` | ReaderPage | 阅读器 |
| `/update` | `update` | UpdatePage | 版本更新 |

**添加新页面**：在 `src/router/index.js` 的路由数组中注册路由，页面组件通过 `router.push({ name })` 导航。ConsolePage 的底部 Tab 栏根据 `route.path` 自动高亮。

### 摸鱼时间统计

主进程通过窗口可见性事件（`show`/`restore` → 开始计时，`hide`/`minimize` → 结束计时）追踪摸鱼时长，数据按天分组持久化到 `electron-store`（键：`moyuSessions`）。渲染进程通过 `activeStart` 字段实现实时计时显示。

### 快捷键分层

- **全局快捷键**（主进程注册）：仅 `bossKey`（默认 `Alt+Q`），任何时候均生效
- **本地快捷键**（渲染进程 `App.vue` 监听 `keydown`）：透明度调整、鼠标穿透、自动滚动控制，仅窗口聚焦时生效

快捷键格式：`"Ctrl+Alt+T"` 或单字符 `"="`，不支持 Shift 作为修饰符。

### 站点规则注入系统

规则文件位于 `src/rules/scripts/*.js`，构建时通过 `import.meta.glob` 自动加载（`src/rules/index.js`）。

URL 匹配逻辑统一在 `src/rules/matchRule.js`，支持自定义 match 函数、RegExp、数组 pattern、通配符、regex/url/hostname 匹配类型。

**规则文件标准结构：**

```js
// src/rules/scripts/example.com.js
export const pattern = ['example.com'];  // 支持字符串、数组、正则、或 match 函数

export default function main(helper) {
  // CSS 注入（优先 insertCSS，可绕过 CSP；idSuffix 唯一标识，传空字符串则移除）
  helper.runWebviewCss('hide-ads', `
    .ad-banner { display: none !important; }
  `);

  // JS 注入（必须为 IIFE，return true；不能依赖渲染器闭包）
  helper.runWebviewJS(`(() => {
    try {
      // 逻辑...
      // 用 window.__xxx 做重复注入 guard
    } catch(e) {}
    return true;
  })();`);
}
```

`helper` 对象字段：`runWebviewCss(idSuffix, css)`、`runWebviewJS(js)`、`webview`（DOM 元素）、`settings`、`activeTab`、`rule`。

**注入时机**：`MainPage.vue` 监听 webview 的 `dom-ready` 事件后触发规则匹配与注入；框架通过脚本签名防止重复注入。

**调试**：webview 内的 `console.log` 会被转发到渲染器 Console，前缀为 `[webview.console]`。

### 设置持久化

- 持久化到磁盘（`userData/glass-reader-settings.json`）：大部分配置项
- **不持久化**（临时状态）：`transparency`、`autoHide`、`hoverHeaderMode`、`clickThroughMode`、`alwaysOnTop` 等，每次启动从 `defaultSettings` 重置
- 推荐站点 / 最近访问：存储在 `localStorage`

### Vite 配置注意事项

- `webview` 标签被声明为自定义元素（`isCustomElement`），Vue 不会将其作为组件处理
- 开发模式下 Vite dev server 固定监听 `127.0.0.1:5173`（`strictPort: true`）
- 构建时 `base: './'` 确保 Electron 以文件协议加载 `dist/` 时路径正确
