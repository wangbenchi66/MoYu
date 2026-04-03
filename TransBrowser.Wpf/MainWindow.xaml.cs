using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using TransBrowser.Wpf.Controls;
using TransBrowser.Wpf.Models;
using TransBrowser.Wpf.Services;

namespace TransBrowser.Wpf;

public partial class MainWindow : Window
{
    // ---- Win32 ----
    [DllImport("user32.dll")]
    private static extern int GetWindowLong(IntPtr hwnd, int nIndex);
    [DllImport("user32.dll")]
    private static extern int SetWindowLong(IntPtr hwnd, int nIndex, int dwNewLong);
    [DllImport("user32.dll")]
    private static extern bool ReleaseCapture();
    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, int Msg, IntPtr wParam, IntPtr lParam);

    private const int GWL_EXSTYLE = -20;
    private const int WS_EX_TRANSPARENT = 0x00000020;
    private const int WS_EX_LAYERED = 0x00080000;
    private const int WM_NCLBUTTONDOWN = 0x00A1;
    private const int WM_NCHITTEST = 0x0084;
    private const int HTLEFT = 10;
    private const int HTRIGHT = 11;
    private const int HTTOP = 12;
    private const int HTTOPLEFT = 13;
    private const int HTTOPRIGHT = 14;
    private const int HTBOTTOM = 15;
    private const int HTBOTTOMLEFT = 16;
    private const int HTBOTTOMRIGHT = 17;

    // ---- Services / state ----
    private readonly SettingsService _settingsService = new();
    private AppSettings _settings;
    private GlobalHotkeyService? _hotkeyService;
    private TrayService? _trayService;
    private bool _isMouseThrough;

    // ---- Tabs ----
    private readonly List<BrowserTabView> _tabs = new();
    private BrowserTabView? _activeTab;
    private readonly List<Button> _tabButtons = new();

    public MainWindow()
    {
        _settings = new AppSettings();
        InitializeComponent();
        SourceInitialized += OnSourceInitialized;
        Loaded += OnLoaded;
        Closing += OnClosing;
        StateChanged += OnStateChanged;
    }

    private void OnSourceInitialized(object? sender, EventArgs e)
    {
        var helper = new WindowInteropHelper(this);
        var src = HwndSource.FromHwnd(helper.Handle);
        src?.AddHook(WndProc);

        // Initialize hotkey service (needs window handle)
        _hotkeyService = new GlobalHotkeyService(this);
    }

    private void OnLoaded(object? sender, RoutedEventArgs e)
    {
        _settings = _settingsService.Load();
        ApplySettings();

        _hotkeyService!.Register(_settings.HotkeyOpacityUp, () => AdjustOpacity(+0.05));
        _hotkeyService!.Register(_settings.HotkeyOpacityDown, () => AdjustOpacity(-0.05));
        _hotkeyService!.Register(_settings.HotkeyBossKey, ToggleBossKey);
        _hotkeyService!.Register(_settings.HotkeyMouseThrough, ToggleMouseThrough);

        _trayService = new TrayService(this, _settings);
        _trayService.MouseThroughToggleRequested += ToggleMouseThrough;
        _trayService.ExitRequested += () => Application.Current.Shutdown();

        AddNewTab();
        ApplyContextMenuVisibility();
    }

    private void ApplySettings()
    {
        Opacity = Math.Clamp(_settings.Opacity, 0.1, 1.0);
        OpacitySlider.Value = Opacity;
        Left = _settings.WindowLeft;
        Top = _settings.WindowTop;
        Width = _settings.WindowWidth;
        Height = _settings.WindowHeight;
    }

    private void ApplyContextMenuVisibility()
    {
        var cm = _settings.ContextMenuItems;
        CtxBack.Visibility = cm.Back ? Visibility.Visible : Visibility.Collapsed;
        CtxForward.Visibility = cm.Forward ? Visibility.Visible : Visibility.Collapsed;
        CtxRefresh.Visibility = cm.Refresh ? Visibility.Visible : Visibility.Collapsed;
        CtxCopyLink.Visibility = cm.CopyLink ? Visibility.Visible : Visibility.Collapsed;
        CtxNewTab.Visibility = cm.NewTab ? Visibility.Visible : Visibility.Collapsed;
        CtxDevTools.Visibility = cm.DevTools ? Visibility.Visible : Visibility.Collapsed;
    }

    private void OnClosing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        if (_settings.MinimizeToTray)
        {
            e.Cancel = true;
            Hide();
            return;
        }
        SaveAndExit();
    }

    private void SaveAndExit()
    {
        _settings.Opacity = Opacity;
        _settings.WindowLeft = Left;
        _settings.WindowTop = Top;
        _settings.WindowWidth = Width;
        _settings.WindowHeight = Height;
        _settingsService.Save(_settings);
        _hotkeyService?.Dispose();
        _trayService?.Dispose();
    }

    // ---- WndProc for resize hit testing ----
    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == WM_NCHITTEST)
        {
            int xy = lParam.ToInt32();
            var ptScreen = new Point(
                (short)(xy & 0xFFFF),
                (short)((xy >> 16) & 0xFFFF));

            Point ptClient;
            try { ptClient = PointFromScreen(ptScreen); }
            catch { return IntPtr.Zero; }

            double border = 8;
            bool left = ptClient.X < border;
            bool right = ptClient.X > ActualWidth - border;
            bool top = ptClient.Y < border;
            bool bottom = ptClient.Y > ActualHeight - border;

            if (top && left) { handled = true; return (IntPtr)HTTOPLEFT; }
            if (top && right) { handled = true; return (IntPtr)HTTOPRIGHT; }
            if (bottom && left) { handled = true; return (IntPtr)HTBOTTOMLEFT; }
            if (bottom && right) { handled = true; return (IntPtr)HTBOTTOMRIGHT; }
            if (top) { handled = true; return (IntPtr)HTTOP; }
            if (bottom) { handled = true; return (IntPtr)HTBOTTOM; }
            if (left) { handled = true; return (IntPtr)HTLEFT; }
            if (right) { handled = true; return (IntPtr)HTRIGHT; }
        }
        return IntPtr.Zero;
    }

    // ---- Resize grips (XAML-side fallback) ----
    private void Grip_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (sender is FrameworkElement fe && fe.Tag is string tag)
        {
            var hwnd = new WindowInteropHelper(this).Handle;
            ReleaseCapture();
            int dir = tag switch
            {
                "TL" => HTTOPLEFT,
                "TR" => HTTOPRIGHT,
                "BL" => HTBOTTOMLEFT,
                "BR" => HTBOTTOMRIGHT,
                "T" => HTTOP,
                "B" => HTBOTTOM,
                "L" => HTLEFT,
                "R" => HTRIGHT,
                _ => 0
            };
            if (dir != 0)
                SendMessage(hwnd, WM_NCLBUTTONDOWN, (IntPtr)dir, IntPtr.Zero);
        }
    }

    // ---- Title bar drag ----
    private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ClickCount == 2)
        {
            ToggleMaximize();
            return;
        }
        DragMove();
    }

    // ---- Window chrome buttons ----
    private void MinimizeButton_Click(object sender, RoutedEventArgs e)
    {
        if (_settings.MinimizeToTray)
            Hide();
        else
            WindowState = WindowState.Minimized;
    }

    private void MaxRestoreButton_Click(object sender, RoutedEventArgs e) => ToggleMaximize();

    private void ToggleMaximize()
    {
        WindowState = WindowState == WindowState.Maximized
            ? WindowState.Normal
            : WindowState.Maximized;
    }

    private void OnStateChanged(object? sender, EventArgs e)
    {
        MaxRestoreButton.Content = WindowState == WindowState.Maximized ? "❐" : "□";
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        SaveAndExit();
        Application.Current.Shutdown();
    }

    // ---- Opacity ----
    private void OpacitySlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        Opacity = e.NewValue;
        _settings.Opacity = Opacity;
    }

    private void AdjustOpacity(double delta)
    {
        Dispatcher.Invoke(() =>
        {
            Opacity = Math.Clamp(Opacity + delta, 0.1, 1.0);
            OpacitySlider.Value = Opacity;
            _settings.Opacity = Opacity;
        });
    }

    // ---- Mouse click-through ----
    public void SetClickThrough(bool enable)
    {
        var hwnd = new WindowInteropHelper(this).Handle;
        if (hwnd == IntPtr.Zero) return;
        int exStyle = GetWindowLong(hwnd, GWL_EXSTYLE);
        if (enable)
            SetWindowLong(hwnd, GWL_EXSTYLE, exStyle | WS_EX_TRANSPARENT | WS_EX_LAYERED);
        else
            SetWindowLong(hwnd, GWL_EXSTYLE, exStyle & ~WS_EX_TRANSPARENT);
    }

    private void ToggleMouseThrough()
    {
        Dispatcher.Invoke(() =>
        {
            _isMouseThrough = !_isMouseThrough;
            SetClickThrough(_isMouseThrough);
            _settings.MouseThroughEnabled = _isMouseThrough;
            MouseThroughIndicator.Visibility = _isMouseThrough ? Visibility.Visible : Visibility.Collapsed;
        });
    }

    // ---- Boss key ----
    private void ToggleBossKey()
    {
        Dispatcher.Invoke(() =>
        {
            if (IsVisible) Hide();
            else { Show(); Activate(); }
        });
    }

    // ---- Tabs ----
    private void AddNewTab(string url = "")
    {
        var tab = new BrowserTab { Url = url };
        var view = new BrowserTabView(tab);
        view.CloseRequested += RemoveTab;
        view.TitleChanged += _ => RefreshTabButtons();
        _tabs.Add(view);

        var btn = new Button
        {
            Style = FindResource("TabButtonStyle") as Style,
            DataContext = tab,
            Tag = view
        };
        var sp = new StackPanel { Orientation = Orientation.Horizontal };
        var titleTb = new TextBlock { VerticalAlignment = VerticalAlignment.Center, MaxWidth = 120 };
        titleTb.SetBinding(TextBlock.TextProperty, new System.Windows.Data.Binding("Title"));
        sp.Children.Add(titleTb);
        btn.Content = sp;
        btn.Click += (_, _) => SelectTab(view);
        _tabButtons.Add(btn);
        TabStrip.Children.Add(btn);

        SelectTab(view);
    }

    private void SelectTab(BrowserTabView view)
    {
        _activeTab = view;
        TabContent.Content = view;

        for (int i = 0; i < _tabs.Count; i++)
        {
            _tabButtons[i].Style = _tabs[i] == view
                ? FindResource("ActiveTabButtonStyle") as Style
                : FindResource("TabButtonStyle") as Style;
        }
    }

    private void RemoveTab(BrowserTabView view)
    {
        int idx = _tabs.IndexOf(view);
        if (idx < 0) return;

        _tabs.RemoveAt(idx);
        TabStrip.Children.Remove(_tabButtons[idx]);
        _tabButtons.RemoveAt(idx);
        view.Dispose();

        if (_tabs.Count == 0)
        {
            AddNewTab();
        }
        else
        {
            int next = Math.Min(idx, _tabs.Count - 1);
            SelectTab(_tabs[next]);
        }
    }

    private void RefreshTabButtons()
    {
        // Bindings update automatically via INotifyPropertyChanged
    }

    private void AddTab_Click(object sender, RoutedEventArgs e) => AddNewTab();

    // ---- Context menu ----
    private void Content_MouseRightButtonUp(object sender, MouseButtonEventArgs e)
    {
        if (ContextMenu != null)
            ContextMenu.IsOpen = true;
    }

    private void CtxBack_Click(object sender, RoutedEventArgs e) => _activeTab?.GoBack();
    private void CtxForward_Click(object sender, RoutedEventArgs e) => _activeTab?.GoForward();
    private void CtxRefresh_Click(object sender, RoutedEventArgs e) => _activeTab?.Refresh();
    private void CtxDevTools_Click(object sender, RoutedEventArgs e) => _activeTab?.OpenDevTools();
    private void CtxNewTab_Click(object sender, RoutedEventArgs e) => AddNewTab();

    private void CtxCopyLink_Click(object sender, RoutedEventArgs e)
    {
        var url = _activeTab?.CurrentUrl;
        if (!string.IsNullOrEmpty(url))
        {
            try { Clipboard.SetText(url); }
            catch { }
        }
    }
}
