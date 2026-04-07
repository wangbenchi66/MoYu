using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;

namespace TransBrowser.Wpf;

public class GlobalHotkeyService : IDisposable
{
    private const int WM_HOTKEY = 0x0312;

    private HwndSource? _hwndSource;
    private readonly Dictionary<int, Action> _hotkeys = new();
    private IntPtr _hwnd;

    public void Initialize(Window window)
    {
        _hwnd = new WindowInteropHelper(window).Handle;
        _hwndSource = HwndSource.FromHwnd(_hwnd);
        _hwndSource?.AddHook(WndProc);
    }

    public void Register(int id, string hotkeyStr, Action callback)
    {
        if (!HotkeyParser.TryParse(hotkeyStr, out var modifiers, out var key))
            return;

        uint fsModifiers = (uint)modifiers;
        uint vk = (uint)KeyInterop.VirtualKeyFromKey(key);

        Win32Helper.UnregisterHotKey(_hwnd, id);
        if (Win32Helper.RegisterHotKey(_hwnd, id, fsModifiers, vk))
            _hotkeys[id] = callback;
    }

    public void Unregister(int id)
    {
        Win32Helper.UnregisterHotKey(_hwnd, id);
        _hotkeys.Remove(id);
    }

    public void UnregisterAll()
    {
        foreach (var id in _hotkeys.Keys.ToList())
            Win32Helper.UnregisterHotKey(_hwnd, id);
        _hotkeys.Clear();
    }

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == WM_HOTKEY)
        {
            int id = wParam.ToInt32();
            if (_hotkeys.TryGetValue(id, out var callback))
            {
                callback();
                handled = true;
            }
        }
        return IntPtr.Zero;
    }

    public void Dispose()
    {
        UnregisterAll();
        _hwndSource?.RemoveHook(WndProc);
        _hwndSource = null;
    }
}
