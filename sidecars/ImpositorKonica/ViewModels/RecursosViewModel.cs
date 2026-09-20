using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using ImpositorKonica.Models;

namespace ImpositorKonica.ViewModels
{
    public partial class RecursosViewModel : ObservableObject
    {
        public ObservableCollection<Recurso> Recursos { get; } = new ObservableCollection<Recurso>();
        
        [ObservableProperty]
        private Recurso? _recursoSelecionado;
        
        public RecursosViewModel()
        {
            // Mock data
            Recursos.Add(new Recurso { Nome = "SRA3", Dimensoes = "320mm x 450mm", Tipo = "Midia" });
            Recursos.Add(new Recurso { Nome = "A3", Dimensoes = "297mm x 420mm", Tipo = "Bloco" });
        }
    }
}
