# GlassReader 使用示例

这是一个简明的使用与开发示例，帮助你在本地运行、调试和打包 GlassReader（基于 Vite + Electron）。

**先决条件**
- Node.js（建议 18+）
- npm
- Windows / macOS / Linux 环境

**安装依赖**
```bash
npm install
```

**本地开发**
- 启动前端开发服务器（Vite）并同时启动 Electron：
```bash
npm run dev
```
- 或单独运行前端：
```bash
npm run dev:web
```
- 单独启动 Electron（在 dev:web 启动并监听 5173 后）：
```bash
npm run dev:electron
```

**预览与构建**
- 本地构建静态资源并预览：
```bash
npm run build
npm run preview
```
- 打包（生成 release 文件夹）：
```bash
npm run pack    # 仅打包为目录（未生成安装程序）
npm run dist    # 生成安装包
npm run dist:win # 仅为 Windows 生成 nsis 安装包
```

**常见调试点**
- WebView 内容无法加载或报 TLS 错误：请先在外部浏览器确认目标站点是否可访问，检查系统代理/杀软/企业证书拦截。可以在 `electron/main.js` 中添加 `did-fail-load` 或 `certificate-error` 日志以获取更多信息。
- 要在 WebView 内注入 JS/CSS：规则位于 `src/rule/`，构建时会被自动加载（见 `src/lib/siteRules.js`）。注入时请注意：
  - 渲染器（`main`）与 WebView 页面是不同上下文，若要在页面内执行函数需把函数源码注入到页面（例如使用 `runWebviewJS` 或 `webview.executeJavaScript`）。
  - 注入函数应为自包含（不要依赖渲染器闭包或未注入的变量）；避免重复声明，推荐把函数挂在 `window` 并加 guard（如 `if (!window.__grInstalled) { window.__grInstalled = true; window.nextChapter = ... }`）。

**示例：注入并调用页面函数**
- 在规则文件中把函数注入一次（示例）:
```js
runJs && runJs(`(function(){
  if (window.__nextChapterInstalled) return;
  window.__nextChapterInstalled = true;
  window.nextChapter = ${nextChapter.toString()};
})();`);
```
- 之后只需在渲染器调用：
```js
runJs && runJs('window.nextChapter();');
```

**如何编辑站点规则**
- 规则目录：`src/rule/`。
- 编写规则时推荐：
  - 使用 `export const pattern = [...]` 匹配站点；
  - 导出默认函数 `export default function main(helper) {}`；
  - 使用 `helper.runWebviewJS` / `helper.runWebviewCss` 注入到 WebView。 

**调试 WebView 的控制台**
- WebView 的 console 信息会被转发到渲染器控制台，搜索带前缀 `[webview.console]` 的日志以定位注入脚本输出。

**示例：快速排查 WebView 无法加载**
```bash
# 在项目根目录运行：
curl -v https://weread.qq.com
# 或使用 openssl 检查 TLS 握手：
openssl s_client -connect weread.qq.com:443 -servername weread.qq.com
```

**文件与入口**
- 渲染器主文件：`src/main.js`，Electron 入口：`electron/main.js`，预加载脚本：`electron/preload.js`（或 `preload.cjs`）。

如果你希望我把这份文档放到其它路径、补充更多示例（例如：如何编写站点规则模板、如何在 `preload` 暴露 API），告诉我即可。