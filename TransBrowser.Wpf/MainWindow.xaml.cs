using System;
using System.Runtime.InteropServices;

namespace TransBrowser.Wpf
{
    public static class Win32Helper
    {
        // Function to get window exstyle
        [DllImport("user32.dll", SetLastError = true)]
        public static extern int GetWindowLong(IntPtr hWnd, int nIndex);

        // Function to set window exstyle
        [DllImport("user32.dll", SetLastError = true)]
        public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

        // Function to set layered window attributes
        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool SetLayeredWindowAttributes(IntPtr hwnd, uint crKey, byte bAlpha, uint dwFlags);

        // Constants for GetWindowLong and SetWindowLong
        private const int GWL_EXSTYLE = -20;
        private const int WS_EX_LAYERED = 0x00080000;
        private const int LWA_ALPHA = 0x00000002;
        private const int LWA_COLORKEY = 0x00000001;

        // Function to apply layered opacity
        public static void ApplyLayeredOpacity(IntPtr hwnd, double opacity)
        {
            if (hwnd == IntPtr.Zero) return; // Guard for hwnd==IntPtr.Zero

            int exStyle = GetWindowLong(hwnd, GWL_EXSTYLE);
            SetWindowLong(hwnd, GWL_EXSTYLE, exStyle | WS_EX_LAYERED);

            byte alpha = (byte)(opacity * 255); // Map 0.01-1.0 to byte 3-255
            SetLayeredWindowAttributes(hwnd, 0, alpha, LWA_ALPHA);
        }
    }

    public partial class MainWindow
    {
        // Call ApplyLayeredOpacity from ApplySettings/ApplyAllSettings and StatusOpacitySlider_ValueChanged
        public void ApplySettings()
        {
            // Existing code...
            ApplyLayeredOpacity(this.Handle, desiredOpacity);
        }

        public void StatusOpacitySlider_ValueChanged(double value)
        {
            // Existing code...
            ApplyLayeredOpacity(this.Handle, value);
        }

        public void SetOpacity(double value)
        {
            // Existing code...
            ApplyLayeredOpacity(this.Handle, value);
        }

        // Enable no-image mode at the resource level so images are not downloaded at all.
        if (_settings.NoImageMode)
        {
            EnableNoImageMode(tab.WebView.CoreWebView2);
        }
    }

    /// <summary>
    /// Enables a lightweight "no image" mode by intercepting image resources
    /// in WebView2. This works in addition to the CSS-based hiding used on DOMContentLoaded.
    /// </summary>
    private void EnableNoImageMode(CoreWebView2 core)
    {
        try
        {
            // Add a filter for image resources. If this was already added, WebView2
            // will throw and we simply ignore it.
            core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.Image);
        }
        catch
        {
            // Ignore duplicate filter registration
        }

        core.WebResourceRequested += (sender, args) =>
        {
            if (args.ResourceContext == CoreWebView2WebResourceContext.Image)
            {
                var env = ((CoreWebView2)sender).Environment;
                // Return an empty 200 OK so the page believes the request succeeded
                var response = env.CreateWebResourceResponse(
                    null,
                    200,
                    "OK",
                    "Content-Type: text/plain");
                args.Response = response;
            }
        };
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
                scripts.Add(TransparentBgInjection);

            if (_settings.GrayscaleMode)
                scripts.Add(GrayscaleBgInjection);

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
            // For new-tab pages we show the built-in overlay UI instead of navigating
            // the WebView. Keep the webview content consistent though.
            try { tab.WebView.CoreWebView2.NavigateToString(BuildNewtabHtml()); } catch { }
            tab.Url = NewTabUrl;
            if (NewTabOverlay != null)
                NewTabOverlay.Visibility = Visibility.Visible;
        }
        else
        {
            if (!url.StartsWith("http://") && !url.StartsWith("https://") &&
                !url.StartsWith("file://") && !url.StartsWith("about:"))
                url = "https://" + url;
            tab.WebView.CoreWebView2.Navigate(url);
            if (NewTabOverlay != null)
                NewTabOverlay.Visibility = Visibility.Collapsed;
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

        // Show or hide the new-tab overlay depending on the tab URL
        if (NewTabOverlay != null)
        {
            NewTabOverlay.Visibility = (tab.Url == NewTabUrl || (tab.Url?.Contains("about:") == true))
                ? Visibility.Visible
                : Visibility.Collapsed;
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
        WebViewHost.Children.Remove(tab.WebView);
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
        menu.Items.Add("退出", null, (s, e) => Dispatcher.Invoke(() => { _forceClose = true; System.Windows.Application.Current.Shutdown(); }));

        _trayIcon.ContextMenuStrip = menu;
        _trayIcon.DoubleClick += (s, e) => Dispatcher.Invoke(() => { Show(); Activate(); WindowState = WindowState.Normal; });
    }

    private void OpenSettings()
    {
        // If a settings window is already open, just bring it to the front
        if (_settingsWindow?.IsVisible == true)
        {
            _settingsWindow.Activate();
            return;
        }

        _settingsWindow = new SettingsWindow(_settings, ApplyAllSettings);
        _settingsWindow.Owner = this;
        _settingsWindow.Show();
    }

    /// <summary>Full settings re-apply called by the live settings callback.</summary>
    private void ApplyAllSettings()
    {
        // Don't overwrite window position/size during a live settings session
        Opacity = _settings.Opacity;
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
        var hwnd = new WindowInteropHelper(this).Handle;
        if (hwnd != IntPtr.Zero)
            Win32Helper.SetClickThrough(hwnd, _isClickThrough);

        ApplyWindowTransparency(_settings.WindowTransparent);
        ApplyWindowShadow(_settings.DisableWindowShadow);
        ApplyAntiScreenshot(_settings.AntiScreenshotMode);
        ApplyGrayscaleToAllTabs(_settings.GrayscaleMode);

        _hotkeyService.UnregisterAll();
        RegisterHotkeys();

        foreach (var tab in _tabs)
            _ = ApplyWebViewSettings(tab);
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
        // If "close to tray" is enabled and this is not a forced exit, minimize to tray
        if (_settings.CloseToTray && !_forceClose)
        {
            e.Cancel = true;
            Hide();
            if (_settings.ShowMinimizeNotification && _trayIcon != null)
                _trayIcon.ShowBalloonTip(2000, "TransBrowser", "程序已最小化到系统托盘", System.Windows.Forms.ToolTipIcon.Info);
            return;
        }

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
        if (WindowState == WindowState.Minimized)
        {
            if (_settings.AutoHide)
                Hide();

            if (_settings.ShowMinimizeNotification && _trayIcon != null)
                _trayIcon.ShowBalloonTip(2000, "TransBrowser", "程序已最小化到系统托盘", System.Windows.Forms.ToolTipIcon.Info);
        }
    }
}