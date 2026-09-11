import { eq, and, like } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { stockItems, stockTransactions, notifications, printJobs, users } from '../../db/schema.js';
import type { StockItem } from '../../db/schema.js';
import { newId } from '../../lib/ids.js';
import { sendToRecipients } from '../../lib/whatsapp.js';
import { getSetting } from '../../lib/settings.js';
import { divideAreaToLength, subtractStock, toPrecision } from '../../lib/math.js';
import { dispatchStockAlert } from '../../lib/notification-resend.js';
import type { NewJob } from './job-detector.js';

const SYSTEM_ACTOR_ID = 'hp-agent-system';

// userId nas transações/notificações aponta p/ users.id (FK ativo no Turso).
// Garante o usuário do agente na primeira execução.
let ensureUserPromise: Promise<string> | null = null;
async function ensureSystemUser(): Promise<string> {
  if (!ensureUserPromise) {
    ensureUserPromise = (async () => {
      const existing = await db.select().from(users).where(eq(users.id, SYSTEM_ACTOR_ID)).get();
      if (!existing) {
        await db.insert(users).values({
          id: SYSTEM_ACTOR_ID,
          name: 'HP Latex Agent',
          email: 'hp-agent@grafica.local',
          passwordHash: '__system__',
          role: 'OPERATOR',
        });
      }
      return SYSTEM_ACTOR_ID;
    })();
  }
  return ensureUserPromise;
}

const INK_COLOR_MAP: Record<string, keyof Pick<NewJob, 'inkCyanMl' | 'inkLightCyanMl' | 'inkMagentaMl' | 'inkLightMagentaMl' | 'inkYellowMl' | 'inkBlackMl' | 'inkOptimizerMl'>> = {
  'hp_tinta-cyan': 'inkCyanMl',
  'hp_tinta-light-cyan': 'inkLightCyanMl',
  'hp_tinta-magenta': 'inkMagentaMl',
  'hp_tinta-light-magenta': 'inkLightMagentaMl',
  'hp_tinta-yellow': 'inkYellowMl',
  'hp_tinta-black': 'inkBlackMl',
  'hp_tinta-optimizer': 'inkOptimizerMl',
};

function computeStatus(current: number, min: number): 'AVAILABLE' | 'LOW_STOCK' | 'OUT_OF_STOCK' {
  if (current <= 0) return 'OUT_OF_STOCK';
  if (current <= min) return 'LOW_STOCK';
  return 'AVAILABLE';
}

/**
 * Normaliza nomes de mídia para comparação: minúsculas, sem espaços/símbolos.
 * Ex.: "STARFLEX 280G - 1,06M" e "starflex 280g - 1,06m" viram o mesmo token.
 */
function normalizeMediaName(name: string): string {
  return name.toLowerCase().replace(/[\s\-_,./()ºª]+/g, '');
}

/**
 * Tenta extrair a largura do rolo (em metros) a partir do nome do perfil de mídia,
 * ex.: "starflex 280g - 1,06m", "STARFLEX 280G 1,06 Mts.", "1060mm".
 * Usado como fallback quando o item de estoque não tem `width` cadastrado.
 */
function parseMediaWidthM(media: string): number | null {
  const lower = media.toLowerCase();

  const withUnit = lower.match(/(\d{1,4}(?:[.,]\d{1,3})?)\s*(mm|m\b|m(ts)?\.?|metros)/);
  if (withUnit) {
    const raw = withUnit[1]!.replace(',', '.');
    const value = parseFloat(raw);
    if (Number.isFinite(value) && value >= 0.3 && value <= 3.5) {
      return withUnit[2]!.startsWith('mm') ? value / 1000 : value;
    }
    return null;
  }

  // Sem unidade: aceita apenas valores plausíveis de largura de bobina (0.3m–3.5m).
  const bare = lower.match(/(\d[,.]\d{1,3})/);
  if (bare) {
    const value = parseFloat(bare[1]!.replace(',', '.'));
    if (Number.isFinite(value) && value >= 0.3 && value <= 3.5) return value;
  }

  return null;
}

/**
 * Encontra o item de estoque (PAPER_MEDIA) correspondente ao tipo de mídia.
 * Entre candidatos equivalentes, prioriza o nome mais específico (maior).
 * Se um `widthHint` for informado (largura real do rolo, ex.: lida no nome do arquivo),
 * itens com `width` igual têm prioridade.
 */
function findMediaItem(
  items: StockItem[],
  mediaType: string,
  widthHint: number | null = null,
): StockItem | null {
  const target = normalizeMediaName(mediaType);
  if (!target) return null;

  const candidates = items.filter((item) => {
    const name = normalizeMediaName(item.name);
    return name && (name.includes(target) || target.includes(name));
  });
  if (candidates.length === 0) return null;

  if (widthHint) {
    const widthMatches = candidates.filter(
      (item) => item.width && Math.abs(item.width - widthHint) < 0.01,
    );
    if (widthMatches.length > 0) {
      widthMatches.sort((a, b) => b.name.length - a.name.length);
      return widthMatches[0]!;
    }
    // Nenhum item com a largura exata: mantém os candidatos por nome.
  }

  candidates.sort((a, b) => b.name.length - a.name.length);
  return candidates[0]!;
}

export async function deductStockForJob(
  job: NewJob,
  io: { to: (room: string) => { emit: (event: string, data: unknown) => void } },
): Promise<void> {
  const actorId = await ensureSystemUser();

  for (const [sku, field] of Object.entries(INK_COLOR_MAP)) {
    const quantity = job[field];
    if (!quantity || quantity <= 0) continue;

    const items = await db.select().from(stockItems).where(eq(stockItems.name, sku)).all();
    const item = items[0];
    if (!item) continue;

    const existingTx = await db
      .select({ id: stockTransactions.id })
      .from(stockTransactions)
      .where(
        and(
          eq(stockTransactions.itemId, item.id),
          like(stockTransactions.reason, `%${job.jobName}%`),
        ),
      )
      .get();
    if (existingTx) continue;

    const newQty = Math.max(0, item.currentQuantity - quantity);
    const status = computeStatus(newQty, item.minQuantity);

    await db.update(stockItems).set({ currentQuantity: newQty, status }).where(eq(stockItems.id, item.id));

    const txId = newId();
    await db.insert(stockTransactions).values({
      id: txId,
      itemId: item.id,
      type: 'OUT',
      quantity,
      reason: `HP Agent: job ${job.jobName}`,
      userId: actorId,
      userName: 'HP Latex Agent',
    });

    io.to('estoque').emit('stock:deducted', {
      itemName: item.name,
      quantity,
      unit: item.unit,
      jobName: job.jobName,
    });

    if (status === 'LOW_STOCK' || status === 'OUT_OF_STOCK') {
      await dispatchStockAlert({ item, newQty, status, actorId, io });
    }
  }

  if (job.mediaType && job.mediaAreaM2 > 0) {
    const rows = await db.select().from(stockItems).where(eq(stockItems.category, 'PAPER_MEDIA')).all();

    // Largura real do rolo carregado. Prioridade: nome do arquivo do job (convenção do
    // operador, ex.: "LONA 280G 1,06m - Pedido X.pdf") → tipo de mídia do perfil HP
    // (ex.: "starflex 280g - 1,06m") → campo width do item.
    const widthFromJobName = parseMediaWidthM(job.jobName);
    const widthFromMedia = parseMediaWidthM(job.mediaType);
    const widthHint = widthFromJobName ?? widthFromMedia;

    const item = findMediaItem(rows, job.mediaType, widthHint) ?? null;

    if (item) {
      // Idempotência: verifica se já houve transação de mídia para este job
      const existingMediaTx = await db
        .select({ id: stockTransactions.id })
        .from(stockTransactions)
        .where(
          and(
            eq(stockTransactions.itemId, item.id),
            like(stockTransactions.reason, `%${job.jobName}%`),
          ),
        )
        .get();

      if (!existingMediaTx) {
        // A HP reporta consumo de substrato em m² (largura do rolo × comprimento avançado).
        // O estoque é controlado em metros lineares de rolo, então o débito é m² ÷ largura.
        const widthM = (widthHint ?? (item.width && item.width > 0 ? item.width : null)) ?? null;
        const debitQty = widthM ? divideAreaToLength(job.mediaAreaM2, widthM) : job.mediaAreaM2;

        if (!widthM) {
          console.warn(
            `[HP Agent] Mídia "${job.mediaType}" sem largura no job/item "${item.name}"; debitando ${debitQty.toFixed(2)} ${item.unit} diretamente do m². Item sem campo width nem largura no nome do arquivo.`,
          );
        }

        const newQty = subtractStock(item.currentQuantity, debitQty);
        const status = computeStatus(newQty, item.minQuantity);

        await db.update(stockItems).set({ currentQuantity: newQty, status }).where(eq(stockItems.id, item.id));

        const detail = widthM ? `${job.mediaAreaM2.toFixed(4)} m² / ${widthM} m` : `${job.mediaAreaM2.toFixed(4)} m²`;
        await db.insert(stockTransactions).values({
          id: newId(),
          itemId: item.id,
          type: 'OUT',
          quantity: toPrecision(debitQty, 3),
          reason: `HP Agent: job ${job.jobName} (${job.mediaType}) — ${detail}`,
          userId: actorId,
          userName: 'HP Latex Agent',
        });

        io.to('estoque').emit('stock:deducted', {
          itemName: item.name,
          quantity: debitQty,
          unit: item.unit,
          jobName: job.jobName,
        });

      if (status === 'LOW_STOCK' || status === 'OUT_OF_STOCK') {
        await dispatchStockAlert({ item, newQty, status, actorId, io });
      }
      }
    }
  }

  const jobRow = await db.select().from(printJobs).where(eq(printJobs.jobId, job.jobId)).get();
  if (jobRow) {
    // Salvar campos de auditoria para rastreabilidade
    const widthM = (job.mediaType && job.mediaAreaM2 > 0) ? (() => {
      const widthFromJobName = parseMediaWidthM(job.jobName);
      const widthFromMedia = parseMediaWidthM(job.mediaType);
      return widthFromJobName ?? widthFromMedia ?? (jobRow.rollWidthUsed ?? null) ?? 1.52;
    })() : null;
    
    const linearMeters = widthM ? divideAreaToLength(job.mediaAreaM2, widthM) : null;
    
    await db.update(printJobs).set({
      stockDeducted: true,
      deductedAt: new Date().toISOString(),
      rollWidthUsed: widthM,
      linearMetersDebited: linearMeters ? toPrecision(linearMeters, 3) : null,
    }).where(eq(printJobs.id, jobRow.id));
  }

  io.to('estoque').emit('printer:job_completed', {
    jobName: job.jobName,
    inkTotalMl: job.inkTotalMl,
    mediaType: job.mediaType,
    mediaAreaM2: job.mediaAreaM2,
    printEndDate: job.printEndDate,
  });
}
