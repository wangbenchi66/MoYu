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

没有测试框架。

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
    PrivacyConsent.vue  首次启动隐私知情同意弹窗
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
    useDeviceReport.js  匿名设备上报（受 backendEnabled 门禁，默认关闭）
    mainpage/           MainPage 专用子模块
      useWebviewRefs.js     webview 引用管理（实例生命周期、事件监听绑定）
      useWebviewExec.js     脚本/CSS 注入工具（runWebviewJS / runWebviewCss）
      useWebviewSync.js     webview 样式/效果同步（透明、无图、滚动条、字号、自动滚动）
      usePauseOnBlur.js     失焦/隐藏时暂停媒体与自动滚动

  http/
    index.js            Axios 封装（拦截器、Loading 管理、GET/POST/PUT/DELETE）

  pages/                页面组件
    ConsolePage.vue     控制台布局（底部 Tab 栏 + <router-view>）
    HomePage.vue        首页（网址输入 + 推荐站点 + 最近访问）
    ProfilePage.vue     个人中心（菜单导航）
    HistoryPage.vue     历史记录（搜索 + 分页 + 右键菜单）
    StatsPage.vue       摸鱼时间统计（今日/历史/累计 + 7 天柱状图 + 24h 热力图）
    RulesPage.vue       站点规则备份/恢复 + 油猴脚本导入
    AboutPage.vue       关于（版本信息 + 手动检查更新）
    HelpPage.vue        使用说明（纯静态）
    UpdatePage.vue      版本更新页（强制更新时跳转）
    MainPage.vue        多 webview 管理（标签渲染、规则注入调度、快捷键转发）

  rules/                站点规则注入系统
    index.js            规则加载入口（import.meta.glob 加载 scripts/、CRUD、
                        备份/恢复、油猴脚本解析）
    matchRule.js        规则 URL 匹配工具（统一的 matchesRule 实现）
    providers/
      index.js          规则聚合层（合并 site / settings / toolbar 规则）
      settingsRules.js  设置类规则（按站点覆盖设置）——**当前未被消费**
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
| `update:check` | invoke | 返回 `{ currentVersion, platform, isDev }`（**本地 IPC，非网络请求**） |
| `device:get-id` | invoke | 读取/生成持久化匿名设备 ID |
| `renderer:log` | send | 渲染进程日志转发到主进程写文件 |
| `contextmenu:show` | main→renderer | webview 内右键，转发 guest 的 `params` 给渲染进程渲染菜单 |
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
| `/update` | `update` | UpdatePage | 版本更新 |

路由守卫：`forceUpdateActive` 为真时，任何导航都被重定向到 `update`。

**添加新页面**：在 `src/router/index.js` 的路由数组中注册，通过 `router.push({ name })` 导航。ConsolePage 底部 Tab 按 `route.path` 自动高亮。

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

### 设置持久化

- 持久化到磁盘（`userData/glass-reader-settings.json`）：大部分配置项（写入前备份 `.bak`）
- **不持久化**（每次启动从 `defaultSettings` 重置）：`transparency`、`autoHide`、`transparentBackground`、`hoverHeaderMode`、`pageTransparentMode`、`forcePageTransparent`、`clickThroughMode`、`alwaysOnTop`、`autoScrollEnabled`
- 推荐站点 / 最近访问 / 站点规则 / 标签会话 / 隐私同意：存 `localStorage`
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
| 后端在线服务 | `backendEnabled` | **关** | 门禁 `CheckVersion` 与 `ReportDevice` 两个端点 |

> `restoreSession()` 必须在 `settings` 加载**之后**调用，否则读到的开关还是默认值。

### 已决定不做的方向

以下方向经评估后**不做**，相关文档保留仅作存档，不要当作待办：

- **远程插件市场**（`docs/插件市场设计.md`）：需后端 + 审核，远程脚本注入 webview 的 XSS 面大。已由本地规则备份/恢复 + 油猴导入替代
- **云同步 / 会员体系**（`docs/市场模式.md`）：项目无账号体系；设想的付费点（防截屏、摸鱼统计）当前均为免费功能
- **多窗口 / 分屏**：`MainPage` 是「单容器 + `v-show` 切换」结构，改造要动 `webviewRefs` 管理模型
- **窗口标题伪装**：用户场景为 `showInTaskbar: false`，窗口不在任务栏/Alt+Tab 中，无暴露面

### 已知死代码 / 待决策

- `settingsRules` provider 实现了完整的按站点覆盖设置，但 `MainPage` **从不读 `combined.settings`**，`customSettings` 是死路径——接上或删除
- `MainPage.onWebviewNewWindow` 已定义但模板未绑定
- `App.vue` 的 `autoRangeRef`、`openDefaultUrl()` 未被引用
- `http/index.js` 的 Bearer token 分支无写入方
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
