const { app, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const { spawn } = require('node:child_process');
const os = require('node:os');

const PIPE_NAME = '\\\\.\\pipe\\graficaos-impositor';

/**
 * Localiza o executável nativo do sidecar ImpositorKonica tanto em produção quanto em desenvolvimento (.NET 10 e .NET 8).
 */
function resolveImposerExecutable() {
  const isPackaged = typeof app !== 'undefined' && app ? app.isPackaged : false;

  // 1. Caminho em produção (extraResources mapeado para bin/ImpositorKonica.exe)
  if (isPackaged && process.resourcesPath) {
    const prodPath = path.join(process.resourcesPath, 'bin', 'ImpositorKonica.exe');
    if (fs.existsSync(prodPath)) {
      return prodPath;
    }
  }

  // 2. Caminhos em desenvolvimento (sidecars/ImpositorKonica/bin/...)
  const devCandidates = [
    // .NET 10 (Target atual do projeto)
    path.resolve(__dirname, '../../sidecars/ImpositorKonica/bin/Release/net10.0-windows/win-x64/publish/ImpositorKonica.exe'),
    path.resolve(__dirname, '../../sidecars/ImpositorKonica/bin/Release/net10.0-windows/win-x64/ImpositorKonica.exe'),
    path.resolve(__dirname, '../../sidecars/ImpositorKonica/bin/Release/net10.0-windows/ImpositorKonica.exe'),
    path.resolve(__dirname, '../../sidecars/ImpositorKonica/bin/Debug/net10.0-windows/ImpositorKonica.exe'),
    path.resolve(process.cwd(), 'sidecars/ImpositorKonica/bin/Release/net10.0-windows/win-x64/publish/ImpositorKonica.exe'),
    path.resolve(process.cwd(), 'sidecars/ImpositorKonica/bin/Release/net10.0-windows/win-x64/ImpositorKonica.exe'),

    // .NET 8 (Compatibilidade legada / diretório especificado pelo operador)
    path.resolve(__dirname, '../../sidecars/ImpositorKonica/bin/Release/net8.0-windows/win-x64/publish/ImpositorKonica.exe'),
    path.resolve(__dirname, '../../sidecars/ImpositorKonica/bin/Release/net8.0-windows/win-x64/ImpositorKonica.exe'),
    path.resolve(__dirname, '../../sidecars/ImpositorKonica/bin/Release/net8.0-windows/ImpositorKonica.exe'),
    path.resolve(__dirname, '../../sidecars/ImpositorKonica/bin/Debug/net8.0-windows/ImpositorKonica.exe'),
    path.resolve(process.cwd(), 'sidecars/ImpositorKonica/bin/Release/net8.0-windows/win-x64/publish/ImpositorKonica.exe'),
    path.resolve(process.cwd(), 'sidecars/ImpositorKonica/bin/Release/net8.0-windows/win-x64/ImpositorKonica.exe'),
    path.resolve(process.cwd(), 'sidecars/ImpositorKonica/bin/Debug/net8.0-windows/ImpositorKonica.exe'),
  ];

  for (const candidate of devCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Fallback padrão
  return devCandidates[0];
}

/**
 * Envia mensagem JSON via Windows Named Pipe diretamente para a instância aberta do ImpositorKonica.
 */
function sendToNamedPipe(payload, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    let client;
    try {
      client = net.connect(PIPE_NAME, () => {
        const message = JSON.stringify({ type: 'SET_PAYLOAD', payload }) + '\n';
        client.write(message, 'utf-8');
      });
    } catch (err) {
      return reject(err);
    }

    let responseData = '';
    client.on('data', (chunk) => {
      responseData += chunk.toString('utf-8');
    });

    client.on('end', () => {
      client.destroy();
      resolve({ success: true, response: responseData });
    });

    client.on('error', (err) => {
      client.destroy();
      reject(err);
    });

    client.setTimeout(timeoutMs, () => {
      client.destroy();
      reject(new Error(`Timeout de ${timeoutMs}ms aguardando resposta do Named Pipe`));
    });
  });
}

/**
 * Aguarda o Named Pipe se tornar disponível com retries periódicos.
 */
async function waitForPipe(maxRetries = 15, delayMs = 300) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await new Promise((resolve, reject) => {
        const s = net.connect(PIPE_NAME, () => {
          s.destroy();
          resolve();
        });
        s.on('error', (err) => {
          s.destroy();
          reject(err);
        });
        s.setTimeout(500, () => {
          s.destroy();
          reject(new Error('timeout'));
        });
      });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

/**
 * Envia dados em tempo real para o ImpositorKonica.
 * Se o processo já estiver aberto, envia diretamente pelo Named Pipe em milissegundos.
 * Se estiver fechado, spawna o processo e conecta assim que o pipe subir.
 */
async function sendLiveImpositionData(payload) {
  // 1. Tenta envio direto pelo pipe existente
  try {
    const res = await sendToNamedPipe(payload, 1500);
    console.log('[ImposerSidecar] Dados enviados com sucesso em tempo real pelo Named Pipe.');
    return { success: true, mode: 'pipe_direct', ...res };
  } catch (err) {
    console.log('[ImposerSidecar] Instância aberta não respondeu ao pipe. Iniciando executável...');
  }

  // 2. Se o pipe falhou, inicia o executável nativo
  const exePath = resolveImposerExecutable();
  if (!fs.existsSync(exePath)) {
    const msg = `Executável do sidecar não encontrado em: ${exePath}. Compile o projeto C# antes de acionar.`;
    console.warn(`[ImposerSidecar] ${msg}`);
    return { success: false, error: msg };
  }

  // Grava payload inicial em arquivo temporário
  const tempFileName = `imp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.json`;
  const tempBaseDir = typeof app !== 'undefined' && app && app.getPath ? app.getPath('temp') : os.tmpdir();
  const tempFilePath = path.join(tempBaseDir, tempFileName);

  try {
    await fs.promises.writeFile(tempFilePath, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (err) {
    console.error('[ImposerSidecar] Falha ao gravar arquivo temporário:', err.message);
  }

  // Spawna desacoplado para manter a UI independente e responsiva
  const child = spawn(exePath, ['--data', tempFilePath], {
    windowsHide: false,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  // Aguarda o servidor Named Pipe subir no processo C#
  const pipeReady = await waitForPipe(15, 300);
  if (pipeReady) {
    try {
      await sendToNamedPipe(payload, 2000);
      console.log('[ImposerSidecar] Instância iniciada e sincronizada via Named Pipe.');
    } catch (e) {
      console.warn('[ImposerSidecar] Pipe subiu mas payload já foi carregado via --data.');
    }
  }

  cleanupTempFile(tempFilePath);
  return { success: true, mode: 'spawned' };
}

function cleanupTempFile(filePath) {
  setTimeout(() => {
    fs.unlink(filePath, (err) => {
      if (err && err.code !== 'ENOENT') {
        console.warn(`[ImposerSidecar] Aviso ao remover arquivo temporário: ${err.message}`);
      }
    });
  }, 5000);
}

function registerImpositionSidecar() {
  // Abre ou foca a mesa de imposição com o lote de etiquetas
  ipcMain.handle('imposition:open', async (_event, payload) => {
    return await sendLiveImpositionData(payload);
  });

  // Envio contínuo de atualizações em tempo real (ex: novas etiquetas adicionadas ao lote)
  ipcMain.handle('imposition:send-live-data', async (_event, payload) => {
    return await sendLiveImpositionData(payload);
  });

  console.log('[ImposerSidecar] Canais IPC "imposition:open" e "imposition:send-live-data" registrados com suporte a Named Pipes.');
}

module.exports = {
  resolveImposerExecutable,
  sendToNamedPipe,
  sendLiveImpositionData,
  registerImpositionSidecar,
};
