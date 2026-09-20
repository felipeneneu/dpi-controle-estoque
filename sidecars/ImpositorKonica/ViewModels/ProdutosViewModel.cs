using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using ImpositorKonica.Models;

namespace ImpositorKonica.ViewModels
{
    public partial class ProdutosViewModel : ObservableObject
    {
        public ObservableCollection<Produto> Produtos { get; } = new ObservableCollection<Produto>();
        
        [ObservableProperty]
        private Produto? _produtoSelecionado;
        
        public ProdutosViewModel()
        {
            // Mock data
            var root = new Produto { Nome = "Produto 1" };
            root.SubProdutos.Add(new Produto { Nome = "SubProduto A" });
            root.SubProdutos.Add(new Produto { Nome = "SubProduto B" });
            Produtos.Add(root);
        }
    }
}
