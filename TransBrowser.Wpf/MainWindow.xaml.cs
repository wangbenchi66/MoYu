using System.IO;
using System.Reflection;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using WpfButton = System.Windows.Controls.Button;
using WpfKeyEventArgs = System.Windows.Input.KeyEventArgs;
using WpfMouseEventArgs = System.Windows.Input.MouseEventArgs;
using WpfCursors = System.Windows.Input.Cursors;
using WpfOrientation = System.Windows.Controls.Orientation;
using WpfClipboard = System.Windows.Clipboard;

namespace TransBrowser.Wpf;

public class BrowserTab
{
    public WebView2 WebView { get; set; } = null!;
    public string Title { get; set; } = "新标签页";
    public string Url { get; set; } = "";
    public bool IsInitialized { get; set; }
    public WpfButton? TabButton { get; set; }
}

public partial class MainWindow : Window
{
    private AppSettings _settings = new();
    private readonly List<BrowserTab> _tabs = new();
    private BrowserTab? _activeTab;
    private CoreWebView2Environment? _webViewEnv;
    private readonly GlobalHotkeyService _hotkeyService = new();
    private System.Windows.Forms.NotifyIcon? _trayIcon;
    private bool _isClickThrough;
    private bool _hoverHeaderVisible;
    private string _newtabHtml = "";
    private readonly System.Windows.Threading.DispatcherTimer _opacitySaveTimer;

    private const string NewTabUrl = "about:newtab";
    private const int MaxTabTitleLength = 16;
    private const int MaxHistoryItems = 50;
    private const string DefaultMobileUserAgent =
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

    public MainWindow()
    {
        InitializeComponent();
        _opacitySaveTimer = new System.Windows.Threading.DispatcherTimer
        {
            Interval = TimeSpan.FromMilliseconds(300)
        };
        _opacitySaveTimer.Tick += (_, _) =>
        {
            _opacitySaveTimer.Stop();
            SettingsService.Save(_settings);
        };
        Loaded += MainWindow_Loaded;
        Deactivated += MainWindow_Deactivated;
        Closing += MainWindow_Closing;
        StateChanged += MainWindow_StateChanged;
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        _settings = SettingsService.Load();
        ApplySettings();
        LoadNewtabTemplate();
        await InitWebViewEnvironmentAsync();
        AddTab(string.IsNullOrEmpty(_settings.StartUrl) ? NewTabUrl : _settings.StartUrl);
        SetupTrayIcon();
        _hotkeyService.Initialize(this);
        RegisterHotkeys();
    }

    private void ApplySettings()
    {
        Opacity = _settings.Opacity;
        Left = _settings.WindowLeft;
        Top = _settings.WindowTop;
        Width = _settings.WindowWidth;
        Height = _settings.WindowHeight;
        Topmost = _settings.TopMost;
        ShowInTaskbar = _settings.ShowInTaskbar;
        StatusOpacitySlider.Value = _settings.Opacity;

        TitleBar.Visibility = _settings.NoTitle ? Visibility.Collapsed : Visibility.Visible;
        TitleBarRow.Height = _settings.NoTitle ? new GridLength(0) : new GridLength(40);

        TabBarPanel.Visibility = _settings.ShowTabBar ? Visibility.Visible : Visibility.Collapsed;
        TabBarRow.Height = _settings.ShowTabBar ? new GridLength(32) : new GridLength(0);

        if (_settings.HoverHeaderMode && !_settings.NoTitle)
        {
            TitleBar.Visibility = Visibility.Collapsed;
            TitleBarRow.Height = new GridLength(0);
        }

        _isClickThrough = _settings.ClickThroughMode;
    }

    private void LoadNewtabTemplate()
    {
        try
        {
            var asm = Assembly.GetExecutingAssembly();
            using var stream = asm.GetManifestResourceStream("TransBrowser.Wpf.Resources.newtab.html");
            if (stream != null)
                using (var reader = new StreamReader(stream))
                    _newtabHtml = reader.ReadToEnd();
        }
        catch { }

        if (string.IsNullOrEmpty(_newtabHtml))
            _newtabHtml = "<html><body><h1>新标签页</h1></body></html>";
    }

    private string BuildNewtabHtml()
    {
        var customJson = JsonSerializer.Serialize(
            _settings.CustomSites.Select(s => new { n = s.Name, u = s.Url }).ToList());
        var historyJson = JsonSerializer.Serialize(
            _settings.History.Take(MaxHistoryItems).Select(h => new { t = h.Title, u = h.Url }).ToList());

        return _newtabHtml
            .Replace("##CUSTOM_DATA##", customJson)
            .Replace("##HISTORY_DATA##", historyJson);
    }

    private async Task InitWebViewEnvironmentAsync()
    {
        try
        {
            var userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "TransBrowser", "WebView2");
            _webViewEnv = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
        }
        catch { }
    }

    private async void AddTab(string url = "")
    {
        var wv = new WebView2 { Visibility = Visibility.Collapsed };
        var tab = new BrowserTab { WebView = wv, Url = url };
        _tabs.Add(tab);
        WebViewContainer.Children.Add(wv);

        if (_webViewEnv != null)
        {
            await wv.EnsureCoreWebView2Async(_webViewEnv);
            tab.IsInitialized = true;
            ApplyWebViewSettings(tab);
            HookWebViewEvents(tab);
        }

        UpdateTabUI();
        SwitchToTab(tab);

        if (tab.IsInitialized)
            NavigateTab(tab, url);
    }

    private void ApplyWebViewSettings(BrowserTab tab)
    {
        if (tab.WebView.CoreWebView2 == null) return;
        var settings = tab.WebView.CoreWebView2.Settings;

        if (!string.IsNullOrEmpty(_settings.UserAgent))
            settings.UserAgent = _settings.UserAgent;
        else if (_settings.MobileMold)
            settings.UserAgent = DefaultMobileUserAgent;
    }

    private void HookWebViewEvents(BrowserTab tab)
    {
        var wv = tab.WebView;
        if (wv.CoreWebView2 == null) return;

        wv.CoreWebView2.NewWindowRequested += (s, e) =>
        {
            e.Handled = true;
            var newUrl = e.Uri;
            Dispatcher.Invoke(() => AddTab(newUrl));
        };

        wv.CoreWebView2.NavigationStarting += (s, e) =>
        {
            Dispatcher.Invoke(() =>
            {
                if (_activeTab == tab)
                    TxtUrl.Text = e.Uri;
                tab.Url = e.Uri;
            });
        };

        wv.CoreWebView2.NavigationCompleted += async (s, e) =>
        {
            var title = wv.CoreWebView2.DocumentTitle;
            var url = wv.CoreWebView2.Source;

            Dispatcher.Invoke(() =>
            {
                tab.Title = string.IsNullOrEmpty(title) ? url : title;
                if (_activeTab == tab)
                {
                    TitleText.Text = tab.Title;
                    TxtUrl.Text = url;
                    tab.Url = url;
                }
                UpdateTabUI();
            });

            if (!url.StartsWith("about:") && !url.Contains("newtab.local") && !string.IsNullOrEmpty(url))
            {
                Dispatcher.Invoke(() =>
                {
                    var existing = _settings.History.FirstOrDefault(h => h.Url == url);
                    if (existing != null)
                        _settings.History.Remove(existing);

                    _settings.History.Insert(0, new HistoryItem
                    {
                        Title = string.IsNullOrEmpty(title) ? url : title,
                        Url = url,
                        VisitedAt = DateTime.Now
                    });

                    if (_settings.History.Count > MaxHistoryItems)
                        _settings.History = _settings.History.Take(MaxHistoryItems).ToList();

                    SettingsService.Save(_settings);
                });
            }

            if (e.IsSuccess && !string.IsNullOrEmpty(_settings.AutoScript))
            {
                try
                {
                    await wv.CoreWebView2.ExecuteScriptAsync(_settings.AutoScript);
                }
                catch { }
            }
        };

        wv.CoreWebView2.DOMContentLoaded += async (s, e) =>
        {
            var scripts = new List<string>();

            if (_settings.NoImageMode)
                scripts.Add("(function(){var st=document.createElement('style');st.textContent='img,video,source{display:none!important}';document.head.appendChild(st);})();");

            if (_settings.TransparentBackground)
                scripts.Add("(function(){var st=document.createElement('style');st.textContent='html,body{background:transparent!important}';document.head.appendChild(st);})();");

            foreach (var script in scripts)
            {
                try { await wv.CoreWebView2.ExecuteScriptAsync(script); }
                catch { }
            }
        };

        wv.CoreWebView2.WebMessageReceived += (s, e) =>
        {
            var msg = e.TryGetWebMessageAsString();
            if (string.IsNullOrEmpty(msg)) return;

            var parts = msg.Split('\t');
            if (parts.Length >= 3 && parts[0] == "add")
            {
                Dispatcher.Invoke(() =>
                {
                    var name = parts[1];
                    var url = parts[2];
                    if (!string.IsNullOrEmpty(url))
                    {
                        _settings.CustomSites.RemoveAll(cs => cs.Url == url);
                        _settings.CustomSites.Add(new CustomSite { Name = name, Url = url });
                        SettingsService.Save(_settings);
                        if (_activeTab?.Url == NewTabUrl || _activeTab?.Url?.Contains("about:") == true)
                            NavigateTab(_activeTab!, NewTabUrl);
                    }
                });
            }
            else if (parts.Length >= 2 && parts[0] == "remove")
            {
                Dispatcher.Invoke(() =>
                {
                    var url = parts[1];
                    _settings.CustomSites.RemoveAll(cs => cs.Url == url);
                    SettingsService.Save(_settings);
                    if (_activeTab?.Url == NewTabUrl || _activeTab?.Url?.Contains("about:") == true)
                        NavigateTab(_activeTab!, NewTabUrl);
                });
            }
        };

        wv.CoreWebView2.ContextMenuRequested += (s, e) =>
        {
            var menu = e.MenuItems;

            var devToolsItem = wv.CoreWebView2.Environment.CreateContextMenuItem(
                "打开开发者工具", null, CoreWebView2ContextMenuItemKind.Command);
            devToolsItem.CustomItemSelected += (sender, _) =>
                Dispatcher.Invoke(() => wv.CoreWebView2.OpenDevToolsWindow());
            menu.Add(devToolsItem);

            if (e.ContextMenuTarget.HasLinkUri)
            {
                var copyLinkItem = wv.CoreWebView2.Environment.CreateContextMenuItem(
                    "复制链接", null, CoreWebView2ContextMenuItemKind.Command);
                copyLinkItem.CustomItemSelected += (sender, _) =>
                    Dispatcher.Invoke(() => WpfClipboard.SetText(e.ContextMenuTarget.LinkUri));
                menu.Insert(0, copyLinkItem);
            }
        };
    }

    private void NavigateTab(BrowserTab tab, string url)
    {
        if (tab.WebView.CoreWebView2 == null) return;

        if (url == NewTabUrl || string.IsNullOrEmpty(url))
        {
            tab.WebView.CoreWebView2.NavigateToString(BuildNewtabHtml());
            tab.Url = NewTabUrl;
        }
        else
        {
            if (!url.StartsWith("http://") && !url.StartsWith("https://") &&
                !url.StartsWith("file://") && !url.StartsWith("about:"))
                url = "https://" + url;
            tab.WebView.CoreWebView2.Navigate(url);
        }
    }

    private void SwitchToTab(BrowserTab tab)
    {
        foreach (var t in _tabs)
        {
            t.WebView.Visibility = t == tab ? Visibility.Visible : Visibility.Collapsed;
            if (t.TabButton != null)
                t.TabButton.Background = t == tab
                    ? new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(0x31, 0x32, 0x44))
                    : new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(0x11, 0x11, 0x1B));
        }

        _activeTab = tab;
        TxtUrl.Text = tab.Url == NewTabUrl ? "" : tab.Url;
        TitleText.Text = tab.Title;
    }

    private void CloseTab(BrowserTab tab)
    {
        if (_tabs.Count <= 1) return;

        var idx = _tabs.IndexOf(tab);
        _tabs.Remove(tab);
        WebViewContainer.Children.Remove(tab.WebView);
        tab.WebView.Dispose();

        var nextTab = _tabs[Math.Min(idx, _tabs.Count - 1)];
        UpdateTabUI();
        SwitchToTab(nextTab);
    }

    private void UpdateTabUI()
    {
        TabButtonsPanel.Children.Clear();

        foreach (var tab in _tabs)
        {
            var btn = new WpfButton
            {
                MinWidth = 100,
                MaxWidth = 160,
                Height = 28,
                Margin = new Thickness(2, 2, 0, 2),
                Padding = new Thickness(6, 0, 2, 0),
                Background = tab == _activeTab
                    ? new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(0x31, 0x32, 0x44))
                    : new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(0x11, 0x11, 0x1B)),
                BorderThickness = new Thickness(0),
                Cursor = WpfCursors.Hand,
            };

            var sp = new StackPanel { Orientation = WpfOrientation.Horizontal };
            sp.Children.Add(new TextBlock
            {
                Text = tab.Title.Length > MaxTabTitleLength ? tab.Title[..MaxTabTitleLength] + "…" : tab.Title,
                Foreground = System.Windows.Media.Brushes.White,
                FontSize = 11,
                VerticalAlignment = VerticalAlignment.Center,
                MaxWidth = 110,
                TextTrimming = TextTrimming.CharacterEllipsis,
            });

            var closeBtn = new WpfButton
            {
                Content = "×",
                Width = 16,
                Height = 16,
                Background = System.Windows.Media.Brushes.Transparent,
                Foreground = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(0x6C, 0x70, 0x86)),
                BorderThickness = new Thickness(0),
                FontSize = 11,
                Cursor = WpfCursors.Hand,
                Margin = new Thickness(4, 0, 0, 0),
                Padding = new Thickness(0),
            };

            var capturedTab = tab;
            closeBtn.Click += (s, e) =>
            {
                e.Handled = true;
                CloseTab(capturedTab);
            };

            sp.Children.Add(closeBtn);
            btn.Content = sp;
            btn.Click += (s, e) => SwitchToTab(capturedTab);
            tab.TabButton = btn;
            TabButtonsPanel.Children.Add(btn);
        }
    }

    private void RegisterHotkeys()
    {
        _hotkeyService.Register(1, _settings.BossKey, ToggleVisibility);
        _hotkeyService.Register(2, _settings.OpacityUp, () => Dispatcher.Invoke(() => SetOpacity(Math.Min(1.0, Opacity + 0.1))));
        _hotkeyService.Register(3, _settings.OpacityDown, () => Dispatcher.Invoke(() => SetOpacity(Math.Max(0.1, Opacity - 0.1))));
        _hotkeyService.Register(4, _settings.OpacityReset, () => Dispatcher.Invoke(() => SetOpacity(1.0)));
        _hotkeyService.Register(5, _settings.ClickThrough, () => Dispatcher.Invoke(ToggleClickThrough));
        _hotkeyService.Register(6, _settings.GoBack, () => Dispatcher.Invoke(() => _activeTab?.WebView.CoreWebView2?.GoBack()));
        _hotkeyService.Register(7, _settings.RunJs, () => Dispatcher.Invoke(OpenJsEditor));
    }

    private void SetOpacity(double value)
    {
        Opacity = value;
        StatusOpacitySlider.Value = value;
        _settings.Opacity = value;
        SettingsService.Save(_settings);
    }

    private void ToggleVisibility()
    {
        Dispatcher.Invoke(() =>
        {
            if (IsVisible)
                Hide();
            else
            {
                Show();
                Activate();
            }
        });
    }

    private void ToggleClickThrough()
    {
        _isClickThrough = !_isClickThrough;
        var hwnd = new WindowInteropHelper(this).Handle;
        Win32Helper.SetClickThrough(hwnd, _isClickThrough);
        StatusText.Text = _isClickThrough ? "⚡ 穿透模式已开启" : "";
        _settings.ClickThroughMode = _isClickThrough;
        SettingsService.Save(_settings);
    }

    private void OpenJsEditor()
    {
        var jsWin = new JsEditorWindow();
        jsWin.Owner = this;
        jsWin.RunRequested += async code =>
        {
            if (_activeTab?.WebView.CoreWebView2 != null)
            {
                try { await _activeTab.WebView.CoreWebView2.ExecuteScriptAsync(code); }
                catch { }
            }
        };
        jsWin.Show();
    }

    private void SetupTrayIcon()
    {
        _trayIcon = new System.Windows.Forms.NotifyIcon
        {
            Icon = System.Drawing.SystemIcons.Application,
            Visible = true,
            Text = "TransBrowser"
        };

        var menu = new System.Windows.Forms.ContextMenuStrip();
        menu.Items.Add("显示/隐藏", null, (s, e) => Dispatcher.Invoke(ToggleVisibility));
        menu.Items.Add("穿透模式切换", null, (s, e) => Dispatcher.Invoke(ToggleClickThrough));
        menu.Items.Add("总在最前切换", null, (s, e) => Dispatcher.Invoke(() =>
        {
            Topmost = !Topmost;
            _settings.TopMost = Topmost;
            SettingsService.Save(_settings);
        }));
        menu.Items.Add("设置", null, (s, e) => Dispatcher.Invoke(OpenSettings));
        menu.Items.Add(new System.Windows.Forms.ToolStripSeparator());
        menu.Items.Add("退出", null, (s, e) => Dispatcher.Invoke(() => System.Windows.Application.Current.Shutdown()));

        _trayIcon.ContextMenuStrip = menu;
        _trayIcon.DoubleClick += (s, e) => Dispatcher.Invoke(() => { Show(); Activate(); WindowState = WindowState.Normal; });
    }

    private void OpenSettings()
    {
        var win = new SettingsWindow(_settings);
        win.Owner = this;
        if (win.ShowDialog() == true)
        {
            ApplySettings();
            _hotkeyService.UnregisterAll();
            RegisterHotkeys();
            foreach (var tab in _tabs)
                ApplyWebViewSettings(tab);
        }
    }

    // --- Event handlers ---

    private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ClickCount == 2)
            WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
        else
            DragMove();
    }

    private void BtnMinimize_Click(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;
    private void BtnMaximize_Click(object sender, RoutedEventArgs e) =>
        WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
    private void BtnClose_Click(object sender, RoutedEventArgs e) => Close();

    private void BtnNewTab_Click(object sender, RoutedEventArgs e) => AddTab(NewTabUrl);

    private void BtnBack_Click(object sender, RoutedEventArgs e) => _activeTab?.WebView.CoreWebView2?.GoBack();
    private void BtnForward_Click(object sender, RoutedEventArgs e) => _activeTab?.WebView.CoreWebView2?.GoForward();
    private void BtnRefresh_Click(object sender, RoutedEventArgs e) => _activeTab?.WebView.CoreWebView2?.Reload();

    private void TxtUrl_KeyDown(object sender, WpfKeyEventArgs e)
    {
        if (e.Key == Key.Enter && _activeTab != null)
        {
            NavigateTab(_activeTab, TxtUrl.Text.Trim());
            e.Handled = true;
        }
    }

    private void BtnSettings_Click(object sender, RoutedEventArgs e) => OpenSettings();

    private void StatusOpacitySlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        Opacity = e.NewValue;
        _settings.Opacity = e.NewValue;

        // Debounce: restart the 300 ms timer; fires once after dragging pauses
        _opacitySaveTimer.Stop();
        _opacitySaveTimer.Start();
    }

    private void StatusOpacitySlider_DragCompleted(object sender, System.Windows.Controls.Primitives.DragCompletedEventArgs e)
    {
        // Force an immediate save when the user releases the thumb
        _opacitySaveTimer.Stop();
        SettingsService.Save(_settings);
    }

    private void Window_MouseMove(object sender, WpfMouseEventArgs e)
    {
        if (!_settings.HoverHeaderMode || _settings.NoTitle) return;

        var pos = e.GetPosition(this);
        if (pos.Y < 5)
        {
            if (!_hoverHeaderVisible)
            {
                TitleBar.Visibility = Visibility.Visible;
                TitleBarRow.Height = new GridLength(40);
                _hoverHeaderVisible = true;
            }
        }
        else if (pos.Y > 50)
        {
            if (_hoverHeaderVisible)
            {
                TitleBar.Visibility = Visibility.Collapsed;
                TitleBarRow.Height = new GridLength(0);
                _hoverHeaderVisible = false;
            }
        }
    }

    private void MainWindow_Deactivated(object? sender, EventArgs e)
    {
        if (_settings.AutoHide)
            Hide();
    }

    private void MainWindow_Closing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        _settings.WindowLeft = Left;
        _settings.WindowTop = Top;
        _settings.WindowWidth = Width;
        _settings.WindowHeight = Height;
        SettingsService.Save(_settings);

        _hotkeyService.Dispose();

        if (_trayIcon != null)
        {
            _trayIcon.Visible = false;
            _trayIcon.Dispose();
        }

        foreach (var tab in _tabs)
            tab.WebView.Dispose();
    }

    private void MainWindow_StateChanged(object? sender, EventArgs e)
    {
        if (WindowState == WindowState.Minimized && _settings.AutoHide)
            Hide();
    }
}
