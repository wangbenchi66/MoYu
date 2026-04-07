using System.Runtime.InteropServices;

namespace TransBrowser.Wpf;

public static class Win32Helper
{
    private const int GWL_EXSTYLE = -20;
    private const int WS_EX_TRANSPARENT = 0x00000020;
    private const int WS_EX_LAYERED = 0x00080000;
    private const int LWA_ALPHA = 0x00000002;

    [DllImport("user32.dll", SetLastError = true)]
    private static extern int GetWindowLong(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetLayeredWindowAttributes(IntPtr hwnd, uint crKey, byte bAlpha, uint dwFlags);

    [DllImport("user32.dll")]
    public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll")]
    public static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    [DllImport("user32.dll")]
    public static extern bool SetWindowDisplayAffinity(IntPtr hwnd, uint dwAffinity);

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int dwAttribute, ref int pvAttribute, int cbAttribute);

    private const int DWMWA_NCRENDERING_POLICY = 2;
    private const int DWMNCRP_DISABLED = 1;
    private const int DWMNCRP_USEWINDOWSTYLE = 0;

    public const uint WDA_NONE = 0x00000000;
    public const uint WDA_EXCLUDEFROMCAPTURE = 0x00000011;

    /// <summary>Enables or disables the DWM non-client shadow for a window.</summary>
    public static void SetWindowShadow(IntPtr hwnd, bool enable)
    {
        if (hwnd == IntPtr.Zero) return;
        int policy = enable ? DWMNCRP_USEWINDOWSTYLE : DWMNCRP_DISABLED;
        DwmSetWindowAttribute(hwnd, DWMWA_NCRENDERING_POLICY, ref policy, sizeof(int));
    }

    public static void SetClickThrough(IntPtr hwnd, bool enable)
    {
        int exStyle = GetWindowLong(hwnd, GWL_EXSTYLE);
        if (enable)
            exStyle |= WS_EX_TRANSPARENT | WS_EX_LAYERED;
        else
            exStyle &= ~WS_EX_TRANSPARENT;
        SetWindowLong(hwnd, GWL_EXSTYLE, exStyle);
    }

    /// <summary>
    /// Enables Win32 WS_EX_LAYERED extended style on the window (idempotent).
    /// Must be called before <see cref="SetAlpha"/>.
    /// </summary>
    public static void EnableLayered(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero) return;
        int exStyle = GetWindowLong(hwnd, GWL_EXSTYLE);
        if ((exStyle & WS_EX_LAYERED) == 0)
            SetWindowLong(hwnd, GWL_EXSTYLE, exStyle | WS_EX_LAYERED);
    }

    /// <summary>
    /// Sets the per-pixel alpha for a layered window.
    /// <paramref name="alpha"/> 0 = fully transparent, 255 = fully opaque.
    /// </summary>
    public static void SetAlpha(IntPtr hwnd, byte alpha)
    {
        if (hwnd == IntPtr.Zero) return;
        SetLayeredWindowAttributes(hwnd, 0, alpha, LWA_ALPHA);
    }
}
