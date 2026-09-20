using System.Collections.Generic;
using System.Threading.Tasks;
using ImpositorKonica.Models;

namespace ImpositorKonica.Services
{
    public interface IImposicaoService
    {
        Task<bool> GerarExecucoesAsync(IEnumerable<ImposicaoExecucao> execucoes);
    }
    
    public class MockImposicaoService : IImposicaoService
    {
        public async Task<bool> GerarExecucoesAsync(IEnumerable<ImposicaoExecucao> execucoes)
        {
            await Task.Delay(500); // Simulate work
            return true;
        }
    }
}
