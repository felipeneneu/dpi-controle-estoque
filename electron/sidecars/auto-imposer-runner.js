const { app, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const os = require('node:os');
const { getAutoImposerPath } = require('../utils/path-resolver.js');

/**
 * AutoImposerCLI runner — ADR-017 (imposição headless 70x100).
 * Monta os args com 4 margens independentes e rotacionamento, faz spawn do
 * executável nativo e reporta o resultado para a API via PATCH
 * /api/v1/automation/jobs/:id/result (token m2m ou JWT).
 */



/**
 * Monta os argumentos do CLI.
 *
 * Quando cols/rows/pecaWMm/pecaHMm estão presentes, envia --json com o payload
 * completo para que o CLI obedeça à grade calculada pelo frontend (evita que o
 * CLI recalcule a partir do MediaBox do PDF — que pode ser uma prancheta grande).
 *
 * Caso contrário, usa o modo legado de args posicionais.
 */
function buildAutoImposerArgs(payload) {
  const {
    inputPdf,
    sheetWMm,
    sheetHMm,
    gapMm,
    marginTopMm,
    marginRightMm,
    marginBottomMm,
    marginLeftMm,
    rotation,
    targetCopies,
    cols,
    rows,
    pecaWMm,
    pecaHMm,
  } = payload || {};

  const marginTop = typeof marginTopMm === 'number' ? marginTopMm : 0;
  const marginRight = typeof marginRightMm === 'number' ? marginRightMm : 0;
  const marginBottom = typeof marginBottomMm === 'number' ? marginBottomMm : 0;
  const marginLeft = typeof marginLeftMm === 'number' ? marginLeftMm : 0;
  const rotacionar90 = rotation === '90';

  // ── Modo JSON (Electron envia grade pronta) ─────────────────────
  if (typeof cols === 'number' && cols > 0 && typeof rows === 'number' && rows > 0 &&
      typeof pecaWMm === 'number' && typeof pecaHMm === 'number') {
    const jsonPayload = JSON.stringify({
      inputPdf,
      sheetWMm: sheetWMm ?? 700,
      sheetHMm: sheetHMm ?? 1000,
      cols,
      rows,
      gapMm: gapMm ?? 0,
      marginLeftMm: marginLeft,
      marginTopMm: marginTop,
      marginRightMm: marginRight,
      marginBottomMm: marginBottom,
      rotacionar90,
      targetCopies: targetCopies ?? (cols * rows),
      pecaWMm,
      pecaHMm,
    });
    return [inputPdf, '--json', jsonPayload];
  }

  // ── Modo legado (args posicionais) ──────────────────────────────
  const rot = rotation === '0' || rotation === '90' ? rotation : 'auto';
  const args = [
    String(inputPdf),
    String(sheetWMm ?? 700),
    String(sheetHMm ?? 1000),
    String(gapMm ?? 2),
    String(marginTop),
    '--margin-t',
    String(marginTop),
    '--margin-r',
    String(marginRight),
    '--margin-b',
    String(marginBottom),
    '--margin-l',
    String(marginLeft),
    '--rotation',
    rot,
  ];

  if (typeof targetCopies === 'number' && targetCopies > 0) {
    args.push('--copies', String(targetCopies));
  }

  args.push('--json');
  return args;
}

function parseResultJson(stdout) {
  const line = (stdout || '').split('\n').find((l) => l.startsWith('RESULT_JSON:'));
  if (!line) return null;
  const raw = line.slice('RESULT_JSON:'.length).trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[AutoImposerRunner] Falha ao parsear RESULT_JSON:', err.message);
    return null;
  }
}

function resolveAutomationSecret() {
  if (process.env.MIMAKI_INTEGRATION_SECRET) return process.env.MIMAKI_INTEGRATION_SECRET.trim();

  let backendEnvPath = null;
  if (typeof app !== 'undefined' && app && app.isPackaged && process.resourcesPath) {
    backendEnvPath = path.join(process.resourcesPath, 'graficaos', 'backend', '.env');
  } else {
    backendEnvPath = path.resolve(__dirname, '../../grafica-app/backend/.env');
  }
  try {
    if (!fs.existsSync(backendEnvPath)) return '';
    const content = fs.readFileSync(backendEnvPath, 'utf8');
    const m = content.match(
      /^\s*(?:MIMAKI_INTEGRATION_SECRET|AUTOMATION_RUNNER_SECRET)\s*=\s*(.+)\s*$/m
    );
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch (err) {
    console.warn('[AutoImposerRunner] Aviso ao ler .env do backend:', err.message);
  }
  return '';
}

function authHeaders(payload) {
  // Prioriza secret m2m resolveado localmente; senão, usa o JWT do operador.
  const secret = resolveAutomationSecret();
  if (secret) {
    return { 'x-api-secret': secret, 'Content-Type': 'application/json' };
  }
  if (payload && payload.token) {
    return { Authorization: `Bearer ${payload.token}`, 'Content-Type': 'application/json' };
  }
  return { 'Content-Type': 'application/json' };
}

async function reportJobStatus(baseUrl, jobId, payload, body) {
  const url = `${String(baseUrl || 'http://localhost:3001').replace(/\/+$/, '')}/api/automation/jobs/${encodeURIComponent(jobId)}/result`;
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: authHeaders(payload),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[AutoImposerRunner] PATCH result ${res.status}: ${text.slice(0, 200)}`);
      return { ok: false, status: res.status, body: text };
    }
    return { ok: true, status: res.status, body: await res.json() };
  } catch (err) {
    console.error(`[AutoImposerRunner] Falha ao reportar resultado: ${err.message}`);
    return { ok: false, status: 0, body: err.message };
  }
}

/**
 * Executa o AutoImposerCLI para um job e reporta o resultado na API (ADR-017).
 * Fluxo: PATCH running → spawn CLI → parse RESULT_JSON → PATCH done|failed.
 */
async function runAutoImposer(payload) {
  const {
    jobId,
    inputPdf,
    baseUrl,
    token,
    sheetWMm,
    sheetHMm,
    gapMm,
    marginTopMm,
    marginRightMm,
    marginBottomMm,
    marginLeftMm,
    rotation,
  } = payload || {};

  if (!jobId || !inputPdf) {
    return { success: false, exitCode: 2, error: 'payload inválido: jobId e inputPdf são obrigatórios' };
  }

  await reportJobStatus(baseUrl, jobId, payload, { status: 'running' });

  const exePath = getAutoImposerPath();
  if (!fs.existsSync(exePath)) {
    const msg = `AutoImposerCLI.exe não encontrado. Compile com 'dotnet publish sidecars/AutoImposerCLI/AutoImposerCLI.csproj'. Procurado em: ${exePath}`;
    console.error(`[AutoImposerRunner] ${msg}`);
    await reportJobStatus(baseUrl, jobId, payload, { status: 'failed', error: msg });
    return { success: false, exitCode: 2, error: msg };
  }

  if (!fs.existsSync(inputPdf)) {
    const msg = `PDF de entrada não encontrado: ${inputPdf}`;
    console.error(`[AutoImposerRunner] ${msg}`);
    await reportJobStatus(baseUrl, jobId, payload, { status: 'failed', error: msg });
    return { success: false, exitCode: 1, error: msg };
  }

  const args = buildAutoImposerArgs(payload);
  console.log('[AutoImposerRunner] Executando:', path.basename(exePath), args.join(' '));

  return new Promise((resolvePromise) => {
    const child = spawn(exePath, args, {
      windowsHide: true,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: path.dirname(exePath),
    });

    let stdout = '';
    let stderr = '';
    let handled = false;

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    const finish = async (exitCode, result) => {
      if (handled) return;
      handled = true;

      const parsed = result !== undefined ? result : (exitCode === 0 ? parseResultJson(stdout) : null);

      if (exitCode === 0 && parsed) {
        let outputBytes = null;
        if (parsed.outputPath) {
          try {
            outputBytes = fs.statSync(parsed.outputPath).size;
          } catch {
            outputBytes = null;
          }
        }
        await reportJobStatus(baseUrl, jobId, payload, {
          status: 'done',
          outputPath: parsed.outputPath ?? null,
          outputUnits: parsed.grid && typeof parsed.grid.units === 'number' ? parsed.grid.units : null,
          outputBytes,
          checksum: parsed.checksum ?? null,
          durationMs: typeof parsed.durationMs === 'number' ? parsed.durationMs : null,
        });
        return resolvePromise({ success: true, exitCode, result: parsed });
      }

      const errorMessage =
        stderr.trim() ||
        (parsed && parsed.error) ||
        (exitCode === 0 && !parsed ? 'CLI finalizou sem RESULT_JSON (rode com --json).' : `Processo finalizado com código ${exitCode}`);

      await reportJobStatus(baseUrl, jobId, payload, {
        status: 'failed',
        error: errorMessage,
      });
      return resolvePromise({ success: false, exitCode, error: errorMessage, result: parsed });
    };

    child.on('error', (err) => {
      console.error(`[AutoImposerRunner] Erro no processo filho: ${err.message}`);
      finish(2, null);
    });

    child.on('close', (code) => {
      const exitCode = typeof code === 'number' ? code : 1;
      if (stdout.trim()) console.log(`[AutoImposerRunner stdout] ${stdout.trim().slice(0, 2000)}`);
      if (stderr.trim()) console.warn(`[AutoImposerRunner stderr] ${stderr.trim().slice(0, 2000)}`);
      finish(exitCode);
    });
  });
}

async function pickArtFile(win) {
  try {
    const result = await dialog.showOpenDialog(win, {
      title: 'Selecionar arte (PDF) para imposição',
      filters: [{ name: 'Arte PDF', extensions: ['pdf'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  } catch (err) {
    console.error('[AutoImposerRunner] Erro ao abrir seletor de arquivo:', err.message);
    return null;
  }
}

/**
 * Registra os canais IPC do runner no processo Main.
 */
function registerAutoImposerRunner() {
  ipcMain.handle('automation:impose', async (_event, payload) => {
    return await runAutoImposer(payload);
  });

  ipcMain.handle('automation:pick-art', async (event) => {
    const win = event.sender;
    return await pickArtFile(win);
  });

  console.log(
    '[AutoImposerRunner] Canais IPC "automation:impose" e "automation:pick-art" registrados.'
  );
}

module.exports = {
  getAutoImposerPath,
  buildAutoImposerArgs,
  parseResultJson,
  runAutoImposer,
  registerAutoImposerRunner,
};