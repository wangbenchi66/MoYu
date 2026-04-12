规则提供器（ruleProviders）与 siteRules 说明

此文档说明 workspace 内 `site` / `toolbar` / `settings` 三类规则的格式与示例，便于通过设置页管理。

通用字段：
- `id`：规则唯一 id（字符串）。
- `pattern`：匹配模式，例如 `example.com`、`*.example.com` 或正则。
- `matchType`：匹配类型，`hostname` / `url` / `regex`。
- `enabled`：布尔，是否生效。

1) Site 规则（site）
- 语义：对特定站点注入自定义 CSS/JS，或修改页面行为（如阻止 target=_blank、移除图片）。
- 额外字段：
  - `preventBlankTargets`：布尔，是否阻止新窗口（将 target=_blank 在页面中拦截到当前窗口）。
  - `removeImages`：布尔，是否移除/隐藏页面中的图片。
  - `customCss`：字符串，注入的 CSS 内容。
  - `customJs`：字符串，注入的 JS 内容。

示例：
{
  "id": "site-1",
  "pattern": "*.example.com",
  "matchType": "hostname",
  "enabled": true,
  "preventBlankTargets": true,
  "removeImages": false,
  "customCss": "body{ background:#fff }",
  "customJs": "console.log('hello from site rule')"
}

2) Toolbar 规则（toolbar）
- 语义：控制底部工具栏在匹配站点下的展示行为（停靠、悬浮、图标模式、隐藏手柄等）。
- 额外字段：
  - `toolbarDocked`：nullable 布尔，`true` 强制停靠，`false` 强制悬浮，`null` 不覆盖。
  - `toolbarPinned`：nullable 布尔，`true` 固定显示，`false` 移入显示，`null` 不覆盖。
  - `toolbarVisible`：nullable 布尔，用于直接显示/隐藏（不建议滥用）。
  - `toolbarDisabled`：nullable 布尔，禁用工具栏交互。
  - `hideHandle`：布尔，隐藏左侧手柄。
  - `iconOnly`：布尔，仅显示图标样式。

示例：
{
  "id": "tb-1",
  "pattern": "reader.example.com",
  "matchType": "hostname",
  "enabled": true,
  "toolbarDocked": true,
  "toolbarPinned": false,
  "iconOnly": true
}

3) Settings 规则（settings）
- 语义：用于针对某些站点覆盖全局设置项（比如字体、颜色、其它自定义字段），字段以 `customSettings` 对象保存。

示例：
{
  "id": "s-1",
  "pattern": "docs.example.com",
  "matchType": "hostname",
  "enabled": true,
  "customSettings": {
    "readerFontScale": 120,
    "readerTextColor": "#222222"
  }
}

持久化与 API
- 三类规则均由 `ruleProviders` 暴露（`ruleProviders.site` / `ruleProviders.toolbar` / `ruleProviders.settings`）。
- 推荐使用如下方法：
  - `getRules()` 返回规则数组
  - `addRule(rule)` 新增（会分配 id）
  - `editRule(id, partial)` 编辑（局部更新）
  - `removeRule(id)` 删除
  - `persistRules()` 将当前规则写入 localStorage（或同步主进程）

在设置页中使用 `RuleManager` 组件可进行增删改管理，保存后请调用 `persistRules()` 以确保存储。