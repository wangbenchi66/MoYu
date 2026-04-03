using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace TransBrowser.Wpf.Controls;

public partial class BrowserTabView : UserControl
{
    public BrowserTab Tab { get; }
    private WebView2? _webView;

    public event Action<BrowserTabView>? CloseRequested;
    public event Action<string>? TitleChanged;

    public BrowserTabView(BrowserTab tab)
    {
        Tab = tab;
        InitializeComponent();
        DataContext = tab;
        Loaded += OnLoaded;
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        if (_webView != null) return;

        _webView = new WebView2
        {
            HorizontalAlignment = HorizontalAlignment.Stretch,
            VerticalAlignment = VerticalAlignment.Stretch
        };

        WebViewHost.Content = _webView;

        try
        {
            await _webView.EnsureCoreWebView2Async();

            _webView.CoreWebView2.DocumentTitleChanged += (s, _) =>
            {
                var title = _webView.CoreWebView2.DocumentTitle;
                Tab.Title = string.IsNullOrEmpty(title) ? "New Tab" : title;
                TitleChanged?.Invoke(Tab.Title);
            };

            _webView.NavigationStarting += (s, args) =>
            {
                Tab.IsLoading = true;
                Tab.Url = args.Uri ?? Tab.Url;
                UrlBox.Text = Tab.Url;
            };

            _webView.NavigationCompleted += (s, args) =>
            {
                Tab.IsLoading = false;
                Tab.Url = _webView.CoreWebView2.Source ?? Tab.Url;
                UrlBox.Text = Tab.Url;
            };

            _webView.CoreWebView2.NewWindowRequested += (s, args) =>
            {
                args.Handled = true;
                _webView.CoreWebView2.Navigate(args.Uri);
            };

            if (!string.IsNullOrEmpty(Tab.Url) && Tab.Url != "about:blank")
                _webView.CoreWebView2.Navigate(Tab.Url);
            else
                _webView.CoreWebView2.Navigate("https://www.google.com");
        }
        catch (Exception ex)
        {
            ShowError(ex.Message);
        }
    }

    private void ShowError(string message)
    {
        var tb = new TextBlock
        {
            Text = $"WebView2 error: {message}\n\nMake sure the WebView2 Runtime is installed.",
            Foreground = System.Windows.Media.Brushes.White,
            Margin = new Thickness(20),
            TextWrapping = TextWrapping.Wrap
        };
        WebViewHost.Content = tb;
    }

    private void UrlBox_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Return)
            Navigate(UrlBox.Text.Trim());
    }

    private void Navigate(string input)
    {
        if (string.IsNullOrWhiteSpace(input)) return;

        string url;
        if (input.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
            input.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ||
            input.StartsWith("about:", StringComparison.OrdinalIgnoreCase))
        {
            url = input;
        }
        else if (Uri.TryCreate("https://" + input, UriKind.Absolute, out var candidate) &&
                 candidate.Host.Contains('.') && !input.Contains(' '))
        {
            url = "https://" + input;
        }
        else
        {
            url = $"https://www.google.com/search?q={Uri.EscapeDataString(input)}";
        }

        Tab.Url = url;
        _webView?.CoreWebView2?.Navigate(url);
    }

    public void GoBack() => _webView?.GoBack();
    public void GoForward() => _webView?.GoForward();
    public void Refresh() => _webView?.Reload();
    public void OpenDevTools() => _webView?.CoreWebView2?.OpenDevToolsWindow();

    public string? CurrentUrl => _webView?.CoreWebView2?.Source;

    private void BackButton_Click(object sender, RoutedEventArgs e) => GoBack();
    private void ForwardButton_Click(object sender, RoutedEventArgs e) => GoForward();
    private void RefreshButton_Click(object sender, RoutedEventArgs e) => Refresh();

    private void CloseTab_Click(object sender, RoutedEventArgs e)
    {
        CloseRequested?.Invoke(this);
    }

    private void WebViewHost_MouseRightButtonUp(object sender, MouseButtonEventArgs e)
    {
        // Context menu handled by MainWindow
    }
}
