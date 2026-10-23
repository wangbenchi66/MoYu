# 内置油猴脚本

把 `.user.js` 文件放进本目录，构建时会**自动注册为内置规则**，
在「个人中心 → 站点规则 → 内置规则」里出现，默认开启，可随时停用。

不需要改任何代码，也不需要写 wrapper。

## 用法

1. 把油猴脚本拷进来，例如：

```
src/rules/userscripts/某站点净化.user.js
```

2. 重新构建（或重启 `npm run dev`）：

```bash
npm run build
```

3. 打开应用 → 个人中心 → 站点规则，即可在「内置规则」分组看到它。

## 注意

- **文件名不限**，但必须以 `.user.js` 结尾才会被识别。
- **需要重新构建**：脚本是在构建时通过 Vite 的 `import.meta.glob` 静态收集的，
  直接往文件夹里丢文件不会热更新，必须重新 build（dev 模式重启即可）。
- **`@match` 会转成 hostname**：`*://*.example.com/*` → `example.com`。
  只匹配 `*://*/*`（全站）的脚本会被跳过，因为在本应用里等于对所有站点生效。
- **不支持 `GM_*` API**：依赖 `GM_setValue` / `GM_xmlhttpRequest` 等接口的脚本，
  相关功能会失效（其余部分仍会注入）。
- **`@run-at` 一律按 dom-ready**：`document-start` 等时机不会被支持。
- **`@exclude` 不生效**。

## 与 vendors/ 的区别

| 目录 | 用途 | 加载方式 |
|---|---|---|
| `scripts/vendors/` | 需要特殊处理的第三方脚本（如知乎插件，要剥壳 + GM shim） | 由对应的 wrapper 手动 `?raw` import |
| `scripts/userscripts/` | **通用油猴脚本，放进来就自动生效** | Vite glob 自动收集 |
