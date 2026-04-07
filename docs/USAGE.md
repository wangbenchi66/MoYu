# TransBrowser 使用说明

TransBrowser 是一款基于 WPF + Microsoft WebView2 的**透明摸鱼浏览器**，支持多标签页、全局热键、鼠标穿透、自定义脚本等功能，专为在工作间隙摸鱼设计。

---

## 目录

1. [安装依赖](#安装依赖)
2. [快速上手](#快速上手)
3. [INI 配置迁移](#ini-配置迁移)
4. [settings.json 配置说明](#settingsjson-配置说明)
5. [功能详解](#功能详解)
6. [快捷键](#快捷键)
7. [常见问题](#常见问题)

---

## 安装依赖

### 必要依赖

| 依赖 | 说明 | 获取方式 |
|------|------|----------|
| **.NET 8 Runtime** | 程序运行时 | [下载地址](https://dotnet.microsoft.com/download/dotnet/8.0) |
| **Microsoft WebView2 Runtime** | 网页渲染引擎 | Windows 11 已内置；Windows 10 需手动安装：[下载地址](https://developer.microsoft.com/microsoft-edge/webview2/) |

### 开发/构建依赖

| 依赖 | 版本 |
|------|------|
| .NET SDK | 8.0+ |
| Microsoft.Web.WebView2 NuGet | 1.0.2849.39 |

```bash
# 还原依赖
dotnet restore

# 构建（Windows 环境）
dotnet build TransBrowser.Wpf/TransBrowser.Wpf.csproj

# 在 Linux CI 上构建（需加 EnableWindowsTargeting）
dotnet build TransBrowser.Wpf/TransBrowser.Wpf.csproj -p:EnableWindowsTargeting=true
```

---

## 快速上手

1. 启动 `TransBrowser.exe`
2. 窗口出现后，在地址栏输入网址，按 **Enter** 导航
3. 使用 **Alt+Q**（默认 Boss 键）快速隐藏/显示窗口
4. 右下角拖动调整透明度滑块
5. 点击 **⚙** 按钮打开设置

---

## INI 配置迁移

如果你曾使用过 **TransBrowserFork（WinForms 版本）**，可以将其 `config.ini` 文件迁移到本程序的 JSON 格式：

### 迁移方法（自动）

将 `config.ini` 放置在以下任意位置，程序启动时自动检测并迁移：

- 程序目录下：`TransBrowser.exe` 所在文件夹
- AppData 目录：`%APPDATA%\TransBrowser\config.ini`

**迁移完成后：**
- 原文件重命名为 `config.ini.migrated`（保留备份）
- 新配置保存到 `%APPDATA%\TransBrowser\settings.json`
- 如有格式错误的配置项，启动时会弹出提示，并使用默认值代替

### 映射规则

| INI 键 | JSON 键 | 转换说明 |
|--------|---------|----------|
| `[Window] Opacity=100` | `Opacity: 1.0` | 除以 100 |
| `[Window] Position=x,y` | `WindowLeft/Top` | 拆分坐标 |
| `[Window] Size=w,h` | `WindowWidth/Height` | 拆分尺寸 |
| `[Browser] DefaultUrl=` | `StartUrl` | 直接映射 |
| `[Hotkeys] BossKey=Alt+Q` | `BossKey` | 直接映射 |
| `[CustomSites] Name\|Url` | `CustomSites[]` | 拆分 `\|` 分隔符 |

---

## settings.json 配置说明

配置文件位置：`%APPDATA%\TransBrowser\settings.json`

```json
{
  "Opacity": 1.0,
  "WindowLeft": 100,
  "WindowTop": 100,
  "WindowWidth": 900,
  "WindowHeight": 650,
  "TopMost": false,
  "ShowInTaskbar": true,
  "NoTitle": false,
  "HoverHeaderMode": false,
  "ShowTabBar": true,
  "StartUrl": "",
  "UserAgent": "",
  "AutoHide": false,
  "NoImageMode": false,
  "TransparentBackground": false,
  "MobileMold": false,
  "ClickThroughMode": false,
  "BossKey": "Alt+Q",
  "OpacityUp": "Alt+Right",
  "OpacityDown": "Alt+Left",
  "OpacityReset": "Alt+Up",
  "ClickThrough": "Ctrl+Alt+T",
  "GoBack": "Alt+Shift+Z",
  "RunJs": "Alt+Shift+C",
  "AutoScript": "",
  "CustomSites": [],
  "History": []
}
```

### 字段说明

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `Opacity` | double | 1.0 | 窗口透明度 (0.01~1.0，1.0 完全不透明) |
| `TopMost` | bool | false | 窗口是否始终置顶 |
| `ShowInTaskbar` | bool | true | 任务栏是否显示 |
| `NoTitle` | bool | false | 是否隐藏标题栏（无边框） |
| `HoverHeaderMode` | bool | false | 鼠标移到顶部时才显示标题栏 |
| `ShowTabBar` | bool | true | 是否显示标签栏 |
| `StartUrl` | string | "" | 启动时加载的网址，留空打开新标签页 |
| `UserAgent` | string | "" | 自定义 UA，留空使用默认 WebView2 UA |
| `AutoHide` | bool | false | 失去焦点时自动隐藏窗口 |
| `NoImageMode` | bool | false | 屏蔽网页中的图片和视频 |
| `TransparentBackground` | bool | false | 强制网页背景透明（透出 WPF 窗口背景） |
| `MobileMold` | bool | false | 使用移动端 User-Agent（模拟手机） |
| `ClickThroughMode` | bool | false | 初始启动时是否开启鼠标穿透模式 |
| `AutoScript` | string | "" | 每次导航完成后自动执行的 JavaScript |
| `BossKey` | string | "Alt+Q" | Boss 键（隐藏/显示窗口） |
| `OpacityUp` | string | "Alt+Right" | 增加透明度（更不透明） |
| `OpacityDown` | string | "Alt+Left" | 减少透明度（更透明） |
| `OpacityReset` | string | "Alt+Up" | 重置透明度为 100% |
| `ClickThrough` | string | "Ctrl+Alt+T" | 切换鼠标穿透模式 |
| `GoBack` | string | "Alt+Shift+Z" | 当前标签页后退 |
| `RunJs` | string | "Alt+Shift+C" | 打开 JS 编辑器 |

---

## 功能详解

### 多标签页

- 点击标签栏右侧 **+** 按钮新建标签页
- 点击标签上的 **×** 关闭标签（至少保留 1 个）
- 标签标题自动更新为页面标题
- 外链（`target="_blank"` 等）自动在**新标签页**打开

### 新标签页

新标签页包含：
- **URL 输入框**：输入地址后按 Enter 导航
- **内置快捷**：微信读书、小红书、哔哩哔哩
- **我的网站**：可添加/删除自定义快捷网站
- **最近访问**：显示最近 50 条历史记录（支持搜索、分页加载）

### 鼠标穿透模式

按 **Ctrl+Alt+T**（默认）切换穿透模式。开启后：
- 鼠标点击将穿透窗口，到达后方程序
- 状态栏显示 `⚡ 穿透模式已开启`
- 全局热键仍然生效（可以用 Boss 键或穿透快捷键恢复）

> **恢复方法**：再次按 Ctrl+Alt+T，或通过系统托盘右键菜单选"穿透模式切换"

### Boss 键（隐藏/显示）

按 **Alt+Q**（默认）快速隐藏或显示窗口，方便在老板来时快速切换。

隐藏后，通过：
- 再次按 Alt+Q 显示
- 系统托盘双击显示

### 透明度调节

| 操作 | 效果 |
|------|------|
| Alt+Right | 增加 10% 不透明度 |
| Alt+Left | 减少 10% 不透明度 |
| Alt+Up | 重置为 100% 不透明度 |
| 状态栏滑块 | 实时拖动调整 |
| 设置窗口 | 精确设置 |

### 自动隐藏（AutoHide）

开启后，窗口失去焦点时自动隐藏。通过 Boss 键或托盘双击恢复。

### 无图模式（NoImageMode）

开启后，通过注入 CSS 屏蔽所有 `<img>` 和 `<video>` 元素，节省流量。

### 透明背景（TransparentBackground）

强制注入 CSS `html,body{background:transparent!important}`，让网页背景透明，透出 WPF 窗口的半透明效果。

### 手机模式（MobileMold）

使用 Android 移动端 User-Agent，使网站显示手机版布局。

### JS 编辑器

按 **Alt+Shift+C**（默认）打开 JS 编辑器，输入 JavaScript 代码后点击"运行"，在当前标签页执行。

### 自动脚本

在设置中填写"自动脚本"，每次页面导航完成后自动执行，适合：
- 自动登录/填表
- 注入样式修改页面外观
- 自动化操作

### 系统托盘

程序运行时在系统托盘显示图标，右键菜单：

| 菜单项 | 功能 |
|--------|------|
| 显示/隐藏 | 切换窗口可见性 |
| 穿透模式切换 | 开/关鼠标穿透 |
| 总在最前切换 | 切换置顶状态 |
| 设置 | 打开设置窗口 |
| 退出 | 完全退出程序 |

托盘图标双击可显示/恢复窗口。

### 右键菜单

在网页内容区域右键：
- **复制链接**：仅在右键点击链接时显示，复制链接地址到剪贴板
- **打开开发者工具**：打开 Chromium DevTools

---

## 快捷键

### 全局快捷键（可自定义）

| 功能 | 默认快捷键 | 说明 |
|------|-----------|------|
| Boss 键 | `Alt+Q` | 隐藏/显示主窗口 |
| 透明度增加 | `Alt+Right` | 每次 +10% 不透明度 |
| 透明度减少 | `Alt+Left` | 每次 -10% 不透明度 |
| 透明度重置 | `Alt+Up` | 重置为 100% 不透明 |
| 穿透模式切换 | `Ctrl+Alt+T` | 开/关鼠标穿透 |
| 返回上页 | `Alt+Shift+Z` | 当前标签后退 |
| 运行 JS | `Alt+Shift+C` | 打开 JS 编辑器 |

### 快捷键格式

格式：`修饰键+按键`，例如：`Ctrl+Alt+T`、`Alt+Q`、`Shift+F1`

支持修饰键：`Ctrl`、`Alt`、`Shift`、`Win`

支持按键：`A-Z`、`0-9`、`F1-F12`、`Up`/`Down`/`Left`/`Right`、`Space`、`Tab`、`Enter`、`Escape` 等

### 自定义快捷键

在**设置**（⚙ 按钮或托盘菜单）→ 快捷键设置 中修改，保存后立即生效。

---

## 常见问题

**Q: 程序启动后白屏/黑屏？**  
A: 确认已安装 [Microsoft WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)。

**Q: 透明效果不工作？**  
A: 确认窗口不在最大化状态；如使用远程桌面，可能不支持透明度。

**Q: 热键不响应？**  
A: 可能与其他程序冲突。在设置中更换一个不冲突的热键。

**Q: 穿透模式下无法操作浏览器了？**  
A: 再次按穿透快捷键（默认 `Ctrl+Alt+T`）关闭穿透模式；或右键点击系统托盘图标 → 穿透模式切换。

**Q: 关闭所有标签页后怎么新建？**  
A: 至少保留 1 个标签，无法关闭最后一个标签。

**Q: 历史记录怎么清除？**  
A: 在 `%APPDATA%\TransBrowser\settings.json` 中将 `"History": []` 清空即可。

**Q: config.ini 迁移后原文件在哪？**  
A: 重命名为 `config.ini.migrated`，与原文件同目录，可手动删除。

**Q: 如何完全重置设置？**  
A: 删除 `%APPDATA%\TransBrowser\settings.json`，重启程序自动生成默认配置。

---

## 数据目录

| 文件/文件夹 | 说明 |
|------------|------|
| `%APPDATA%\TransBrowser\settings.json` | 主配置文件 |
| `%APPDATA%\TransBrowser\WebView2\` | WebView2 用户数据（Cookie、缓存等） |
