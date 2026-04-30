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

### 进程分工

```
electron/main.js        # 主进程：窗口管理、设置持久化、Tray、全局快捷键（仅老板键）
electron/preload.js     # 预加载脚本：通过 contextBridge 向渲染进程暴露 ipcRenderer 接口
src/main.js             # 渲染进程入口：挂载 Vue 应用
```

**主进程 ↔ 渲染进程通信（IPC）**：
- `settings:get` / `settings:update` / `settings:set-transparency` — 设置读写
- `window:minimize` / `window:maximize` / `window:close` / `window:quit` — 窗口控制
- `ui:set-ignore-mouse-events` — 鼠标穿透
- `shell:open-external` — 外部浏览器打开链接

### 渲染进程核心结构

```
src/composables/useDesktopApp.js   # 全局状态（settings、tabs、历史、规则）— 唯一数据层
src/App.vue                        # 根组件：快捷键处理、设置面板、热区悬停逻辑
src/pages/MainPage.vue             # 多 webview 管理、脚本注入调度
src/layouts/TopBar.vue             # 顶部标题栏（窗口控制、透明度快速切换）
src/pages/parts/BottomToolbar.vue  # 底部工具栏（后退/前进/缩放，支持悬浮/停靠/固定模式）
src/shared/defaultSettings.js      # 主进程与渲染进程共享的默认配置（单一来源）
```

**状态管理**：`useDesktopApp.js` 是整个应用的唯一状态层，无 Pinia/Vuex。设置变更后通过防抖（120ms）同步到主进程；`immediateSyncKeys`（透明度、快捷键等）会立即同步。

### 快捷键分层

- **全局快捷键**（主进程注册）：仅 `bossKey`（默认 `Alt+Q`），任何时候均生效
- **本地快捷键**（渲染进程 `App.vue` 监听 `keydown`）：透明度调整、鼠标穿透、自动滚动控制，仅窗口聚焦时生效

快捷键格式：`"Ctrl+Alt+T"` 或单字符 `"="`，不支持 Shift 作为修饰符。

### 站点规则注入系统

规则文件位于 `src/rule/*.js`，构建时通过 `import.meta.glob` 自动加载（`src/lib/siteRules.js`）。

**规则文件标准结构：**

```js
// src/rule/example.com.js
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

**注入时机**：`MainPage.vue` 监听 webview 的 `did-finish-load` 事件后触发规则匹配与注入；框架通过脚本签名防止重复注入。

**调试**：webview 内的 `console.log` 会被转发到渲染器 Console，前缀为 `[webview.console]`。

### 设置持久化

- 持久化到磁盘（`userData/glass-reader-settings.json`）：大部分配置项
- **不持久化**（临时状态）：`transparency`、`autoHide`、`hoverHeaderMode`、`clickThroughMode`、`alwaysOnTop` 等，每次启动从 `defaultSettings` 重置
- 推荐站点 / 最近访问：存储在 `localStorage`

### Vite 配置注意事项

- `webview` 标签被声明为自定义元素（`isCustomElement`），Vue 不会将其作为组件处理
- 开发模式下 Vite dev server 固定监听 `127.0.0.1:5173`（`strictPort: true`）
- 构建时 `base: './'` 确保 Electron 以文件协议加载 `dist/` 时路径正确
