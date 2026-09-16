import { ipcMain, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { getAutoImposerPath, getIllustratorImposerPath } from '../utils/path-resolver';

export interface FileInspectionResult {
  fileName: string;
  filePath: string;
  widthMm: number;
  heightMm: number;
  detectedBobinaTag: string | null;
}

export function registerImpositionOrchestratorIpc() {
  // 1. Inspeciona o arquivo arrastado (dimensões preliminares e tags de bobina no nome)
  ipcMain.handle('imposition:inspect-file', async (_, filePath: string): Promise<FileInspectionResult> => {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Arquivo inexistente: ${filePath}`);
    }

    const fileName = path.basename(filePath);

    // Heurística de Bobina: detecta se há padrão "BOB-XXXX" ou "CHP-XXXX" no nome
    const matchBobina = fileName.match(/(BOB-\d+|CHP-\d+)/i);
    const detectedBobinaTag = matchBobina ? matchBobina[1].toUpperCase() : null;

    // Leitura rápida de BoundingBox/MediaBox do PDF via stream
    let widthMm = 50;
    let heightMm = 50;
    try {
      const buffer = fs.readFileSync(filePath, { encoding: 'latin1', flag: 'r' });
      const mediaBoxMatch = buffer.match(/\/MediaBox\s*\[\s*([\d\.\-]+)\s+([\d\.\-]+)\s+([\d\.\-]+)\s+([\d\.\-]+)\s*\]/);
      if (mediaBoxMatch) {
        const ptW = Math.abs(parseFloat(mediaBoxMatch[3]) - parseFloat(mediaBoxMatch[1]));
        const ptH = Math.abs(parseFloat(mediaBoxMatch[4]) - parseFloat(mediaBoxMatch[2]));
        widthMm = Number(((ptW * 25.4) / 72.0).toFixed(1));
        heightMm = Number(((ptH * 25.4) / 72.0).toFixed(1));
      }
    } catch (_) {
      // Mantém tamanhos default caso o header do PDF seja encriptado
    }

    return {
      fileName,
      filePath,
      widthMm,
      heightMm,
      detectedBobinaTag,
    };
  });

  // 2. Acionador Unificado dos Motores
  ipcMain.handle('imposition:execute-job', async (_, payload) => {
    const { motor, jobId, params } = payload || {};
    const inicio = Date.now();
    let outputPath = '';

    try {
      if (motor === 'CLI_NET') {
        // Aciona AutoImposerCLI isolado usando o payload JSON de alta precisão
        const cliPath = getAutoImposerPath();
        const jsonPayload = {
          inputPdf: params.inputPath,
          outputPath: params.outputDir || path.dirname(params.inputPath),
          sheetWMm: params.sheetWMm || 700,
          sheetHMm: params.sheetHMm || 1000,
          cols: params.cols || 0,
          rows: params.rows || 0,
          gapMm: params.gapMm ?? 0,
          marginLeftMm: params.sideMarginMm ?? params.marginLeftMm ?? 0,
          marginTopMm: params.marginTopMm ?? 0,
          rotacionar90: Boolean(params.rotate),
          targetCopies: params.targetCopies || (params.cols && params.rows ? params.cols * params.rows : 0),
          pecaWMm: params.pecaWMm || (params.rotate ? params.arteHMm : params.arteWMm) || 0,
          pecaHMm: params.pecaHMm || (params.rotate ? params.arteWMm : params.arteHMm) || 0,
        };

        const stdout = await new Promise<string>((resolve, reject) => {
          execFile(
            cliPath,
            ['--json', JSON.stringify(jsonPayload)],
            { maxBuffer: 10 * 1024 * 1024 },
            (error, out, stderr) => {
              if (error) {
                // Fallback para chamada posicional caso --json falhe por sintaxe
                execFile(
                  cliPath,
                  [
                    params.inputPath,
                    (params.sheetWMm || 700).toString(),
                    (params.sheetHMm || 1000).toString(),
                    (params.gapMm || 0).toString(),
                    '0',
                    params.outputDir || path.dirname(params.inputPath),
                    (params.targetCopies || 0).toString(),
                  ],
                  (err2, out2, stderr2) => {
                    if (err2) reject(new Error(stderr2 || out2 || stderr || error.message));
                    else resolve(out2);
                  }
                );
              } else {
                resolve(out);
              }
            }
          );
        });

        // Extrai outputPath da linha RESULT_JSON (stdout do CLI é multiline)
        try {
          const resultLine = (stdout || '').split('\n').find((l) => l.startsWith('RESULT_JSON:'));
          if (resultLine) {
            const parsed = JSON.parse(resultLine.slice('RESULT_JSON:'.length).trim());
            if (parsed && parsed.outputPath) {
              outputPath = parsed.outputPath;
            }
          }
        } catch (_) {}
        if (!outputPath) {
          // Busca caminho na saída textual
          const m = stdout.match(/(?:Salvo em|Saída|Output):\s*([^\r\n]+)/i);
          if (m) outputPath = m[1].trim();
        }
      } else if (motor === 'ILLUSTRATOR_COM') {
        // Usa o mesmo IllustratorImposerCLI do Impor_Illustrator.bat (auto-cura do
        // TypeLib embutida + engine por máscara/prancha). Evita o PowerShell + DoJavaScriptFile,
        // que falha com TYPE_E_LIBNOTREGISTERED quando a instalação do Illustrator está dessincronizada.
        const cliPath = getIllustratorImposerPath();
        const outputPathCli = (params && params.outputPath) || params.outputDir || path.dirname(params.inputPath || '');
        const jsonPayload = {
          InputPath: params.inputPath,
          OutputPath: outputPathCli,
          SheetWMm: params.sheetWMm || 700,
          SheetHMm: params.sheetHMm || 0,
          Cols: params.cols || 0,
          Rows: params.rows || 0,
          GapMm: params.gapMm ?? 0,
          MarginSideMm: params.sideMarginMm ?? params.marginLeftMm ?? 0,
          MarginTopMm: params.marginTopMm ?? 0,
          Rotacionar90: typeof params.rotate === 'boolean' ? params.rotate : null,
          TargetCopies: params.targetCopies || (params.cols && params.rows ? params.cols * params.rows : 100),
          ManterAberto: params.manterAberto ?? (params.openAfter ? true : false),
        };

        const stdout = await new Promise((resolve, reject) => {
          execFile(
            cliPath,
            ['--json', JSON.stringify(jsonPayload)],
            { maxBuffer: 10 * 1024 * 1024 },
            (error, out, stderr) => {
              if (error) {
                const raw = [stderr, out, error.message].find(Boolean);
                try {
                  const jm = String(raw || '').match(/\{[\s\S]*\}/);
                  if (jm) {
                    const p = JSON.parse(jm[0]);
                    if (p && p.error) reject(new Error(p.error));
                    else reject(new Error(String(raw || '').trim() || error.message));
                    return;
                  }
                } catch (_) {}
                reject(new Error(String(raw || '').trim() || error.message));
              } else {
                resolve(out);
              }
            }
          );
        });

        // Extrai outputPath da linha JSON do stdout (engine.jsx retorna {"success":true,...})
        try {
          const resultLine = String(stdout || '').split('\n').map((l: string) => l.trim()).find((l: string) => l.startsWith('{'));
          if (resultLine) {
            const parsed = JSON.parse(resultLine);
            if (parsed && parsed.outputPath) {
              outputPath = parsed.outputPath;
            } else if (!outputPath && jsonPayload.OutputPath) {
              outputPath = jsonPayload.OutputPath;
            }
          }
        } catch (_) {}
        if (!outputPath) outputPath = jsonPayload.OutputPath;
      }

      const duracaoMs = Date.now() - inicio;
      return { success: true, duracaoMs, outputPath };
    } catch (err: any) {
      const duracaoMs = Date.now() - inicio;
      return { success: false, duracaoMs, error: err.message };
    }
  });
}
