using System;
using System.Text.Json.Serialization;

namespace TransBrowser.Wpf.Models;

public class AppSettings
{
    public double Opacity { get; set; } = 0.85;
    public bool MouseThroughEnabled { get; set; } = false;
    public string HotkeyOpacityUp { get; set; } = "Ctrl+Alt+Up";
    public string HotkeyOpacityDown { get; set; } = "Ctrl+Alt+Down";
    public string HotkeyBossKey { get; set; } = "Alt+Q";
    public string HotkeyMouseThrough { get; set; } = "Ctrl+Alt+P";
    public ContextMenuSettings ContextMenuItems { get; set; } = new();
    public bool MinimizeToTray { get; set; } = true;
    public double WindowLeft { get; set; } = 100;
    public double WindowTop { get; set; } = 100;
    public double WindowWidth { get; set; } = 1024;
    public double WindowHeight { get; set; } = 768;
}

public class ContextMenuSettings
{
    public bool Back { get; set; } = true;
    public bool Forward { get; set; } = true;
    public bool Refresh { get; set; } = true;
    public bool CopyLink { get; set; } = true;
    public bool DevTools { get; set; } = true;
    public bool NewTab { get; set; } = true;
}
