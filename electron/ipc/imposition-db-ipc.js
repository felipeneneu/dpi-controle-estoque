const { ipcMain } = require('electron');
const {
  criarImpositionJob,
  atualizarImpositionJob,
  listarImpositionJobsRecentes,
  listarBobinasEstoque,
} = require('../db/index');

function registerImpositionDbIpc() {
  // 1. Cria job de imposição no banco
  ipcMain.handle('imposition:criar-job', async (_, payload) => {
    try {
      const id = await criarImpositionJob(payload);
      return { success: true, id };
    } catch (err) {
      console.error('[ipc] Erro em imposition:criar-job:', err.message);
      throw new Error(`Falha ao registrar job: ${err.message}`);
    }
  });

  // 2. Atualiza job com resultado
  ipcMain.handle('imposition:atualizar-job', async (_, payload) => {
    try {
      const ok = await atualizarImpositionJob(payload);
      return { success: ok };
    } catch (err) {
      console.error('[ipc] Erro em imposition:atualizar-job:', err.message);
      return { success: false, error: err.message };
    }
  });

  // 3. Lista jobs recentes
  ipcMain.handle('imposition:listar-recentes', async (_, limit = 20) => {
    try {
      return await listarImpositionJobsRecentes(limit);
    } catch (err) {
      console.error('[ipc] Erro em imposition:listar-recentes:', err.message);
      return [];
    }
  });

  // 4. Lista bobinas para o modal de imposição
  ipcMain.handle('estoque:listar-bobinas', async () => {
    try {
      return await listarBobinasEstoque();
    } catch (err) {
      console.error('[ipc] Erro em estoque:listar-bobinas:', err.message);
      return [];
    }
  });
}

module.exports = { registerImpositionDbIpc };
