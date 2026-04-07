using System.Windows;
using WpfTextBox = System.Windows.Controls.TextBox;
using WpfKeyEventArgs = System.Windows.Input.KeyEventArgs;
using WpfKey = System.Windows.Input.Key;
using WpfKeyboard = System.Windows.Input.Keyboard;
using WpfMouseButtonEventArgs = System.Windows.Input.MouseButtonEventArgs;

namespace TransBrowser.Wpf;

public partial class SettingsWindow : Window
{
    private readonly AppSettings _settings;
    private readonly Action _onSettingChanged;
    private bool _loading = true;

    // Static brushes shared across all instances – avoids per-event allocations
    private static readonly System.Windows.Media.SolidColorBrush BrushHotkeyFocused =
        new(System.Windows.Media.Color.FromRgb(0x45, 0x47, 0x5A));
    private static readonly System.Windows.Media.SolidColorBrush BrushHotkeyNormal =
        new(System.Windows.Media.Color.FromRgb(0x31, 0x32, 0x44));

    // Single debounce timer shared by text-input fields
    private readonly System.Windows.Threading.DispatcherTimer _textSaveTimer;

    public SettingsWindow(AppSettings settings, Action onSettingChanged)
    {
        InitializeComponent();
        _settings = settings;
        _onSettingChanged = onSettingChanged;

        _textSaveTimer = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromMilliseconds(600) };
        _textSaveTimer.Tick += (_, _) => { _textSaveTimer.Stop(); CommitTextFields(); ApplyAndSave(); };
    }

    private void SettingsWindow_Loaded(object sender, RoutedEventArgs e)
    {
        LoadSettings();
        _loading = false;
    }

    private void LoadSettings()
    {
        // Convert stored opacity (0.01..1.0) to slider pct (1..100)
        OpacitySlider.Value = Math.Clamp(_settings.Opacity * 100, 1, 100);
        OpacityValueText.Text = $"{(int)OpacitySlider.Value}%";

        SwTopMost.IsChecked = _settings.TopMost;
        SwShowInTaskbar.IsChecked = _settings.ShowInTaskbar;
        SwNoTitle.IsChecked = _settings.NoTitle;
        SwHoverHeader.IsChecked = _settings.HoverHeaderMode;
        SwShowTabBar.IsChecked = _settings.ShowTabBar;
        SwAutoHide.IsChecked = _settings.AutoHide;
        SwClickThrough.IsChecked = _settings.ClickThroughMode;
        SwWindowTransparent.IsChecked = _settings.WindowTransparent;

        SwNoImage.IsChecked = _settings.NoImageMode;
        SwTransparentBg.IsChecked = _settings.TransparentBackground;
        SwMobileMold.IsChecked = _settings.MobileMold;
        SwGrayscale.IsChecked = _settings.GrayscaleMode;
        SwAntiScreenshot.IsChecked = _settings.AntiScreenshotMode;
        SwDisableShadow.IsChecked = _settings.DisableWindowShadow;
        SwCloseToTray.IsChecked = _settings.CloseToTray;
        SwMinimizeNotify.IsChecked = _settings.ShowMinimizeNotification;

        TxtStartUrl.Text = _settings.StartUrl;
        TxtUserAgent.Text = _settings.UserAgent;
        TxtAutoScript.Text = _settings.AutoScript;

        TxtBossKey.Text = _settings.BossKey;
        TxtOpacityUp.Text = _settings.OpacityUp;
        TxtOpacityDown.Text = _settings.OpacityDown;
        TxtOpacityReset.Text = _settings.OpacityReset;
        TxtClickThrough.Text = _settings.ClickThrough;
        TxtGoBack.Text = _settings.GoBack;
        TxtRunJs.Text = _settings.RunJs;
    }

    // ── Persist & notify ────────────────────────────────────────────────────
    private void ApplyAndSave()
    {
        SettingsService.Save(_settings);
        _onSettingChanged();
    }

    // ── Opacity ─────────────────────────────────────────────────────────────
    private void OpacitySlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (_loading) return;
        int pct = (int)e.NewValue;
        OpacityValueText.Text = $"{pct}%";
        _settings.Opacity = pct / 100.0;
        ApplyAndSave();
    }

    // ── Window toggles ──────────────────────────────────────────────────────
    private void SwTopMost_Changed(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        _settings.TopMost = SwTopMost.IsChecked == true;
        ApplyAndSave();
    }

    private void SwShowInTaskbar_Changed(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        _settings.ShowInTaskbar = SwShowInTaskbar.IsChecked == true;
        ApplyAndSave();
    }

    private void SwNoTitle_Changed(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        _settings.NoTitle = SwNoTitle.IsChecked == true;
        ApplyAndSave();
    }

    private void SwHoverHeader_Changed(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        _settings.HoverHeaderMode = SwHoverHeader.IsChecked == true;
        ApplyAndSave();
    }

    private void SwShowTabBar_Changed(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        _settings.ShowTabBar = SwShowTabBar.IsChecked == true;
        ApplyAndSave();
    }

    private void SwAutoHide_Changed(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        _settings.AutoHide = SwAutoHide.IsChecked == true;
        ApplyAndSave();
    }

    private void SwClickThrough_Changed(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        _settings.ClickThroughMode = SwClickThrough.IsChecked == true;
        ApplyAndSave();
    }

    private void SwWindowTransparent_Changed(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        _settings.WindowTransparent = SwWindowTransparent.IsChecked == true;
        ApplyAndSave();
    }

    // ── Browser toggles ─────────────────────────────────────────────────────
    private void SwNoImage_Changed(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        _settings.NoImageMode = SwNoImage.IsChecked == true;
        ApplyAndSave();
    }

    private void SwTransparentBg_Changed(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        _settings.TransparentBackground = SwTransparentBg.IsChecked == true;
        ApplyAndSave();
    }

    private void SwMobileMold_Changed(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        _settings.MobileMold = SwMobileMold.IsChecked == true;
        ApplyAndSave();
    }

    private void SwGrayscale_Changed(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        _settings.GrayscaleMode = SwGrayscale.IsChecked == true;
        ApplyAndSave();
    }

    private void SwAntiScreenshot_Changed(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        _settings.AntiScreenshotMode = SwAntiScreenshot.IsChecked == true;
        ApplyAndSave();
    }

    private void SwDisableShadow_Changed(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        _settings.DisableWindowShadow = SwDisableShadow.IsChecked == true;
        ApplyAndSave();
    }

    private void SwCloseToTray_Changed(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        _settings.CloseToTray = SwCloseToTray.IsChecked == true;
        ApplyAndSave();
    }

    private void SwMinimizeNotify_Changed(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        _settings.ShowMinimizeNotification = SwMinimizeNotify.IsChecked == true;
        ApplyAndSave();
    }

    // ── URL / UserAgent / AutoScript (debounced on LostFocus) ───────────────
    // ── Text field helpers ───────────────────────────────────────────────────
    /// <summary>Copies all text-field contents to the settings model.</summary>
    private void CommitTextFields()
    {
        _settings.StartUrl = TxtStartUrl.Text.Trim();
        _settings.UserAgent = TxtUserAgent.Text.Trim();
        _settings.AutoScript = TxtAutoScript.Text;
    }

    private void TxtStartUrl_LostFocus(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        _textSaveTimer.Stop();
        CommitTextFields();
        ApplyAndSave();
    }

    private void TxtStartUrl_KeyDown(object sender, WpfKeyEventArgs e)
    {
        if (e.Key == WpfKey.Enter)
        {
            _textSaveTimer.Stop();
            CommitTextFields();
            ApplyAndSave();
        }
    }

    private void TxtUserAgent_LostFocus(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        _textSaveTimer.Stop();
        CommitTextFields();
        ApplyAndSave();
    }

    private void TxtAutoScript_LostFocus(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        _textSaveTimer.Stop();
        CommitTextFields();
        ApplyAndSave();
    }

    private void BtnOpenUrl_Click(object sender, RoutedEventArgs e)
    {
        CommitTextFields();
        ApplyAndSave();
    }

    // ── Hotkey capture ───────────────────────────────────────────────────────
    private void HotkeyTextBox_KeyDown(object sender, WpfKeyEventArgs e)
    {
        e.Handled = true;
        var tb = (WpfTextBox)sender;

        var key = e.Key == WpfKey.System ? e.SystemKey : e.Key;
        // Ignore bare modifier keys
        if (key is WpfKey.LeftCtrl or WpfKey.RightCtrl or WpfKey.LeftAlt or WpfKey.RightAlt
                 or WpfKey.LeftShift or WpfKey.RightShift or WpfKey.LWin or WpfKey.RWin)
            return;

        var mods = KeyModifiers.None;
        if (WpfKeyboard.IsKeyDown(WpfKey.LeftCtrl) || WpfKeyboard.IsKeyDown(WpfKey.RightCtrl)) mods |= KeyModifiers.Ctrl;
        if (WpfKeyboard.IsKeyDown(WpfKey.LeftAlt) || WpfKeyboard.IsKeyDown(WpfKey.RightAlt)) mods |= KeyModifiers.Alt;
        if (WpfKeyboard.IsKeyDown(WpfKey.LeftShift) || WpfKeyboard.IsKeyDown(WpfKey.RightShift)) mods |= KeyModifiers.Shift;
        if (WpfKeyboard.IsKeyDown(WpfKey.LWin) || WpfKeyboard.IsKeyDown(WpfKey.RWin)) mods |= KeyModifiers.Win;

        var formatted = HotkeyParser.Format(mods, key);
        if (string.IsNullOrEmpty(formatted)) return;

        tb.Text = formatted;

        switch (tb.Name)
        {
            case nameof(TxtBossKey): _settings.BossKey = formatted; break;
            case nameof(TxtOpacityUp): _settings.OpacityUp = formatted; break;
            case nameof(TxtOpacityDown): _settings.OpacityDown = formatted; break;
            case nameof(TxtOpacityReset): _settings.OpacityReset = formatted; break;
            case nameof(TxtClickThrough): _settings.ClickThrough = formatted; break;
            case nameof(TxtGoBack): _settings.GoBack = formatted; break;
            case nameof(TxtRunJs): _settings.RunJs = formatted; break;
        }
        ApplyAndSave();
    }

    private void HotkeyTextBox_GotFocus(object sender, RoutedEventArgs e)
        => ((WpfTextBox)sender).Background = BrushHotkeyFocused;

    private void HotkeyTextBox_LostFocus(object sender, RoutedEventArgs e)
        => ((WpfTextBox)sender).Background = BrushHotkeyNormal;

    // ── Window chrome ────────────────────────────────────────────────────────
    private void TitleBar_MouseLeftButtonDown(object sender, WpfMouseButtonEventArgs e)
    {
        if (e.ClickCount == 1) DragMove();
    }

    private void BtnClose_Click(object sender, RoutedEventArgs e) => Close();
}
