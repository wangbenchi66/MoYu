using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using Microsoft.Web.WebView2.Core;

namespace TransBrowser.Wpf;

public partial class MainWindow : Window
{
    private AppSettings _settings;
    private bool _opacityChanging;

    // ──────────────────────────── Win32 helpers ────────────────────────────
    [DllImport("user32.dll")]
    private static extern bool ReleaseCapture();

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

    private const int WM_SYSCOMMAND = 0x0112;
    private const int SC_SIZE = 0xF000;      // resize grip direction: south-east = +8
    private const int SC_MOVE = 0xF010;

    // ──────────────────────────── Constructor ──────────────────────────────
    public MainWindow()
    {
        InitializeComponent();

        _settings = SettingsService.Load();
        ApplySettings();

        Loaded += MainWindow_Loaded;
        Closing += MainWindow_Closing;
    }

    // ──────────────────────────── Lifecycle ────────────────────────────────
    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        try
        {
            // Set up WebView2 environment with custom user data folder
            var userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "TransBrowser", "WebView2Data");

            var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
            await WebView.EnsureCoreWebView2Async(env);

            WebView.CoreWebView2.NewWindowRequested += CoreWebView2_NewWindowRequested;
            WebView.CoreWebView2.NavigationStarting += CoreWebView2_NavigationStarting;
            WebView.CoreWebView2.NavigationCompleted += CoreWebView2_NavigationCompleted;
            WebView.CoreWebView2.DOMContentLoaded += CoreWebView2_DOMContentLoaded;

            Navigate(_settings.StartUrl);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"无法初始化 WebView2：{ex.Message}\n\n" +
                "请确保已安装 Microsoft WebView2 Runtime。\n" +
                "下载地址：https://developer.microsoft.com/microsoft-edge/webview2/",
                "WebView2 初始化失败",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
        }
    }

    private void MainWindow_Closing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        SaveCurrentSettings();
    }

    // ──────────────────────────── Settings ─────────────────────────────────
    private void ApplySettings()
    {
        // Window bounds
        Left = _settings.WindowLeft;
        Top = _settings.WindowTop;
        Width = _settings.WindowWidth;
        Height = _settings.WindowHeight;

        // Opacity (suppress ValueChanged feedback loop)
        _opacityChanging = true;
        SliderOpacity.Value = _settings.Opacity;
        Opacity = _settings.Opacity;
        TxtOpacityValue.Text = $"{(int)(_settings.Opacity * 100)}%";
        _opacityChanging = false;

        // URL bar
        TxtUrl.Text = _settings.StartUrl;
        TxtSettingsUrl.Text = _settings.StartUrl;
    }

    private void SaveCurrentSettings()
    {
        _settings.Opacity = SliderOpacity.Value;
        _settings.StartUrl = TxtUrl.Text;
        _settings.WindowLeft = RestoreBounds.IsEmpty ? Left : RestoreBounds.Left;
        _settings.WindowTop = RestoreBounds.IsEmpty ? Top : RestoreBounds.Top;
        _settings.WindowWidth = RestoreBounds.IsEmpty ? Width : RestoreBounds.Width;
        _settings.WindowHeight = RestoreBounds.IsEmpty ? Height : RestoreBounds.Height;
        SettingsService.Save(_settings);
    }

    // ──────────────────────────── Navigation ───────────────────────────────
    private void Navigate(string url)
    {
        if (string.IsNullOrWhiteSpace(url))
            return;

        // Auto-prefix with https:// if no scheme is provided
        if (!url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
            !url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            url = "https://" + url;
        }

        TxtUrl.Text = url;
        WebView.Source = new Uri(url);
    }

    // ──────────────────────────── WebView2 events ──────────────────────────
    private void CoreWebView2_NavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        Dispatcher.Invoke(() =>
        {
            TxtUrl.Text = e.Uri;
            TxtStatus.Text = "正在加载…";
        });
    }

    private void CoreWebView2_NavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        Dispatcher.Invoke(() =>
        {
            TxtStatus.Text = e.IsSuccess ? "就绪" : $"加载失败 ({e.WebErrorStatus})";
        });
    }

    private async void CoreWebView2_DOMContentLoaded(object? sender, CoreWebView2DOMContentLoadedEventArgs e)
    {
        // Inject CSS to make the page background transparent so the WPF
        // window transparency can show through
        const string css = "html,body{background:transparent!important}";
        await WebView.CoreWebView2.ExecuteScriptAsync(
            $"(function(){{" +
            $"  var s=document.createElement('style');" +
            $"  s.textContent={System.Text.Json.JsonSerializer.Serialize(css)};" +
            $"  document.head.appendChild(s);" +
            $"}})();");
    }

    private void CoreWebView2_NewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        // Open links that request a new window in the same WebView
        e.Handled = true;
        Dispatcher.Invoke(() => Navigate(e.Uri));
    }

    // ──────────────────────────── UI Event Handlers ────────────────────────
    private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ClickCount == 2)
        {
            ToggleMaximize();
            return;
        }

        if (WindowState != WindowState.Maximized)
            DragMove();
    }

    private void BtnMinimize_Click(object sender, RoutedEventArgs e) =>
        WindowState = WindowState.Minimized;

    private void BtnMaxRestore_Click(object sender, RoutedEventArgs e) =>
        ToggleMaximize();

    private void BtnClose_Click(object sender, RoutedEventArgs e) =>
        Close();

    private void BtnBack_Click(object sender, RoutedEventArgs e)
    {
        if (WebView.CoreWebView2 != null && WebView.CoreWebView2.CanGoBack)
            WebView.CoreWebView2.GoBack();
    }

    private void BtnRefresh_Click(object sender, RoutedEventArgs e) =>
        WebView.CoreWebView2?.Reload();

    private void TxtUrl_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
            Navigate(TxtUrl.Text);
    }

    private void SliderOpacity_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (_opacityChanging) return;

        Opacity = e.NewValue;
        if (TxtOpacityValue != null)
            TxtOpacityValue.Text = $"{(int)(e.NewValue * 100)}%";
    }

    private void BtnSettings_Click(object sender, RoutedEventArgs e)
    {
        TxtSettingsUrl.Text = TxtUrl.Text;
        SettingsPopup.IsOpen = !SettingsPopup.IsOpen;
    }

    private void BtnSaveSettings_Click(object sender, RoutedEventArgs e)
    {
        _settings.StartUrl = TxtSettingsUrl.Text;
        SettingsService.Save(_settings);
        Navigate(_settings.StartUrl);
        SettingsPopup.IsOpen = false;
    }

    private void ResizeGrip_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        var hwnd = new WindowInteropHelper(this).Handle;
        ReleaseCapture();
        // SC_SIZE + 8 = resize from bottom-right corner
        SendMessage(hwnd, WM_SYSCOMMAND, new IntPtr(SC_SIZE + 8), IntPtr.Zero);
    }

    // ──────────────────────────── Helpers ──────────────────────────────────
    private void ToggleMaximize()
    {
        WindowState = WindowState == WindowState.Maximized
            ? WindowState.Normal
            : WindowState.Maximized;
    }
}
