using CommunityToolkit.Mvvm.ComponentModel;

namespace ImpositorKonica.Models
{
    public partial class Recurso : ObservableObject
    {
        [ObservableProperty]
        private string _nome = string.Empty;

        [ObservableProperty]
        private string _dimensoes = string.Empty;
        
        [ObservableProperty]
        private string _tipo = string.Empty; // Midia, Bloco, etc.
    }
}
