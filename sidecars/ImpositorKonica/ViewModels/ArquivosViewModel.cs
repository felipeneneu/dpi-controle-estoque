using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using ImpositorKonica.Models;

namespace ImpositorKonica.ViewModels
{
    public partial class ArquivosViewModel : ObservableObject
    {
        public ObservableCollection<Arquivo> Arquivos { get; } = new ObservableCollection<Arquivo>();
        
        [ObservableProperty]
        private Arquivo? _arquivoSelecionado;
        
        public ArquivosViewModel()
        {
            // Mock data
            Arquivos.Add(new Arquivo { NomeArquivo = "capa.pdf", ContagemPaginas = 2, Arremate = "A4" });
            Arquivos.Add(new Arquivo { NomeArquivo = "miolo.pdf", ContagemPaginas = 32, Arremate = "A4" });
        }
    }
}
