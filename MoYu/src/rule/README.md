# 规则注入（JS / CSS）使用说明

本文档说明如何为 `src/rule/*.js` 中的站点规则编写注入脚本（JS/CSS），并介绍可用的 `helper` API、注意事项与调试方法。

**位置**
- 放置规则文件：`src/rule/` 目录下，每个文件是一个模块（例如 `src/rule/weread.qq.com.js`）。
- 规则会由项目在运行/构建时通过 `import.meta.glob('../rule/*.js', { eager: true })` 自动加载（见 `src/lib/siteRules.js`）。

---

**一、模块导出约定（推荐）**

推荐导出形式：默认导出为函数（即规则的 entry），并同时导出 `pattern` / `patterns` 或 `match` 用于匹配目标 URL：

```js
// 示例：src/rule/weread.qq.com.js
export const pattern = ['weread.qq.com', 'book.weread.qq.com'];
export default function main(helper) {
  // 在这里使用 helper.runWebviewCss / helper.runWebviewJS
}
```

支持的导出形式（loader 会兼容）：
- `export default function (helper)`：直接把默认导出当作 `apply`（推荐）。
- `export default { pattern, apply(helper){}, ... }`：对象方式，`apply` 或 `main` 会被视为执行入口。
- 命名导出 `export function apply(helper){}` / `export function main(helper){}`。
- 匹配字段：`export const pattern = 'example.com'`、`export const patterns = ['a.com','b.com']`、`export const match = (url)=>boolean`、或 `pattern` 为 `RegExp`。

---

**二、helper API（注入入口可用）**
规则的默认入口（`apply(helper)` / `main(helper)`）会接收一个 `helper` 对象，常用字段如下：

- `helper.runWebviewCss(idSuffix, css)`
  - 将 CSS 注入到当前 webview。
  - `idSuffix`：用于区分本规则注入的不同样式段（建议使用短且无空格的标识符，例如 `remove-ads`、`hide-sidebar`）。在内部样式 ID 会以 `site-custom-css-${rule.id}-${idSuffix}` 的形式生成并复用/替换已有样式。
  - `css`：字符串，传空字符串或 `''` 表示移除对应 id 的样式。
  - 返回：通常为一个 Promise（注入完成或失败情况会被捕获）。
  - 实现细节：优先使用 `webview.insertCSS`（可绕过 CSP），失败时回退为在页面中插入 `<style id="...">`。

- `helper.runWebviewJS(js)`
  - 在 webview 上执行一段 JS 字符串。
  - 建议把脚本写成自执行函数（IIFE），并 `return true`：
    ```js
    helper.runWebviewJS(`(() => {
      try { /* ... */ } catch(e){}
      return true;
    })();`);
    ```
  - 返回：如果 webview 的 `executeJavaScript` 返回 Promise，则此函数会返回该 Promise，便于在调试时观察错误；但调用端（框架）不会等待该 Promise 完成（会尽量 .catch），因此不要依赖返回值做关键的同步逻辑。

- `helper.webview`
  - 直接引用底层的 Electron `webview` DOM 元素。
  - 可针对性调用 `executeJavaScript`, `insertCSS`, `getURL`, `getZoomFactor`, `removeInsertedCSS` 等 API，但请注意兼容性与错误处理。

- `helper.settings`、`helper.activeTab`、`helper.rule`
  - 分别为应用设置对象、当前 tab 信息（含 `url`）与当前规则对象（含 `id`、`pattern`、`matchType` 等）。

---

**三、实用示例**

1) 隐藏广告（CSS 注入）：

```js
export const pattern = 'example.com';
export default function main(helper) {
  helper.runWebviewCss('hide-ads', `
    .ad-banner, .sponsored, [id^="ad_"] { display: none !important; }
  `);
}
```

2) 简单 JS 注入（带日志和 alert 测试）：

```js
export const pattern = ['weread.qq.com'];
export default function main(helper) {
  helper.runWebviewJS(`(() => {
    try {
      console.log('[weread.rule] running test');
      // 警告：生产中不要使用 alert，仅用于调试
      alert('注入测试 - weread');
    } catch (e) {}
    return true;
  })();`);
}
```

3) 等待元素出现后再操作（MutationObserver）：

```js
export default function main(helper) {
  helper.runWebviewJS(`(() => {
    try {
      function applyWhenReady() {
        const el = document.querySelector('.chapter-content');
        if (el) {
          el.style.paddingTop = '10px';
          return true;
        }
        return false;
      }

      if (!applyWhenReady()) {
        const mo = new MutationObserver(() => { if (applyWhenReady()) mo.disconnect(); });
        mo.observe(document.documentElement || document, { childList: true, subtree: true });
      }
    } catch(e){}
    return true;
  })();`);
}
```

---

**四、异步与返回值注意**
- 规则的 `apply` / `main` 可以返回 Promise；框架会尝试 `.catch()` 捕获报错，但通常不会 `await` 等待 Promise 完成（以避免阻塞其它规则）。如果你的逻辑依赖顺序执行或必须确保注入完成，请在注入脚本内部处理同步/重试逻辑（例如在注入的脚本里用 Promise/MutationObserver/polling）。

---

**五、调试与常见问题**

- 看不到注入结果（常见原因）：
  1. 规则未匹配到 URL：确认 `pattern`/`patterns`/`match` 是否与 `activeTab.url` 或 `webview.getURL()` 匹配。可在规则里添加 `console.log('[my-rule] matched', helper.activeTab?.url)` 来确认；项目会把 webview 的 console-message 转发到渲染器 Console（前缀 `[webview.console]`）。
  2. timing（时机）问题：`dom-ready` 可能在页面脚本完成前触发，使用 MutationObserver 或在注入脚本中轮询目标元素即可。
  3. CSP / 页面策略：CSS 注入优先通过 `insertCSS`（能更好绕过 CSP），JS 注入可能受限。尽量把样式放到 `runWebviewCss`，逻辑放入 `runWebviewJS` 中谨慎处理。
  4. 页面本身拦截或覆盖：某些页面会动态插入样式/脚本覆盖你注入的样式，考虑用更高优先级或 MutationObserver 重新应用。

- 调试技巧：
  - 在注入脚本里添加 `console.log('[rule-name]', ...)`，然后在应用 DevTools Console 中查找 `[webview.console]` 或你输出的前缀。
  - 检查渲染器 Console（主窗口）是否出现 `[site-rules] applying rule` 日志，表示框架已经调用了规则入口。

---

**六、最佳实践**
- 使用唯一且可预测的 `idSuffix`（例如 `hide-ads`, `reader-style`），避免与其他规则或内置样式冲突。
- 注入的 JS 使用 IIFE 并 `return true`，确保执行环境自给自足，减少对外部变量依赖。
- 在注入脚本中做好错误捕获（try/catch），保证不会抛出到页面控制台影响体验。
- 不要在生产规则中使用 `alert()`，仅用于临时调试。
- 对可能长期存在的 DOM 修改使用 `MutationObserver`，并在不需要时断开 observer。

---

**七、快速检查清单（创建规则时）**
- [ ] 是否导出了 `pattern`/`patterns` 或 `match`？
- [ ] 是否导出了默认函数（`default`）或 `apply` 函数？
- [ ] CSS 用 `helper.runWebviewCss` 注入，且 `idSuffix` 唯一。
- [ ] JS 用 `helper.runWebviewJS` 注入，且封装为 IIFE。
- [ ] 在 DevTools Console 中有日志输出以便调试。

---

如需，我可以把这份说明转换为仓库根目录下的更正式文档（例如 `docs/rules.md`），或为 `src/rule/weread.qq.com.js` 增加注释样例。需要我继续吗？

---

## 完整示例（逐行注释）

下面给出一个完整的规则文件示例（可直接放到 `src/rule/example.full.js`），同时在代码中逐行注释说明为何这样写、注意点与常见替代方案。

```js
// example.full.js - 完整示例（逐行注释）

// 1) 导出 pattern：告诉 loader 哪些 URL 应该匹配此规则。
//    支持字符串、数组或正则。优先用 hostname/子域方式匹配。
export const pattern = ['weread.qq.com', 'book.weread.qq.com'];

// 2) 可选描述字段（便于开发者识别）
export const description = '示例规则：优化阅读页面、移除广告、增强交互';

// 3) 默认导出为规则入口函数，框架在匹配时会传入 helper。
//    helper 常见字段：runWebviewCss(idSuffix, css), runWebviewJS(js), webview, settings, activeTab, rule
export default function main(helper) {
  // 便捷变量，减少每次写 helper.xxx
  const runCss = helper && helper.runWebviewCss;
  const runJs = helper && helper.runWebviewJS;
  const webview = helper && helper.webview;
  const activeTab = helper && helper.activeTab;

  // 最外层 try/catch：避免规则内部错误影响主程序
  try {
    // 调试输出：渲染器会转发 webview 的 console-message 到主窗口 Console
    try { console.log('[example.full] apply start', activeTab && activeTab.url); } catch (e) {}

    // ==========================
    // CSS 注入：分段管理，便于后续更新或移除
    // 推荐使用短的 idSuffix（例如 'base','layout','hide-ads'）
    // ==========================
    try {
      // 基础样式重置：移除默认 margin，设置透明背景
      runCss && runCss('base', `
        html, body { margin: 0 !important; padding: 0 !important; background: transparent !important; }
        * { box-sizing: border-box !important; }
      `);

      // 布局与宽度限制：阅读体验优化
      runCss && runCss('layout', `
        .reader-content, .chapter-content { max-width: 760px !important; margin: 0 auto !important; padding: 20px !important; }
        .chapter-title { font-size: 20px !important; font-weight: 700 !important; margin-bottom: 12px !important; }
      `);

      // 隐藏非阅读区域（页眉、侧栏等）
      runCss && runCss('hide-side', `
        .site-header, .site-footer, .sidebar, .recommend-panel { display: none !important; }
      `);
    } catch (e) {
      try { console.error('[example.full] runCss failed', e); } catch (err) {}
    }

    // ==========================
    // JS 注入：封装为 IIFE，保持独立作用域
    // - 小改变/清理可以多次调用 runJs
    // - 复杂流程建议合并为一个 IIFE，或在 IIFE 内使用 Promise/MO
    // ==========================
    try {
      // 简单清理：移除常见广告/遮罩
      runJs && runJs(`(() => {
        try {
          document.querySelectorAll('[id*=ad],[class*=ad],[class*=banner],[class*=mask]').forEach(n => { try{ n.remove(); }catch(e){} });
          console.log('[example.full] removed common ad nodes');
        } catch(e) {}
        return true;
      })();`);

      // 等待异步加载的文章内容：使用 MutationObserver
      runJs && runJs(`(() => {
        try {
          function applyWhenReady() {
            const el = document.querySelector('.chapter-content') || document.querySelector('.reader-content');
            if (!el) return false;
            // 找到后做必要的 DOM 修正
            try { el.querySelectorAll && el.querySelectorAll('p').forEach(p => { p.style.marginBottom = '12px'; }); } catch(e) {}
            return true;
          }

          if (!applyWhenReady()) {
            const mo = new MutationObserver((mutations, obs) => { if (applyWhenReady()) { try{ obs.disconnect(); }catch(e){} } });
            mo.observe(document.documentElement || document, { childList: true, subtree: true });
          }
        } catch(e) {}
        return true;
      })();`);

      // 增强交互：键盘翻页（示例）
      runJs && runJs(`(() => {
        try {
          if (window.__gr_example_keybind) return true; // 防止重复绑定
          window.__gr_example_keybind = true;
          window.addEventListener('keydown', function(e){ try {
            if (e.key === 'ArrowLeft') { const prev = document.querySelector('.pager-prev, .prev-chapter'); if (prev && prev.click) prev.click(); }
            if (e.key === 'ArrowRight') { const next = document.querySelector('.pager-next, .next-chapter'); if (next && next.click) next.click(); }
          } catch(e){} }, false);
        } catch(e) {}
        return true;
      })();`);
    } catch (e) {
      try { console.error('[example.full] runJs failed', e); } catch (err) {}
    }

    // ==========================
    // 可选：直接使用 webview.executeJavaScript 获取返回值或做更底层操作
    // 注意：executeJavaScript 返回 Promise，可用于调试或获取执行结果
    // ==========================
    try {
      if (webview && typeof webview.executeJavaScript === 'function') {
        // 这里演示记录日志到 webview 端（会被转发到渲染器 Console）
        try { webview.executeJavaScript(`console.log('[example.full] executed within webview');`).catch(()=>{}); } catch(e){}
      }
    } catch (e) {}

    // ==========================
    // 调试建议（生产环境需移除或屏蔽）
    // - 避免使用 alert()；若要临时验证注入是否生效，建议使用 console.log，方便收集与自动化
    // - 使用唯一 idSuffix 管理 CSS 段，便于后续替换/移除
    // ==========================
    try { console.log('[example.full] apply finished'); } catch (e) {}

  } catch (err) {
    try { console.error('[example.full] unexpected error', err); } catch (e) {}
  }

  // 函数结束：不返回则视为同步完成，若有异步工作可返回 Promise
}
```

附注：上面示例展示了常见场景与实现要点。你可以把此文件复制到 `src/rule/example.full.js`，并根据目标站点的 DOM 结构调整选择器与脚本逻辑。

---

已完成：追加完整逐行注释示例。
