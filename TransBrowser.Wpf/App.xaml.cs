using System;
using System.Windows;
using System.Windows.Threading;

namespace TransBrowser.Wpf;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        DispatcherUnhandledException += OnDispatcherUnhandledException;
        AppDomain.CurrentDomain.UnhandledException += OnDomainUnhandledException;
    }

    private void OnDispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        MessageBox.Show($"Unhandled error:\n{e.Exception.Message}", "TransBrowser Error",
            MessageBoxButton.OK, MessageBoxImage.Error);
        e.Handled = true;
    }

    private void OnDomainUnhandledException(object sender, UnhandledExceptionEventArgs e)
    {
        MessageBox.Show($"Fatal error:\n{e.ExceptionObject}", "TransBrowser Fatal Error",
            MessageBoxButton.OK, MessageBoxImage.Error);
    }
}
