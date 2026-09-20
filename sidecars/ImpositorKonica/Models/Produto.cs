using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;

namespace ImpositorKonica.Models
{
    public partial class Produto : ObservableObject
    {
        [ObservableProperty]
        private string _nome = string.Empty;
        
        public ObservableCollection<Produto> SubProdutos { get; } = new ObservableCollection<Produto>();
    }
}
