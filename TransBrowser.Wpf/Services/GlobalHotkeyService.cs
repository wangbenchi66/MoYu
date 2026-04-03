using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;

namespace TransBrowser.Wpf.Services;

public class GlobalHotkeyService : IDisposable
{
    [DllImport("user32.dll")]
    private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll")]
    private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    private const int WM_HOTKEY = 0x0312;

    private const uint MOD_NONE = 0x0000;
    private const uint MOD_ALT = 0x0001;
    private const uint MOD_CONTROL = 0x0002;
    private const uint MOD_SHIFT = 0x0004;
    private const uint MOD_WIN = 0x0008;
    private const uint MOD_NOREPEAT = 0x4000;

    private readonly Window _window;
    private HwndSource? _hwndSource;
    private readonly Dictionary<int, Action> _hotkeys = new();
    private int _nextId = 9000;

    public GlobalHotkeyService(Window window)
    {
        _window = window;
        _window.SourceInitialized += OnSourceInitialized;
    }

    private void OnSourceInitialized(object? sender, EventArgs e)
    {
        var helper = new WindowInteropHelper(_window);
        _hwndSource = HwndSource.FromHwnd(helper.Handle);
        _hwndSource?.AddHook(WndProc);
    }

    public int Register(string hotkeyString, Action callback)
    {
        if (!TryParse(hotkeyString, out uint mods, out uint vk))
            return -1;

        var hwnd = new WindowInteropHelper(_window).Handle;
        if (hwnd == IntPtr.Zero) return -1;

        int id = _nextId++;
        if (RegisterHotKey(hwnd, id, mods | MOD_NOREPEAT, vk))
        {
            _hotkeys[id] = callback;
            return id;
        }
        return -1;
    }

    public void Unregister(int id)
    {
        if (id < 0) return;
        var hwnd = new WindowInteropHelper(_window).Handle;
        if (hwnd != IntPtr.Zero)
            UnregisterHotKey(hwnd, id);
        _hotkeys.Remove(id);
    }

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == WM_HOTKEY && _hotkeys.TryGetValue(wParam.ToInt32(), out var action))
        {
            action();
            handled = true;
        }
        return IntPtr.Zero;
    }

    private static bool TryParse(string s, out uint mods, out uint vk)
    {
        mods = 0;
        vk = 0;
        if (string.IsNullOrWhiteSpace(s)) return false;

        var parts = s.Split('+');
        string keyPart = parts[^1].Trim();

        foreach (var part in parts[..^1])
        {
            switch (part.Trim().ToLowerInvariant())
            {
                case "ctrl": case "control": mods |= MOD_CONTROL; break;
                case "alt": mods |= MOD_ALT; break;
                case "shift": mods |= MOD_SHIFT; break;
                case "win": mods |= MOD_WIN; break;
            }
        }

        vk = keyPart.ToUpperInvariant() switch
        {
            "UP" => 0x26,
            "DOWN" => 0x28,
            "LEFT" => 0x25,
            "RIGHT" => 0x27,
            "Q" => 0x51,
            "W" => 0x57,
            "E" => 0x45,
            "R" => 0x52,
            "T" => 0x54,
            "P" => 0x50,
            "F1" => 0x70,
            "F2" => 0x71,
            "F3" => 0x72,
            "F4" => 0x73,
            "F5" => 0x74,
            "F6" => 0x75,
            "F7" => 0x76,
            "F8" => 0x77,
            "F9" => 0x78,
            "F10" => 0x79,
            "F11" => 0x7A,
            "F12" => 0x7B,
            _ => 0
        };

        return vk != 0;
    }

    public void Dispose()
    {
        var hwnd = new WindowInteropHelper(_window).Handle;
        if (hwnd != IntPtr.Zero)
        {
            foreach (var id in _hotkeys.Keys)
                UnregisterHotKey(hwnd, id);
        }
        _hwndSource?.RemoveHook(WndProc);
        _hotkeys.Clear();
    }
}
