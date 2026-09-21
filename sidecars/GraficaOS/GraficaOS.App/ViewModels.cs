using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using GraficaOS.Core;

namespace GraficaOS.App.ViewModels
{
    public partial class MainViewModel : ObservableObject
    {
        public MenuBarViewModel MenuBarVM { get; }
        public ToolsViewModel ToolsVM { get; }
        public ProdutosViewModel ProdutosVM { get; }
        public ArquivosViewModel ArquivosVM { get; }
        public RecursosViewModel RecursosVM { get; }
        public ImpositionViewModel ImpositionVM { get; }
        public ExecucoesViewModel ExecucoesVM { get; }
        public StatusBarViewModel StatusBarVM { get; }

        public MainViewModel()
        {
            var imposicaoService = new ImposicaoService();
            
            MenuBarVM = new MenuBarViewModel();
            ToolsVM = new ToolsViewModel();
            ProdutosVM = new ProdutosViewModel();
            ArquivosVM = new ArquivosViewModel();
            RecursosVM = new RecursosViewModel();
            ImpositionVM = new ImpositionViewModel(imposicaoService);
            ExecucoesVM = new ExecucoesViewModel();
            StatusBarVM = new StatusBarViewModel();
        }
    }

    public partial class MenuBarViewModel : ObservableObject
    {
        [RelayCommand]
        private void NovoArquivo() { }

        [RelayCommand]
        private void AbrirArquivo() { }

        [RelayCommand]
        private void ImportarPdf() { }

        [RelayCommand]
        private void Salvar() { }
    }

    public partial class ToolsViewModel : ObservableObject
    {
        [ObservableProperty]
        private string _ferramentaAtiva = "Selecao";
    }

    public partial class ProdutosViewModel : ObservableObject
    {
        // TreeView logic
    }

    public partial class ArquivosViewModel : ObservableObject
    {
        public ObservableCollection<PdfEntrada> Arquivos { get; } = new ObservableCollection<PdfEntrada>();
    }

    public partial class RecursosViewModel : ObservableObject
    {
    }

    public partial class ImpositionViewModel : ObservableObject
    {
        private readonly IImposicaoService _service;

        [ObservableProperty]
        private bool _isActive = true;

        [ObservableProperty]
        private PdfEntrada? _documentoPdf;

        [ObservableProperty]
        private int _linhas = 1;

        [ObservableProperty]
        private int _colunas = 1;

        [ObservableProperty]
        private double _espacoMm = 0;

        [ObservableProperty]
        private double _sangriaMm = 0;

        [ObservableProperty]
        private ResultadoProducao? _resultadoProducao;

        public int TotalCopias => ResultadoProducao?.TotalCopias ?? 0;

        public ImpositionViewModel(IImposicaoService service)
        {
            _service = service;
            DocumentoPdf = new PdfEntrada { Caminho = "test.pdf", LarguraMm = 210, AlturaMm = 297, Paginas = 1 };
            Recalcular();
        }

        partial void OnLinhasChanged(int value) => Recalcular();
        partial void OnColunasChanged(int value) => Recalcular();
        partial void OnEspacoMmChanged(double value) => Recalcular();
        partial void OnSangriaMmChanged(double value) => Recalcular();

        private void Recalcular()
        {
            if (DocumentoPdf != null)
            {
                var param = new ParametrosRepeticao
                {
                    Linhas = this.Linhas,
                    Colunas = this.Colunas,
                    EspacoMm = this.EspacoMm,
                    SangriaMm = this.SangriaMm
                };
                ResultadoProducao = _service.Calcular(DocumentoPdf, param);
                OnPropertyChanged(nameof(TotalCopias));
            }
        }
    }

    public partial class ExecucoesViewModel : ObservableObject
    {
        public ObservableCollection<ImposicaoExecucao> Execucoes { get; } = new ObservableCollection<ImposicaoExecucao>();

        [RelayCommand]
        private void Add() { }

        [RelayCommand]
        private void Remove() { }

        [RelayCommand]
        private void MoveUp() { }

        [RelayCommand]
        private void MoveDown() { }
    }

    public partial class StatusBarViewModel : ObservableObject
    {
        [ObservableProperty]
        private bool _isOnline = true;

        [RelayCommand]
        private void GerarExecucoes() { }
    }
}
