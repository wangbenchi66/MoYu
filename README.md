# TransBrowser

一个基于 **WPF + Microsoft WebView2** 构建的 Windows 透明浏览器，窗口无边框、背景透明，可通过滑块实时调节透明度，并自动保存/恢复上次的 URL 与窗口设置。

---

## 功能（基础版 MVP）

| 功能 | 说明 |
|---|---|
| 无边框透明窗口 | `WindowStyle=None` + Win32 `WS_EX_LAYERED`（不使用 `AllowsTransparency`） |
| 内置 WebView2 | 使用 Microsoft WebView2（Chromium 内核）渲染网页 |
| 透明度调节 | 底部 Slider，范围 10%–100%，实时生效 |
| 网页背景透明 | 自动注入 CSS 使 `html/body` 背景透明，配合窗口透明使用 |
| 自定义拖动 | 拖动顶部标题栏移动窗口；双击标题栏最大化/还原 |
| URL 导航栏 | 输入地址后回车导航；后退、刷新按钮 |
| 设置面板 | 点击 ⚙ 设置启动 URL |
| 配置持久化 | 自动保存透明度、URL、窗口位置与大小到 `%APPDATA%\TransBrowser\settings.json` |
| 最小化 / 最大化 / 关闭 | 自定义窗口按钮 |
| 窗口缩放 | 右下角拖拽调整尺寸 |

---

## 系统要求

- Windows 10 (1903+) / Windows 11
- [.NET 8 桌面运行时](https://dotnet.microsoft.com/download/dotnet/8.0)
- **Microsoft WebView2 Runtime**（见下方安装说明）

---

## 安装 WebView2 Runtime

> Windows 11 与大多数 Windows 10 设备已自带 WebView2 Runtime，无需额外安装。

如果启动时提示缺少 WebView2，请选择以下方式之一安装：

1. **Evergreen 独立安装程序（推荐）**  
   下载地址：<https://developer.microsoft.com/microsoft-edge/webview2/>  
   点击 **"下载"** → 选择 *Evergreen Standalone Installer* → x64

2. **Bootstrapper（网络安装）**  
   下载 `MicrosoftEdgeWebview2Setup.exe` 并运行即可自动下载安装。

---

## 如何构建与运行

### 前提条件

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)（8.0.100 及以上）
- Windows 操作系统（或在 CI/Linux 上仅构建，不运行）

### 构建

```bash
# 克隆仓库
git clone https://github.com/wangbenchi66/TransBrowser.git
cd TransBrowser

# 还原依赖
dotnet restore

# 构建（Debug）
dotnet build TransBrowser.Wpf/TransBrowser.Wpf.csproj

# 发布（自包含 x64）
dotnet publish TransBrowser.Wpf/TransBrowser.Wpf.csproj \
  -c Release -r win-x64 --self-contained false \
  -o publish/
```

### 运行

```bash
# 开发模式（需要已安装 .NET 8 运行时）
dotnet run --project TransBrowser.Wpf/TransBrowser.Wpf.csproj

# 或直接运行发布产物
publish/TransBrowser.exe
```

---

## 配置文件

配置自动保存于：

```
%APPDATA%\TransBrowser\settings.json
```

示例内容：

```json
{
  "StartUrl": "https://www.bing.com",
  "Opacity": 0.9,
  "WindowLeft": 100,
  "WindowTop": 100,
  "WindowWidth": 1200,
  "WindowHeight": 800
}
```

---

## 项目结构

```
TransBrowser/
├── TransBrowser.sln
└── TransBrowser.Wpf/
    ├── TransBrowser.Wpf.csproj   # WPF 项目文件（.NET 8-windows）
    ├── App.xaml / App.xaml.cs    # WPF Application 入口
    ├── MainWindow.xaml            # 主窗口 UI（无边框透明）
    ├── MainWindow.xaml.cs         # 主窗口逻辑（WebView2、拖动、透明度）
    └── SettingsService.cs         # AppSettings 模型 + JSON 持久化
```

---

## 已实现功能 vs 下一步计划

### ✅ 基础版（当前）

- [x] 无边框透明窗口
- [x] WebView2 嵌入浏览器
- [x] 透明度实时调节（Slider）
- [x] URL 导航栏（地址输入、后退、刷新）
- [x] 配置持久化（URL、透明度、窗口位置/大小）
- [x] 新窗口链接在当前 WebView 内打开
- [x] 网页背景透明注入（CSS）
- [x] 自定义拖拽、最大化/还原、最小化、关闭

### 🔮 下一步计划

- [ ] **鼠标穿透模式**：按快捷键切换"可交互 / 穿透到桌面"
- [ ] **全局快捷键**：Ctrl+Alt+T 切换穿透；Ctrl+Alt+↑/↓ 调节透明度
- [ ] **置顶切换**：一键设置 `Topmost`
- [ ] **多 Tab 支持**：类浏览器标签页
- [ ] **亚克力/毛玻璃背景**：Win11 DWM Mica/Acrylic
- [ ] **右键菜单自定义**：复制链接、DevTools 等
- [ ] **JS ↔ C# 双向通信**：通过 `window.chrome.webview` 控制窗口行为
- [ ] **多配置方案**：不同网站使用不同透明度与窗口尺寸
- [ ] **系统托盘图标**：最小化到托盘

---

## 透明度实现（Win32 Layered Window）

TransBrowser 使用 **Win32 Layered Window**（`WS_EX_LAYERED` + `SetLayeredWindowAttributes`）实现窗口级透明，而**不是** WPF 的 `Opacity` 属性。这带来以下优势：

| 对比项 | WPF Opacity | Win32 Layered Window |
|---|---|---|
| WebView2 透明 | ❌ 子窗口不受影响 | ✅ 整个窗口含 WebView2 同步透明 |
| 渲染质量 | WPF 软件渲染 | 系统 DWM 合成，无闪烁 |
| 性能 | 较差（重复重绘） | 优（GPU 合成层） |
| 点击穿透 | 不支持 | 可选（不启用 `WS_EX_TRANSPARENT`） |

### 关键实现

#### 1. 禁用 WPF 透明（XAML）

```xml
<Window WindowStyle="None"
        AllowsTransparency="False"
        Background="Transparent">
```

> ⚠️ `AllowsTransparency="False"` 是必须的。若保留 `True`，WPF 会用软件渲染处理透明，导致与 Win32 Layered 冲突。

#### 2. Win32 初始化（`OnSourceInitialized`）

```csharp
protected override void OnSourceInitialized(EventArgs e)
{
    base.OnSourceInitialized(e);
    var hwnd = new WindowInteropHelper(this).Handle;
    _transparencyService.Initialize(hwnd);        // 设置 WS_EX_LAYERED
    _transparencyService.SetTransparency(_settings.Opacity);
}
```

#### 3. WebView2 透明背景

```csharp
await wv.EnsureCoreWebView2Async();
wv.DefaultBackgroundColor = System.Drawing.Color.Transparent;
```

> ⚠️ WebView2 默认背景为白色，必须手动设置为透明，否则 Win32 透明效果无法穿透 WebView2。

### 透明策略（TransparencyMode）

| 模式 | 行为 |
|---|---|
| `None` | 窗口完全不透明（alpha = 255） |
| `Fixed` | 始终使用设置中的透明度值（默认） |
| `Dynamic` | 鼠标悬停时完全不透明，鼠标离开时恢复设置值 |

通过 `AppSettings.TransparencyMode` 配置。

### 老板键联动

老板键（默认可在设置中自定义）第一次按下时将窗口透明度降至 0.1（近乎隐形），再次按下恢复到当前设置的透明度值。

---



- 产品形态参考：[yclown/TransBrowser](https://github.com/yclown/TransBrowser)
- 技术栈：WPF (.NET 8) + [Microsoft WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)
