using System.Windows;

namespace TransBrowser.Wpf;

public partial class SettingsWindow : Window
{
    private readonly AppSettings _settings;

    public SettingsWindow(AppSettings settings)
    {
        InitializeComponent();
        _settings = settings;
        LoadSettings();
    }

    private void LoadSettings()
    {
        OpacitySlider.Value = _settings.Opacity;
        ChkTopMost.IsChecked = _settings.TopMost;
        ChkShowInTaskbar.IsChecked = _settings.ShowInTaskbar;
        ChkNoTitle.IsChecked = _settings.NoTitle;
        ChkHoverHeader.IsChecked = _settings.HoverHeaderMode;
        ChkShowTabBar.IsChecked = _settings.ShowTabBar;
        TxtStartUrl.Text = _settings.StartUrl;
        TxtUserAgent.Text = _settings.UserAgent;
        ChkAutoHide.IsChecked = _settings.AutoHide;
        ChkNoImage.IsChecked = _settings.NoImageMode;
        ChkTransparentBg.IsChecked = _settings.TransparentBackground;
        ChkMobileMold.IsChecked = _settings.MobileMold;
        ChkClickThrough.IsChecked = _settings.ClickThroughMode;
        TxtAutoScript.Text = _settings.AutoScript;
        TxtBossKey.Text = _settings.BossKey;
        TxtOpacityUp.Text = _settings.OpacityUp;
        TxtOpacityDown.Text = _settings.OpacityDown;
        TxtOpacityReset.Text = _settings.OpacityReset;
        TxtClickThrough.Text = _settings.ClickThrough;
        TxtGoBack.Text = _settings.GoBack;
        TxtRunJs.Text = _settings.RunJs;
    }

    private void BtnSave_Click(object sender, RoutedEventArgs e)
    {
        _settings.Opacity = OpacitySlider.Value;
        _settings.TopMost = ChkTopMost.IsChecked == true;
        _settings.ShowInTaskbar = ChkShowInTaskbar.IsChecked == true;
        _settings.NoTitle = ChkNoTitle.IsChecked == true;
        _settings.HoverHeaderMode = ChkHoverHeader.IsChecked == true;
        _settings.ShowTabBar = ChkShowTabBar.IsChecked == true;
        _settings.StartUrl = TxtStartUrl.Text.Trim();
        _settings.UserAgent = TxtUserAgent.Text.Trim();
        _settings.AutoHide = ChkAutoHide.IsChecked == true;
        _settings.NoImageMode = ChkNoImage.IsChecked == true;
        _settings.TransparentBackground = ChkTransparentBg.IsChecked == true;
        _settings.MobileMold = ChkMobileMold.IsChecked == true;
        _settings.ClickThroughMode = ChkClickThrough.IsChecked == true;
        _settings.AutoScript = TxtAutoScript.Text;
        _settings.BossKey = TxtBossKey.Text.Trim();
        _settings.OpacityUp = TxtOpacityUp.Text.Trim();
        _settings.OpacityDown = TxtOpacityDown.Text.Trim();
        _settings.OpacityReset = TxtOpacityReset.Text.Trim();
        _settings.ClickThrough = TxtClickThrough.Text.Trim();
        _settings.GoBack = TxtGoBack.Text.Trim();
        _settings.RunJs = TxtRunJs.Text.Trim();

        SettingsService.Save(_settings);
        DialogResult = true;
        Close();
    }

    private void BtnCancel_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }
}
