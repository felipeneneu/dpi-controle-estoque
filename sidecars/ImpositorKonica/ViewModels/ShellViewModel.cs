using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using ImpositorKonica.Services;

namespace ImpositorKonica.ViewModels
{
    public partial class ShellViewModel : ObservableObject
    {
        public ProdutosViewModel ProdutosVM { get; }
        public ArquivosViewModel ArquivosVM { get; }
        public RecursosViewModel RecursosVM { get; }
        public PropriedadesViewModel PropriedadesVM { get; }
        public ExecucoesViewModel ExecucoesVM { get; }
        
        public ShellViewModel(IImposicaoService imposicaoService)
        {
            ProdutosVM = new ProdutosViewModel();
            ArquivosVM = new ArquivosViewModel();
            RecursosVM = new RecursosViewModel();
            PropriedadesVM = new PropriedadesViewModel();
            ExecucoesVM = new ExecucoesViewModel(imposicaoService);
        }

        [RelayCommand] private void Undo() { }
        [RelayCommand] private void Redo() { }
        [RelayCommand] private void ZoomExtents() { }
        [RelayCommand] private void ZoomIn() { }
        [RelayCommand] private void ZoomOut() { }
        [RelayCommand] private void SelectTool() { }
        [RelayCommand] private void TextTool() { }
    }
}
