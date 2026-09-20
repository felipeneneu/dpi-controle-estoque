using System.Collections.ObjectModel;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using ImpositorKonica.Models;
using ImpositorKonica.Services;

namespace ImpositorKonica.ViewModels
{
    public partial class ExecucoesViewModel : ObservableObject
    {
        private readonly IImposicaoService _imposicaoService;

        public ObservableCollection<ImposicaoExecucao> Execucoes { get; } = new ObservableCollection<ImposicaoExecucao>();
        
        [ObservableProperty]
        [NotifyCanExecuteChangedFor(nameof(RemoveCommand))]
        [NotifyCanExecuteChangedFor(nameof(MoveUpCommand))]
        [NotifyCanExecuteChangedFor(nameof(MoveDownCommand))]
        private ImposicaoExecucao? _execucaoSelecionada;
        
        [ObservableProperty]
        private string _status = "Pronto.";

        public ExecucoesViewModel(IImposicaoService imposicaoService)
        {
            _imposicaoService = imposicaoService;
            
            // Initial data
            Execucoes.Add(new ImposicaoExecucao 
            { 
                Nome = "Execução 1", 
                EstiloTrabalho = "Sheetwise",
                Midia = "Sem título-1 tpl",
                Assinatura = "Sem título Sig 1"
            });
        }

        [RelayCommand]
        private void Add()
        {
            Execucoes.Add(new ImposicaoExecucao { Nome = $"Execução {Execucoes.Count + 1}" });
        }

        [RelayCommand(CanExecute = nameof(CanExecuteAction))]
        private void Remove()
        {
            if (ExecucaoSelecionada != null)
            {
                Execucoes.Remove(ExecucaoSelecionada);
            }
        }

        [RelayCommand(CanExecute = nameof(CanMoveUp))]
        private void MoveUp()
        {
            if (ExecucaoSelecionada == null) return;
            var index = Execucoes.IndexOf(ExecucaoSelecionada);
            if (index > 0)
            {
                Execucoes.Move(index, index - 1);
            }
        }

        [RelayCommand(CanExecute = nameof(CanMoveDown))]
        private void MoveDown()
        {
            if (ExecucaoSelecionada == null) return;
            var index = Execucoes.IndexOf(ExecucaoSelecionada);
            if (index < Execucoes.Count - 1)
            {
                Execucoes.Move(index, index + 1);
            }
        }

        private bool CanExecuteAction() => ExecucaoSelecionada != null;
        private bool CanMoveUp() => ExecucaoSelecionada != null && Execucoes.IndexOf(ExecucaoSelecionada) > 0;
        private bool CanMoveDown() => ExecucaoSelecionada != null && Execucoes.IndexOf(ExecucaoSelecionada) < Execucoes.Count - 1;

        [RelayCommand(CanExecute = nameof(CanGerarExecucoes))]
        private async Task GerarExecucoesAsync()
        {
            Status = "Gerando execuções...";
            var success = await _imposicaoService.GerarExecucoesAsync(Execucoes);
            Status = success ? "Execuções geradas com sucesso." : "Erro ao gerar execuções.";
        }

        private bool CanGerarExecucoes() => Execucoes.Count > 0;
    }
}
