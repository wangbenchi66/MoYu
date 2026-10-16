# TransBrowser / MoYu（摸鱼工作台）

一个**透明浮窗式网页浏览器**桌面应用。窗口可整体透明、可鼠标穿透、可一键隐藏，用来在工作间隙"优雅地摸鱼"。

> 本仓库根目录是**仓库外壳**，真正的应用代码在 [`MoYu/`](MoYu/) 子目录中。
> 本文件是仓库级总览；应用级的详细说明见 [`MoYu/README.md`](MoYu/README.md) 与 [`MoYu/CLAUDE.md`](MoYu/CLAUDE.md)。

---

## 1. 项目定位

MoYu 把「浏览器」和「隐身」两件事合到一起：

| 能力 | 一句话说明 |
|---|---|
| 透明窗口 | 窗口背景透明（`transparent: true`），透明档位 0→100 可调，还能让网页自身背景也透明 |
| 老板键 | 全局快捷键（默认 `Alt+Q`）一键隐藏/恢复窗口，任意应用聚焦时都生效；隐藏时**自动静音** |
| 后台听音频 | 失焦/隐藏时**音频继续播放**（视频仍暂停），可开关 |
| 鼠标穿透 | 开启后鼠标事件穿透到下层窗口，临时关闭设置面板可恢复交互 |
| 防截屏 | 开启 `setContentProtection`，录屏/截屏软件抓不到窗口内容 |
| 多标签 | 每个标签一个 `<webview>`，驻留 DOM 只切显隐，切回不重载；**重启可恢复上次标签** |
| 右键菜单 | 网页内右键弹出中文菜单：**背景透明 / 窗口透明度 / 灰度 / 站点工具**（由主进程接管，替换 Chromium 英文菜单） |
| 站点规则注入 | 按 URL 匹配注入自定义 CSS/JS；支持**油猴脚本导入**与备份/恢复 |
| 摸鱼统计 | 主进程按窗口可见性计时，按天分组展示摸鱼时长 |
| 隐私清理 | 历史按天保留（1/3/7/30 天或永久）+ 一键清除痕迹 + 可选退出清理网页缓存 |

---

## 2. 技术栈

| 层面 | 技术 |
|---|---|
| 桌面框架 | Electron 31（主进程 + preload + 渲染进程三层） |
| 前端框架 | Vue 3（Composition API，`<script setup>`） |
| 构建工具 | Vite 5（`base: './'`，适配 `file://` 加载） |
| UI 组件库 | Element Plus |
| 路由 | vue-router 5（**Hash 模式**，适配 Electron） |
| 状态管理 | **无 Pinia/Vuex**，自建 composable 聚合层 `useDesktopApp` |
| HTTP | Axios（统一拦截器封装） |
| 解析 | marked、DOMPurify |
| 持久化 | `electron-store`（窗口尺寸、摸鱼统计）+ JSON 文件（设置）+ `localStorage`（站点/历史/规则） |
| 打包 | electron-builder（Windows NSIS / macOS DMG） |

---

## 3. 仓库结构

```
TransBrowser/
├── .github/workflows/main.yml     CI：手动触发 → 建 Release → macOS/Windows 并行打包并上传
├── .gitignore
├── README.md                      ← 本文件（仓库总览）
└── MoYu/                          ← 应用本体
    ├── package.json               依赖、脚本、electron-builder 配置
    ├── vite.config.js             Vite 配置（webview 声明为自定义元素、固定 5173 端口）
    ├── index.html                 渲染进程 HTML 入口
    ├── CLAUDE.md                  面向 AI/开发者的架构说明（最详细）
    ├── README.md                  应用级说明
    ├── USAGE.md                   使用与调试示例（部分内容已过时）
    ├── .env.development / .env.production   后端 API 基地址
    ├── docs/                      设计文档（优化建议 + 两份已决定不做的存档）
    ├── electron/                  主进程 + 预加载
    │   ├── main.js                1165 行：窗口/托盘/快捷键/设置/统计/导航拦截
    │   ├── preload.js             ESM preload，contextBridge 暴露 window.desktop
    │   └── preload.cjs            CJS 包装器，动态 import ESM，失败时降级
    ├── public/                    图标资源（icon.png / icon.ico / tray.png / favicon.svg）
    └── src/                       渲染进程
        ├── main.js                Vue 应用入口
        ├── App.vue                1283 行：根组件、快捷键、设置面板、热区
        ├── style.css              42KB 全局样式与主题变量
        ├── components/            TopBar / TabBar / BottomToolbar / ContextMenu / ShortcutRow / BaseButton / PrivacyConsent
        ├── composables/           状态层（详见第 4 节）
        ├── pages/                 各页面（详见第 5 节）
        ├── rules/                 站点规则注入系统
        ├── router/                Hash 路由
        ├── http/                  Axios 封装
        └── shared/                主/渲染进程共享的默认配置
```

---

## 4. 架构总览

### 4.1 三进程分工

```
┌─────────────────────── 主进程 electron/main.js ───────────────────────┐
│ 窗口生命周期 · 透明度(setOpacity) · 置顶 · 防截屏 · 托盘 · 全局快捷键   │
│ 设置持久化(glass-reader-settings.json) · 摸鱼计时 · 鼠标移出隐藏轮询     │
│ webview 导航拦截(zhihu:// 等自定义协议与 /oia/ 中转页)                 │
│ 日志写入(userData/app.log，超 2MB 截半)                                │
└───────────────────────────┬───────────────────────────────────────────┘
                            │ IPC（ipcMain.handle / ipcMain.on）
┌───────────────────────────┴───────────────────────────────────────────┐
│ preload.js  contextBridge → window.desktop（唯一受控通道）             │
│  preload.cjs  CJS 包装：动态 import ESM preload，失败则降级最小实现      │
└───────────────────────────┬───────────────────────────────────────────┘
                            │ window.desktop.*
┌───────────────────────────┴───────────────────────────────────────────┐
│ 渲染进程  Vue 3 应用                                                   │
│  App.vue（窗口级 UI/快捷键/设置面板）                                  │
│    └ MainPage.vue（多 <webview> 管理 + 规则注入调度）                  │
│        ├ ConsolePage.vue → router-view（首页/个人中心/统计/规则…）      │
│        └ <webview> × N（每个 page 标签一个，v-show 切换）              │
│  状态：useDesktopApp 聚合层（无 Pinia）                                │
└───────────────────────────────────────────────────────────────────────┘
```

### 4.2 IPC 接口清单

| 通道 | 方向 | 用途 |
|---|---|---|
| `settings:get` | invoke | 读取当前设置 |
| `settings:update` | invoke | 全量/局部更新设置（会触发保存、重注册快捷键、重建托盘菜单） |
| `settings:set-transparency` | invoke | 专用于透明度滑块的高频通道 |
| `settings:changed` | main→renderer | 设置变更广播 |
| `ui:open-settings` | main→renderer | 托盘"打开设置" |
| `ui:set-ignore-mouse-events` | invoke | 临时鼠标穿透（不改持久设置） |
| `window:minimize` / `:maximize` / `:close` / `:quit` | invoke | 窗口控制 |
| `window:open-settings` | invoke | 打开设置面板 |
| `shell:open-external` | invoke | 外部浏览器打开（**仅允许 http/https**） |
| `moyu:get-stats` / `moyu:clear-stats` | invoke | 摸鱼统计读取/清空 |
| `update:check` | invoke | 返回 `{ currentVersion, platform, isDev }` |
| `device:get-id` | invoke | 读取/生成持久化的匿名设备 ID |
| `renderer:log` | send | 渲染进程日志转发到主进程写文件 |
| `contextmenu:show` | main→renderer | webview 内右键：转发 guest 的 `params` 供渲染进程渲染菜单 |
| `preload:loaded` | send | preload 注入自检信号 |

### 4.3 状态管理（无 Pinia）

`useDesktopApp.js` 是**唯一状态聚合层**，对外 API 保持不变，内部按职责拆分：

```
useAppState.js          共享 ref/reactive（settings、tabs、activeTabId、urlInput…）
    ↑
useSettings.js          设置同步：120ms 防抖；immediateSyncKeys 内的键立即同步
useRecentVisits.js      最近访问：localStorage，最多 200 条，2s 防抖落盘；支持按天保留
useTabManager.js        标签 CRUD：createPageTab / closeTab / closeTabsToLeft|Right / closeAllTabs
useRecommendedSites.js  推荐站点：6 个内置 system 站点 + 用户自定义（localStorage）
    ↑
useDesktopApp.js        聚合导出 + 计算属性（filteredRecentVisits、themeVars、shellClasses…）
                        以及 clearAllTraces / cleanExpiredTraces（隐私清理）
```

**`themeVars` 是视觉核心**：根据 `transparentBackground` / `fullWindowTransparent` / `pageTransparentMode` / `transparency` 计算 `--shell-alpha`、`--surface-alpha`、`--page-alpha`、`--header-tint` 等 CSS 变量，注入到根元素 `.window-shell` 的 `:style` 上。

### 4.4 设置项与持久化

- **持久化** → `userData/glass-reader-settings.json`（写入前自动备份 `.bak`，主文件损坏时回退读取备份）
- **不持久化**（每次启动从 `defaultSettings` 重置）：`transparency`、`autoHide`、`transparentBackground`、`hoverHeaderMode`、`pageTransparentMode`、`forcePageTransparent`、`fullWindowTransparent`、`shellOnlyTransparent`、`clickThroughMode`、`alwaysOnTop`、`autoScrollEnabled`
- **窗口尺寸** → `electron-store`（键 `width` / `height`，读取时按屏幕工作区 clamp）
- **摸鱼统计** → `electron-store`（键 `moyuSessions`，结构 `{ "YYYY-MM-DD": [{start, end}, …] }`）
- **推荐站点 / 最近访问 / 站点规则 / 标签会话 / 隐私同意** → `localStorage`

### 4.4.1 会话恢复（标签页）

关掉应用再打开时恢复上次的标签页，默认开启。设置面板 →「隐私与痕迹」→「启动时恢复上次标签页」可关闭；在意痕迹的用户建议关掉，关闭后 `localStorage` 不会写入任何标签数据。

| 行为 | 说明 |
|---|---|
| 保存时机 | 标签增删改 / 切换时 **800ms 防抖**写入；退出时 `flushSession()` 立即落盘 |
| 保存键 | `localStorage['moyu_tabs_session']` |
| 保存内容 | 仅 `kind === 'page'` 的标签，最多 **20** 个，只存 `{ url, title }` + 激活项的 URL |
| 不保存 | `about:blank`（工作台）、`blob:`（本地文件）、`local:`（无法重建） |
| 恢复时机 | `initializeDesktopApp` 中 **`settings` 加载完成之后**（否则开关判断会用到默认值） |
| 恢复后 | 移除初始的空工作台，避免多出一个空白标签；激活项失效时回退到第一个标签 |
| 与"清除所有痕迹" | 该操作会一并清掉已保存的会话 |

> **为什么额外监听 `pagehide` / `beforeunload`**：`closeToTray` 默认开启时，关闭窗口只是 `hide()`，
> **不会触发 Vue 的 `onBeforeUnmount`**，只靠 `disposeDesktopApp` 会漏掉最常见的退出路径。

### 4.4.2 老板键静音

老板键（默认 `Alt+Q`）隐藏窗口时，主进程会调用 `webContents.setAudioMuted(true)` 静音**所有** webContents（含各 webview 的 guest 实例），重新显示时还原。

- 由 `muteOnBossKey` 控制，默认开启
- 接入点是 `hideMainWindow` / `showMainWindow`，因此**托盘隐藏、自动隐藏（autoHide）**同样会静音
- 不改变网页自身的静音状态，只是进程级静音
- **不受 `keepAudioPlayingInBackground` 影响**——老板键是紧急隐藏，必须静音

### 4.4.3 失焦/隐藏时的媒体处理

窗口失焦或被隐藏时，渲染进程通过 `document.visibilitychange` 触发 `usePauseOnBlur.js`。由两个设置项共同决定行为：

| 设置项 | 默认 | 作用 |
|---|---|---|
| `pauseOnBlurHide` | 开 | 总开关。关闭后失焦/隐藏不做任何媒体处理 |
| `keepAudioPlayingInBackground` | **开** | 允许音频在后台继续播放 |

**当 `keepAudioPlayingInBackground` 开启时**：

| 媒体类型 | 行为 |
|---|---|
| **音频**（`<audio>`，或无可见画面的 `<video>`） | **不暂停、不静音**，继续后台播放 |
| **视频**（有画面的 `<video>`） | 暂停 + 静音 |
| 自动滚动 | 仍然停止 |

关闭该开关则回到旧行为：**音频与视频一视同仁地被暂停**。

**判定「是否音频」的规则**（`__glassIsAudioOnly`）：

- 标签是 `<audio>` → 音频
- `<video>` 但**无画面尺寸**（`videoWidth`/`videoHeight` 均为 0）**且不可见**（零尺寸）→ 视作音频
- `<video>` 的 CSS 为 `display:none` / `visibility:hidden` / `opacity:0` → 视作音频

这样处理是因为有些播客站用 `<video>` 承载纯音频。

**恢复时只还原"确实被我们暂停过"的元素**——暂停时打 `__glass_reader_paused_by_us` 标记，恢复时按标记处理。因此放行的音频不会在恢复时被误调 `play()`。

**两个边界情况**：

1. **最小化**：走 `minimize()` 不经过 `hideMainWindow`，所以**不触发进程级静音**；但 `document.hidden` 会变 true，因此媒体处理仍生效
2. **窗口失焦但仍可见**（例如点到别的应用、MoYu 还露在屏幕上）：`document.hidden` 为 `false`，**不触发任何处理**——窗口看得见就不该停

### 4.4.4 退出时清理网页数据

`clearCacheOnExit`（默认**关闭**）开启后，退出应用时会清理 webview 的浏览数据：

```js
session.defaultSession.clearStorageData({ storages: [
  'cookies', 'filesystem', 'indexdb', 'localstorage',
  'shadercache', 'websql', 'serviceworkers', 'cachestorage',
]})
session.defaultSession.clearCache()
```

> ⚠️ **会清掉所有网站的登录态**，属于强隐私选项，故默认关闭。

**时序注意**：`will-quit` 是同步事件，而清理是异步的。实现上先 `event.preventDefault()` 拦住退出，
清理完成后在 `.finally()` 里再 `app.quit()`，并用 `_privacyCleanupDone` 标志防止二次进入造成死循环。

项目未给 webview 配置 `partition`，所有标签共用 `defaultSession`，因此清理一次即可覆盖全部。

### 4.5 顶栏透明度交互

顶栏那个百分比按钮支持三种操作，都不占额外空间（顶栏很窄，放滑块会挤压布局）：

| 操作 | 行为 |
|---|---|
| **滚轮** | 微调，每格 **±1%**（范围 0–100） |
| **单击** | 在预设档位间循环：`0 → 20 → 50 → 85 → 100 → 0` |
| **双击** | 在 `0` 与**上次的非零值**之间切换（如 43% ⇄ 0%） |

设计要点：

- **上限取 100**，与设置面板的滑块一致（快捷键那套历史上限是 85，两者本就不同）
- **双击的记忆值**会在滚轮调节时同步更新：滚到 13% → 双击归零 → 再双击回到 13%
- 从未设过非零值时，双击 0 会给一个兜底值 50%
- **单击延迟 220ms 执行**：因为双击必然先触发两次 `click`，若立即执行会把透明度循环两轮再归零。等待期内出现第二次点击就取消挂起的单击
- 调节时数字会轻微放大（`scale(1.18)`，420ms）作为生效反馈；鼠标指针为 `ns-resize` 提示可滚轮
- 滚轮事件调用了 `preventDefault` + `stopPropagation`，防止滚动穿透到下层页面

### 4.6 三个操作入口的分工

顶栏、右下角、右键菜单**刻意不重叠**，按作用域划分：

| 入口 | 步数 | 作用域 | 内容 |
|---|---|---|---|
| **顶栏** | 1 步 | 窗口级 + 外观 | 透明度、背景透明（三态）、悬停标题栏、自动隐藏、置顶、设置、关闭 |
| **右下角**（悬停出现） | 3 步 | 页面级 + 阅读 | 后退/前进/刷新、缩放、字号、字色、无图、滚动条、自动滚动、外部打开 |
| **右键菜单** | 1 步 | 站点级 | 背景透明、窗口透明度、灰度模式、加入推荐站点、查看本站生效的规则、开发者工具 |

**右下角是倒 L 形两臂布局**（本来就分好了组）：

- **垂直臂**（向上）= 阅读类：字号、自动滚动、无图、字色、滚动条
- **水平臂**（向左）= 导航类：后退、前进、刷新、缩放、浏览器打开

**右键菜单只放右下角没有的能力**。曾统计 11 项中 5 项重复（后退/前进/刷新/无图/缩放），已移除，菜单从 9 项降到 6 项、全高从 210px 降到 140px。

> 为什么删了导航项还留右键菜单：右下角需要「移到热区 → 等 FAB 淡入 → 点击展开」**三步**，右键是**一步**。而「查看本站规则」「开发者工具」这类排查性操作天然适合就地右键。

### 4.6.1 背景透明改为三态

原先顶栏有**两个**按钮（"软件背景透明"和"网页背景透明"），难区分却占两个位置。现合并为一个循环按钮，**顺序为"软件优先"**：

```
关闭  →  软件透明  →  软件+网页都透明  →  关闭
```

| 档位 | `shellOnlyTransparent` | `pageTransparentMode` | `fullWindowTransparent` | 实际效果 |
|---|---|---|---|---|
| 关闭 | false | false | false | 全部不透明 |
| **软件透明** | **true** | false | false | 外壳/面板透明，**网页保持原样** |
| **软件+网页都透明** | false | **true** | **true** | 外壳 + 网页一起透明 |

实测三档的 CSS 变量（`--shell-alpha` 外壳 / `--surface-alpha` 面板 / `--page-alpha` 网页）：

| 档位 | shell | surface | page |
|---|---|---|---|
| 关闭 | 1 | 1 | 1 |
| 软件透明 | **0** | **0** | **1** |
| 软件+网页 | **0** | **0** | **0** |

- 三档用不同图标（`Monitor` / `Moon` / `View`）
- 激活时按钮右下角有**状态点**，最高档是**双点**
- 「软件透明」这一档是**新增的键** `shellOnlyTransparent` —— 旧的两个键组合不出来：
  只开 `pageTransparentMode` 时 `shellAlpha` 最小只到 0.70，永远无法让外壳全透明

### 4.6.2 图标与激活态

原先激活态只靠变蓝，小窗口下图标语义模糊。改进：

| 按钮 | 变化 |
|---|---|
| 悬停标题栏 | `Hide` ⇄ `View`（开启后变"眼睛"，与"隐藏窗口"区分开） |
| 自动隐藏 | `Pointer` → `Top`（暗示"移出顶部才隐藏"） |
| 全部开关类 | 激活时多一个**右下角蓝点**，不再只靠颜色 |

**状态点在顶栏与右下角统一**（4px 蓝点 + 白描边，同一套 `.state-dot`）：

- 顶栏：背景透明、悬停标题栏、自动隐藏、置顶
- 右下角：无图模式、显示滚动条

> 字号与自动滚动用的是 `.val-badge`（显示具体数值如 `120`），语义是"当前值"而非"开关状态"，故不换成圆点。

### 4.6.3 响应式

窗口变窄时按优先级整组隐藏：`≤420px` 隐藏透明度组，`≤340px` 隐藏可见性组，**设置/最小化/关闭永不隐藏**。

> 原先用 `flex` 收缩实现隐藏，但按钮有 `min-width: 22px !important` 无法被压缩——**那套机制从未生效**。实测窄到 360px 时 8 个按钮仍完整可见，故改为明确的媒体查询阈值。

### 4.7 快捷键分层
| 层级 | 注册位置 | 键 | 生效条件 |
|---|---|---|---|
| 全局 | 主进程 `globalShortcut` | `bossKey`（`Alt+Q`） | **任意时候** |
| 本地 | 渲染进程 capture 监听 | 透明度 ±、鼠标穿透、自动滚动开关/加减速 | 窗口聚焦或鼠标在窗口内 |

快捷键格式为 Electron Accelerator 风格（`"Ctrl+Alt+T"`）或单字符（`"="`）。**明确不支持 Shift 作为修饰符**（`formatAcceleratorFromEvent` 会拒绝）。

### 4.8 webview 与站点规则注入

页面内按键要能触发宿主功能，靠的是三层配合：

1. **全局默认规则** [`src/rules/scripts/default.js`](MoYu/src/rules/scripts/default.js) 向每个页面注入 `keydown` 监听，匹配到快捷键时 `console.log('GLASS_SHORTCUT:' + JSON)`。
2. **webview 的 `console-message` 事件** 捕获该日志，转交 `MainPage.handleShortcutMessage` 解析执行。
3. **MainPage 的 `_forwardKeyHandler`** 用 capture 阶段 `keydown`/`keyup` + `webview.sendInputEvent` 把渲染进程的按键送进 webview。

规则匹配算法统一在 [`src/rules/matchRule.js`](MoYu/src/rules/matchRule.js)，优先级：自定义 `match` 函数 > 数组 pattern（任一命中）> RegExp > `matchType`（`regex` / `url` / `hostname`，默认 hostname）。hostname 类型支持 `*` 通配符，无通配符时按 `(^|\.)pattern$` 做**精确主机或子域**匹配。

注入时机：webview `dom-ready` → 匹配规则 → `r.apply({ runWebviewCss, runWebviewJS, webview, settings, activeTab, rule })`。
`runWebviewCss` 优先用 `insertCSS`（可 `removeInsertedCSS` 撤销，能绕过 CSP），失败回退 `<style>` 标签；`runWebviewJS` 走 `executeJavaScript`。两者都有 **1200ms 时间窗去重**（签名取脚本前 512 字符）；跨 `dom-ready` 的永久去重依赖脚本自身 `window.__xxx` guard。

---

## 5. 页面与路由

路由为 **Hash 模式**，只管控制台区域（dashboard 标签），webview 标签由 MainPage 独立管理。

| 路径 | name | 组件 | 说明 |
|---|---|---|---|
| `/` | `home` | HomePage | 网址输入 + 推荐站点 + 最近访问 |
| `/profile` | `profile` | ProfilePage | 个人中心菜单（静态，无账号体系） |
| `/profile/history` | `history` | HistoryPage | 历史记录：搜索 + 分页 + 右键菜单 |
| `/profile/stats` | `stats` | StatsPage | 摸鱼统计：今日/历史/累计，1s 实时刷新 |
| `/profile/rules` | `rules` | RulesPage | 站点规则**备份/恢复**，支持油猴脚本导入 |
| `/profile/about` | `about` | AboutPage | 版本信息与手动检查更新 |
| `/profile/help` | `help` | HelpPage | 使用说明（纯静态长文） |
| `/update` | `update` | UpdatePage | 强制更新页，跳浏览器下载 |

路由守卫：`forceUpdateActive` 为真时，任何导航都被重定向到 `update`。

> **已移除**（曾存在，现已删除）：`/library`（书架）与 `/library/:id`（阅读器）两个页面，
> 以及首页的「导入文件」入口与本地文件标签页。相关文件 `LibraryPage.vue` / `ReaderPage.vue` /
> `useLocalFiles.js` / `useLocalReaderAutoScroll.js` 已一并删除。

### 5.1 站点规则备份/恢复

入口：个人中心 →「站点规则备份」。与「最近访问」「推荐站点」一样，规则只存本地。

| 操作 | 说明 |
|---|---|
| **备份全部** | 导出所有自定义规则为 `moyu-rules-YYYYMMDD-HHmm.json` |
| **备份单条** | 每条规则右侧的「备份」按钮 |
| **备份选中** | 勾选多条后批量导出 |
| **恢复 / 导入** | 支持一次选多个文件；自动区分备份 JSON 与油猴脚本 |
| **粘贴导入** | 直接粘贴备份 JSON 或完整油猴脚本 |

冲突策略可选**覆盖**（默认）或**跳过**已存在的同 `pattern` 规则。

**油猴（Tampermonkey）脚本兼容**：选择 `.user.js` 文件或粘贴脚本正文即可，解析器会：

1. 读取 `// ==UserScript==` 元数据块中的 `@name` / `@version` / `@description` / `@author`
2. 把 `@match` / `@include` 转换为本应用的匹配模式，**支持通配符**：

   | 油猴写法 | 转换结果 |
   |---|---|
   | `*://*.zhihu.com/*` | `zhihu.com`（`*.` 前缀去掉，hostname 模式本身支持子域） |
   | `https://www.zhihu.com/question/*` | `www.zhihu.com`（丢弃路径） |
   | `https://host.com:8080/x` | `host.com`（丢弃端口） |
   | `/^https?:\/\/zhuanlan\.zhihu\.com\//` | 原样保留，按正则匹配 |

3. 脚本体转成规则的 `customJs`，在 `dom-ready` 时注入
4. 导入的规则会打上「**油猴 v5.17.1**」徽标，便于与手写规则区分

**已知限制**（导入时会明确提示）：

- **不提供 `GM_*` API**（`GM_setValue` / `GM_getValue` / `GM_registerMenuCommand` 等）。依赖这些 API 的脚本相关功能不可用
- `@run-at` 不受支持，一律按 `dom-ready` 时机注入
- `@exclude` 暂不生效
- 仅匹配所有站点的脚本（如只写 `*://*/*`）会被**拒绝导入**，避免误伤全部网站

仓库 `src/rules/scripts/vendors/` 下已有两个真实油猴脚本可用于验证该功能。

---

## 6. 运行与构建

所有命令都在 **`MoYu/`** 目录下执行（仓库根目录没有 `package.json`）。

```bash
cd MoYu
npm install          # 首次需要；会下载 Electron 二进制，体积较大
```

### 6.1 三种运行方式对比

| 方式 | 命令 | 加载的界面 | 能否用老板键 / 托盘 / 穿透 | 适用场景 |
|---|---|---|---|---|
| **① 仅网页（浏览器）** | `npm run dev:web` | 浏览器里的 Vue 页面 | ❌ 全部失效 | 调 UI、调样式、改页面逻辑 |
| **② 完整桌面软件（开发）** | `npm run dev` | Vite 实时热更新 | ✅ 全部可用 | **日常开发首选** |
| **③ 完整桌面软件（构建产物）** | `npm run build` → `npm start` | `dist/` 静态文件 | ✅ 全部可用 | 验证打包后的真实表现 |

> ⚠️ **关键区别**：`npm start` **不会**启动 Vite，它直接以 `file://` 加载 `dist/index.html`。
> 所以必须先 `npm run build`，否则会打开旧版本、甚至白屏。
> 这是 [`electron/main.js`](MoYu/electron/main.js) 中 `getWindowUrl()` 的判定逻辑决定的：
> 只有 `npm_lifecycle_event` 是 `dev` / `dev:electron` 时才连 `127.0.0.1:5173`，否则一律读 `dist/`。

### 6.2 ① 仅网页方式（浏览器）

```bash
cd MoYu
npm run dev:web
```

打开 <http://127.0.0.1:5173>。端口在 [`vite.config.js`](MoYu/vite.config.js) 中写死为 `5173` 且 `strictPort: true`——**端口被占用时直接报错退出**，不会自动换端口。

**此方式下不可用的功能**（因为 `window.desktop` 不存在，即 preload 未注入）：

- 老板键、托盘、全局快捷键
- 窗口透明度、置顶、鼠标穿透、防截屏
- 多标签 `<webview>`（浏览器不支持该标签，页面会空白或不渲染）
- 摸鱼统计、文件读写、本地规则文件导入导出等能力

代码对此有降级处理：`useAppState.js` 中 `desktopApi` 为 `null`，`useDesktopApp` 的各动作会写入 `statusMessage` 提示"当前环境不支持…"，不会抛异常。所以浏览器里能放心调控制台区域的页面（首页、个人中心、统计、设置面板等）。

### 6.3 ② 完整软件方式（开发模式）

```bash
cd MoYu
npm run dev
```

该命令用 `concurrently` 并行跑两个子任务：

1. `npm run dev:web` → 启动 Vite（`127.0.0.1:5173`）
2. `npm run dev:electron` → `wait-on tcp:5173` 等端口就绪，再 `electron .`

Vite 就绪前 Electron 会等待，因此**不会出现白屏**。改前端代码即时热更新；改 `electron/` 下的主进程代码需重启（`npm run dev` 带 `-k`，Ctrl+C 会一并结束两个进程）。

也可以分开跑（调试单侧时更清晰）：

```bash
# 终端 1
npm run dev:web
# 终端 2（需 5173 已在监听）
npm run dev:electron
```

> `dev:electron` 里的 `chcp 65001` 是 **Windows 专用**，用于让控制台以 UTF-8 输出中文日志。在 macOS / Linux 上直接跑 `electron .` 即可。

### 6.4 ③ 完整软件方式（构建产物 / 验收）

```bash
cd MoYu
npm run build    # 输出到 dist/
npm start        # 以 file:// 加载 dist/，等价于打包后的运行形态
```

这条路径最接近用户装完后看到的样子，适合在发版前做一次验收。注意它是**静态**的——改了代码必须重新 `build`。

### 6.5 打包成安装包

```bash
cd MoYu
npm run pack         # 只打包为目录（release/win-unpacked），最快，适合本地验证
npm run dist:win     # Windows NSIS 安装包 → release/*.exe
npm run dist:mac     # macOS DMG → release/*.dmg
```

产物在 `MoYu/release/`。`pack` 不生成安装程序，但能直接双击其中的可执行文件测试，比 `dist:win` 快得多。

### 6.6 打包产物 vs CI

仓库 CI（[`.github/workflows/main.yml`](.github/workflows/main.yml)）与你本地跑的是**同一套** `electron-builder`，但 CI 用的是 `npx electron-builder --win --x64 --publish never`，且只在手动触发时运行。CI 的 Node 是 18，本地用当前系统的 Node。

### 6.7 常见问题

**`npm run dev` / `npm start` 一启动就崩，报 `cjsPreparseModuleExports`**

```
TypeError: Cannot read properties of undefined (reading 'exports')
    at cjsPreparseModuleExports (node:internal/modules/esm/translators:379)
```

这几乎总是环境变量 **`ELECTRON_RUN_AS_NODE`** 造成的，**不是代码问题**。该变量会让 `electron.exe` 以纯 Node 进程启动，而不是 Electron 运行时，于是 `import { app } from 'electron'` 走 Node 的 CJS 加载器并崩溃。

```powershell
# 确认
Write-Output $env:ELECTRON_RUN_AS_NODE     # 输出 1 就是它

# 本次会话内清掉
Remove-Item Env:\ELECTRON_RUN_AS_NODE
npm start
```

该变量常由 IDE / 工具链注入，且可能既不在 User 级也不在 Machine 级（只是从父进程继承）。**新开一个干净的终端**通常即可解决。若想永久排查来源：

```powershell
[Environment]::GetEnvironmentVariable('ELECTRON_RUN_AS_NODE','User')
[Environment]::GetEnvironmentVariable('ELECTRON_RUN_AS_NODE','Machine')
```

**`npm run dev` 报端口占用**：`strictPort: true` 导致不换端口。先结束占用 5173 的进程：

```powershell
# Windows
Get-NetTCPConnection -LocalPort 5173 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

**`npm start` 打开是空白 / 旧界面**：忘了先 `npm run build`。

**`npm install` 卡在下载 Electron**：`electron` 二进制走 GitHub。国内环境可设置镜像后重装：

```bash
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
npm install
```

**打包报错 `rcedit-x64.exe: file does not exist`（或其它 `winCodeSign` / `nsis` 文件缺失）**

```
⨯ cannot execute  cause=exec: "...\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0\rcedit-x64.exe": file does not exist
```

这是 **electron-builder 的二进制缓存损坏**，与项目代码无关。典型表现是缓存目录里**只有目录结构、没有文件**——下载或解压中途失败留下的空壳。

```powershell
# 1. 确认缓存确实为空（文件数应为 0 或极少）
$root = "$env:LOCALAPPDATA\electron-builder\Cache"
Get-ChildItem "$root\winCodeSign" -Recurse -File | Measure-Object   # ← 目录很多但文件数为 0 就是坏了

# 2. 清掉损坏的缓存（整个 Cache 目录都可以删，下次会自动重新下载）
Remove-Item $root -Recurse -Force

# 3. 重新打包，会重新下载 winCodeSign / nsis / nsis-resources
npm run dist:win
```

正常情况下重新打包时会看到：

```
• downloading  url=https://npmmirror.com/mirrors/electron-builder-binaries/winCodeSign-2.6.0/winCodeSign-2.6.0.7z size=5.6 MB
• downloading  url=https://npmmirror.com/mirrors/electron-builder-binaries/nsis-3.0.4.1/nsis-3.0.4.1.7z size=1.3 MB
• downloading  url=https://npmmirror.com/mirrors/electron-builder-binaries/nsis-resources-3.4.1/nsis-resources-3.4.1.7z size=731 kB
```

国内环境建议配置镜像（已在本项目 `.npmrc` 中设置 `electron_builder_binaries_mirror`），否则下载 GitHub 资源容易超时导致再次出现空壳缓存。

**打包成功后的产物**：

| 文件 | 说明 |
|---|---|
| `release/MoYu-0.0.5-win-x64.exe` | NSIS 安装程序（约 89 MB） |
| `release/MoYu-0.0.5-win-x64.exe.blockmap` | 增量更新用 |
| `release/win-unpacked/MoYu.exe` | 免安装版，可直接双击运行 |

**验证打包产物是否正常**：直接双击 `release/win-unpacked/MoYu.exe`。注意它是 Electron 应用，**启动需要十几秒且不会自动退出**——用命令行跑会看起来"卡住"，这是正常的。

**调试主进程**：`electron/` 下的日志会打到启动它的终端，同时写入 `userData/app.log`（超 2MB 自动截半）。渲染进程的日志经 `renderer:log` 通道汇入同一文件。

**调试 webview 内的页面**：`webview` 标签的 DevTools 可用；页面 `console.log` 会以 `[webview.console]` 前缀转发到渲染进程控制台。

**没有测试框架**（`package.json` 中无 test 脚本，仓库内无测试文件）。

### 环境变量

| 文件 | 变量 | 值 |
|---|---|---|
| `.env.development` | `VITE_APP_BASE_API` | `http://localhost:7000` |
| `.env.production` | `VITE_APP_BASE_API` | `https://gateway.benchi.xyz` |

该变量在 [`src/http/index.js`](MoYu/src/http/index.js) 中作为 `axios.defaults.baseURL`。

### 后端接口

应用访问自有网关，共 2 个端点：

| 端点 | 调用处 | 说明 |
|---|---|---|
| `GET /api/MoYu/CheckVersion` | `App.vue` onMounted、`AboutPage.checkUpdate` | 版本检查，参数 `platform` |
| `POST /api/MoYu/ReportDevice` | `useDeviceReport.reportDevice` | 匿名设备上报 |

**当前状态：默认全部关闭。** 由 [`defaultSettings.backendEnabled`](MoYu/src/shared/defaultSettings.js)（默认 `false`）控制，设置面板 →「隐私与痕迹」→「启用后端在线服务」可开关。

关闭时的行为：

| 影响 | 说明 |
|---|---|
| 启动版本检测 | 完全不发起请求；因此**不会**再因接口不可达而强制跳转更新页 |
| 匿名设备上报 | 不发起请求；隐私弹窗的「同意」只写本地标记 |
| 关于页「检查更新」 | 给出「后端在线服务已关闭」提示 |
| 版本号显示 | **仍正常**——`window.desktop.checkForUpdate()` 是本地 IPC（只返回版本号/平台），不是网络请求，不受此开关影响 |

> **隐私相关**：`/api/MoYu/ReportDevice` 上报 `{ deviceId, platform, appVersion, osInfo }`。`deviceId` 是首次启动生成的 UUID，存于 `userData/.moyu_device_id`，**不随缓存清理丢失**。上报**仅在** `localStorage['moyu-privacy-consent'] === '1'` 时执行（首次启动弹 `PrivacyConsent.vue`，用户点"同意并继续"才写入该标记；点 ✕ 只是关闭本次弹窗，下次启动继续提示）。
>
> 即：**即使把 `backendEnabled` 重新打开，也必须用户明确同意后才会上报**。两个条件是「与」的关系。

**重新启用后端服务**：把 `backendEnabled` 改为 `true`，或在设置面板打开该开关。

### CI/CD

[`.github/workflows/main.yml`](.github/workflows/main.yml) 仅支持 `workflow_dispatch` **手动触发**：

1. `create-release`（ubuntu）读 `MoYu/package.json` 版本号，创建 **draft** GitHub Release
2. `build` 矩阵并行：`macos-latest/universal` 与 `windows-latest/x64`，各自 `npm ci` → 缓存 Electron 二进制 → `npm run build` → `electron-builder` → 上传 `.dmg` / `.exe` 到该 Release

---

## 7. 已知问题与待办

[`MoYu/docs/优化与功能建议.md`](MoYu/docs/优化与功能建议.md) 是作者自己的代码审查清单。**注意其中引用的行号是重构前的旧版本，已不对应现状**。经本轮阅读代码确认的现存问题：

**真实缺陷**
- `MainPage.vue` 中 `onWebviewNewWindow` 已定义但**模板里未绑定**到 webview（死代码）。
- `App.vue` 中 `autoRangeRef` 定义后未被模板使用（死代码）；`openDefaultUrl()` 同样未被引用。
- `App.vue` 模板使用了 `BaseButton` 但**未 import**，依赖 `src/main.js` 的全局注册；若拆分组件会立刻报错。
- `fullWindowTransparent` 变化**不会**触发 `syncWebviewTransparency` 的 watcher（`MainPage.vue` 只监听了 `pageTransparentMode`），需靠其他路径间接触发。
- 更新检查失败时会**强制**跳转到 `/update` 并展示"联系 QQ 群"的保底文案，用户无法跳过。
- **遥测文案与实现不符**：`PrivacyConsent.vue` 声称"以加密哈希形式匿名上报"，但 `device:get-id` 实际是明文存盘的 UUID（`userData/.moyu_device_id`），可长期追踪同一设备；且 `osInfo` 兜底分支会带上原始 UA 前 80 字符。
- `src/http/index.js` 的 `Bearer token` 注入分支是**死代码**（全库无任何地方写入 `localStorage.token`），疑似残留的账号体系设想。
- `useAppState.js` 中 `activeTabId` 初值为 `1`，而 `tabs` 初值只有 id `0`，初始状态不匹配（靠 `activeTab` 的 `?? tabs.value[0]` 兜底）。

**架构注意点**
- `settingsRules` provider（localStorage `glass_reader_settings_rules`）已实现但**在 MainPage 中未被消费**，`customSettings` 目前是死路径。
- `toolbarRules` 只取匹配结果的第一条（`toolbar[0]`）作为覆盖。
- webview 未使用 `partition`，**所有标签共享默认 session**（cookie/localStorage 互通）。
- 规则注入是"时间窗去重 + 脚本内 guard"，不是框架级永久去重；`dom-ready` 重复触发时可能重复执行。
- `USAGE.md` 描述的路径（`src/rule/`、`src/lib/siteRules.js`）是**旧结构**，现为 `src/rules/`。

**已明确不做的方向（仅存设计文档）**

以下三份/三个方向经评估后**已决定不做**，相关文档保留仅作历史记录，不再作为待办：

| 方向 | 文档 | 不做的原因 |
|---|---|---|
| 插件市场（远程） | [`MoYu/docs/插件市场设计.md`](MoYu/docs/插件市场设计.md) | 需后端 + 审核机制；远程脚本注入 webview 的 XSS 面很大。**已由本地规则备份/恢复 + 油猴导入替代**（见 5.1） |
| 云同步 / 会员体系 | [`MoYu/docs/市场模式.md`](MoYu/docs/市场模式.md) | 项目无任何账号体系（`http/index.js` 的 Bearer token 分支无写入方，是残留死代码）；且该文档设想的付费点（防截屏、摸鱼统计）当前都是免费功能 |
| 多窗口 / 分屏 | — | `MainPage` 是"单容器 + `v-show` 切换"结构，改成分屏要动布局与 `webviewRefs` 管理模型，收益/成本比不佳 |

> 对应的条目已从 [`docs/优化与功能建议.md`](docs/优化与功能建议.md) 移除，不再出现在待办清单中。

---

## 8. 相关文档索引

| 文档 | 内容 |
|---|---|
| [`docs/架构说明.md`](docs/架构说明.md) | **本仓库的深度架构说明书**：进程模型、主进程细节、注入机制、数据字典、风险清单 |
| [`docs/优化与功能建议.md`](docs/优化与功能建议.md) | **基于当前代码的优化/功能建议**：数据丢失级缺陷、可改进点、功能推荐与执行顺序 |
| [`docs/扩展导入可行性分析.md`](docs/扩展导入可行性分析.md) | **Chrome/Edge 扩展导入的可行性结论与实施路径**（含必须先做的验证项） |
| [`MoYu/CLAUDE.md`](MoYu/CLAUDE.md) | 面向 AI 助手的速查：目录树、进程分工、IPC、状态管理、路由表、规则系统、持久化 |
| [`MoYu/README.md`](MoYu/README.md) | 应用级 README：特性、技术栈、结构、快速开始 |
| [`MoYu/USAGE.md`](MoYu/USAGE.md) | 使用与调试示例（**路径信息已过时**，注入原理部分仍有效） |
| [`MoYu/docs/优化与功能建议.md`](MoYu/docs/优化与功能建议.md) | 作者早期自审（**行号已过时**，部分缺陷已修） |
| [`MoYu/docs/插件市场设计.md`](MoYu/docs/插件市场设计.md) | 插件市场设计（**已决定不做**，存档） |
| [`MoYu/docs/市场模式.md`](MoYu/docs/市场模式.md) | 商业化策略（**已决定不做**，存档） |

---

## 9. 开发约定

- **注释与 UI 文案使用中文**，注释风格为 JSDoc 式（`@param` 说明参数）。
- 用户配置**单一来源**：[`src/shared/defaultSettings.js`](MoYu/src/shared/defaultSettings.js)，主进程与渲染进程共同引用。新增设置项必须同时更新此处与 `electron/main.js` 的 `normalizeSettings`。
- 主进程对设置做**白名单式规范化**（clamp 数值范围、校验颜色 hex、Boolean 强制），不信任渲染进程传入的值。
- 新增页面：在 [`src/router/index.js`](MoYu/src/router/index.js) 注册路由，ConsolePage 底部 Tab 按 `route.path` 自动高亮。
- 新增站点规则：在 `src/rules/scripts/` 放一个 `.js`，`import.meta.glob` 自动加载，无需注册。
