using CommunityToolkit.Mvvm.ComponentModel;

namespace ImpositorKonica.ViewModels
{
    public partial class PropriedadesViewModel : ObservableObject
    {
        [ObservableProperty]
        private object? _itemSelecionado;
    }
}
