import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { stockItems, stockTransactions, notifications, printJobs, users } from '../../db/schema.js';
import type { StockItem } from '../../db/schema.js';
import { newId } from '../../lib/ids.js';
import { sendToRecipients } from '../../lib/whatsapp.js';
import { getSetting } from '../../lib/settings.js';
import type { NewKonicaJob } from './job-detector.js';
import { incrementPagesPrinted, resetTonerPageCounter } from './telemetry-store.js';

const SYSTEM_ACTOR_ID = 'konica-agent-system';

// userId nas transações/notificações aponta p/ users.id (FK ativo no Turso).
// Garante o usuário "operador do agente" na primeira execução.
let ensureUserPromise: Promise<string> | null = null;
async function ensureSystemUser(): Promise<string> {
  if (!ensureUserPromise) {
    ensureUserPromise = (async () => {
      const existing = await db.select().from(users).where(eq(users.id, SYSTEM_ACTOR_ID)).get();
      if (!existing) {
        await db.insert(users).values({
          id: SYSTEM_ACTOR_ID,
          name: 'Konica Agent',
          email: 'konica-agent@grafica.local',
          // Hash inválido de propósito: conta de sistema, sem login.
          passwordHash: '__system__',
          role: 'OPERATOR',
        });
      }
      return SYSTEM_ACTOR_ID;
    })();
  }
  return ensureUserPromise;
}

const KONICA_TONER_COLOR_MAP: Record<string, keyof NonNullable<NewKonicaJob['tonerByColor']>> = {
  'konica_toner-cyan': 'cyan',
  'konica_toner-magenta': 'magenta',
  'konica_toner-yellow': 'yellow',
  'konica_toner-black': 'black',
};

const CONVERSION_FACTOR_BY_UNIT = {
  fls: 1,
  rms: 500,
  'pk': 50,
  'bl': 2500,
} as const;

// Toner do C3070 não é exposto por job no PrintManager (descoberta T1).
// Usa contagem de páginas para estimar consumo de toner.
const TONER_EXPOSED = false;

function computeStatus(current: number, min: number): 'AVAILABLE' | 'LOW_STOCK' | 'OUT_OF_STOCK' {
  if (current <= 0) return 'OUT_OF_STOCK';
  if (current <= min) return 'LOW_STOCK';
  return 'AVAILABLE';
}

/** Normaliza acentos + separadores p/ comparação: "Couché A4 90g" → "couchea490g". */
export function normalizeMediaName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s\-_,./()ºª]+/g, '');
}

/** Prioriza tamanhos específicos citados no job; 33x48 é o padrão dos papéis da AccurioPrint. */
function sizeScore(name: string): number {
  if (name.includes('a4')) return 3;
  if (name.includes('a3')) return 2;
  if (name.includes('13x19') || name.includes('33x48')) return 1;
  return 0;
}

/**
 * Busca o item de papel da máquina pelo papel derivado do job ("couche a4").
 * O paperName é dividido em tokens (classe + tamanho) e o item precisa conter
 * todos — independe da ordem ("Couché A4 250g" casa com token 'couche' e 'a4').
 * Se o nome do job informa a gramatura (ex.: 250g), prefere o item com esse valor.
 */
export function findPaperItem(
  items: StockItem[],
  paperName: string,
  gram: number | null,
): StockItem | null {
  if (!paperName) return null;

  const tokens = paperName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return null;

  const candidates = items.filter((item) => {
    const name = normalizeMediaName(item.name);
    return name && tokens.every((t) => name.includes(t));
  });
  if (candidates.length === 0) return null;

  const byGram = gram
    ? candidates.filter((item) => normalizeMediaName(item.name).includes(String(gram)))
    : [];
  const pool = byGram.length > 0 ? byGram : candidates;

  pool.sort((a, b) => {
    const s = sizeScore(normalizeMediaName(b.name)) - sizeScore(normalizeMediaName(a.name));
    if (s !== 0) return s;
    return b.name.length - a.name.length;
  });
  return pool[0]!;
}

import { dispatchStockAlert } from '../../lib/notification-resend.js';

async function notifyStock(
  item: StockItem,
  newQty: number,
  status: 'LOW_STOCK' | 'OUT_OF_STOCK',
  actorId: string,
  io: { to: (room: string) => { emit: (event: string, data: unknown) => void } },
): Promise<void> {
  await dispatchStockAlert({ item, newQty, status, actorId, io });
}

export async function deductStockForJob(
  job: NewKonicaJob,
  io: { to: (room: string) => { emit: (event: string, data: unknown) => void } },
): Promise<void> {
  const actorId = await ensureSystemUser();

  if (job.paperName && job.sheets > 0) {
    const rows = await db.select().from(stockItems).where(eq(stockItems.category, 'PAPER_MEDIA')).all();
    const item = findPaperItem(rows, job.paperName, job.gram);

    if (item) {
      const sheetsUsed = Math.floor(job.sheets); // folhas inteiras (job.sheets já é inteiro)
      // O papel da AccurioPrint é cotado em folhas (fls) → débito = páginas impressas.
      // Para outras unidades (rms), converte e arredonda SEM casas decimais.
      const factor = CONVERSION_FACTOR_BY_UNIT[item.unit as keyof typeof CONVERSION_FACTOR_BY_UNIT] ?? 1;
      const debitQty = factor > 1 ? Math.floor(sheetsUsed / factor) : sheetsUsed;

      const newQty = Math.max(0, item.currentQuantity - debitQty);
      const status = computeStatus(newQty, item.minQuantity);

      await db.update(stockItems).set({ currentQuantity: newQty, status }).where(eq(stockItems.id, item.id));

      const gramNote = job.gram ? `, gramatura ${job.gram}g` : '';
      await db.insert(stockTransactions).values({
        id: newId(),
        itemId: item.id,
        type: 'OUT',
        quantity: debitQty,
        reason: `Konica Agent: job ${job.jobName} (${job.paperName}${gramNote}) — ${sheetsUsed} folhas`,
        userId: actorId,
        userName: 'Konica Agent',
      });

      io.to('estoque').emit('stock:deducted', {
        itemName: item.name,
        quantity: debitQty,
        unit: item.unit,
        jobName: job.jobName,
      });

      if (status === 'LOW_STOCK' || status === 'OUT_OF_STOCK') {
        await notifyStock(item, newQty, status, actorId, io);
      }
    } else {
      console.warn(
        `[Konica Agent] Papel "${job.paperName}"${job.gram ? ` (${job.gram}g)` : ''} ` +
          `não encontrado no estoque; nenhum débito realizado (job "${job.jobName}").`,
      );
    }
  }

  const toner = job.tonerByColor;
  if (TONER_EXPOSED && toner) {
    for (const [sku, colorKey] of Object.entries(KONICA_TONER_COLOR_MAP)) {
      const quantity = toner[colorKey];
      if (!quantity || quantity <= 0) continue;

      const items = await db.select().from(stockItems).where(eq(stockItems.name, sku)).all();
      const item = items[0];
      if (!item) continue;

      const newQty = Math.max(0, item.currentQuantity - quantity);
      const status = computeStatus(newQty, item.minQuantity);

      await db.update(stockItems).set({ currentQuantity: newQty, status }).where(eq(stockItems.id, item.id));

      await db.insert(stockTransactions).values({
        id: newId(),
        itemId: item.id,
        type: 'OUT',
        quantity,
        reason: `Konica Agent: job ${job.jobName}`,
        userId: actorId,
        userName: 'Konica Agent',
      });

      if (status === 'LOW_STOCK' || status === 'OUT_OF_STOCK') {
        await notifyStock(item, newQty, status, actorId, io);
      }
    }
  } else if (job.paperName) {
    console.log('[Konica Agent] Toner não exposto pelo PrintManager — usando contagem de páginas para estimativa.');
  }

  // Incrementa contador de páginas para cálculo de toner
  if (job.pages && job.pages > 0) {
    await incrementPagesPrinted(job.pages);
  }

  const jobRow = await db.select().from(printJobs).where(eq(printJobs.jobId, job.jobId)).get();
  if (jobRow) {
    await db.update(printJobs).set({
      stockDeducted: true,
      deductedAt: new Date().toISOString(),
    }).where(eq(printJobs.id, jobRow.id));
  }

  io.to('estoque').emit('printer:job_completed', {
    jobName: job.jobName,
    paperName: job.paperName,
    pages: job.pages,
    sheets: job.sheets,
    printEndDate: job.printEndDate,
  });
}