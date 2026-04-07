using System.IO;
using System.Text.Json;

namespace TransBrowser.Wpf;

public class CustomSite
{
    public string Name { get; set; } = "";
    public string Url { get; set; } = "";
}

public class HistoryItem
{
    public string Title { get; set; } = "";
    public string Url { get; set; } = "";
    public DateTime VisitedAt { get; set; } = DateTime.Now;
}

public class AppSettings
{
    // Window
    public double Opacity { get; set; } = 1.0;
    public double WindowLeft { get; set; } = 100;
    public double WindowTop { get; set; } = 100;
    public double WindowWidth { get; set; } = 900;
    public double WindowHeight { get; set; } = 650;
    public bool TopMost { get; set; } = false;
    public bool ShowInTaskbar { get; set; } = true;
    public bool NoTitle { get; set; } = false;
    public bool HoverHeaderMode { get; set; } = false;

    // TabBar
    public bool ShowTabBar { get; set; } = true;

    // Browser
    public string StartUrl { get; set; } = "";
    public string UserAgent { get; set; } = "";
    public bool AutoHide { get; set; } = false;
    public bool NoImageMode { get; set; } = false;
    public bool TransparentBackground { get; set; } = false;
    public bool WindowTransparent { get; set; } = false;
    public bool MobileMold { get; set; } = false;
    public bool ClickThroughMode { get; set; } = false;

    // Hotkeys
    public string BossKey { get; set; } = "Alt+Q";
    public string OpacityUp { get; set; } = "Alt+Right";
    public string OpacityDown { get; set; } = "Alt+Left";
    public string OpacityReset { get; set; } = "Alt+Up";
    public string ClickThrough { get; set; } = "Ctrl+Alt+T";
    public string GoBack { get; set; } = "Alt+Shift+Z";
    public string RunJs { get; set; } = "Alt+Shift+C";

    // Data
    public List<CustomSite> CustomSites { get; set; } = new();
    public List<HistoryItem> History { get; set; } = new();

    // Auto script
    public string AutoScript { get; set; } = "";
}

public static class SettingsService
{
    private static readonly string SettingsDir =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "TransBrowser");

    private static readonly string SettingsFile =
        Path.Combine(SettingsDir, "settings.json");

    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    public static AppSettings Load()
    {
        try
        {
            if (File.Exists(SettingsFile))
            {
                var json = File.ReadAllText(SettingsFile);
                return JsonSerializer.Deserialize<AppSettings>(json, JsonOptions) ?? new AppSettings();
            }
        }
        catch { }
        return new AppSettings();
    }

    public static void Save(AppSettings settings)
    {
        try
        {
            Directory.CreateDirectory(SettingsDir);
            var json = JsonSerializer.Serialize(settings, JsonOptions);
            File.WriteAllText(SettingsFile, json);
        }
        catch { }
    }
}
