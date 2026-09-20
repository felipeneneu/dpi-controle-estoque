using CommunityToolkit.Mvvm.ComponentModel;

namespace ImpositorKonica.Models
{
    public partial class ImposicaoExecucao : ObservableObject
    {
        [ObservableProperty]
        private string _nome = string.Empty;

        [ObservableProperty]
        private string _estiloTrabalho = "Sheetwise";

        [ObservableProperty]
        private int _secoes = 1;

        [ObservableProperty]
        private string _etapaERepeticoes = "1x1";

        [ObservableProperty]
        private string _cores = "4/4";

        [ObservableProperty]
        private string _bloco = string.Empty;

        [ObservableProperty]
        private string _midia = string.Empty;

        [ObservableProperty]
        private string _modelo = string.Empty;

        [ObservableProperty]
        private string _assinatura = string.Empty;

        [ObservableProperty]
        private int _comprimento = 0;
    }
}
