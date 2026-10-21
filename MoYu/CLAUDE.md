# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介

**MoYu（摸鱼工作台）** 是一个 Electron + Vue 3 + Vite 构建的透明浮窗式网页浏览应用。核心特性：透明窗口、多标签页、站点级脚本注入（支持油猴脚本导入）、老板键（隐藏并静音）。

## 常用命令

所有命令在 **本目录（`MoYu/`）** 下执行。

```bash
npm install          # 首次需要

# 开发（并行启动 Vite + Electron，推荐）
npm run dev

# 仅前端（浏览器打开 http://127.0.0.1:5173，无桌面能力）
npm run dev:web

# 构建前端资源到 dist/
npm run build

# 以构建产物运行（等价于打包后形态；必须先 build）
npm start

# 打包
npm run pack         # 只出目录（release/win-unpacked），最快
npm run dist:win     # Windows NSIS 安装包
npm run dist:mac     # macOS DMG
```

**仓库根目录的快捷脚本**（双击即可，不必手敲命令）：

| 文件 | 作用 |
|---|---|
| `run.bat` | 启动开发模式（`cd MoYu && npm run dev`） |
| `build.bat` | 打包 Windows 安装包（`cd MoYu && npm run dist:win`） |
| `scripts/check-build-lock.ps1` | 由 `build.bat` 调用的打包前置检查 |

> ⚠️ **不要手敲 `electron-builder`**。它在 `node_modules/.bin/`，**不在系统 PATH**，
> 直接调用会报 `'electron-builder' 不是内部或外部命令`。
> 必须经 `npm run`（npm 会临时把 `.bin` 加进 PATH）或 `npx`。
>
> **`npm run dist:win` 已包含 `npm run build`**，不要写成
> `npm run build && electron-builder --win nsis` —— 后半段没有 npm 前缀，必然失败。
> 最易踩的形态就是先跑通 `npm run build`（`vite` 也在 `.bin` 里，所以能跑），
> 然后顺手用 `&&` 接上 `electron-builder`。

> ⚠️ **打包报 `being used by another process`**：electron-builder 要清空
> `MoYu/release/win-unpacked/`，但有进程占着它——通常是之前从那里启动过 `MoYu.exe`
> （句柄未释放），或上次中断留下了卡住的 `7za.exe`。
> `build.bat` 会**自动检测并报出 PID**，不必手动排查。

> ⚠️ **`.bat` 文件必须满足两点**，否则会出问题：
> 1. **CRLF 换行**（LF 会导致批处理解析错误）
> 2. **注释只用 ASCII**——实测中文注释会显示成乱码（UTF-8 被按 GBK 解读），
>    `chcp 65001` 并不能完全避免
>
> 另外，**不要在 `if (...)` 块内的 `echo` 里用裸 `|`**：`^|` 转义在块内不可靠，
> 且 `echo ... "引号"` 会提前闭合块，报 `: was unexpected at this time`。
> 需要管道时改用 `powershell -File` 调外部脚本。

没有测试框架。

**换行符约定：默认 LF。**

| 文件 | 作用 |
|---|---|
| `.gitattributes` | `* text=auto eol=lf`——仓库与工作区都用 LF |
| `.editorconfig` | `end_of_line = lf`——编辑器写入时用 LF |

**新增或重写文件时默认写 LF**。git 的 `eol` 属性优先级高于 `core.autocrlf`，
所以无论本机怎么配，检出结果都由 `.gitattributes` 决定。

例外（这些格式的换行符是硬要求）：

| 格式 | 要求 | 原因 |
|---|---|---|
| `*.bat` / `*.cmd` | **CRLF** | cmd.exe 解析依赖 CRLF，LF 会报离奇语法错误 |
| `*.plist` | **LF** | codesign 的 AMFI 解析器不接受 CRLF |
| `*.sh` | **LF** | bash 不认 CRLF |
| 二进制（`.png` / `.ico` / `.exe` / `.dmg` 等） | 不转换 | 转换会损坏文件 |
| `package-lock.json` / `*.lock` | `-text` | 仅用于 diff 展示 |

> ⚠️ **强制的 `eol=crlf` 曾经害过一次**：`build/entitlements.mac.plist` 在仓库里存的是
> LF，但检出时被转成 CRLF，导致 macOS 打包在 codesign 阶段报
> `Failed to parse entitlements: AMFIUnserializeXML: syntax error near line 1`。
> 这个错误**只在 macOS 上暴露**，本地 Windows 完全正常，排查成本很高。
> 现在默认 LF，并把 `plist` / `sh` 显式标成 `eol=lf` 兜底。

**两个容易踩的点**：

1. `npm start` **不会**启动 Vite，它按 `file://` 加载 `dist/`——忘 `npm run build` 会打开旧版本或白屏。判定逻辑在 `electron/main.js` 的 `getWindowUrl()`：只有 `npm_lifecycle_event` 为 `dev`/`dev:electron` 时才连 `127.0.0.1:5173`。
2. 若启动即报 `cjsPreparseModuleExports`，检查环境变量 `ELECTRON_RUN_AS_NODE`（有值就 `Remove-Item Env:\ELECTRON_RUN_AS_NODE`）。它会让 electron 以纯 Node 启动。

## 架构概览

### 项目目录结构

```
electron/
  main.js               主进程：窗口管理、设置持久化、Tray、全局快捷键、IPC、
                        音频静音、退出清理 webview 数据、webview 导航拦截
  preload.js            预加载脚本（ESM）：通过 contextBridge 暴露 desktop API
  preload.cjs           预加载 CJS 包装器（实际的 webPreferences.preload 目标）：
                        动态 import ESM 版，失败时回退到内联最小实现

src/
  main.js               渲染进程入口：创建 Vue 应用、注册 Element Plus 和路由
  App.vue               根组件：快捷键处理、设置面板、热区悬停、窗口级 UI 布局
  style.css             全局样式（CSS 变量、基础排版、主题色）

  components/           公共组件
    BaseButton.vue      通用按钮（自动判断渲染为 el-button 或原生 button）
    BottomToolbar.vue   底部工具栏（后退/前进/缩放/透明度/自动滚动控制）
    ContextMenu.vue     右键菜单（支持图标、子菜单、分隔线、禁用态、边缘避让）
    ShortcutRow.vue     快捷键设置行（录制/显示/清除快捷键绑定）
    TabBar.vue          顶部标签栏（标签页切换/关闭/右键菜单）
    TopBar.vue          顶部标题栏（窗口控制、透明度快速切换、品牌图标）

  composables/          状态管理层
    useAppState.js      共享状态与基础工具函数（settings、tabs、refs、normalizeUrl）
    useDesktopApp.js    聚合层（对外唯一入口）+ 隐私清理 clearAllTraces / cleanExpiredTraces
    useSettings.js      patchSetting / toggleSetting（120ms 防抖，immediateSyncKeys 立即同步）
    useRecentVisits.js  最近访问（localStorage，上限 200，2s 防抖；支持按天保留）
    useTabManager.js    标签 CRUD + 会话持久化（persistSession / restoreSession）
    useRecommendedSites.js  推荐站点 CRUD（6 个内置 + 用户自定义）
    useTheme.js         主题（light/dark/system），写 data-theme 与 .dark 类
    mainpage/           MainPage 专用子模块
      useWebviewRefs.js     webview 引用管理（实例生命周期、事件监听绑定）
      useWebviewExec.js     脚本/CSS 注入工具（runWebviewJS / runWebviewCss）
      useWebviewSync.js     webview 样式/效果同步（透明、无图、滚动条、字号、自动滚动）
      usePauseOnBlur.js     失焦/隐藏时暂停媒体与自动滚动

  pages/                页面组件
    ConsolePage.vue     控制台布局（底部 Tab 栏 + <router-view>）
    HomePage.vue        首页（网址输入 + 推荐站点 + 最近访问）
    ProfilePage.vue     个人中心（菜单导航）
    HistoryPage.vue     历史记录（搜索 + 分页 + 右键菜单）
    StatsPage.vue       摸鱼时间统计（今日/历史/累计 + 7 天柱状图 + 24h 热力图）
    RulesPage.vue       站点规则备份/恢复 + 油猴脚本导入
    AboutPage.vue       关于（版本信息 + 检查更新 / 下载安装）
    HelpPage.vue        使用说明（纯静态）
    MainPage.vue        多 webview 管理（标签渲染、规则注入调度、快捷键转发）

  rules/                站点规则注入系统
    index.js            规则加载入口（import.meta.glob 加载 scripts/、CRUD、
                        备份/恢复、油猴脚本解析）
    matchRule.js        规则 URL 匹配工具（统一的 matchesRule 实现）
    providers/
      index.js          规则聚合层（合并 site / toolbar 规则）
      toolbarRules.js   工具栏规则（按站点控制工具栏显隐）
    scripts/            站点规则脚本（函数型）
      default.js        默认全局规则（注入快捷键到 webview）
      zhihu.com.js      知乎增强规则
      weread.qq.com.js  微信读书增强规则（含滚动到底倒计时翻章）
      vendors/          第三方油猴脚本素材（**不被自动加载**，glob 不递归）

  router/
    index.js            路由配置（Hash 模式，管理控制台区域页面切换）

  shared/
    defaultSettings.js  主进程与渲染进程共享的默认配置（单一来源）
```

### 进程分工

```
electron/main.js        主进程：窗口管理、设置持久化、Tray、全局快捷键（仅老板键）、
                        音频静音、退出清理、webview 导航协议拦截
electron/preload.js     预加载脚本：通过 contextBridge 向渲染进程暴露 window.desktop
electron/preload.cjs    实际被 webPreferences.preload 引用的入口（包装 ESM 版）
src/main.js             渲染进程入口：挂载 Vue 应用
```

**主进程 ↔ 渲染进程通信（IPC）**：

| 通道 | 方向 | 用途 |
|---|---|---|
| `settings:get` / `settings:update` / `settings:set-transparency` | invoke | 设置读写 |
| `settings:changed` | main→renderer | 设置变更广播 |
| `window:minimize` / `:maximize` / `:close` / `:quit` / `:open-settings` | invoke | 窗口控制 |
| `ui:open-settings` | main→renderer | 托盘「打开设置」 |
| `ui:set-ignore-mouse-events` | invoke | 鼠标穿透（不改持久设置） |
| `shell:open-external` | invoke | 外部浏览器打开链接（仅允许 http/https） |
| `moyu:get-stats` / `moyu:clear-stats` | invoke | 摸鱼时间统计读取与清空 |
| `update:get-version` | invoke | 纯本地返回 `{ currentVersion, platform, isDev, releasesUrl }`（**不联网**） |
| `update:check` | invoke | 联网检查 GitHub Releases，返回 `{ ok, hasUpdate, latestVersion, ... }` |
| `update:download` / `update:install` | invoke | 下载更新 / 退出并安装 |
| `update:download-progress` | main→renderer | 下载进度广播 |
| `renderer:log` | send | 渲染进程日志转发到主进程写文件 |
| `contextmenu:show` | main→renderer | webview 内右键，转发 guest 的 `params` 给渲染进程渲染菜单 |
| `theme:get` | invoke | 返回 `{ mode, effective }`（mode 是设置值，effective 是 nativeTheme 解析结果） |
| `theme:changed` | main→renderer | 主题变化广播（含系统深浅色切换） |
| `preload:loaded` | send | preload 注入自检信号 |

### 状态管理

`useDesktopApp.js` 是整个应用的唯一状态聚合层，无 Pinia/Vuex。内部拆分为子模块：

```
useAppState          ← 共享 ref / reactive 对象
  ↑
useSettings          ← 设置同步（防抖 120ms）
useRecentVisits      ← 最近访问记录（含按天保留）
useTabManager        ← 标签 CRUD + 会话持久化
useRecommendedSites  ← 推荐站点
  ↑
useDesktopApp        ← 聚合导出（对外 API 不变）+ 隐私清理
```

设置变更后通过防抖（120ms）同步到主进程；`immediateSyncKeys`（透明度、快捷键、隐私开关等）会立即同步。

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
| `/profile/rules` | `rules` | RulesPage | 站点规则备份/恢复 |
| `/profile/about` | `about` | AboutPage | 关于 |
| `/profile/help` | `help` | HelpPage | 使用说明 |

**添加新页面**：在 `src/router/index.js` 的路由数组中注册，通过 `router.push({ name })` 导航。ConsolePage 底部 Tab 按 `route.path` 自动高亮。

> `/update` 与 `forceUpdateActive` 守卫已随自建后端一起移除（版本更新改走 GitHub Releases）。

### 摸鱼时间统计

主进程通过窗口可见性事件（`show`/`restore`/`focus` → 开始计时，`hide`/`minimize`/`blur` → 结束）追踪时长，按天分组持久化到 `electron-store`（键 `moyuSessions`）。渲染进程通过 `activeStart` 字段实现实时计时。

细节：`endMoyu()` 延迟 5 秒结算（避免快速切窗口产生碎片会话），短于 2000ms 的会话直接丢弃；`blur` 时会询问渲染进程 `window.__moyuShouldKeepTracking()`，媒体播放或自动滚动中则继续计时。

### 快捷键分层

- **全局快捷键**（主进程注册）：仅 `bossKey`（默认 `Alt+Q`），任何时候均生效
- **本地快捷键**（渲染进程 `App.vue` capture 监听）：透明度调整、鼠标穿透、自动滚动控制，仅窗口聚焦或鼠标在窗口内时生效
- **页面内快捷键**：由 `rules/scripts/default.js` 注入 `keydown` 监听，命中后 `console.log('GLASS_SHORTCUT:...')` 回传宿主

快捷键格式：`"Ctrl+Alt+T"` 或单字符 `"="`，**不支持 Shift 作为修饰符**。

### 站点规则注入系统

规则有两类，`MainPage.vue` 的注入循环**必须同时处理**：

| 形态 | 来源 | 判定 | 注入方式 |
|---|---|---|---|
| **函数型** | 内置 `src/rules/scripts/*.js` | `typeof r.apply === 'function'` | 调用 `r.apply(helper)` |
| **数据型** | 用户规则 / 油猴导入 | 无 `apply` | 读取 `r.customCss` / `r.customJs` 直接注入 |

> ⚠️ 历史上注入循环只有 `apply` 一个分支，导致所有数据型规则（含油猴导入）从未生效。改动此处时务必保留两个分支。

URL 匹配统一在 `src/rules/matchRule.js`，优先级：自定义 `match` 函数 > 数组 pattern（任一命中）> RegExp > `matchType`（`regex` / `url` / `hostname`，默认 hostname）。hostname 支持 `*` 通配符，无通配符时按 `(^|\.)pattern$` 精确主机或子域匹配。

**规则文件标准结构（函数型）：**

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

`helper` 字段：`runWebviewCss(idSuffix, css)`、`runWebviewJS(js)`、`webview`（DOM 元素）、`settings`、`activeTab`、`rule`。

**注入了什么要看日志**：数据型规则会打印 `[rules] injected data rule { tabId, name, pattern, cssLen, jsLen }`。

> **跨函数调用注意**：注入到页面的函数是「具名函数表达式」赋值给 `window` 属性，函数名只在自身体内可见。兄弟函数之间**必须写 `window.X()`**，裸标识符不会报错但 `typeof` 为 `'undefined'`，会导致守卫被静默跳过。

**注入时机**：`MainPage.vue` 监听 webview `dom-ready` 后触发匹配与注入。`runWebviewJS`/`runWebviewCss` 有 **1200ms 时间窗去重**（签名取内容前 512 字符），不是永久去重——跨 `dom-ready` 的重复注入依赖脚本自身的 `window.__xxx` guard。

**油猴脚本导入**：`rules/index.js` 提供 `isUserscript` / `parseUserscript` / `convertUserscriptPatterns` / `convertUserscriptToRule`，把 `@match` 降级为 hostname pattern。**不提供 `GM_*` API**，`@run-at` 一律按 `dom-ready`，`@exclude` 不生效。

**调试**：webview 内的 `console.log` 会被转发到渲染器 Console，前缀为 `[webview.console]`。

### webview 内右键菜单

**必须由主进程接管**：webview 的 guest 是独立 `webContents`，渲染进程拿不到它的 `contextmenu` DOM 事件（`<webview>` 元素上也没有），只能靠 `wc.on('context-menu')`。

```
guest 内右键
 └→ 主进程 wc.on('context-menu', (e, params))   ← 在 did-attach-webview 里注册
      ├─ e.preventDefault()                      ← 挡掉 Chromium 默认英文菜单
      └─ mainWindow.webContents.send('contextmenu:show', { x, y, isEditable, ... })
           └→ 渲染进程 preload 的 window.desktop.onContextMenu(cb)
                └→ MainPage 换算坐标 → ContextMenu.vue 渲染 → 点击执行 action
```

**坐标换算要点**：`params.x/y` 相对 **guest 页面内容区**，而菜单要显示在宿主窗口里。`MainPage.toWindowCoords()` 会叠加 webview 元素的 `getBoundingClientRect()` 偏移。取不到 webview 时回退原坐标。

**菜单结构**（`MainPage.contextMenuItems`，一个 computed）：

| 区块 | 项 |
|---|---|
| 导航 | 后退 / 前进 / 刷新 |
| 摸鱼开关 | 无图模式、灰度模式、透明度（子菜单 5 档）、软件背景透明 |
| 站点 | 将本页加入推荐站点（已在推荐中则禁用） |
| 更多操作 ▸ | 放大 / 缩小 / 重置缩放、查看本站生效的规则、打开开发者工具 |

设计取舍：

- **以摸鱼操作与导航为主**，其余常用项收进「更多操作」子菜单
- **不含剪贴板/链接类项**（复制选中文字、复制链接等）——已按需求移除
- 导航与站点类项在 dashboard 标签下**自动禁用**（`canDisabled = tab.kind === 'page'`），而摸鱼开关类不依赖页面，始终可用

`ContextMenu.vue` 的能力（改动时注意保持）：

- `children` 数组 → 子菜单；`type: 'separator'` → 分隔线；`disabled` → 灰显不可点；`hint` → 右侧提示文字
- **子菜单单独渲染一层**（`.context-menu.submenu`），避免被父级 `overflow` 裁剪
- 边缘避让：靠右/靠下时自动翻转，`EDGE_GAP = 4`
- `Escape` 可关闭

**自适应尺寸**（摸鱼窗口通常很小，默认尺寸既笨重又容易溢出）：

`computeMetrics()` 按窗口大小返回三档令牌，通过 CSS 变量注入（`--cm-font` / `--cm-item-h` / `--cm-pad-y`）：

| 窗口条件 | 行高 | 字号 |
|---|---|---|
| `vh < 320` 或 `vw < 380` | 20px | 10.5px |
| `vh < 520` 或 `vw < 560` | 23px | 11px |
| 其它 | 26px | 12px |

实测：360×242 的窗口下用 20px/10.5px，全部 12 项约 210px，可用 234px——**放得下，无需折叠**。

**溢出折叠**（窗口再小就折叠，保证功能始终可达）：

```
computeOverflow(availableH, itemH)
  ├─ 估算全部项高度，放得下就不折叠
  ├─ 放不下：从**尾部往前**折叠（越靠后越次要）
  ├─ 跳过 keepAlways：头部 KEEP_HEAD=3 项（导航）+ 菜单自带的 'more' 项
  │    ↳ 'more' 必须保留，否则会被折进自动生成的「更多」里，形成「更多 → 更多操作」嵌套
  ├─ 折叠组首尾的分隔线去掉
  └─ 结果放进 overflowItems，visibleItems 在末尾补一个「更多」子菜单
```

实测折叠梯度（360 宽窗口）：

| 可用高度 | 结果 |
|---|---|
| ≥ 234px | 全部显示 |
| 200px | 折叠 透明度/背景透明/推荐站点 |
| ≤ 120px | 只剩 `后退/前进/刷新` + `更多`，**所有功能仍可达** |

窗口 `resize` 时会重算（摸鱼窗口常被拉伸）。子菜单定位同样使用 `metrics.itemH` 估算，不再硬编码。

### 顶栏（TopBar）布局与主题适配

**响应式原则：窗口变窄时压缩标题，绝不隐藏快捷操作。**

| 元素 | flex | 效果 |
|---|---|---|
| `.title-drag` | `1 1 0` + `min-width: 0` | 空间不足时**先收缩到 0** |
| `.window-controls` | `0 0 auto` | **永不收缩**，按钮始终保留 |
| `.ctrl-group` | `0 0 auto` | 同上 |

```css
@media (max-width: 360px) {
  .drag-title { display: none; }               /* 标题让位（用户接受不要标题） */
  .ctrl-btn   { padding: 0 3px !important; }   /* 压缩内边距而非隐藏 */
  .opacity-label { min-width: 22px; font-size: 9px; }
}
```

实测：**窄到 260px 时 8 个按钮仍全部完整可见**。

> ⚠️ **不要用媒体查询隐藏按钮组**。曾写 `@media (max-width: 420px) { .grp-collapsible-a { display:none } }`，
> 结果窗口一小快捷操作整片消失——这是用户反馈的实际问题。
>
> ⚠️ **也不要依赖 `overflow: hidden` 静默裁切**。`.ctrl-btn` 有 `min-width: 22px !important`
> 无法被压缩到 0，裁切只会把按钮切掉一半，看起来像渲染故障。

**图标颜色走语义变量**（深色下自动翻转）：

| 变量 | 浅色 | 深色 |
|---|---|---|
| `--icon` | `rgba(0,0,0,0.5)` | `rgba(255,255,255,0.62)` |
| `--icon-hover` | `rgba(0,0,0,0.8)` | `rgba(255,255,255,0.92)` |
| `--icon-strong` | `rgba(0,0,0,0.35)` | `rgba(255,255,255,0.45)` |

原先写死 `rgba(0,0,0,0.5)`——深色下等于**黑图标画在深色底上**，几乎不可见。
激活态用 `var(--primary)`，两套主题下都自动得到合适的蓝色。

> **验证提示**：手工改 `data-theme` 后**立即**读 `getComputedStyle` 可能拿到未重算的缓存值
> （实测过：变量已变白、按钮 `color` 却仍报黑色）。可靠做法是让应用以目标主题**启动**后再读。

### 主题系统（浅色 / 深色 / 跟随系统）

三态由设置项 `themeMode`（`'light'` / `'dark'` / `'system'`，**默认 `system`**）决定。
实际生效的深浅色写入 `<html data-theme="light|dark">` 与 `.dark` 类。

**三个入口，共用同一条链路**：

| 入口 | 交互 |
|---|---|
| 设置面板 →「外观」→ 主题 | 下拉三选一 |
| **顶栏**主题按钮（组2） | 点击循环 `跟随系统 → 浅色 → 深色`；跟随时显示灰点 |
| **托盘菜单** →「主题：xxx」 | 顶层子菜单，radio 三选一 + 网页跟随开关 |

```
任一入口
  └→ applyTheme(mode)
       ├─ patchSetting('themeMode', mode)   ← 持久化 + IPC
       └─ setThemeMode(mode) → applyToDom() ← 本地立即生效，避免闪烁
            ↓ IPC settings:update
         主进程 applyThemeSource() → nativeTheme.themeSource = mode
              └→ broadcastTheme() → 'theme:changed' → 所有窗口
```

顶栏与托盘是三条独立路径，**都汇聚到 `applyTheme` / `updateSettingsFromTray`**。
注意 `updateSettingsFromTray` 里有专门的判断——只有 `partial` 含 `themeMode` 时才调
`applyThemeSource()`，否则每次托盘操作都会白白同步一次 nativeTheme。

**双通道写 DOM**（`useTheme.js` 的 `applyToDom`）：

| 写入 | 消费者 |
|---|---|
| `data-theme` 属性 | 自有变量体系 `:root[data-theme='dark']` |
| `.dark` 类 | **Element Plus** 的暗色主题（选择器是 `html.dark`） |
| `style.colorScheme` | 浏览器原生控件（滚动条、表单） |

**变量体系的两个关键设计**：

1. **通道变量** `--bg-rgb` / `--fg-rgb` 承载底/前景色。组件里大量 `rgba(255,255,255,0.88)` 这类半透明白，改写成 `rgba(var(--bg-rgb), 0.88)`，深色下只需翻转通道，所有半透明层次自动跟随。
2. **语义变量** `--line` / `--fill-soft` / `--surface-tint` / `--primary` 等，深色块只覆盖这些。

> ⚠️ **深色下描边必须用白色透明度，不能用 `rgba(var(--bg-rgb), a)`**。
> 深色下 `--bg-rgb` 是深色，用它做线条会让边框几乎不可见。
> 正确写法见 `--line: rgba(255, 255, 255, 0.14)`。

> ⚠️ **`themeVars`（内联样式）里绝不能出现硬编码颜色**。
> 内联样式优先级高于样式表，曾出现「顶栏变深但整个窗口仍白」——
> 原因是那段 `background: '#fff'` 与 `--header-tint: '#f5f5f7'` 写死了。
> 现已改为 `var(--surface-tint)`，且 `.window-shell` 补了 `background: rgb(var(--bg-rgb))` 兜底
> （`html`/`body`/`#app` 都是 `transparent`，外壳底色只能在这里给）。

> ⚠️ **`--shell-alpha` / `--page-alpha` 必须真的被 CSS 消费，且必须带 alpha 通道。**
>
> `.window-shell` 的底色曾写成 `background: rgb(var(--bg-rgb))` —— `rgb()` 没有 alpha 通道，
> 外壳永远是实心色块。**结果「软件背景透明 / 网页背景透明」全部失效**：变量值是对的
> （`--shell-alpha: 0`），但渲染出来仍是 `rgb(255,255,255)`，后面所有透明处理都被挡住。
>
> 正确写法：
> ```css
> .window-shell { background: rgba(var(--bg-rgb), var(--shell-alpha, 1)); }
> ```
> 做深色主题迁移时，`rgba(255,255,255,var(--shell-alpha))` → `rgb(var(--bg-rgb))` 这种
> 「只换颜色、丢掉 alpha」的改法很容易发生。改完务必确认**变量仍在表达式里**。

> ⚠️ **透明规则会被后出现的同特异性规则覆盖**。
> `.mode-transparent-page .webview-frame { background: transparent }` 与
> `.webview-wrap .webview-frame { background: var(--page-surface) }` **都是 2 个 class**，
> 特异性相同时**后出现的胜出**，透明被覆盖成不透明底。
> 现已显式加 `!important` 并提升选择器，同时补上 `webview` 元素本身的透明 —— 
> Electron 的 `<webview>` 默认有不透明底，只清 frame 不够。

> ⚠️ **选择器特异性会覆盖主题**。设置弹窗曾出现「深色下整块白底」——
> 根因是 `.settings-modal-layer.settings-floating .settings-modal` 这条**比 `.panel` 更具体**的规则
> 写了 `rgba(255, 255, 255, ...)`。现已改为 `rgba(var(--bg-rgb), ...)`。
> 新增样式时若发现"某个元素在深色下没变"，先查是不是被更具体的选择器覆盖。

**跟随系统能实时响应**：主进程监听 `nativeTheme.on('updated')` → `broadcastTheme()`；
渲染进程还有 `matchMedia('(prefers-color-scheme: dark)')` 作为纯浏览器环境的降级。

**网页跟随**（`darkenWebPages`，默认开）：深色模式下给 webview 注入
`html { filter: invert(1) hue-rotate(180deg) }`，并对 `img/video/canvas` 等媒体元素
**二次反色**还原，避免照片变负片。仅有内容脚本级能力，已自适应深色的站点会显得过深。

### ⚠️ CI 脚本里的两类致命陷阱

这两条都是**本地测不出来、只在 GitHub runner 上炸**的问题，各踩过一次。

#### 1. `$VAR` 后不能紧跟中文标点

```bash
# ✗ 崩溃：line 93: EXPECTED?: unbound variable
echo "✓ 产物校验通过（version: $EXPECTED）"

# ✓ 用花括号明确边界
echo "✓ 产物校验通过（version: ${EXPECTED}）"
```

**原因**：bash 解析 `$NAME` 时会把紧随其后的"可作标识符"字符一并吞掉。
在 macOS runner 的 **bash 3.2 + UTF-8 locale** 下，全角标点（`）` `，` `（`）的
首字节会被当成变量名的一部分，于是去找 `EXPECTED<乱码>` 这个不存在的变量；
配合 `set -u`（nounset）直接 unbound variable 并退出。

**为什么本地测不出来**：Git Bash 是 bash 5.x + C locale，按字节处理，不会吞。
**这条只能在 macOS runner 上暴露。**

**规则**：CI 的 shell 语句里，变量引用**一律写 `${VAR}`**。
尤其后面紧跟中文标点、汉字时，没有例外。

#### 2. Windows runner 默认 shell 是 PowerShell，不认 `\` 续行

```yaml
# ✗ 崩溃：Missing expression after unary operator '--'
- run: |
    npm version 0.0.6 \
      --no-git-tag-version

# ✓ 单行 + 显式 shell: bash
- shell: bash
  run: npm version 0.0.6 --no-git-tag-version --allow-same-version
```

`on.push` 的 workflow 里，`ubuntu-latest` / `macos-latest` 默认 bash，
但 `windows-latest` 默认 **PowerShell**。同一个 `run:` 块在两个平台上语义不同。

**规则**：`build` job 跑在 `matrix.os` 上时，任何**多行脚本**都要显式
`shell: bash`；跨行命令优先改写成单行。

### 版本更新（GitHub Releases）

**不使用任何自建后端**。更新源是 GitHub Releases，由 `electron-updater` 读取 Release 里的
`latest.yml` / `latest-mac.yml` 比对版本。

```
关于页「检查更新」→ window.desktop.checkForUpdate()
  → 主进程 ipcMain 'update:check' → checkForUpdates()
       └→ autoUpdater.checkForUpdates()   ← 读 GitHub Release 的 latest.yml
            ├─ hasUpdate → About 页显示「下载并安装」+「手动下载」
            ├─ 下载 → downloadUpdate()，进度经 'update:download-progress' 广播
            └─ 安装 → installUpdate() → quitAndInstall()
```

**配置位置**（`MoYu/package.json`）：

```json
"repository": { "url": "https://github.com/wangbenchi66/MoYu.git" },
"build": { "publish": [{ "provider": "github", "owner": "wangbenchi66", "repo": "MoYu" }] }
```

> ⚠️ **主进程是 ESM，`electron-updater` 是 CJS**，必须用 `createRequire(import.meta.url)`
> 加载。直接 `require()` 会报 `require is not defined in ES module scope`
> （`package.json` 里有 `"type": "module"`，`.js` 一律按 ESM 解析）。

**为什么 `autoDownload = false`**：检查到新版本后由用户决定是否下载，避免在后台默默消耗流量。

**发布流程要点**（`.github/workflows/main.yml`）：

**触发**：推送 `v*` tag 自动触发；也可在 Actions 页面手动触发（重跑用）。

| 要点 | 原因 |
|---|---|
| **`guard` job 校验仓库与触发者** | `on.push.tags` 是仓库级配置，别人 fork 后打 tag 也会跑。用「仓库名 + `github.actor`」双重判断挡掉 |
| `draft: false` | **draft release 对 electron-updater 不可见**，会导致「检查更新」永远返回已是最新 |
| **`build` 前用 tag 版本覆写 `package.json`** | `latest.yml` 由 electron-builder 生成，版本取自 `packager.appInfo.version`（即 package.json），**它看不到 git tag**。不覆写则 tag 与清单版本分叉，electron-updater 认为无新版本而**静默失效** |
| **打包后校验 `latest.yml` 的 version** | 最后一道防线。覆写若因故没生效，这一步会直接 fail，而不是把坏产物发出去 |
| 上传 `latest.yml` / `latest-mac.yml` | 这是更新清单，缺了它 electron-updater 无法判断版本 |
| 上传 `*.blockmap` | 增量更新所需 |
| Windows 目标为 `nsis` | 自动更新的前提；portable 版不支持 |

#### 版本号以 tag 为唯一真相

**发版步骤（只需两步，不必先改 package.json）**：

```bash
git tag v0.0.6 && git push origin v0.0.6
```

CI 会自己把 tag 版本（`v0.0.6` → `0.0.6`）写进 `MoYu/package.json`，再让 electron-builder
据此生成 `latest.yml`。`package.json` 里长期停留在旧版本号是**预期行为**，
不要为了"对齐"而手动去改它。

> ⚠️ **为什么不反过来要求"tag 必须等于 package.json 版本"**：
> tags 是发布时决定的，package.json 是提交时固定的，两者天然容易分叉。
> 早先的实现用「强制一致 + 不一致就报错」防错，代价是每次发版都要
> 先改 package.json、提交、再打 tag，多一次无意义的提交。
> 现在改成让 tag 单向驱动版本，覆写只发生在 CI 工作区，**不会提交回仓库**。

实现要点：

```yaml
# create-release：版本从 tag 推导（手动触发时退回读 package.json）
VERSION="${TAG#v}"
# 校验是合法 semver，否则 electron-updater 无法比较大小
echo "${VERSION}" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'

# build：打包前覆写（单行 + shell: bash，见上文「陷阱 2」）
npm version ${{ needs.create-release.outputs.version }} --no-git-tag-version --allow-same-version
```

> `--no-git-tag-version` 阻止 npm 顺手打 tag / 提交；
> `--allow-same-version` 让重跑工作流（版本号恰好相同）不报错。

**流水线**：`guard`（权限校验）→ `create-release`（从 tag 定版本 + 建 Release）
→ `build`（覆写 package.json → 打包 → 校验 latest.yml → 上传，macOS/Windows 矩阵并行）。

> **guard 的边界**：它是**软性保护**——对方能改掉自己 fork 里的判断。
> 它防的是"无意触发"与"产物看起来像官方发布"，不是恶意篡改。
> 需要更强时可再加一道只有仓库所有者知道的 secret 校验。

**兜底入口**：About 页保留了「GitHub Releases」一行，自动更新不可用时（平台不支持、
无权限安装等）用户仍可手动下载。

**IPC**：`update:get-version`（纯本地，返回版本号/平台/Releases 地址）、
`update:check`、`update:download`、`update:install`，
以及主进程→渲染进程的 `update:download-progress`。

> **已移除**：自建网关版本检测（`GET /api/MoYu/CheckVersion`）、`src/http/`（axios 封装）、
> `axios` 依赖、`UpdatePage.vue` 与 `/update` 路由、`forceUpdateActive` 守卫。
> 原实的强制更新路径会在接口不可达时把用户锁在更新页，已彻底去掉。

### F11 全屏（主进程接管）

#### ⚠️ 为什么必须自己接管，而不是用 Chromium 内建 F11

窗口配置是 `transparent: true` + `frame: false` + `backgroundColor: '#00000000'`。
**在这类窗口上，Windows 的内建 F11 有严重缺陷**（均为实测结论）：

| 现象 | 实测数据 |
|---|---|
| 全屏后 **`win.isFullScreen()` 仍返回 `false`** | bounds 已变成整屏 `2048×1152`，但 API 报 false |
| 退出全屏后**不恢复原尺寸** | 停在 `2048×1152`，用户看到的就是「按 F11 后再按一下没反应」 |
| 触发 `resize` 时 `getBounds()` 返回**整个屏幕** | 若照单存进 store，窗口尺寸会被写成屏幕分辨率 |

**根因**：内建 F11 是为标准窗口设计的；透明窗口由 DWM 合成器处理，
全屏状态与 Chromium 的窗口状态不同步。

#### 实现要点（`toggleFullScreen()`）

1. **用自维护的 `_isFullScreen` 判断方向，不查 `win.isFullScreen()`**。
   这是最关键的一点——因为该 API 恒为 false，若据此判断，
   两次 F11 都会走「进入全屏」分支，**永远退不出来**。
2. **进入前记录 `_boundsBeforeFullScreen`，退出时 `setBounds()` 精确还原**，
   不依赖 Electron 自己恢复。用 `setTimeout(0)` 让全屏状态先提交，
   否则紧随其后的 `setBounds` 可能被忽略。
3. **`resize` 里跳过全屏/最大化状态**，避免把屏幕分辨率存成窗口尺寸。
4. **`rememberWindowBounds()` 在全屏时早退**，避免 `lastVisibleBounds`
   被撑成屏幕大小（那会影响自动隐藏的「鼠标是否在窗口内」判断）。

拦截方式：

```js
win.webContents.on('before-input-event', (event, input) => {
  if (input.type !== 'keyDown' || input.key !== 'F11') return
  event.preventDefault()
  toggleFullScreen(win)
})
```

> **实测验证**（两轮完整切换）：
> `901×600` → 全屏 `2048×1152` → **还原 `903×600`** → 再全屏 → **再还原 `904×600`**。
> 1–2px 差异是 Windows 窗口边框对齐，正常。

### 老板键与「窗口找不到」的兜底

**问题场景**：`fullWindowTransparent`（软件透明）+ `pageTransparentMode`（网页透明）
+ `hoverHeaderMode`（标题栏悬停隐藏）**同时开启**时，窗口虽然显示了，但视觉上与桌面背景
几乎无法区分。用户连按几次老板键后完全不知道窗口在哪。

**三层兜底**：

| 机制 | 实现 | 作用 |
|---|---|---|
| **唤出闪烁** | 主进程 `showMainWindow()` 广播 `window:revealed` → `useRevealHint.js` | 窗口四周**闪一条 1px 细描边**，150ms 内闪灭 |
| **设置页风险提示** | `App.vue` 的 `showVisibilityWarning` computed | 两个开关都开时，在「外观」分组显示警告条（文案随高亮开关状态变化） |
| **托盘菜单** | 已有的「显示主窗口」 | 最后手段 |

**开关**：`revealHintOnShow`（默认 **true**），在设置面板「隐私与痕迹」分组，
位于「老板键隐藏时静音」下方。关掉后不再闪烁，提示文案会改为强调"只能靠托盘找回"。

> **为什么默认开启**：这是防止用户「把自己锁在外面」的兜底——透明开满 + 标题栏隐藏时，
> 关掉提示会让窗口真的无处可寻。但仍给开关，因为提示对部分人是打扰。

#### ⚠️ 设计基线：摸鱼场景下的「视觉暴露风险」

用户的原话是「**这是摸鱼软件，时间长容易被发现**」。这条约束决定了提示的形态：

| 演进 | 时长 | 视觉元素 | 问题 |
|---|---|---|---|
| 最初 | 2200ms | 恢复不透明 + 弹顶栏 + 2px 描边 + 呼吸动画×2 | 又慢又显眼 |
| 中间 | 520ms | 同上，改单次闪灭 | 仍然显眼 |
| **现在** | **150ms** | **仅 1px 细描边** | — |

**刻意不做的两件事**（都曾实现过，后按上述理由移除）：

1. **不临时恢复外壳不透明** —— 「一个突然出现的实心方块」是整屏最显眼的东西，
   暴露风险远高于一条细线。现在保持透明，只在边缘画线。
2. **不强制显示顶栏** —— 顶栏弹出同样显眼，还会带出一整条控制栏。

**原则**：「看到的时候已经结束了」。改动此处时请保持这个基调——
任何"更醒目"的调整都是在增加用户被发现的风险。

**`useRevealHint.js` 的关键设计**：

- **只改视觉，不改设置** —— 加 `.reveal-hint` class（仅 `outline` + 极轻 `box-shadow`），
  不写 settings、不落盘。
- **只在真需要时闪烁** —— 先看 `revealHintOnShow !== false`（用户允许），
  再看 `fullWindowTransparent || hoverHeaderMode`（窗口真的可能看不见）。
- **用户一操作就结束** —— 监听 `pointerdown` / `keydown` / `wheel`（capture），
  说明他已经找到窗口，不必再等。
- **重复唤出重新计时**，不叠加多个定时器。

> ⚠️ **`onWindowRevealed` 可能不存在**（纯浏览器环境 `npm run dev:web`），
> 渲染进程必须做存在性判断。`preload.cjs` 的降级实现里也加了同名方法。

> **调试提示**：直接调 `window.desktop.updateSettings()` 改设置**不会广播回渲染进程**，
> 渲染进程的 `settings` 仍是旧值。验证依赖 `settings` 的 UI 逻辑时，
> 必须走真实交互（点击开关 → `patchSetting`），否则会误判成"逻辑没生效"。

### 设置持久化

- 持久化到磁盘（`userData/glass-reader-settings.json`）：大部分配置项（写入前备份 `.bak`）
- **不持久化**（每次启动从 `defaultSettings` 重置）：`transparency`、`autoHide`、`transparentBackground`、`hoverHeaderMode`、`pageTransparentMode`、`forcePageTransparent`、`clickThroughMode`、`alwaysOnTop`、`autoScrollEnabled`
- 推荐站点 / 最近访问 / 站点规则 / 标签会话：存 `localStorage`
- 窗口尺寸、摸鱼统计：存 `electron-store`

**新增设置项的完整步骤**：改 `shared/defaultSettings.js` → 在 `electron/main.js` 的 `normalizeSettings` 中加校验（clamp / Boolean / 白名单）→ 若要立即同步，加进 `useSettings.js` 的 `immediateSyncKeys`。

### 隐私与会话相关（近几轮新增）

| 能力 | 设置键 | 默认 | 实现位置 |
|---|---|---|---|
| 标签会话恢复 | `restoreTabsOnStartup` | 开 | `useTabManager.js`；退出靠 `pagehide`/`beforeunload` 兜底（`closeToTray` 下不触发 `onBeforeUnmount`） |
| 老板键静音 | `muteOnBossKey` | 开 | `setAllAudioMuted()` 接在 `hideMainWindow`/`showMainWindow` |
| 后台继续播放音频 | `keepAudioPlayingInBackground` | 开 | `usePauseOnBlur.js`；音频放行、视频仍暂停 |
| 退出清理网页数据 | `clearCacheOnExit` | 关 | `clearAllWebviewData()`，`will-quit` 需 `preventDefault` 后再 `app.quit()` |
| 历史保留天数 | `historyRetentionDays` | 0（永久） | `useRecentVisits.js`；主进程白名单校验只接受 `0/1/3/7/30` |
| 启动清理过期 | `autoCleanOnStartup` | 开 | `useDesktopApp.initializeDesktopApp` |

> **匿名上报已整体移除**：`PrivacyConsent.vue`（首次启动的隐私同意弹窗）、
> `useDeviceReport.js`、`ReportDevice` 端点、`device:get-id` IPC、`getDeviceId`、
> 设置项 `backendEnabled` 全部删除。`App.vue` 启动时还会 `removeItem('moyu-privacy-consent')`
> 清理历史遗留标记。
>
> **`update:get-version` 是本地 IPC**（只返回版本号/平台/Releases 地址，**不联网**），
> 「关于」页显示版本号用它。真正联网的是 `update:check`（读 GitHub Releases），
> **仅在用户点击「检查更新」时触发**。启动时不做任何自动版本检测。

> `restoreSession()` 必须在 `settings` 加载**之后**调用，否则读到的开关还是默认值。

### 已决定不做的方向

以下方向经评估后**不做**，相关文档保留仅作存档，不要当作待办：

- **远程插件市场**（`docs/插件市场设计.md`）：需后端 + 审核，远程脚本注入 webview 的 XSS 面大。已由本地规则备份/恢复 + 油猴导入替代
- **云同步 / 会员体系**（`docs/市场模式.md`）：项目无账号体系；设想的付费点（防截屏、摸鱼统计）当前均为免费功能
- **多窗口 / 分屏**：`MainPage` 是「单容器 + `v-show` 切换」结构，改造要动 `webviewRefs` 管理模型
- **窗口标题伪装**：用户场景为 `showInTaskbar: false`，窗口不在任务栏/Alt+Tab 中，无暴露面

### 已知死代码 / 待决策

> **已清理**（本轮）：`settingsRules` provider（连同 `customSettings`）、
> `MainPage.onWebviewNewWindow`、`App.vue.openDefaultUrl()`。
> 前两者是全路径死代码（有定义无消费/无绑定），删除不影响功能；
> `setWindowOpenHandler`（主进程）本来就负责新窗口准入。
> 若将来要做「按站点覆盖设置」，需同时补上：聚合、`MainPage` 应用、编辑 UI —— 只加 provider 没用。

- `App.vue` 的 `autoRangeRef` 仍未被引用
- `defaultSettings` 中 `forcePageTransparent` 与 `pageTransparentMode` 语义重叠，仅在 `patchSetting` 内联动

### Vite 配置注意事项

- `webview` 标签被声明为自定义元素（`isCustomElement`），Vue 不会将其作为组件处理
- 开发模式下 Vite dev server 固定监听 `127.0.0.1:5173`（`strictPort: true`，端口占用会直接报错而非换端口）
- 构建时 `base: './'` 确保 Electron 以文件协议加载 `dist/` 时路径正确
- `webview` 未使用 `partition`，**所有标签共享默认 session**
- `webview` 未使用 `preload`，页面内没有特权 API，只能靠 `executeJavaScript` + `console-message` 通信

## 相关文档

| 文档 | 内容 |
|---|---|
| `../README.md` | 仓库总览、运行方式、IPC 清单、常见问题 |
| `../docs/架构说明.md` | 深度架构说明书（进程模型、注入机制、数据字典） |
| `../docs/优化与功能建议.md` | 基于当前代码的优化与功能建议、执行顺序 |
| `docs/优化与功能建议.md` | 早期自审（**行号已过时**，仅供存档） |
| `docs/插件市场设计.md`、`docs/市场模式.md` | 已决定不做，存档 |
| `USAGE.md` | 早期使用示例（**路径已过时**，注入原理部分仍有效） |
