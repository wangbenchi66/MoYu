namespace TransBrowser.Wpf;

/// <summary>
/// Controls the transparency behaviour of a window.
/// </summary>
/// <remarks>
/// None    – window is fully opaque (alpha = 255).
/// Fixed   – window uses the opacity value stored in settings at all times.
/// Dynamic – window is fully opaque when the mouse is over it; reverts to the
///           settings opacity when the mouse leaves.
/// </remarks>
public enum TransparencyMode
{
    None,
    Fixed,
    Dynamic,
}

/// <summary>
/// Abstracts Win32 Layered Window transparency so that UI code never calls
/// Win32 APIs directly. Initialize once in <c>OnSourceInitialized</c>, then
/// call <see cref="SetTransparency"/> whenever the opacity needs to change.
/// </summary>
public class WindowTransparencyService
{
    private IntPtr _hwnd;
    private bool _initialized;

    /// <summary>
    /// Enables <c>WS_EX_LAYERED</c> on the window handle. Idempotent – safe to
    /// call more than once.
    /// </summary>
    public void Initialize(IntPtr hwnd)
    {
        if (_initialized) return;
        if (hwnd == IntPtr.Zero) return;

        _hwnd = hwnd;
        Win32Helper.EnableLayered(_hwnd);
        _initialized = true;
    }

    /// <summary>
    /// Sets the window alpha. <paramref name="opacity"/> is clamped to [0.01, 1.0]
    /// and mapped to a byte [2, 255].
    /// </summary>
    public void SetTransparency(double opacity)
    {
        if (!_initialized || _hwnd == IntPtr.Zero) return;
        byte alpha = (byte)(Math.Clamp(opacity, 0.01, 1.0) * 255);
        Win32Helper.SetAlpha(_hwnd, alpha);
    }
}
