using System.IO;
using System.Windows;

namespace TransBrowser.Wpf;

public partial class App : System.Windows.Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        var appDataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "TransBrowser");
        var iniPath = Path.Combine(appDataDir, "config.ini");
        var exeIniPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "config.ini");

        var settings = SettingsService.Load();

        string? migrateFrom = null;
        if (File.Exists(exeIniPath)) migrateFrom = exeIniPath;
        else if (File.Exists(iniPath)) migrateFrom = iniPath;

        if (migrateFrom != null)
        {
            IniMigrationService.TryMigrate(migrateFrom, settings, out var errors);
            SettingsService.Save(settings);
            if (errors.Count > 0)
            {
                System.Windows.MessageBox.Show(
                    "配置文件迁移时发现以下问题（已使用默认值）：\n" + string.Join("\n", errors),
                    "配置迁移提示", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
        }
    }
}
