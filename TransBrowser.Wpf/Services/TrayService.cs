using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Forms;
using TransBrowser.Wpf.Models;

namespace TransBrowser.Wpf.Services;

public class TrayService : IDisposable
{
    private NotifyIcon? _notifyIcon;
    private readonly Window _mainWindow;
    private AppSettings _settings;
    public event Action? MouseThroughToggleRequested;
    public event Action? ExitRequested;

    public TrayService(Window mainWindow, AppSettings settings)
    {
        _mainWindow = mainWindow;
        _settings = settings;
        Build();
    }

    private void Build()
    {
        _notifyIcon = new NotifyIcon
        {
            Text = "TransBrowser",
            Visible = true,
            Icon = CreateIcon()
        };

        var menu = new ContextMenuStrip();
        var showHide = new ToolStripMenuItem("Show / Hide");
        showHide.Click += (_, _) => ToggleVisibility();

        var mouseThrough = new ToolStripMenuItem("Mouse Through");
        mouseThrough.Click += (_, _) => MouseThroughToggleRequested?.Invoke();

        var exit = new ToolStripMenuItem("Exit");
        exit.Click += (_, _) => ExitRequested?.Invoke();

        menu.Items.Add(showHide);
        menu.Items.Add(mouseThrough);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(exit);

        _notifyIcon.ContextMenuStrip = menu;
        _notifyIcon.DoubleClick += (_, _) => ToggleVisibility();
    }

    private void ToggleVisibility()
    {
        if (_mainWindow.IsVisible)
        {
            _mainWindow.Hide();
        }
        else
        {
            _mainWindow.Show();
            _mainWindow.Activate();
        }
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool DestroyIcon(IntPtr hIcon);

    private static Icon CreateIcon()
    {
        // 16x16 icon drawn with GDI
        using var bmp = new Bitmap(16, 16);
        using var g = Graphics.FromImage(bmp);
        g.Clear(Color.FromArgb(32, 32, 32));
        using var brush = new SolidBrush(Color.FromArgb(0, 170, 255));
        g.FillRectangle(brush, 2, 3, 12, 2);  // top bar of T
        g.FillRectangle(brush, 6, 5, 4, 9);   // stem of T
        var hIcon = bmp.GetHicon();
        try
        {
            var icon = Icon.FromHandle(hIcon);
            return (Icon)icon.Clone();
        }
        finally
        {
            DestroyIcon(hIcon);
        }
    }

    public void UpdateSettings(AppSettings settings)
    {
        _settings = settings;
    }

    public void Dispose()
    {
        _notifyIcon?.Dispose();
    }
}
