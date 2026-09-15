import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { mimakiTestJobs } from '../db/schema.js';
import { db } from '../db/index.js';
import { newId } from './ids.js';
import { parsePrintCsv } from './mimaki-test-parser.js';

export const MIMAKI_TEST_CHANNEL = 'mimaki-teste';

const DEFAULT_SOURCE_DIR =
  'J:\\DPI Inteligência Gráfica\\Gráfica Rápida\\Arquivos para Impressão\\Mimaki UCJV 300-75\\jobs_tracker_print\\UCJV300 BE86B073';

export function mimakiTestSourceDir(): string {
  return process.env.MIMAKI_TEST_SOURCE_DIR?.trim() || DEFAULT_SOURCE_DIR;
}

export const mimakiTestHealth = {
  sourceAvailable: true,
  lastScanAt: null as string | null,
  lastScanError: null as string | null,
  lastInserted: 0,
};

export interface MimakiTestScanResult {
  inserted: number;
  files: number;
  sourceAvailable: boolean;
  error: string | null;
}

async function readCsvWithFallback(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('\uFFFD')) {
    text = new TextDecoder('windows-1252').decode(buf);
  }
  return text;
}

export async function scanMimakiTestSource(app: FastifyInstance): Promise<MimakiTestScanResult> {
  const dir = mimakiTestSourceDir();
  let inserted = 0;
  let files = 0;

  try {
    const entries = await readdir(dir);
    const csvFiles = entries.filter((name) => /_print\.csv$/i.test(name));
    files = csvFiles.length;
    mimakiTestHealth.sourceAvailable = true;
    mimakiTestHealth.lastScanError = null;

    for (const fileName of csvFiles) {
      try {
        const text = await readCsvWithFallback(join(dir, fileName));
        const rows = parsePrintCsv(text);
        for (const row of rows) {
          const errorsJson =
            row.filenameMeta.parseErrors.length > 0
              ? JSON.stringify([...new Set(row.filenameMeta.parseErrors)])
              : null;

          const res = await db
            .insert(mimakiTestJobs)
            .values({
              id: newId(),
              channel: MIMAKI_TEST_CHANNEL,
              sourceFile: fileName,
              keyFilename: row.keyFilename,
              result: row.result,
              resultDetail: row.resultDetail,
              arrangeCnt: row.arrangeCnt,
              inkCyanCc: row.inks.cyan,
              inkMagentaCc: row.inks.magenta,
              inkYellowCc: row.inks.yellow,
              inkBlackCc: row.inks.black,
              inkWhite1Cc: row.inks.white1,
              inkWhite2Cc: row.inks.white2,
              inkVarnish1Cc: row.inks.varnish1,
              inkVarnish2Cc: row.inks.varnish2,
              inkTotalCc: row.inks.total,
              ripSTime: row.ripSTime,
              ripETime: row.ripETime,
              printSTime: row.printSTime ?? row.ripSTime,
              printETime: row.printETime,
              parsedOrderCode: row.filenameMeta.orderCode,
              parsedClient: row.filenameMeta.client,
              parsedMaterial: row.filenameMeta.material,
              parsedWidthMm: row.filenameMeta.widthMm,
              parsedHeightMm: row.filenameMeta.heightMm,
              parsedUnits: row.filenameMeta.units,
              parsedCopies: row.filenameMeta.copies,
              parseErrors: errorsJson,
            })
            .onConflictDoNothing()
            .run();

          if (res.rowsAffected > 0) inserted++;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        app.log.warn(`[mimaki-test] Falha ao processar ${fileName}: ${msg}`);
      }
    }
  } catch (err: unknown) {
    mimakiTestHealth.sourceAvailable = false;
    const msg = err instanceof Error ? err.message : String(err);
    mimakiTestHealth.lastScanError = msg;
    app.log.warn(`[mimaki-test] Pasta de origem indisponível (${dir}): ${msg}`);
  }

  mimakiTestHealth.lastScanAt = new Date().toISOString();
  mimakiTestHealth.lastInserted = inserted;

  return {
    inserted,
    files,
    sourceAvailable: mimakiTestHealth.sourceAvailable,
    error: mimakiTestHealth.lastScanError,
  };
}

export function startMimakiTestWatcher(app: FastifyInstance): () => void {
  const enabled = (process.env.MIMAKI_TEST_WATCHER_ENABLED ?? 'true') !== 'false';
  if (!enabled) {
    app.log.info('[mimaki-test] Watcher desabilitado (MIMAKI_TEST_WATCHER_ENABLED=false)');
    return () => {};
  }

  const intervalMs = Number(process.env.MIMAKI_TEST_POLL_INTERVAL_MS || 30_000);
  app.log.info(`[mimaki-test] Watcher ativo — poll a cada ${intervalMs}ms em ${mimakiTestSourceDir()}`);

  const handle = setInterval(() => {
    void scanMimakiTestSource(app).catch((err: unknown) => {
      app.log.warn(`[mimaki-test] Poll falhou: ${err instanceof Error ? err.message : String(err)}`);
    });
  }, intervalMs);
  handle.unref?.();

  return () => clearInterval(handle);
}