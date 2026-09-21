using System.Collections.ObjectModel;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using ImpositorKonica.Models;
using ImpositorKonica.Services;

namespace ImpositorKonica.ViewModels
{
    public partial class ShellViewModel : ObservableObject
    {
        private readonly IFileDialogService _fileDialogService;
        private readonly IPdfImportService _pdfImportService;

        public SidebarViewModel SidebarVM { get; }
        public RecentFilesViewModel RecentFilesVM { get; }
        public DocumentViewModel DocumentVM { get; }

        [ObservableProperty]
        private string _saudacao = "Boas vindas ao Illustrator, Felipe";

        [ObservableProperty]
        private bool _isHomeVisible = true;

        public ShellViewModel(
            IFileDialogService fileDialogService, 
            IPdfImportService pdfImportService, 
            IImpositionService impositionService,
            IRecentFilesRepository recentFilesRepo)
        {
            _fileDialogService = fileDialogService;
            _pdfImportService = pdfImportService;

            SidebarVM = new SidebarViewModel();
            RecentFilesVM = new RecentFilesViewModel(recentFilesRepo);
            DocumentVM = new DocumentViewModel(impositionService);

            // Load data
            RecentFilesVM.LoadDataCommand.Execute(null);
        }

        [RelayCommand]
        private void NovoArquivo()
        {
            // Simulate opening new file dialog and moving to document view
            IsHomeVisible = false;
        }

        [RelayCommand]
        private void AbrirArquivo()
        {
            var file = _fileDialogService.OpenAnyFile();
            if (file != null)
            {
                IsHomeVisible = false;
            }
        }

        [RelayCommand]
        private async Task ImportarPdfAsync()
        {
            var file = _fileDialogService.OpenPdfFile();
            if (file != null)
            {
                IsHomeVisible = false;
                var pageInfo = await _pdfImportService.LoadPdfAsync(file);
                DocumentVM.LoadPdf(pageInfo);
            }
        }
    }

    public partial class SidebarViewModel : ObservableObject
    {
        // Bindings for sidebar if needed
    }

    public partial class RecentFilesViewModel : ObservableObject
    {
        private readonly IRecentFilesRepository _repository;

        public ObservableCollection<RecentFile> Files { get; } = new ObservableCollection<RecentFile>();

        [ObservableProperty]
        private bool _isGridView = true;

        public RecentFilesViewModel(IRecentFilesRepository repository)
        {
            _repository = repository;
        }

        [RelayCommand]
        private void ToggleView()
        {
            IsGridView = !IsGridView;
        }

        [RelayCommand]
        private async Task LoadDataAsync()
        {
            var data = await _repository.GetRecentFilesAsync();
            Files.Clear();
            foreach (var f in data)
            {
                Files.Add(f);
            }
        }
    }

    public partial class DocumentViewModel : ObservableObject
    {
        private readonly IImpositionService _impositionService;

        [ObservableProperty]
        private PdfPageInfo? _currentPage;

        public ImpositionViewModel ImpositionVM { get; }

        public DocumentViewModel(IImpositionService impositionService)
        {
            _impositionService = impositionService;
            ImpositionVM = new ImpositionViewModel(impositionService);
            
            // Subscribe to ImpositionVM changes to recalculate
            ImpositionVM.PropertyChanged += (s, e) => 
            {
                if (e.PropertyName == nameof(ImpositionViewModel.Linhas) ||
                    e.PropertyName == nameof(ImpositionViewModel.Colunas) ||
                    e.PropertyName == nameof(ImpositionViewModel.EspacamentoMm) ||
                    e.PropertyName == nameof(ImpositionViewModel.SangriaMm))
                {
                    Recalculate();
                }
            };
        }

        public void LoadPdf(PdfPageInfo page)
        {
            CurrentPage = page;
            ImpositionVM.IsActive = true;
            Recalculate();
        }

        private void Recalculate()
        {
            if (CurrentPage != null)
            {
                var result = _impositionService.CalculateImposition(
                    CurrentPage,
                    ImpositionVM.Linhas,
                    ImpositionVM.Colunas,
                    ImpositionVM.EspacamentoMm,
                    ImpositionVM.SangriaMm
                );

                ImpositionVM.TotalCopies = result.TotalCopies;
                ImpositionVM.LayoutInfo = $"{result.LayoutWidth}mm x {result.LayoutHeight}mm";
            }
        }
    }

    public partial class ImpositionViewModel : ObservableObject
    {
        private readonly IImpositionService _impositionService;

        [ObservableProperty]
        private bool _isActive = false;

        [ObservableProperty]
        private int _linhas = 1;

        [ObservableProperty]
        private int _colunas = 1;

        [ObservableProperty]
        private double _espacamentoMm = 0;

        [ObservableProperty]
        private double _sangriaMm = 0;

        [ObservableProperty]
        private int _totalCopies = 0;

        [ObservableProperty]
        private string _layoutInfo = "";

        public ImpositionViewModel(IImpositionService impositionService)
        {
            _impositionService = impositionService;
        }
    }
}
