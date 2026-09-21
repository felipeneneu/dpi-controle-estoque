using System;
using System.Windows;
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

            var dialogService = new MockFileDialogService();
            var pdfImportService = new MockPdfImportService();
            var impositionService = new ImpositionService();
            var recentFilesRepo = new MockRecentFilesRepository();

            var shellViewModel = new ShellViewModel(dialogService, pdfImportService, impositionService, recentFilesRepo);

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
