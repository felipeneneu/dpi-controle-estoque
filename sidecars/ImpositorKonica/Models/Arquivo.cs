using CommunityToolkit.Mvvm.ComponentModel;

namespace ImpositorKonica.Models
{
    public partial class Arquivo : ObservableObject
    {
        [ObservableProperty]
        private string _nomeArquivo = string.Empty;

        [ObservableProperty]
        private int _contagemPaginas = 0;

        [ObservableProperty]
        private string _arremate = string.Empty;
    }
}
