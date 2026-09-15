const { app, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const os = require('node:os');

/**
 * Localiza o executável nativo do sidecar ImpositorKonica tanto em produção quanto em desenvolvimento.
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
    // Publicação autocontida Single-File (Release)
    path.resolve(__dirname, '../../sidecars/ImpositorKonica/bin/Release/net8.0-windows/win-x64/publish/ImpositorKonica.exe'),
    // Build padrão Release
    path.resolve(__dirname, '../../sidecars/ImpositorKonica/bin/Release/net8.0-windows/ImpositorKonica.exe'),
    // Build padrão Debug
    path.resolve(__dirname, '../../sidecars/ImpositorKonica/bin/Debug/net8.0-windows/ImpositorKonica.exe'),
    // A partir da raiz do projeto
    path.resolve(process.cwd(), 'sidecars/ImpositorKonica/bin/Release/net8.0-windows/win-x64/publish/ImpositorKonica.exe'),
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
 * Dispara o processo nativo C# WPF via CLI (--data temp_path.json)
 * e aguarda o código de término padronizado pela ADR-015.
 */
async function launchImpositionSidecar(payload) {
  const exePath = resolveImposerExecutable();

  if (!fs.existsSync(exePath)) {
    const msg = `Executável do sidecar não encontrado em: ${exePath}. Compile o projeto C# antes de acionar.`;
    console.warn(`[ImposerSidecar] ${msg}`);
    return {
      success: false,
      printed: false,
      exitCode: 2,
      error: msg,
    };
  }

  // 1. Grava payload atômico em arquivo temporário
  const tempFileName = `imp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.json`;
  const tempBaseDir = typeof app !== 'undefined' && app && app.getPath ? app.getPath('temp') : os.tmpdir();
  const tempFilePath = path.join(tempBaseDir, tempFileName);

  try {
    await fs.promises.writeFile(tempFilePath, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (err) {
    const errorMsg = `Falha ao gravar arquivo temporário de imposição: ${err.message}`;
    console.error(`[ImposerSidecar] ${errorMsg}`);
    return {
      success: false,
      printed: false,
      exitCode: 2,
      error: errorMsg,
    };
  }

  console.log(`[ImposerSidecar] Iniciando ImpositorKonica com dados: ${tempFilePath}`);

  return new Promise((resolve) => {
    const child = spawn(exePath, ['--data', tempFilePath], {
      windowsHide: false,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderrOutput = '';
    let stdoutOutput = '';

    child.stdout?.on('data', (chunk) => {
      stdoutOutput += chunk.toString();
    });

    child.stderr?.on('data', (chunk) => {
      stderrOutput += chunk.toString();
    });

    child.on('error', (err) => {
      console.error(`[ImposerSidecar] Erro no processo filho: ${err.message}`);
      cleanupTempFile(tempFilePath);
      resolve({
        success: false,
        printed: false,
        exitCode: 2,
        error: `Erro ao iniciar processo nativo: ${err.message}`,
      });
    });

    child.on('close', (code) => {
      const exitCode = typeof code === 'number' ? code : 1;
      console.log(`[ImposerSidecar] Processo encerrado com código: ${exitCode}`);
      if (stdoutOutput.trim()) console.log(`[ImposerSidecar stdout] ${stdoutOutput.trim()}`);
      if (stderrOutput.trim()) console.warn(`[ImposerSidecar stderr] ${stderrOutput.trim()}`);

      cleanupTempFile(tempFilePath);

      // Códigos de Saída ADR-015
      switch (exitCode) {
        case 0:
          resolve({ success: true, printed: true, exitCode: 0 });
          break;
        case 1:
          resolve({ success: true, printed: false, exitCode: 1 });
          break;
        case 2:
          resolve({
            success: false,
            printed: false,
            exitCode: 2,
            error: stderrOutput || 'Erro de validação de argumentos ou JSON corrompido.',
          });
          break;
        case 3:
          resolve({
            success: false,
            printed: false,
            exitCode: 3,
            error: stderrOutput || 'Falha na fila de impressão do Windows (System.Printing).',
          });
          break;
        default:
          resolve({
            success: false,
            printed: false,
            exitCode,
            error: stderrOutput || `Processo finalizado com código: ${exitCode}`,
          });
          break;
      }
    });
  });
}

function cleanupTempFile(filePath) {
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.warn(`[ImposerSidecar] Aviso ao remover arquivo temporário: ${err.message}`);
    }
  });
}

function registerImpositionSidecar() {
  ipcMain.handle('imposition:open', async (_event, payload) => {
    return await launchImpositionSidecar(payload);
  });
  console.log('[ImposerSidecar] Canal IPC "imposition:open" registrado.');
}

module.exports = {
  resolveImposerExecutable,
  launchImpositionSidecar,
  registerImpositionSidecar,
};
