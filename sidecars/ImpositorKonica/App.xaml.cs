using System;
using System.IO;
using System.Text.Json;
using System.Windows;
using ImpositorKonica.Models;
using ImpositorKonica.Services;
using ImpositorKonica.ViewModels;

namespace ImpositorKonica
{
    public partial class App : Application
    {
        public static int ExitCodeResult { get; set; } = 0;

        protected override void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);

            // Mocking for now, we will just use ShellViewModel.
            var imposicaoService = new MockImposicaoService();
            var shellViewModel = new ShellViewModel(imposicaoService);

            try
            {
                var mainWindow = new MainWindow
                {
                    DataContext = shellViewModel
                };
                MainWindow = mainWindow;
                mainWindow.Show();
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[ImpositorKonica] Erro inicializando interface gráfica: {ex.Message}");
                Environment.Exit(2);
            }
        }
    }
}
