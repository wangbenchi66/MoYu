using System;
using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace TransBrowser.Wpf.Controls;

public class BrowserTab : INotifyPropertyChanged
{
    private string _title = "New Tab";
    private string _url = "about:blank";
    private bool _isLoading;

    public Guid Id { get; } = Guid.NewGuid();

    public string Title
    {
        get => _title;
        set { _title = value; OnPropertyChanged(); }
    }

    public string Url
    {
        get => _url;
        set { _url = value; OnPropertyChanged(); }
    }

    public bool IsLoading
    {
        get => _isLoading;
        set { _isLoading = value; OnPropertyChanged(); }
    }

    // The actual WebView2 control is created lazily inside BrowserTabView
    public event PropertyChangedEventHandler? PropertyChanged;
    protected void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
