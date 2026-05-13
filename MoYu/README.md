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
electron/          主进程（窗口管理、IPC、Tray）
src/
  components/      公共组件（工具栏、标签栏、右键菜单等）
  composables/     状态管理（useDesktopApp）
  http/            HTTP 封装（Axios + Loading + 错误处理）
  layouts/         布局组件（TopBar）
  pages/           页面组件（首页、书架、阅读器、历史等）
  rules/           站点规则（加载、匹配、注入）
  router/          路由配置
  shared/          主/渲染进程共享配置
```

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

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Alt+Q` | 老板键（隐藏/恢复窗口） |
| `Ctrl+Alt+T` | 切换透明度 |
| `=` / `-` | 调整透明度 |
