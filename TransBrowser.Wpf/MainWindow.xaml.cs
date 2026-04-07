using System;
using System.Runtime.InteropServices;

namespace TransBrowser.Wpf
{
    public static class Win32Helper
    {
        // Function to get window exstyle
        [DllImport("user32.dll", SetLastError = true)]
        public static extern int GetWindowLong(IntPtr hWnd, int nIndex);

        // Function to set window exstyle
        [DllImport("user32.dll", SetLastError = true)]
        public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

        // Function to set layered window attributes
        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool SetLayeredWindowAttributes(IntPtr hwnd, uint crKey, byte bAlpha, uint dwFlags);

        // Constants for GetWindowLong and SetWindowLong
        private const int GWL_EXSTYLE = -20;
        private const int WS_EX_LAYERED = 0x00080000;
        private const int LWA_ALPHA = 0x00000002;
        private const int LWA_COLORKEY = 0x00000001;

        // Function to apply layered opacity
        public static void ApplyLayeredOpacity(IntPtr hwnd, double opacity)
        {
            if (hwnd == IntPtr.Zero) return; // Guard for hwnd==IntPtr.Zero

            int exStyle = GetWindowLong(hwnd, GWL_EXSTYLE);
            SetWindowLong(hwnd, GWL_EXSTYLE, exStyle | WS_EX_LAYERED);

            byte alpha = (byte)(opacity * 255); // Map 0.01-1.0 to byte 3-255
            SetLayeredWindowAttributes(hwnd, 0, alpha, LWA_ALPHA);
        }
    }

    public partial class MainWindow
    {
        // Call ApplyLayeredOpacity from ApplySettings/ApplyAllSettings and StatusOpacitySlider_ValueChanged
        public void ApplySettings()
        {
            // Existing code...
            ApplyLayeredOpacity(this.Handle, desiredOpacity);
        }

        public void StatusOpacitySlider_ValueChanged(double value)
        {
            // Existing code...
            ApplyLayeredOpacity(this.Handle, value);
        }

        public void SetOpacity(double value)
        {
            // Existing code...
            ApplyLayeredOpacity(this.Handle, value);
        }

        // Stop assigning this.Opacity for overall transparency, keep for fallback only if layered fails
        // Existing transparency logic...
    }  
}