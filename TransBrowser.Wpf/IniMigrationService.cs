using System.IO;

namespace TransBrowser.Wpf;

public static class IniMigrationService
{
    public static bool TryMigrate(string iniPath, AppSettings target, out List<string> errors)
    {
        errors = new List<string>();

        if (!File.Exists(iniPath))
            return false;

        try
        {
            var lines = File.ReadAllLines(iniPath);
            string currentSection = "";

            foreach (var rawLine in lines)
            {
                var line = rawLine.Trim();
                if (string.IsNullOrEmpty(line) || line.StartsWith(';') || line.StartsWith('#'))
                    continue;

                if (line.StartsWith('[') && line.EndsWith(']'))
                {
                    var sectionName = line[1..^1].Trim();
                    if (!string.IsNullOrEmpty(sectionName))
                        currentSection = sectionName;
                    continue;
                }

                var eqIdx = line.IndexOf('=');
                if (eqIdx < 0) continue;

                var key = line[..eqIdx].Trim();
                // Strip inline comments
                var valRaw = line[(eqIdx + 1)..];
                var commentIdx = valRaw.IndexOf(';');
                var value = (commentIdx >= 0 ? valRaw[..commentIdx] : valRaw).Trim();

                try
                {
                    ApplyValue(currentSection, key, value, target, errors);
                }
                catch (Exception ex)
                {
                    errors.Add($"[{currentSection}] {key}: {ex.Message}");
                }
            }

            File.Move(iniPath, iniPath + ".migrated", overwrite: true);
            return true;
        }
        catch (Exception ex)
        {
            errors.Add($"Failed to read ini file: {ex.Message}");
            return false;
        }
    }

    private static void ApplyValue(string section, string key, string value, AppSettings t, List<string> errors)
    {
        switch (section)
        {
            case "Window":
                switch (key)
                {
                    case "Opacity":
                        if (int.TryParse(value, out var opInt))
                            t.Opacity = Math.Clamp(opInt / 100.0, 0.01, 1.0);
                        else
                            errors.Add($"[Window] Opacity: invalid integer '{value}'");
                        break;
                    case "Position":
                        var pos = value.Split(',');
                        if (pos.Length == 2 && double.TryParse(pos[0].Trim(), out var x) && double.TryParse(pos[1].Trim(), out var y))
                        { t.WindowLeft = x; t.WindowTop = y; }
                        else errors.Add($"[Window] Position: invalid format '{value}'");
                        break;
                    case "Size":
                        var sz = value.Split(',');
                        if (sz.Length == 2 && double.TryParse(sz[0].Trim(), out var w) && double.TryParse(sz[1].Trim(), out var h))
                        { t.WindowWidth = w; t.WindowHeight = h; }
                        else errors.Add($"[Window] Size: invalid format '{value}'");
                        break;
                    case "TopMost": t.TopMost = ParseBool(value); break;
                    case "ShowInTaskbar": t.ShowInTaskbar = ParseBool(value); break;
                    case "NoTitle": t.NoTitle = ParseBool(value); break;
                    case "HoverHeaderMode": t.HoverHeaderMode = ParseBool(value); break;
                }
                break;

            case "TabBar":
                if (key == "ShowTabBar") t.ShowTabBar = ParseBool(value);
                break;

            case "Browser":
                switch (key)
                {
                    case "DefaultUrl": t.StartUrl = value; break;
                    case "UserAgent": t.UserAgent = value; break;
                    case "AutoHide": t.AutoHide = ParseBool(value); break;
                    case "NoImageMode": t.NoImageMode = ParseBool(value); break;
                    case "TransparentBackground": t.TransparentBackground = ParseBool(value); break;
                    case "MobileMold": t.MobileMold = ParseBool(value); break;
                    case "ClickThroughMode": t.ClickThroughMode = ParseBool(value); break;
                }
                break;

            case "Hotkeys":
                switch (key)
                {
                    case "BossKey": t.BossKey = value; break;
                    case "OpacityUp": t.OpacityUp = value; break;
                    case "OpacityDown": t.OpacityDown = value; break;
                    case "OpacityReset": t.OpacityReset = value; break;
                    case "ClickThrough": t.ClickThrough = value; break;
                    case "GoBack": t.GoBack = value; break;
                    case "RunJs": t.RunJs = value; break;
                }
                break;

            case "CustomSites":
                var parts = value.Split('|');
                if (parts.Length >= 2)
                    t.CustomSites.Add(new CustomSite { Name = parts[0].Trim(), Url = parts[1].Trim() });
                else if (parts.Length == 1 && !string.IsNullOrWhiteSpace(parts[0]))
                    t.CustomSites.Add(new CustomSite { Name = parts[0].Trim(), Url = parts[0].Trim() });
                break;

            case "History":
                var hparts = value.Split('|');
                if (hparts.Length >= 2)
                {
                    var hi = new HistoryItem { Title = hparts[0].Trim(), Url = hparts[1].Trim() };
                    if (hparts.Length >= 3 && DateTime.TryParse(hparts[2].Trim(), out var dt))
                        hi.VisitedAt = dt;
                    t.History.Add(hi);
                }
                break;
        }
    }

    private static bool ParseBool(string value) =>
        value.Equals("true", StringComparison.OrdinalIgnoreCase) ||
        value == "1" ||
        value.Equals("yes", StringComparison.OrdinalIgnoreCase);
}
