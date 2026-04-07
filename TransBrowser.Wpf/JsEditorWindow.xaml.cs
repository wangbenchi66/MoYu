using System.Windows;

namespace TransBrowser.Wpf;

public partial class JsEditorWindow : Window
{
    public event Action<string>? RunRequested;

    public JsEditorWindow(string? initialCode = null)
    {
        InitializeComponent();
        if (!string.IsNullOrEmpty(initialCode))
            TxtCode.Text = initialCode;
    }

    private void BtnRun_Click(object sender, RoutedEventArgs e)
    {
        var code = TxtCode.Text;
        if (!string.IsNullOrWhiteSpace(code))
            RunRequested?.Invoke(code);
    }

    private void BtnClose_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }
}
