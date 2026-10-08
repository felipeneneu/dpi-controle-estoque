import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, or, like, sql } from 'drizzle-orm';
import { mimakiJobs, stockItems, stockTransactions, notifications, users, garrafas, bobinas, machines, inkConsumptionLog } from '../db/schema.js';
import { db } from '../db/index.js';
import { newId } from '../lib/ids.js';
import { m2mAuth } from '../middleware/m2m-auth.js';
import { authenticate } from '../middleware/auth.js';
import { toPrecision } from '../lib/math.js';
import { dispatchStockAlert } from '../lib/notification-resend.js';
import {
  enqueueMimakiJob,
  registerMimakiProcessor,
  type MimakiJobInput,
  type MimakiJobResult,
} from '../lib/mimaki-queue.js';

function computeStatus(current: number, min: number): 'AVAILABLE' | 'LOW_STOCK' | 'OUT_OF_STOCK' {
  if (current <= 0) return 'OUT_OF_STOCK';
  if (current <= min) return 'LOW_STOCK';
  return 'AVAILABLE';
}

export interface MimakiJobDeductData {
  id: string;
  jobName: string;
  lengthMeters?: number | null;
  stockItemId?: string | null;
  bobinaId?: string | null;
  machineId?: string | null;
  orderCode?: string | null;
  totalPrint?: number | null;
  copyNumber?: number | null;
  quantityUnits?: number | null;
  pages?: number | null;
  inkCyanCc?: number | null;
  inkMagentaCc?: number | null;
  inkYellowCc?: number | null;
  inkBlackCc?: number | null;
  inkWhite1Cc?: number | null;
  inkWhite2Cc?: number | null;
  inkVarnish1Cc?: number | null;
  inkVarnish2Cc?: number | null;
  isRebind?: boolean;
}

export interface MimakiDeductResult {
  deductedSubstrate: boolean;
  deductedInksCount: number;
  /** Preenchido quando a operacao abortou sem escrever nada. Para o operador. */
  motivo?: string;
  /**
   * O debito ja existia e foi reconhecido (nao e falha): `stockDeducted` veio
   * ligado e ha transacao correspondente. A rota usa isto para responder "ja
   * baixado" em vez de "nao consegui debitar".
   */
  jaDebitado?: boolean;
  /**
   * Mantido para compatibilidade retroativa de tipos.
   */
  debitoParcial?: boolean;
}

export async function deductMimakiStockForJob(
  app: FastifyInstance,
  job: MimakiJobDeductData,
  userId?: string | null,
): Promise<MimakiDeductResult> {
  // Garante ator válido no banco (FK para users.id)
  let actorId = userId && userId.trim() ? userId : 'system';
  const userExists = await db.select({ id: users.id }).from(users).where(eq(users.id, actorId)).get();
  if (!userExists) {
    actorId = 'system';
  }

  let deductedSubstrate = false;
  let deductedInksCount = 0;

  // Anti-duplicação: verifica transações já registradas para este job
  const jobRow = await db.select().from(mimakiJobs).where(eq(mimakiJobs.id, job.id)).get();

  const allTxs = await db
    .select({
      id: stockTransactions.id,
      reason: stockTransactions.reason,
      itemId: stockTransactions.itemId,
      quantity: stockTransactions.quantity,
      type: stockTransactions.type,
    })
    .from(stockTransactions)
    .where(like(stockTransactions.reason, `%${job.jobName}%`))
    .all();

  const shortId = job.id ? `[Job ${job.id.slice(0, 8)}]` : null;
  const otherJobPattern = /\[Job\s+([a-zA-Z0-9_-]{8})\]/;

  const txsDoJob = allTxs.filter((t) => {
    const r = t.reason ?? '';
    if (shortId && r.includes(shortId)) return true;
    const match = r.match(otherJobPattern);
    if (match) return false; // Pertence explicitamente a outro job
    return true; // Transação legada pré-diferenciação
  });

  const prevBobinaTx = txsDoJob.find((t) => t.type === 'OUT' && (t.reason ?? '').includes('[Bobina '));
  const prevFolhaTx = txsDoJob.find((t) => t.type === 'OUT' && (t.reason ?? '').includes('[Folhas]'));
  const temSubstrato = Boolean(prevBobinaTx || prevFolhaTx);

  if (!job.isRebind) {
    if (temSubstrato) {
      app.log.info(`[mimaki] Job ${job.id} (${job.jobName}) ja possui baixa de substrato registrada.`);
      return {
        deductedSubstrate: false,
        deductedInksCount: 0,
        jaDebitado: true,
        motivo: 'Este job ja tem metragem baixada do estoque.',
      };
    }

    if (jobRow?.stockDeducted) {
      const { mimakiTestJobs } = await import('../db/schema.js');
      const physicalDeducted = await db
        .select({ id: mimakiTestJobs.id })
        .from(mimakiTestJobs)
        .where(
          and(
            or(
              eq(mimakiTestJobs.keyFilename, job.jobName),
              jobRow?.orderCode ? eq(mimakiTestJobs.parsedOrderCode, jobRow.orderCode) : sql`1 = 0`
            ),
            eq(mimakiTestJobs.stockDeducted, true),
            sql`${mimakiTestJobs.bobinaId} IS NOT NULL`
          )
        )
        .get();

      if (physicalDeducted) {
        app.log.info(`[mimaki] Job ${job.id} (${job.jobName}) já teve baixa física registrada pelo watcher. Sincronizando stockDeducted=true.`);
        await db.update(mimakiJobs).set({ stockDeducted: true }).where(eq(mimakiJobs.id, job.id));
        return {
          deductedSubstrate: false,
          deductedInksCount: 0,
          jaDebitado: true,
          motivo: 'A baixa física deste job já foi registrada pelo watcher.',
        };
      }
    }
  }

  // 1. Substrato / Midia - resolvido antes de qualquer escrita
  const substrateEsperado = Boolean(
    job.stockItemId && (
      (job.lengthMeters && job.lengthMeters > 0) ||
      (job.totalPrint && job.totalPrint > 0) ||
      (job.quantityUnits && job.quantityUnits > 0) ||
      (job.pages && job.pages > 0)
    )
  );
  let activeBobina: typeof bobinas.$inferSelect | null = null;

  if (substrateEsperado) {
    const item = await db
      .select()
      .from(stockItems)
      .where(eq(stockItems.id, job.stockItemId!))
      .get();

    if (!item) {
      return {
        deductedSubstrate: false,
        deductedInksCount: 0,
        motivo: `Item de estoque ${job.stockItemId} nao encontrado no cadastro.`,
      };
    }

    const isFolhaOuUnidade = item.unit !== 'm' || item.unit === 'fls' || item.unit === 'rms' || item.unit === 'pk' || item.unit === 'un';

    if (!isFolhaOuUnidade && job.bobinaId) {
      activeBobina =
        (await db.select().from(bobinas).where(eq(bobinas.id, job.bobinaId)).get()) ?? null;
      if (!activeBobina) {
        return {
          deductedSubstrate: false,
          deductedInksCount: 0,
          motivo: `Bobina ${job.bobinaId} nao encontrada.`,
        };
      }
      if (activeBobina.stockItemId !== item.id) {
        return {
          deductedSubstrate: false,
          deductedInksCount: 0,
          motivo: `A bobina ${activeBobina.serial ?? activeBobina.id.slice(0, 8)} pertence a outro item de estoque.`,
        };
      }
    }

    // Se é rebind manual e já havia substrato debitado anteriormente:
    if (job.isRebind && temSubstrato) {
      if (!isFolhaOuUnidade && activeBobina && prevBobinaTx && (prevBobinaTx.reason ?? '').includes(`[Bobina ${activeBobina.serial}]`) && prevBobinaTx.itemId === item.id) {
        return {
          deductedSubstrate: false,
          deductedInksCount: 0,
          jaDebitado: true,
          motivo: 'Este job já está vinculado e debitado nesta mesma bobina.',
        };
      }

      if (isFolhaOuUnidade && prevFolhaTx && prevFolhaTx.itemId === item.id) {
        return {
          deductedSubstrate: false,
          deductedInksCount: 0,
          jaDebitado: true,
          motivo: 'Este job já está vinculado e debitado neste mesmo material de folhas.',
        };
      }

      // Operador solicitou troca de material: realiza o estorno da mídia anterior
      if (prevBobinaTx) {
        const match = prevBobinaTx.reason?.match(/\[Bobina\s+([^\]]+)\]/);
        const oldSerial = match ? match[1].trim() : null;
        if (oldSerial) {
          const oldBobina = await db.select().from(bobinas).where(eq(bobinas.serial, oldSerial)).get();
          if (oldBobina) {
            const refundMeters = prevBobinaTx.quantity;
            const restoredRemaining = toPrecision((oldBobina.metersRemaining ?? 0) + refundMeters, 3);
            await db.update(bobinas).set({
              metersRemaining: restoredRemaining,
              state: 'IN_USE',
            }).where(eq(bobinas.id, oldBobina.id));

            await db.insert(stockTransactions).values({
              id: newId(),
              itemId: oldBobina.stockItemId,
              type: 'IN',
              quantity: refundMeters,
              reason: `Estorno troca de mídia Mimaki: ${job.jobName}${job.id ? ` [Job ${job.id.slice(0, 8)}]` : ''} [Bobina ${oldBobina.serial}] (+${refundMeters}m)`,
              userId: actorId,
              userName: 'Mimaki Agent',
            });
          }
        }
      }

      if (prevFolhaTx) {
        const prevItem = await db.select().from(stockItems).where(eq(stockItems.id, prevFolhaTx.itemId)).get();
        if (prevItem) {
          const restoredQty = prevItem.currentQuantity + prevFolhaTx.quantity;
          await db.update(stockItems).set({
            currentQuantity: restoredQty,
          }).where(eq(stockItems.id, prevItem.id));

          await db.insert(stockTransactions).values({
            id: newId(),
            itemId: prevFolhaTx.itemId,
            type: 'IN',
            quantity: prevFolhaTx.quantity,
            reason: `Estorno troca de mídia Mimaki: ${job.jobName}${job.id ? ` [Job ${job.id.slice(0, 8)}]` : ''} [Folhas] (+${prevFolhaTx.quantity} ${prevItem.unit})`,
            userId: actorId,
            userName: 'Mimaki Agent',
          });
        }
      }
    }

    if (isFolhaOuUnidade) {
      const sheetsUsed = Math.max(1, job.totalPrint || job.copyNumber || job.quantityUnits || job.pages || 1);
      const existingTx = await db
        .select({ id: stockTransactions.id })
        .from(stockTransactions)
        .where(
          and(
            eq(stockTransactions.itemId, item.id),
            like(stockTransactions.reason, `%${job.jobName}% [Folhas]%`),
          ),
        )
        .get();

      if (!existingTx) {
        const newQty = Math.max(0, item.currentQuantity - sheetsUsed);
        const status = newQty <= 0 ? 'OUT_OF_STOCK' : newQty <= item.minQuantity ? 'LOW_STOCK' : 'AVAILABLE';

        await db.update(stockItems).set({ currentQuantity: newQty, status }).where(eq(stockItems.id, item.id));

        await db.insert(stockTransactions).values({
          id: newId(),
          itemId: item.id,
          type: 'OUT',
          quantity: sheetsUsed,
          reason: `Mimaki consumo folha/papel: ${job.jobName}${job.id ? ` [Job ${job.id.slice(0, 8)}]` : ''} [Folhas] — ${sheetsUsed} ${item.unit}`,
          userId: actorId,
          userName: 'Mimaki Agent',
        });

        deductedSubstrate = true;

        app.io.to('estoque').emit('stock:deducted', {
          itemName: item.name,
          quantity: sheetsUsed,
          unit: item.unit,
          jobName: job.jobName,
        });
      } else {
        deductedSubstrate = true;
      }
    } else {
      if (job.bobinaId) {
        activeBobina =
          (await db.select().from(bobinas).where(eq(bobinas.id, job.bobinaId)).get()) ?? null;
        // Vincula a bobina ao item que o operador escolheu. Sem esta checagem, o
        // job com material "Lona 1,60m" pode debitar da bobina de "Vinil 0,75m" e
        // o saldo do item errado muda junto do saldo da bobina errada.
        if (activeBobina && activeBobina.stockItemId !== item.id) {
          return {
            deductedSubstrate: false,
            deductedInksCount: 0,
            motivo: `A bobina ${activeBobina.serial ?? activeBobina.id.slice(0, 8)} pertence a outro item de estoque.`,
          };
        }
      } else if (job.machineId) {
        activeBobina =
          (
            await db
              .select()
              .from(bobinas)
              .where(
                and(
                  eq(bobinas.stockItemId, item.id),
                  eq(bobinas.state, 'IN_USE'),
                  eq(bobinas.location, `machine:${job.machineId}`),
                ),
              )
              .get()
          ) ?? null;
      }

      if (!activeBobina) {
        return {
          deductedSubstrate: false,
          deductedInksCount: 0,
          motivo: job.bobinaId
            ? `Bobina ${job.bobinaId} nao encontrada.`
            : 'Nenhuma bobina informada e nenhuma bobina em uso na maquina. Selecione a bobina.',
        };
      }

      {
        // Idempotencia
        const existingTx = await db
          .select({ id: stockTransactions.id })
          .from(stockTransactions)
          .where(
            and(
              eq(stockTransactions.itemId, item.id),
              like(stockTransactions.reason, `%${job.jobName}% [Bobina ${activeBobina.serial}]%`),
            ),
          )
          .get();

        if (!existingTx) {
          // `substrateEsperado` ja garante `lengthMeters > 0`, mas o TypeScript nao
          // estreita `job.lengthMeters` a partir de uma `const` booleana: sem isto
          // aqui, `toPrecision` recebe `number | null | undefined`.
          const jobLength = job.lengthMeters ?? 0;
          let lengthMeters = toPrecision(jobLength, 3);
          
          let machineInfo = null;
          if (job.machineId) {
             machineInfo = await db.select().from(machines).where(eq(machines.id, job.machineId)).get();
             if (machineInfo && machineInfo.bleedAdjustmentM) {
              lengthMeters += machineInfo.bleedAdjustmentM;
            }
          }

          // R-013: sem `metersRemaining`, `null - 5` e NaN, e `Math.max(0, NaN)`
          // e NaN - que entraria na coluna `real` e depois em todo saldo derivado.
          // `metersInitial` e o melhor chute; sem os dois, a bobina nao e medivel.
          const restante = activeBobina.metersRemaining ?? activeBobina.metersInitial;
          if (restante === null || restante === undefined || !Number.isFinite(restante)) {
            return {
              deductedSubstrate: false,
              deductedInksCount: 0,
              motivo: `A bobina ${activeBobina.serial ?? activeBobina.id.slice(0, 8)} nao tem metragem inicial nem restante informados.`,
            };
          }

          const newQty = Math.max(0, toPrecision(restante - lengthMeters, 3));
          const isFinished = newQty <= 0;

            await db.update(bobinas).set({ 
              metersRemaining: newQty,
              state: isFinished ? 'USED' : activeBobina.state
            }).where(eq(bobinas.id, activeBobina.id));

            const sangriaDetail = machineInfo?.bleedAdjustmentM ? ` + sangria ${machineInfo.bleedAdjustmentM}m` : '';

            await db.insert(stockTransactions).values({
              id: newId(),
              itemId: item.id,
              type: 'OUT',
              quantity: lengthMeters,
              reason: `Mimaki consumo mídia: ${job.jobName}${job.id ? ` [Job ${job.id.slice(0, 8)}]` : ''} [Bobina ${activeBobina.serial}]${sangriaDetail}`,
              userId: actorId,
              userName: 'Mimaki Agent',
            });

            deductedSubstrate = true;

            app.io.to('estoque').emit('stock:deducted', {
              itemName: item.name,
              quantity: lengthMeters,
              unit: item.unit,
              jobName: job.jobName,
            });
          } else {
            // A transacao ja existe: o debito aconteceu antes (reenvio do watcher).
            deductedSubstrate = true;
          }
        }
    }
  }

  // 2. Registro de Consumo de Tintas UV (ADR-057 / BR-012 emendada)
  // Desacoplado do saldo de estoque: grava em inkConsumptionLog para relatórios analíticos.
  // NÃO altera garrafas nem stockItems nem gera stockTransactions para tinta.
  const inkChannels = [
    { key: 'inkCyanCc' as const, channel: 'Cyan' },
    { key: 'inkMagentaCc' as const, channel: 'Magenta' },
    { key: 'inkYellowCc' as const, channel: 'Yellow' },
    { key: 'inkBlackCc' as const, channel: 'Black' },
    { key: 'inkWhite1Cc' as const, channel: 'White1' },
    { key: 'inkWhite2Cc' as const, channel: 'White2' },
    { key: 'inkVarnish1Cc' as const, channel: 'Varnish1' },
    { key: 'inkVarnish2Cc' as const, channel: 'Varnish2' },
  ];

  for (const { key, channel } of inkChannels) {
    const consumed = job[key];
    if (consumed && consumed > 0) {
      const consumedCc = toPrecision(consumed, 4);
      const machineId = job.machineId || 'mimaki-default';

      // Idempotência por machineId + canal + jobId
      const existingLog = await db
        .select({ id: inkConsumptionLog.id })
        .from(inkConsumptionLog)
        .where(
          and(
            eq(inkConsumptionLog.machineId, machineId),
            eq(inkConsumptionLog.channel, channel),
            job.id ? eq(inkConsumptionLog.jobId, job.id) : undefined,
          ),
        )
        .get();

      if (!existingLog) {
        await db.insert(inkConsumptionLog).values({
          id: newId(),
          machineId,
          channel,
          jobId: job.id || null,
          mlConsumed: consumedCc,
        });
      }

      deductedInksCount++;
    }
  }

  // 3. Marca o job como estoque debitado.
  //
  // **So quando o debito aconteceu de fato.** A versao anterior marcava sempre, e
  // essa e a trava que tornava o bug definitivo: `stockDeducted = true` sem
  // metragem baixada significa que nem o operador, nem o reconciliador, nem uma
  // segunda chamada conseguiriam debitar depois - o dado sumia em silencio e nao
  // voltava. `deductedSubstrate = false` aqui so e aceitavel quando nao havia
  // substrato a debitar (job sem midia vinculada), caso em que o job foi
  // processado por completo.
  if (deductedSubstrate || !substrateEsperado) {
    await db.update(mimakiJobs)
      .set({
        stockDeducted: true,
        materialStatus: 'BOUND',
        stockItemId: job.stockItemId ?? jobRow?.stockItemId ?? null,
      })
      .where(eq(mimakiJobs.id, job.id));

    const { mimakiTestJobs } = await import('../db/schema.js');
    await db.update(mimakiTestJobs)
      .set({
        stockDeducted: true,
        stockItemId: job.stockItemId ?? null,
        bobinaId: activeBobina?.id ?? null,
        parsedBobinaSerial: activeBobina?.serial ?? null,
      })
      .where(
        or(
          eq(mimakiTestJobs.keyFilename, job.jobName),
          jobRow?.orderCode ? eq(mimakiTestJobs.parsedOrderCode, jobRow.orderCode) : sql`1 = 0`
        )
      );

    app.io?.to('estoque').emit('stock:updated', { itemId: job.stockItemId ?? jobRow?.stockItemId });
    app.io?.emit('mimaki:job:bound', {
      id: job.id,
      stockItemId: job.stockItemId ?? jobRow?.stockItemId,
      materialStatus: 'BOUND',
      stockDeducted: true,
    });
  } else {
    app.log.warn(
      `[mimaki] Job ${job.id} (${job.jobName}) NAO marcado como debitado: substrato nao baixado. ` +
      `Fica liberado para nova tentativa.`,
    );
  }

  return { deductedSubstrate, deductedInksCount };
}

const mimakiJobSchema = z.object({
  machine_id: z.string().min(1),
  folder_timestamp: z.string().min(1),
  job_name: z.string().min(1),
  order_code: z.string().nullable().optional(),
  quantity_units: z.number().int().positive().default(1),
  pages: z.number().int().positive().default(1),
  copies: z.number().int().positive().optional(),
  copy: z.number().int().positive().optional(),
  copy_number: z.number().int().positive().optional(),
  total_print: z.number().int().positive().optional(),
  pass_count: z.number().int().positive().optional(),
  resolution_dpi: z.union([z.number(), z.string().regex(/^\d+/).transform(Number)]).optional(),
  print_direction: z.string().optional(),
  width_mm: z.number().positive(),
  height_mm: z.number().positive(),
  ink_cyan_cc: z.number().default(0),
  ink_magenta_cc: z.number().default(0),
  ink_yellow_cc: z.number().default(0),
  ink_black_cc: z.number().default(0),
  ink_white1_cc: z.number().default(0),
  ink_white2_cc: z.number().default(0),
  ink_varnish1_cc: z.number().default(0),
  ink_varnish2_cc: z.number().default(0),
  ink_total_cc: z.number().default(0),
  raw_material_name: z.string().nullable().optional(),
});

export async function processMimakiJobRecord(app: FastifyInstance, data: MimakiJobInput): Promise<MimakiJobResult> {
  const effectiveCopies = data.copy_number ?? data.copies ?? data.copy ?? 1;
  const totalPrints = data.total_print ?? (data.pages ? data.pages * effectiveCopies : effectiveCopies);
  const lengthMeters = toPrecision(
    (data.height_mm * totalPrints) / 1000,
    3,
  );

  const existing = await db
    .select()
    .from(mimakiJobs)
    .where(eq(mimakiJobs.folderTimestamp, data.folder_timestamp))
    .get();

  if (existing) {
    // Reenvio/Atualização de job existente: atualiza dados técnicos e recálculo da metragem
    await db.update(mimakiJobs)
      .set({
        jobName: data.job_name,
        orderCode: data.order_code ?? existing.orderCode,
        quantityUnits: data.quantity_units ?? existing.quantityUnits,
        pages: data.pages ?? existing.pages,
        copyNumber: data.copy_number ?? data.copies ?? data.copy ?? existing.copyNumber,
        totalPrint: data.total_print ?? existing.totalPrint,
        passCount: data.pass_count ?? existing.passCount,
        resolutionDpi: data.resolution_dpi ?? existing.resolutionDpi,
        printDirection: data.print_direction ?? existing.printDirection,
        widthMm: data.width_mm,
        heightMm: data.height_mm,
        lengthMeters,
        rawMaterialName: data.raw_material_name ?? existing.rawMaterialName,
        inkCyanCc: data.ink_cyan_cc ?? existing.inkCyanCc,
        inkMagentaCc: data.ink_magenta_cc ?? existing.inkMagentaCc,
        inkYellowCc: data.ink_yellow_cc ?? existing.inkYellowCc,
        inkBlackCc: data.ink_black_cc ?? existing.inkBlackCc,
        inkWhite1Cc: data.ink_white1_cc ?? existing.inkWhite1Cc,
        inkWhite2Cc: data.ink_white2_cc ?? existing.inkWhite2Cc,
        inkVarnish1Cc: data.ink_varnish1_cc ?? existing.inkVarnish1Cc,
        inkVarnish2Cc: data.ink_varnish2_cc ?? existing.inkVarnish2Cc,
        inkTotalCc: data.ink_total_cc ?? existing.inkTotalCc,
      })
      .where(eq(mimakiJobs.id, existing.id));

    return {
      job_id: existing.id,
      length_meters: lengthMeters,
      material_status: existing.materialStatus ?? 'PENDING_BIND',
      stock_item_id: existing.stockItemId,
      updated: true,
    };
  }

  let stockItemId: string | null = null;
  let materialStatus: 'BOUND' | 'PENDING_BIND' = 'PENDING_BIND';

  if (data.raw_material_name) {
    const rawLower = data.raw_material_name.toLowerCase().replace(/[\s\-_,./()ºª]+/g, '');
    const mediaItems = await db
      .select()
      .from(stockItems)
      .where(eq(stockItems.category, 'PAPER_MEDIA'))
      .all();

    const match = mediaItems.find((item) => {
      const nameLower = item.name.toLowerCase().replace(/[\s\-_,./()ºª]+/g, '');
      return nameLower.includes(rawLower) || rawLower.includes(nameLower);
    });

    if (match) {
      stockItemId = match.id;
      materialStatus = 'BOUND';
    }
  }

  const jobId = newId();
  await db.insert(mimakiJobs).values({
    id: jobId,
    machineId: data.machine_id,
    folderTimestamp: data.folder_timestamp,
    jobName: data.job_name,
    orderCode: data.order_code ?? null,
    quantityUnits: data.quantity_units ?? 1,
    pages: data.pages ?? 1,
    copyNumber: data.copy_number ?? data.copies ?? data.copy ?? 1,
    totalPrint: data.total_print ?? null,
    passCount: data.pass_count ?? null,
    resolutionDpi: data.resolution_dpi ?? null,
    printDirection: data.print_direction ?? null,
    widthMm: data.width_mm,
    heightMm: data.height_mm,
    inkCyanCc: data.ink_cyan_cc ?? 0,
    inkMagentaCc: data.ink_magenta_cc ?? 0,
    inkYellowCc: data.ink_yellow_cc ?? 0,
    inkBlackCc: data.ink_black_cc ?? 0,
    inkWhite1Cc: data.ink_white1_cc ?? 0,
    inkWhite2Cc: data.ink_white2_cc ?? 0,
    inkVarnish1Cc: data.ink_varnish1_cc ?? 0,
    inkVarnish2Cc: data.ink_varnish2_cc ?? 0,
    inkTotalCc: data.ink_total_cc ?? 0,
    rawMaterialName: data.raw_material_name ?? null,
    lengthMeters,
    materialStatus,
    stockItemId,
    stockDeducted: false,
  });

  if (materialStatus === 'BOUND' && stockItemId) {
    const deductRes = await deductMimakiStockForJob(app, {
      id: jobId,
      jobName: data.job_name,
      lengthMeters,
      stockItemId,
      machineId: data.machine_id,
      inkCyanCc: data.ink_cyan_cc,
      inkMagentaCc: data.ink_magenta_cc,
      inkYellowCc: data.ink_yellow_cc,
      inkBlackCc: data.ink_black_cc,
      inkWhite1Cc: data.ink_white1_cc,
      inkWhite2Cc: data.ink_white2_cc,
      inkVarnish1Cc: data.ink_varnish1_cc,
      inkVarnish2Cc: data.ink_varnish2_cc,
    });
    if (!deductRes.deductedSubstrate) {
      materialStatus = 'PENDING_BIND';
      await db.update(mimakiJobs).set({ materialStatus }).where(eq(mimakiJobs.id, jobId));
      app.io.to('estoque').emit('mimaki:unmatched_material', {
        job_id: jobId,
        order_code: data.order_code ?? null,
        job_name: data.job_name,
        raw_material_name: data.raw_material_name ?? null,
        length_meters: lengthMeters,
      });
    }
  } else {
    app.io.to('estoque').emit('mimaki:unmatched_material', {
      job_id: jobId,
      order_code: data.order_code ?? null,
      job_name: data.job_name,
      raw_material_name: data.raw_material_name ?? null,
      length_meters: lengthMeters,
    });
  }

  return {
    job_id: jobId,
    length_meters: lengthMeters,
    material_status: materialStatus,
    stock_item_id: stockItemId,
  };
}

registerMimakiProcessor(processMimakiJobRecord);

export async function mimakiRoutes(app: FastifyInstance) {
  app.post('/api/integrations/mimaki/jobs', {
    config: {
      rateLimit: false,
    },
    schema: {
      tags: ['Mimaki Integration'],
      summary: 'Receber job de impressão Mimaki (M2M)',
      description: 'Endpoint M2M para o Mimaki Tracker Electron enviar logs de impressão (único ou lote).',
    },
    preHandler: [m2mAuth],
  }, async (request, reply) => {
    const payload = request.body;

    if (Array.isArray(payload)) {
      const parsedArray = z.array(mimakiJobSchema).safeParse(payload);
      if (!parsedArray.success) {
        return reply.code(400).send({ error: 'Invalid input array', details: parsedArray.error.flatten() });
      }

      const results: MimakiJobResult[] = [];
      for (const item of parsedArray.data) {
        const res = await enqueueMimakiJob(app, item);
        results.push(res);
      }

      return reply.code(201).send({
        success: true,
        count: results.length,
        jobs: results,
      });
    }

    const parsed = mimakiJobSchema.safeParse(payload);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const result = await enqueueMimakiJob(app, parsed.data);
    return reply.code(201).send(result);
  });

  app.post('/api/integrations/mimaki/jobs/:id/bind-material', {
    schema: {
      tags: ['Mimaki Integration'],
      summary: 'Vincular material a um job Mimaki',
      description: 'Vincula um item de estoque a um job Mimaki e desconta material e tintas UV do estoque.',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        // Só `stock_item_id` fica no `required` de propósito. Se `bobina_id`
        // também estivesse aqui, o AJV responderia 400 "Invalid input" - um
        // erro de máquina que não diz o que falta - e a mensagem explicativa do
        // handler (que diz o que fazer) nunca chegaria ao operador.
        required: ['stock_item_id'],
        properties: {
          stock_item_id: { type: 'string' },
          bobina_id: { type: 'string', minLength: 1 },
        },
      },
      response: {
        200: {
          type: 'object',
          // Campos ausentes da serialização são removidos: `alreadyDeducted` e
          // `message` precisam estar aqui para o front saber que já baixou.
          properties: {
            success: { type: 'boolean' },
            deductedSubstrate: { type: 'boolean' },
            alreadyDeducted: { type: 'boolean' },
            deductedInks: { type: 'integer' },
            bobinaId: { type: 'string' },
            message: { type: 'string' },
          },
        },
        400: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
        409: { type: 'object', properties: { error: { type: 'string' }, deductedSubstrate: { type: 'boolean' }, deductedInks: { type: 'integer' } } },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { stock_item_id, bobina_id } = request.body as { stock_item_id: string; bobina_id?: string };

    const job = await db
      .select()
      .from(mimakiJobs)
      .where(eq(mimakiJobs.id, id))
      .get();

    if (!job) {
      return reply.code(404).send({ error: 'Job não encontrado' });
    }

    const item = await db
      .select()
      .from(stockItems)
      .where(eq(stockItems.id, stock_item_id))
      .get();
    if (!item) {
      return reply.code(404).send({ error: 'Item de estoque não encontrado' });
    }

    const isFolhaOuUnidade = item.unit === 'fls' || item.unit === 'rms' || item.unit === 'pk' || item.unit === 'un';
    let resolvedBobinaId = bobina_id;

    if (!isFolhaOuUnidade) {
      if (!resolvedBobinaId || !resolvedBobinaId.trim()) {
        return reply.code(400).send({
          error: 'Selecione a bobina usada na impressão. Sem a bobina não há metragem a baixar.',
        });
      }

      const bobina = await db
        .select()
        .from(bobinas)
        .where(eq(bobinas.id, resolvedBobinaId))
        .get();
      if (!bobina) {
        return reply.code(404).send({ error: 'Bobina não encontrada' });
      }
      if (bobina.stockItemId !== stock_item_id) {
        const ownerItem = await db
          .select()
          .from(stockItems)
          .where(eq(stockItems.id, bobina.stockItemId))
          .get();
        return reply.code(400).send({
          error:
            `A bobina ${bobina.serial ?? bobina.id.slice(0, 8)} é do material ` +
            `"${ownerItem?.name ?? bobina.stockItemId}", não de "${item.name}". ` +
            `Escolha uma bobina do material selecionado.`,
        });
      }
      if (bobina.state !== 'NEW' && bobina.state !== 'IN_USE') {
        return reply.code(400).send({
          error: `A bobina ${bobina.serial ?? bobina.id.slice(0, 8)} está ${bobina.state === 'USED' ? 'esgotada' : bobina.state.toLowerCase()} e não pode receber consumo.`,
        });
      }
    }

    // Desconta mídia e registra consumo de tintas UV de forma segura e idempotente
    const deductRes = await deductMimakiStockForJob(
      app,
      {
        ...job,
        stockItemId: stock_item_id,
        bobinaId: resolvedBobinaId,
        isRebind: true,
      },
      request.userId,
    );

    // Já baixado nesta mesma bobina / mídia: idempotente
    if (deductRes.jaDebitado) {
      await db
        .update(mimakiJobs)
        .set({ materialStatus: 'BOUND', stockItemId: stock_item_id })
        .where(eq(mimakiJobs.id, id));

      return reply.code(200).send({
        success: true,
        deductedSubstrate: false,
        alreadyDeducted: true,
        deductedInks: 0,
        bobinaId: resolvedBobinaId,
        message: deductRes.motivo ?? 'Este job já tinha estoque baixado nesta bobina.',
      });
    }

    if (!deductRes.deductedSubstrate) {
      return reply.code(409).send({
        error: deductRes.motivo ?? 'Não foi possível baixar a mídia da bobina selecionada.',
        deductedSubstrate: false,
        deductedInks: deductRes.deductedInksCount,
      });
    }

    await db.update(mimakiJobs)
      .set({ materialStatus: 'BOUND', stockItemId: stock_item_id })
      .where(eq(mimakiJobs.id, id));

    return reply.code(200).send({
      success: true,
      deductedSubstrate: true,
      deductedInks: deductRes.deductedInksCount,
      bobinaId: resolvedBobinaId,
    });
  });

  app.patch('/api/integrations/mimaki/jobs/:id', {
    schema: {
      tags: ['Mimaki Integration'],
      summary: 'Atualizar job Mimaki (metragem, ordem, cópias)',
      description: 'Permite ao operador ajustar metragem ou código de OS. Se o job já teve estoque debitado, ajusta a diferença no estoque com rastreabilidade.',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          length_meters: { type: 'number' },
          order_code: { type: 'string', nullable: true },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            length_meters: { type: 'number' },
            stock_adjusted_diff: { type: 'number', nullable: true },
          },
        },
        400: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { length_meters, order_code } = request.body as {
      length_meters?: number;
      order_code?: string | null;
    };

    const job = await db.select().from(mimakiJobs).where(eq(mimakiJobs.id, id)).get();
    if (!job) {
      return reply.code(404).send({ error: 'Job não encontrado' });
    }

    let actorId = request.userId && request.userId.trim() ? request.userId : 'system';
    const userExists = await db.select({ id: users.id }).from(users).where(eq(users.id, actorId)).get();
    if (!userExists) actorId = 'system';

    let stockAdjustedDiff: number | null = null;

    if (length_meters !== undefined && length_meters > 0) {
      const newLength = toPrecision(length_meters, 3);
      const oldLength = toPrecision(job.lengthMeters ?? 0, 3);
      const diff = toPrecision(newLength - oldLength, 3);

      // Se já debitou estoque de mídia e tem item vinculado, ajusta a diferença
      if (job.stockDeducted && job.stockItemId && diff !== 0) {
        const item = await db.select().from(stockItems).where(eq(stockItems.id, job.stockItemId)).get();
        if (item) {
          const newQty = Math.max(0, toPrecision(item.currentQuantity - diff, 3));
          const status = computeStatus(newQty, item.minQuantity);

          await db.update(stockItems)
            .set({ currentQuantity: newQty, status })
            .where(eq(stockItems.id, item.id));

          await db.insert(stockTransactions).values({
            id: newId(),
            itemId: item.id,
            type: diff > 0 ? 'OUT' : 'IN',
            quantity: Math.abs(diff),
            reason: diff > 0
              ? `Ajuste metragem Mimaki: ${job.jobName} (+${diff}m)`
              : `Ajuste metragem Mimaki estorno: ${job.jobName} (-${Math.abs(diff)}m)`,
            userId: actorId,
            userName: 'Mimaki Agent',
          });

          stockAdjustedDiff = diff;

          app.io.to('estoque').emit('stock:updated', {
            itemId: item.id,
            newQuantity: newQty,
          });
        }
      }

      await db.update(mimakiJobs)
        .set({
          lengthMeters: newLength,
          ...(order_code !== undefined ? { orderCode: order_code } : {}),
        })
        .where(eq(mimakiJobs.id, id));

      return reply.code(200).send({
        success: true,
        length_meters: newLength,
        stock_adjusted_diff: stockAdjustedDiff,
      });
    }

    if (order_code !== undefined) {
      await db.update(mimakiJobs)
        .set({ orderCode: order_code })
        .where(eq(mimakiJobs.id, id));
    }

    return reply.code(200).send({
      success: true,
      length_meters: job.lengthMeters,
      stock_adjusted_diff: null,
    });
  });

  app.post('/api/integrations/mimaki/sync-stock', {
    schema: {
      tags: ['Mimaki Integration'],
      summary: 'Sincronizar e descontar estoque dos jobs Mimaki vinculados',
      description: 'Varre jobs vinculados (BOUND) que ainda não tiveram o estoque descontado e processa o débito de material e tintas UV.',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            processedCount: { type: 'number' },
            message: { type: 'string' },
          },
        },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    // 1. Busca jobs BOUND que ainda precisam de dedução de estoque
    const boundJobs = await db
      .select()
      .from(mimakiJobs)
      .where(
        and(
          eq(mimakiJobs.materialStatus, 'BOUND'),
          or(
            eq(mimakiJobs.stockDeducted, false),
            sql`${mimakiJobs.stockDeducted} IS NULL`,
            sql`${mimakiJobs.stockDeducted} = 0`,
          ),
        ),
      )
      .all();

    // 2. Tenta auto-vincular jobs PENDING_BIND cujo rawMaterialName corresponda a algum item em stockItems
    const pendingJobs = await db
      .select()
      .from(mimakiJobs)
      .where(eq(mimakiJobs.materialStatus, 'PENDING_BIND'))
      .all();

    const allMediaItems = await db
      .select()
      .from(stockItems)
      .where(eq(stockItems.category, 'PAPER_MEDIA'))
      .all();

    let autoBoundCount = 0;
    for (const pJob of pendingJobs) {
      if (pJob.rawMaterialName) {
        const rawLower = pJob.rawMaterialName.toLowerCase().replace(/[\s\-_,./()ºª]+/g, '');
        const matched = allMediaItems.find((m) => {
          const mLower = m.name.toLowerCase().replace(/[\s\-_,./()ºª]+/g, '');
          return mLower.includes(rawLower) || rawLower.includes(mLower);
        });
        if (matched) {
          await db.update(mimakiJobs)
            .set({ materialStatus: 'BOUND', stockItemId: matched.id })
            .where(eq(mimakiJobs.id, pJob.id));
          pJob.stockItemId = matched.id;
          pJob.materialStatus = 'BOUND';
          boundJobs.push(pJob);
          autoBoundCount++;
        }
      }
    }

    let processedCount = 0;
    for (const job of boundJobs) {
      await deductMimakiStockForJob(app, job, request.userId);
      processedCount++;
    }

    return reply.code(200).send({
      success: true,
      processedCount,
      message: `${processedCount} job(s) Mimaki processado(s) com sucesso${autoBoundCount > 0 ? ` (${autoBoundCount} vinculado(s) automaticamente)` : ''}.`,
    });
  });

  app.get('/api/integrations/mimaki/jobs', {
    schema: {
      tags: ['Mimaki Integration'],
      summary: 'Listar jobs Mimaki',
      description: 'Lista jobs recebidos via M2M com status de material e estoque.',
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['BOUND', 'PENDING_BIND'] },
          machine_id: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: true,
            properties: {
              id: { type: 'string' },
              machineId: { type: 'string' },
              folderTimestamp: { type: 'string' },
              jobName: { type: 'string' },
              orderCode: { type: 'string', nullable: true },
              rawMaterialName: { type: 'string', nullable: true },
              lengthMeters: { type: 'number' },
              widthMm: { type: 'number' },
              heightMm: { type: 'number' },
              pages: { type: 'number' },
              quantityUnits: { type: 'number' },
              copyNumber: { type: 'number', nullable: true },
              totalPrint: { type: 'number', nullable: true },
              passCount: { type: 'number', nullable: true },
              resolutionDpi: { type: 'number', nullable: true },
              printDirection: { type: 'string', nullable: true },
              inkCyanCc: { type: 'number', nullable: true },
              inkMagentaCc: { type: 'number', nullable: true },
              inkYellowCc: { type: 'number', nullable: true },
              inkBlackCc: { type: 'number', nullable: true },
              inkWhite1Cc: { type: 'number', nullable: true },
              inkWhite2Cc: { type: 'number', nullable: true },
              inkVarnish1Cc: { type: 'number', nullable: true },
              inkVarnish2Cc: { type: 'number', nullable: true },
              inkTotalCc: { type: 'number', nullable: true },
              materialStatus: { type: 'string' },
              stockItemId: { type: 'string', nullable: true },
              stockItemName: { type: 'string', nullable: true },
              stockDeducted: { type: 'boolean' },
              createdAt: { type: 'string' },
            },
          },
        },
      },
    },
    preHandler: [authenticate],
  }, async (request) => {
    const query = request.query as { status?: string; machine_id?: string };
    const conditions = [];
    if (query.status) conditions.push(eq(mimakiJobs.materialStatus, query.status as 'BOUND' | 'PENDING_BIND'));
    if (query.machine_id) conditions.push(eq(mimakiJobs.machineId, query.machine_id));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    return await db
      .select({
        id: mimakiJobs.id,
        machineId: mimakiJobs.machineId,
        folderTimestamp: mimakiJobs.folderTimestamp,
        jobName: mimakiJobs.jobName,
        orderCode: mimakiJobs.orderCode,
        rawMaterialName: mimakiJobs.rawMaterialName,
        lengthMeters: mimakiJobs.lengthMeters,
        widthMm: mimakiJobs.widthMm,
        heightMm: mimakiJobs.heightMm,
        pages: mimakiJobs.pages,
        quantityUnits: mimakiJobs.quantityUnits,
        copyNumber: mimakiJobs.copyNumber,
        totalPrint: mimakiJobs.totalPrint,
        passCount: mimakiJobs.passCount,
        resolutionDpi: mimakiJobs.resolutionDpi,
        printDirection: mimakiJobs.printDirection,
        inkCyanCc: mimakiJobs.inkCyanCc,
        inkMagentaCc: mimakiJobs.inkMagentaCc,
        inkYellowCc: mimakiJobs.inkYellowCc,
        inkBlackCc: mimakiJobs.inkBlackCc,
        inkWhite1Cc: mimakiJobs.inkWhite1Cc,
        inkWhite2Cc: mimakiJobs.inkWhite2Cc,
        inkVarnish1Cc: mimakiJobs.inkVarnish1Cc,
        inkVarnish2Cc: mimakiJobs.inkVarnish2Cc,
        inkTotalCc: mimakiJobs.inkTotalCc,
        materialStatus: mimakiJobs.materialStatus,
        stockItemId: mimakiJobs.stockItemId,
        stockItemName: stockItems.name,
        stockDeducted: mimakiJobs.stockDeducted,
        createdAt: mimakiJobs.createdAt,
      })
      .from(mimakiJobs)
      .leftJoin(stockItems, eq(mimakiJobs.stockItemId, stockItems.id))
      .where(where)
      .orderBy(sql`${mimakiJobs.createdAt} DESC`)
      .limit(100)
      .all();
  });

  app.get('/api/integrations/mimaki/jobs/:id', {
    schema: {
      tags: ['Mimaki Integration'],
      summary: 'Obter detalhes de um job Mimaki por ID',
      description: 'Retorna os dados completos do job Mimaki por ID.',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      response: {
        200: {
          type: 'object',
          additionalProperties: true,
          properties: {
            id: { type: 'string' },
            machineId: { type: 'string' },
            folderTimestamp: { type: 'string' },
            jobName: { type: 'string' },
            orderCode: { type: 'string', nullable: true },
            rawMaterialName: { type: 'string', nullable: true },
            lengthMeters: { type: 'number' },
            widthMm: { type: 'number' },
            heightMm: { type: 'number' },
            pages: { type: 'number' },
            quantityUnits: { type: 'number' },
            copyNumber: { type: 'number', nullable: true },
            totalPrint: { type: 'number', nullable: true },
            passCount: { type: 'number', nullable: true },
            resolutionDpi: { type: 'number', nullable: true },
            printDirection: { type: 'string', nullable: true },
            inkCyanCc: { type: 'number', nullable: true },
            inkMagentaCc: { type: 'number', nullable: true },
            inkYellowCc: { type: 'number', nullable: true },
            inkBlackCc: { type: 'number', nullable: true },
            inkWhite1Cc: { type: 'number', nullable: true },
            inkWhite2Cc: { type: 'number', nullable: true },
            inkVarnish1Cc: { type: 'number', nullable: true },
            inkVarnish2Cc: { type: 'number', nullable: true },
            inkTotalCc: { type: 'number', nullable: true },
            materialStatus: { type: 'string' },
            stockItemId: { type: 'string', nullable: true },
            stockItemName: { type: 'string', nullable: true },
            stockDeducted: { type: 'boolean' },
            createdAt: { type: 'string' },
          },
        },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const job = await db
      .select({
        id: mimakiJobs.id,
        machineId: mimakiJobs.machineId,
        folderTimestamp: mimakiJobs.folderTimestamp,
        jobName: mimakiJobs.jobName,
        orderCode: mimakiJobs.orderCode,
        rawMaterialName: mimakiJobs.rawMaterialName,
        lengthMeters: mimakiJobs.lengthMeters,
        widthMm: mimakiJobs.widthMm,
        heightMm: mimakiJobs.heightMm,
        pages: mimakiJobs.pages,
        quantityUnits: mimakiJobs.quantityUnits,
        copyNumber: mimakiJobs.copyNumber,
        totalPrint: mimakiJobs.totalPrint,
        passCount: mimakiJobs.passCount,
        resolutionDpi: mimakiJobs.resolutionDpi,
        printDirection: mimakiJobs.printDirection,
        inkCyanCc: mimakiJobs.inkCyanCc,
        inkMagentaCc: mimakiJobs.inkMagentaCc,
        inkYellowCc: mimakiJobs.inkYellowCc,
        inkBlackCc: mimakiJobs.inkBlackCc,
        inkWhite1Cc: mimakiJobs.inkWhite1Cc,
        inkWhite2Cc: mimakiJobs.inkWhite2Cc,
        inkVarnish1Cc: mimakiJobs.inkVarnish1Cc,
        inkVarnish2Cc: mimakiJobs.inkVarnish2Cc,
        inkTotalCc: mimakiJobs.inkTotalCc,
        materialStatus: mimakiJobs.materialStatus,
        stockItemId: mimakiJobs.stockItemId,
        stockItemName: stockItems.name,
        stockDeducted: mimakiJobs.stockDeducted,
        createdAt: mimakiJobs.createdAt,
      })
      .from(mimakiJobs)
      .leftJoin(stockItems, eq(mimakiJobs.stockItemId, stockItems.id))
      .where(eq(mimakiJobs.id, id))
      .get();

    if (!job) {
      return reply.code(404).send({ error: 'Job Mimaki não encontrado' });
    }

    return reply.code(200).send(job);
  });
}
