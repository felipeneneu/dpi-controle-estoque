import { readdir, readFile } from 'node:fs/promises';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { eq, and, or, like, sql } from 'drizzle-orm';
import {
  mimakiTestJobs,
  mimakiJobs,
  bobinas,
  stockItems,
  stockTransactions,
  garrafas,
  type MimakiTestJob,
  type MimakiJob,
} from '../db/schema.js';
import { db } from '../db/index.js';
import { newId } from './ids.js';
import { toPrecision } from './math.js';
import { parsePrintCsv, cleanLayerSuffix, type MimakiTestParsedRow } from './mimaki-test-parser.js';

export const MIMAKI_TEST_CHANNEL = 'mimaki-teste';

export const MIMAKI_MACHINE_ID = 'c6dfb08e-07fe-45c9-b978-be8d8f40a6bb';

export const DEFAULT_MIMAKI_BASE_DIR =
  'J:\\DPI Inteligência Gráfica\\Gráfica Rápida\\Arquivos para Impressão\\Mimaki UCJV 300-75';

const DEFAULT_SOURCE_DIR =
  'J:\\DPI Inteligência Gráfica\\Gráfica Rápida\\Arquivos para Impressão\\Mimaki UCJV 300-75\\jobs_tracker_print\\UCJV300 BE86B073';

export function mimakiTestSourceDir(): string {
  return process.env.MIMAKI_TEST_SOURCE_DIR?.trim() || DEFAULT_SOURCE_DIR;
}

export function mimakiBaseDir(): string {
  return process.env.MIMAKI_BASE_DIR?.trim() || DEFAULT_MIMAKI_BASE_DIR;
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

function computeStatus(current: number, min: number): 'AVAILABLE' | 'LOW_STOCK' | 'OUT_OF_STOCK' {
  if (current <= 0) return 'OUT_OF_STOCK';
  if (current <= min) return 'LOW_STOCK';
  return 'AVAILABLE';
}

/**
 * Lê dimensões físicas do PDF direto da tag /MediaBox.
 */
function readPdfMediaBox(filePath: string): { widthMm: number; heightMm: number } | null {
  try {
    if (!existsSync(filePath)) return null;
    const buf = readFileSync(filePath);
    const str = buf.toString('latin1');
    const m = str.match(/\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/);
    if (!m) return null;
    const wPt = Math.abs(parseFloat(m[3]) - parseFloat(m[1]));
    const hPt = Math.abs(parseFloat(m[4]) - parseFloat(m[2]));
    const ptToMm = 25.4 / 72.0;
    return {
      widthMm: Number((wPt * ptToMm).toFixed(2)),
      heightMm: Number((hPt * ptToMm).toFixed(2)),
    };
  } catch {
    return null;
  }
}

/**
 * Procura o arquivo PDF na pasta da Mimaki no J: para extrair dimensões exatas.
 * Realiza busca inteligente na raiz, subpastas ativas e em FINALIZADAS.
 */
function findPdfDimensions(
  keyFilename: string,
  orderCode?: string | null,
  rawFilenames?: string[],
): { widthMm: number; heightMm: number; linearAdvanceMm: number } | null {
  const baseDir = mimakiBaseDir();
  try {
    if (!existsSync(baseDir)) return null;

    const candidates = new Set<string>();
    candidates.add(keyFilename);
    candidates.add(cleanLayerSuffix(keyFilename));
    candidates.add(keyFilename.replace(/\s*copiar/gi, '').trim());
    candidates.add(cleanLayerSuffix(keyFilename).replace(/\s*copiar/gi, '').trim());
    if (rawFilenames) {
      for (const rf of rawFilenames) {
        candidates.add(rf);
        candidates.add(cleanLayerSuffix(rf));
        candidates.add(rf.replace(/\s*copiar/gi, '').trim());
      }
    }

    function checkCandidate(folderPath: string): { widthMm: number; heightMm: number; linearAdvanceMm: number } | null {
      for (const name of candidates) {
        const p = join(folderPath, name.endsWith('.pdf') ? name : `${name}.pdf`);
        if (existsSync(p)) {
          const dim = readPdfMediaBox(p);
          if (dim && (dim.widthMm > 0 || dim.heightMm > 0)) {
            // Regra prepress da Mimaki UCJV300-75:
            // A largura imprimível do rolo é de até 750mm.
            // Se uma dimensão for > 750mm e a outra <= 750mm, a menor é a largura transversal e a maior é o avanço linear no rolo.
            let linearAdvanceMm = dim.heightMm;
            if (dim.widthMm > 750 && dim.heightMm <= 750) {
              linearAdvanceMm = dim.widthMm;
            }
            return {
              widthMm: dim.widthMm,
              heightMm: dim.heightMm,
              linearAdvanceMm,
            };
          }
        }
      }
      return null;
    }

    // 1. Diretamente na raiz
    const direct = checkCandidate(baseDir);
    if (direct) return direct;

    // 2. Subpastas de ordens de serviço ativas na raiz
    const entries = readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'jobs_tracker_print') continue;
      if (entry.name === 'FINALIZADAS') continue;

      const subDir = join(baseDir, entry.name);
      const inSaida = checkCandidate(join(subDir, 'Saida'));
      if (inSaida) return inSaida;

      const inRootSub = checkCandidate(subDir);
      if (inRootSub) return inRootSub;
    }

    // 3. Pastas em FINALIZADAS (quando o pedido já foi arquivado)
    const finalizadasDir = join(baseDir, 'FINALIZADAS');
    if (existsSync(finalizadasDir)) {
      const currentYear = new Date().getFullYear().toString();
      const yearDir = join(finalizadasDir, currentYear);
      if (existsSync(yearDir)) {
        const monthEntries = readdirSync(yearDir, { withFileTypes: true });
        for (const mEntry of monthEntries) {
          if (!mEntry.isDirectory()) continue;
          const monthDir = join(yearDir, mEntry.name);
          const osEntries = readdirSync(monthDir, { withFileTypes: true });
          for (const osEntry of osEntries) {
            if (!osEntry.isDirectory()) continue;
            if (orderCode && !osEntry.name.includes(orderCode)) continue;

            const osDir = join(monthDir, osEntry.name);
            const inSaida = checkCandidate(join(osDir, 'Saida'));
            if (inSaida) return inSaida;

            const inRoot = checkCandidate(osDir);
            if (inRoot) return inRoot;
          }
        }
      }
    }
  } catch {
    // Ignora erro de acesso a disco
  }
  return null;
}

async function readCsvWithFallback(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('\uFFFD')) {
    text = new TextDecoder('windows-1252').decode(buf);
  }
  return text;
}

/**
 * Realiza a baixa de bobina e tintas para uma impressão física confirmada ('OK').
 * Idempotente por timestamp físico [PrintS: ...].
 */
async function deductStockForPhysicalPrint(
  app: FastifyInstance,
  row: MimakiTestParsedRow,
  testJob: MimakiTestJob,
  mimakiJob: MimakiJob | null,
  linearMeters: number | null,
  resolvedHeightMm: number | null,
) {
  const printTime = row.printSTime ?? row.ripSTime ?? '';
  let bobinaId: string | null = null;
  let stockItemId: string | null = null;

  // -------------------------------------------------------------
  // 1. DÉBITO DA BOBINA
  // -------------------------------------------------------------
  const bobinaCode = row.filenameMeta.bobinaSerial;
  let targetBobina = null;

  if (bobinaCode) {
    const clean = bobinaCode.toUpperCase().trim();
    // Busca exata pelo serial
    targetBobina = await db
      .select()
      .from(bobinas)
      .where(sql`UPPER(TRIM(${bobinas.serial})) = ${clean}`)
      .get();

    // Fallback: busca sem hífen/underline (ex: BOB3702 vs BOB-3702)
    if (!targetBobina) {
      const stripped = clean.replace(/[-_\s]/g, '');
      targetBobina = await db
        .select()
        .from(bobinas)
        .where(sql`REPLACE(REPLACE(UPPER(${bobinas.serial}), '-', ''), '_', '') = ${stripped}`)
        .get();
    }
  }

  // Fallback: se não informado serial no nome do arquivo, busca bobina ativa na Mimaki
  if (!targetBobina) {
    targetBobina = await db
      .select()
      .from(bobinas)
      .where(
        and(
          eq(bobinas.state, 'IN_USE'),
          eq(bobinas.location, `machine:${MIMAKI_MACHINE_ID}`)
        )
      )
      .get();
  }

  if (targetBobina) {
    bobinaId = targetBobina.id;
    stockItemId = targetBobina.stockItemId;

    if (linearMeters && linearMeters > 0) {
      // Idempotência: verifica se esta impressão física já gerou transação
      const txExists = await db
        .select({ id: stockTransactions.id })
        .from(stockTransactions)
        .where(
          and(
            eq(stockTransactions.itemId, targetBobina.stockItemId),
            like(stockTransactions.reason, `%[PrintS: ${printTime}]%`)
          )
        )
        .get();

      if (!txExists) {
        const remaining = targetBobina.metersRemaining ?? 0;
        const newRemaining = Math.max(0, toPrecision(remaining - linearMeters, 3));
        const isFinished = newRemaining <= 0.05; // 5 cm ou menos = bobina finalizada
        const newState = isFinished ? 'USED' : (targetBobina.state === 'NEW' ? 'IN_USE' : targetBobina.state);

        await db
          .update(bobinas)
          .set({
            metersRemaining: newRemaining,
            state: newState,
            finishedAt: isFinished ? new Date() : targetBobina.finishedAt,
            bobinaOpenedAt: targetBobina.bobinaOpenedAt ?? new Date(),
          })
          .where(eq(bobinas.id, targetBobina.id));

        // Atualiza item pai do estoque geral
        const parentItem = await db
          .select()
          .from(stockItems)
          .where(eq(stockItems.id, targetBobina.stockItemId))
          .get();

        if (parentItem) {
          const newQty = Math.max(0, toPrecision(parentItem.currentQuantity - linearMeters, 3));
          const status = computeStatus(newQty, parentItem.minQuantity);
          await db
            .update(stockItems)
            .set({ currentQuantity: newQty, status })
            .where(eq(stockItems.id, parentItem.id));
        }

        // Insere transação no histórico
        await db.insert(stockTransactions).values({
          id: newId(),
          itemId: targetBobina.stockItemId,
          type: 'OUT',
          quantity: linearMeters,
          reason: `Mimaki consumo bobina: ${row.keyFilename} [Bobina ${targetBobina.serial}] [PrintS: ${printTime}]`,
          userId: 'system',
          userName: 'Mimaki Watcher',
        });

        app.log.info(
          `[mimaki-test] Bobina ${targetBobina.serial} debitada: -${linearMeters}m (restante: ${newRemaining}m, estado: ${newState})`
        );

        app.io?.to('estoque').emit('stock:deducted', {
          itemId: targetBobina.stockItemId,
          itemName: parentItem?.name ?? `Bobina ${targetBobina.serial}`,
          quantity: linearMeters,
          unit: parentItem?.unit ?? 'm',
          jobName: row.keyFilename,
          bobinaSerial: targetBobina.serial,
          metersRemaining: newRemaining,
          isFinished,
        });

        if (isFinished) {
          app.io?.to('estoque').emit('bobina:finished', {
            bobinaId: targetBobina.id,
            serial: targetBobina.serial,
            itemName: parentItem?.name,
            message: `Bobina ${targetBobina.serial} zerou (${newRemaining}m restantes) e foi finalizada como USED.`,
          });
        }
      }
    }
  }

  // -------------------------------------------------------------
  // 2. DÉBITO DAS TINTAS UV
  // -------------------------------------------------------------
  const inkMap = [
    { color: 'Cyan', amount: row.inks.cyan },
    { color: 'Magenta', amount: row.inks.magenta },
    { color: 'Yellow', amount: row.inks.yellow },
    { color: 'Black', amount: row.inks.black },
    { color: 'White', amount: toPrecision(row.inks.white1 + row.inks.white2, 4) },
    { color: 'Verniz', amount: toPrecision(row.inks.varnish1 + row.inks.varnish2, 4) },
  ];

  const allUvInks = await db
    .select()
    .from(stockItems)
    .where(eq(stockItems.category, 'INK_SUPPLY'))
    .all();

  for (const { color, amount } of inkMap) {
    if (amount <= 0) continue;

    const inkItem = allUvInks.find(
      (i) =>
        i.name.toLowerCase().includes('uv') &&
        (i.name.toLowerCase().includes(color.toLowerCase()) ||
          (color === 'Verniz' && (i.name.toLowerCase().includes('verniz') || i.name.toLowerCase().includes('clear'))))
    );

    if (!inkItem) continue;

    // Idempotência para o canal de tinta nesta impressão física
    const inkTxExists = await db
      .select({ id: stockTransactions.id })
      .from(stockTransactions)
      .where(
        and(
          eq(stockTransactions.itemId, inkItem.id),
          like(stockTransactions.reason, `%[PrintS: ${printTime}]%`)
        )
      )
      .get();

    if (!inkTxExists) {
      // Se houver garrafa ativa instalada na máquina, debita dela
      const activeGarrafa = await db
        .select()
        .from(garrafas)
        .where(
          and(
            eq(garrafas.stockItemId, inkItem.id),
            eq(garrafas.state, 'IN_USE'),
            eq(garrafas.location, `machine:${MIMAKI_MACHINE_ID}`)
          )
        )
        .get();

      if (activeGarrafa) {
        const newMl = Math.max(0, toPrecision((activeGarrafa.mlRemaining ?? 0) - amount, 4));
        const isGarrafaFinished = newMl <= 0;
        await db
          .update(garrafas)
          .set({
            mlRemaining: newMl,
            state: isGarrafaFinished ? 'USED' : activeGarrafa.state,
            finishedAt: isGarrafaFinished ? new Date() : activeGarrafa.finishedAt,
          })
          .where(eq(garrafas.id, activeGarrafa.id));
      }

      // Atualiza estoque geral do stock_item
      const newStockQty = Math.max(0, toPrecision(inkItem.currentQuantity - amount, 4));
      const status = computeStatus(newStockQty, inkItem.minQuantity);
      await db
        .update(stockItems)
        .set({ currentQuantity: newStockQty, status })
        .where(eq(stockItems.id, inkItem.id));

      await db.insert(stockTransactions).values({
        id: newId(),
        itemId: inkItem.id,
        type: 'OUT',
        quantity: amount,
        reason: `Mimaki tinta UV ${color}: ${row.keyFilename} [PrintS: ${printTime}]`,
        userId: 'system',
        userName: 'Mimaki Watcher',
      });

      app.io?.to('estoque').emit('stock:deducted', {
        itemName: inkItem.name,
        quantity: amount,
        unit: inkItem.unit,
        jobName: row.keyFilename,
      });

      app.log.info(`[mimaki-test] Tinta UV ${color} debitada: -${amount}cc (restante: ${newStockQty}ml)`);
    }
  }

  // -------------------------------------------------------------
  // 3. ATUALIZA mimaki_test_jobs E SINCRONIZA mimaki_jobs
  // -------------------------------------------------------------
  await db
    .update(mimakiTestJobs)
    .set({
      stockDeducted: true,
      bobinaId: bobinaId ?? testJob.bobinaId,
      stockItemId: stockItemId ?? testJob.stockItemId,
      mimakiJobId: mimakiJob?.id ?? testJob.mimakiJobId,
      heightMm: resolvedHeightMm && resolvedHeightMm > 0 ? resolvedHeightMm : testJob.heightMm,
      linearMeters: linearMeters ?? testJob.linearMeters,
      parsedBobinaSerial: bobinaCode ?? testJob.parsedBobinaSerial,
    })
    .where(eq(mimakiTestJobs.id, testJob.id));

  // Trava mimaki_jobs correspondente para que o M2M NUNCA duplique a baixa e atualiza dados
  if (mimakiJob) {
    await db
      .update(mimakiJobs)
      .set({
        stockDeducted: true,
        materialStatus: stockItemId ? 'BOUND' : mimakiJob.materialStatus,
        stockItemId: stockItemId ?? mimakiJob.stockItemId,
        lengthMeters: linearMeters && linearMeters > 0 ? linearMeters : mimakiJob.lengthMeters,
      })
      .where(eq(mimakiJobs.id, mimakiJob.id));
    app.log.info(`[mimaki-test] mimaki_jobs ${mimakiJob.id} atualizado com baixa e sincronizado`);
  }
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
          const printTime = row.printSTime ?? row.ripSTime ?? '';

          // 1. Procura registros existentes em mimaki_test_jobs para este print físico
          const existingTestJobs = await db
            .select()
            .from(mimakiTestJobs)
            .where(
              and(
                eq(mimakiTestJobs.sourceFile, fileName),
                eq(mimakiTestJobs.printSTime, printTime)
              )
            )
            .all();

          let testJob: typeof mimakiTestJobs.$inferSelect | null = null;
          if (existingTestJobs.length > 0) {
            // Se existiam múltiplas linhas (ex: COR e BRANCO separadas anteriormente), mescla na principal
            testJob = existingTestJobs.find((t) => t.keyFilename === row.keyFilename) ?? existingTestJobs[0];
            const duplicateRows = existingTestJobs.filter((t) => t.id !== testJob!.id);
            for (const dup of duplicateRows) {
              if (dup.stockDeducted) {
                testJob.stockDeducted = true;
              }
              await db.delete(mimakiTestJobs).where(eq(mimakiTestJobs.id, dup.id));
            }
          }

          // 2. Cruza com mimaki_jobs para obter dados do print ou RIP correspondente
          let mimakiJob = printTime
            ? await db
                .select()
                .from(mimakiJobs)
                .where(
                  or(
                    eq(mimakiJobs.folderTimestamp, printTime),
                    sql`${mimakiJobs.folderTimestamp} LIKE ${printTime + '%'}`
                  )
                )
                .get()
            : await db
                .select()
                .from(mimakiJobs)
                .where(eq(mimakiJobs.jobName, row.keyFilename))
                .get();

          // 3. Resolve dimensões e avanço linear exato (1º mimaki_jobs se >50mm, 2º PDF MediaBox na J:, 3º Imposição, 4º Estimativa geométrica, 5º filename)
          let resolvedHeightMm: number | null = null;
          let resolvedWidthMm: number | null = null;
          if (mimakiJob?.heightMm && mimakiJob.heightMm > 50) {
            resolvedHeightMm = mimakiJob.heightMm;
            resolvedWidthMm = mimakiJob.widthMm ?? null;
          } else {
            const pdfDim = findPdfDimensions(row.keyFilename, row.filenameMeta.orderCode, row.rawFilenames);
            if (pdfDim) {
              resolvedHeightMm = pdfDim.linearAdvanceMm;
              resolvedWidthMm = pdfDim.widthMm;
            } else if (row.filenameMeta.impostoHeightMm && row.filenameMeta.impostoHeightMm > 0) {
              resolvedHeightMm = row.filenameMeta.impostoHeightMm;
              resolvedWidthMm = row.filenameMeta.impostoWidthMm ?? null;
            } else if (row.filenameMeta.estimatedLinearMeters && row.filenameMeta.estimatedLinearMeters > 0) {
              resolvedHeightMm = Number((row.filenameMeta.estimatedLinearMeters * 1000).toFixed(2));
              resolvedWidthMm = row.filenameMeta.impostoWidthMm ?? row.filenameMeta.widthMm ?? null;
            } else if (row.filenameMeta.heightMm && row.filenameMeta.heightMm > 0) {
              resolvedHeightMm = row.filenameMeta.heightMm;
              resolvedWidthMm = row.filenameMeta.widthMm ?? null;
            }
          }

          // 4. Calcula metragem linear = (altura_mm * arrange_cnt) / 1000
          const arrange = row.arrangeCnt ?? 1;
          const linearMeters =
            resolvedHeightMm && resolvedHeightMm > 0
              ? toPrecision((resolvedHeightMm * arrange) / 1000, 3)
              : null;

          // 4.1 Sincroniza mimaki_jobs para manter a aba oficial "Jobs" da Mimaki sempre atualizada
          if (!mimakiJob) {
            const newMimakiJobId = newId();
            let materialStatus: 'BOUND' | 'PENDING_BIND' = 'PENDING_BIND';
            let matchedStockItemId: string | null = null;

            if (row.filenameMeta.material) {
              const rawLower = row.filenameMeta.material.toLowerCase().replace(/[\s\-_,./()ºª]+/g, '');
              const mediaItems = await db
                .select()
                .from(stockItems)
                .where(eq(stockItems.category, 'PAPER_MEDIA'))
                .all();

              const matched = mediaItems.find((item) => {
                const nameLower = item.name.toLowerCase().replace(/[\s\-_,./()ºª]+/g, '');
                return nameLower.includes(rawLower) || rawLower.includes(nameLower);
              });
              if (matched) {
                matchedStockItemId = matched.id;
                materialStatus = 'BOUND';
              }
            }

            const folderTs = printTime || new Date().toISOString();
            await db
              .insert(mimakiJobs)
              .values({
                id: newMimakiJobId,
                machineId: MIMAKI_MACHINE_ID,
                folderTimestamp: folderTs,
                jobName: row.keyFilename,
                orderCode: row.filenameMeta.orderCode ?? null,
                quantityUnits: row.filenameMeta.units ?? 1,
                pages: 1,
                copyNumber: arrange,
                totalPrint: arrange,
                widthMm: resolvedWidthMm ?? row.filenameMeta.widthMm ?? 700,
                heightMm: resolvedHeightMm ?? row.filenameMeta.heightMm ?? 0,
                lengthMeters: linearMeters ?? 0,
                inkCyanCc: row.inks.cyan,
                inkMagentaCc: row.inks.magenta,
                inkYellowCc: row.inks.yellow,
                inkBlackCc: row.inks.black,
                inkWhite1Cc: row.inks.white1,
                inkWhite2Cc: row.inks.white2,
                inkVarnish1Cc: row.inks.varnish1,
                inkVarnish2Cc: row.inks.varnish2,
                inkTotalCc: row.inks.total,
                rawMaterialName: row.filenameMeta.material ?? null,
                materialStatus,
                stockItemId: matchedStockItemId,
                stockDeducted: testJob?.stockDeducted ?? false,
              })
              .onConflictDoNothing()
              .run();

            mimakiJob = await db
              .select()
              .from(mimakiJobs)
              .where(eq(mimakiJobs.id, newMimakiJobId))
              .get();
          } else {
            // Se mimakiJob já existia mas tinha metragem defasada ou incompleta, atualiza
            if (
              resolvedHeightMm &&
              resolvedHeightMm > 0 &&
              (!mimakiJob.lengthMeters || mimakiJob.lengthMeters < (linearMeters ?? 0) || mimakiJob.heightMm !== resolvedHeightMm)
            ) {
              await db
                .update(mimakiJobs)
                .set({
                  lengthMeters: linearMeters ?? mimakiJob.lengthMeters,
                  heightMm: resolvedHeightMm,
                  widthMm: resolvedWidthMm && resolvedWidthMm > 0 ? resolvedWidthMm : mimakiJob.widthMm,
                })
                .where(eq(mimakiJobs.id, mimakiJob.id));
            }
          }

          const errorsJson =
            row.filenameMeta.parseErrors.length > 0
              ? JSON.stringify([...new Set(row.filenameMeta.parseErrors)])
              : null;

          const detail =
            row.layers && row.layers.length > 1
              ? `Camadas mescladas: ${row.layers.join(', ')}`
              : row.resultDetail;

          if (testJob) {
            // Atualiza registro existente com consolidação e dimensões reais
            await db
              .update(mimakiTestJobs)
              .set({
                keyFilename: row.keyFilename,
                result: row.result,
                resultDetail: detail,
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
                parsedOrderCode: row.filenameMeta.orderCode ?? testJob.parsedOrderCode,
                parsedClient: row.filenameMeta.client ?? testJob.parsedClient,
                parsedMaterial: row.filenameMeta.material ?? testJob.parsedMaterial,
                parsedWidthMm: resolvedWidthMm ?? row.filenameMeta.widthMm ?? testJob.parsedWidthMm,
                parsedHeightMm: resolvedHeightMm ?? row.filenameMeta.heightMm ?? testJob.parsedHeightMm,
                parsedUnits: row.filenameMeta.units ?? testJob.parsedUnits,
                parsedCopies: row.filenameMeta.copies ?? testJob.parsedCopies,
                parsedBobinaSerial: row.filenameMeta.bobinaSerial ?? testJob.parsedBobinaSerial,
                heightMm: resolvedHeightMm && resolvedHeightMm > 0 ? resolvedHeightMm : testJob.heightMm,
                linearMeters: linearMeters ?? testJob.linearMeters,
                mimakiJobId: mimakiJob?.id ?? testJob.mimakiJobId,
                parseErrors: errorsJson,
              })
              .where(eq(mimakiTestJobs.id, testJob.id));

            testJob.heightMm = resolvedHeightMm && resolvedHeightMm > 0 ? resolvedHeightMm : testJob.heightMm;
            testJob.linearMeters = linearMeters ?? testJob.linearMeters;
            testJob.keyFilename = row.keyFilename;
          } else {
            const testJobId = newId();
            await db
              .insert(mimakiTestJobs)
              .values({
                id: testJobId,
                channel: MIMAKI_TEST_CHANNEL,
                sourceFile: fileName,
                keyFilename: row.keyFilename,
                result: row.result,
                resultDetail: detail,
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
                printSTime: printTime,
                printETime: row.printETime,
                parsedOrderCode: row.filenameMeta.orderCode,
                parsedClient: row.filenameMeta.client,
                parsedMaterial: row.filenameMeta.material,
                parsedWidthMm: resolvedWidthMm ?? row.filenameMeta.widthMm,
                parsedHeightMm: resolvedHeightMm ?? row.filenameMeta.heightMm,
                parsedUnits: row.filenameMeta.units,
                parsedCopies: row.filenameMeta.copies,
                parsedBobinaSerial: row.filenameMeta.bobinaSerial,
                heightMm: resolvedHeightMm && resolvedHeightMm > 0 ? resolvedHeightMm : null,
                linearMeters,
                stockDeducted: false,
                mimakiJobId: mimakiJob?.id ?? null,
                parseErrors: errorsJson,
              })
              .onConflictDoNothing()
              .run();

            testJob =
              (await db
                .select()
                .from(mimakiTestJobs)
                .where(
                  and(
                    eq(mimakiTestJobs.sourceFile, fileName),
                    eq(mimakiTestJobs.keyFilename, row.keyFilename),
                    eq(mimakiTestJobs.printSTime, printTime)
                  )
                )
                .get()) ?? null;

          }

          // 5. Se concluído com sucesso e estoque pendente de baixa, executa a baixa
          if (row.result === 'OK' && testJob && !testJob.stockDeducted) {
            await deductStockForPhysicalPrint(
              app,
              row,
              testJob,
              mimakiJob ?? null,
              linearMeters,
              resolvedHeightMm
            );
          }
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