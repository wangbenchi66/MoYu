# TransBrowser

A lightweight, transparent, frameless overlay browser built with WPF (.NET 8) and Microsoft WebView2. Designed to float above your desktop with customizable opacity and mouse click-through mode.

---

## Features

### 🖥️ Transparent Frameless Window
- Fully transparent / semi-transparent window with custom dark chrome
- Drag the title bar to move; drag any edge or corner to resize
- All four corners (including bottom-left and bottom-right) support resize via proper WM_NCHITTEST implementation

### 🖱️ Mouse Click-Through Mode
- Toggle with **Ctrl+Alt+P** (default)
- In click-through mode the window becomes invisible to mouse events — clicks and drags pass directly to the desktop/windows underneath
- A red **"CLICK-THROUGH"** badge appears in the title bar to indicate the mode is active
- Also togglable via the system tray context menu

### ⌨️ Global Hotkeys
All hotkeys work even when the application is in the background.

| Hotkey | Action |
|---|---|
| `Ctrl+Alt+Up` | Increase opacity by 5% |
| `Ctrl+Alt+Down` | Decrease opacity by 5% |
| `Alt+Q` | Boss key — instantly hide/show the window |
| `Ctrl+Alt+P` | Toggle mouse click-through mode |

#### Customizing Hotkeys
Edit `%APPDATA%\TransBrowser\settings.json`:
```json
{
  "HotkeyOpacityUp": "Ctrl+Alt+Up",
  "HotkeyOpacityDown": "Ctrl+Alt+Down",
  "HotkeyBossKey": "Alt+Q",
  "HotkeyMouseThrough": "Ctrl+Alt+P"
}
```
Supported modifiers: `Ctrl`, `Alt`, `Shift`, `Win`  
Supported keys: `Up`, `Down`, `Left`, `Right`, `Q`–`Z`, `A`–`P`, `F1`–`F12`

### 📑 Multi-Tab Browser
- Click **+** in the tab bar to open a new tab
- Each tab has its own independent WebView2 instance (URL, history, session)
- Click **✕** on a tab to close it (if the last tab is closed a new empty tab opens)
- Address bar with back/forward/refresh navigation

### 🖱️ Right-Click Context Menu
Right-click anywhere in the browser content area to access:
- ◀ Back / ▶ Forward / ↻ Refresh
- 🔗 Copy current page URL to clipboard
- ＋ New Tab
- 🛠 Open DevTools

Enable/disable individual items in settings:
```json
{
  "ContextMenuItems": {
    "Back": true,
    "Forward": true,
    "Refresh": true,
    "CopyLink": true,
    "NewTab": true,
    "DevTools": true
  }
}
```

### 📥 System Tray
- Minimize to tray by clicking the minimize button (when `MinimizeToTray` is `true` in settings)
- Double-click the tray icon or use **Show / Hide** to toggle window visibility
- Tray menu:
  - **Show / Hide** — toggle window visibility
  - **Mouse Through** — toggle click-through mode
  - **Exit** — quit the application

### 🔧 Settings Persistence
All settings are automatically saved to:
```
%APPDATA%\TransBrowser\settings.json
```

Full settings reference:
```json
{
  "Opacity": 0.85,
  "MouseThroughEnabled": false,
  "HotkeyOpacityUp": "Ctrl+Alt+Up",
  "HotkeyOpacityDown": "Ctrl+Alt+Down",
  "HotkeyBossKey": "Alt+Q",
  "HotkeyMouseThrough": "Ctrl+Alt+P",
  "ContextMenuItems": {
    "Back": true,
    "Forward": true,
    "Refresh": true,
    "CopyLink": true,
    "DevTools": true,
    "NewTab": true
  },
  "MinimizeToTray": true,
  "WindowLeft": 100,
  "WindowTop": 100,
  "WindowWidth": 1024,
  "WindowHeight": 768
}
```

---

## Requirements

- Windows 10/11 (x64)
- [.NET 8 Runtime](https://dotnet.microsoft.com/download/dotnet/8.0)
- [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (usually pre-installed on Windows 10/11)

---

## Build

```bash
# Restore and build
dotnet build TransBrowser.Wpf/TransBrowser.Wpf.csproj

# Run
dotnet run --project TransBrowser.Wpf/TransBrowser.Wpf.csproj
```

> On Linux/CI you may need `-p:EnableWindowsTargeting=true` to compile without a Windows SDK.

---

## Architecture

```
TransBrowser.Wpf/
├── App.xaml / App.xaml.cs          — Application entry point, error handling
├── MainWindow.xaml / .cs           — Frameless window, WM_NCHITTEST, tabs, context menu
├── Controls/
│   ├── BrowserTab.cs               — Tab data model (INotifyPropertyChanged)
│   └── BrowserTabView.xaml / .cs   — WebView2 wrapper with nav bar
├── Models/
│   └── AppSettings.cs              — Settings model
├── Services/
│   ├── GlobalHotkeyService.cs      — Win32 RegisterHotKey / WM_HOTKEY dispatch
│   ├── SettingsService.cs          — JSON load/save to %APPDATA%
│   └── TrayService.cs              — System tray NotifyIcon management
└── Themes/
    └── Generic.xaml                — Dark chrome styles (buttons, tabs, menus)
```

---

## Window Resize Fix

**Problem:** In borderless WPF windows, the bottom-left and bottom-right resize corners often fail because the default WPF hit-testing doesn't map those screen regions to the correct `HTBOTTOMLEFT`/`HTBOTTOMRIGHT` non-client areas.

**Fix:** A `WndProc` hook on `WM_NCHITTEST` manually computes which edge/corner the cursor is in and returns the correct hit-test value for all 8 regions (4 edges + 4 corners). Additionally, XAML `Rectangle` grips with `MouseLeftButtonDown` send `WM_NCLBUTTONDOWN` as a fallback.

---

## License

MIT