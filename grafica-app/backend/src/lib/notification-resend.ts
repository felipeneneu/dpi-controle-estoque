import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { notifications, type StockItem } from '../db/schema.js';
import { getSetting } from './settings.js';
import { enqueueStockAlert } from './whatsapp.js';
import { newId } from './ids.js';

export interface StockAlertParams {
  item: StockItem;
  newQty: number;
  status: 'LOW_STOCK' | 'OUT_OF_STOCK';
  actorId: string;
  io?: { to: (room: string) => { emit: (event: string, data: unknown) => void } };
  reason?: string;
}

/**
 * Dispara alerta de estoque de forma inteligente e anti-spam.
 * Regra: se já existe um alerta ativo (não confirmado) com o mesmo status para este item,
 * NÃO reenvia mensagem no WhatsApp. Só envia mensagem quando houver um novo aviso
 * (ex.: agravamento para OUT_OF_STOCK ou após reposição/confirmação).
 */
export async function dispatchStockAlert({
  item,
  newQty,
  status,
  actorId,
  io,
}: StockAlertParams): Promise<boolean> {
  const existingPending = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.itemId, item.id),
        eq(notifications.type, 'stock'),
        eq(notifications.alertLevel, status),
        isNull(notifications.acknowledgedAt),
      ),
    )
    .limit(1)
    .all();

  const isNewStatusWarning = existingPending.length === 0;
  if (!isNewStatusWarning) {
    // Alerta já foi enviado para este status e está pendente de confirmação. Não reenvia WhatsApp (anti-spam).
    return false;
  }

  const notifId = newId();
  const title = `Estoque ${status === 'LOW_STOCK' ? 'baixo' : 'zerado'}`;
  const body = `${item.name} está com ${newQty} ${item.unit}`;

  // Mensagem humanizada e natural, evitando formatações mecânicas de bot que a Meta detecta
  const waMessage =
    `📦 *Aviso de Estoque — GraficaOS*\n\n` +
    `Olá! Passando para avisar que o material *${item.name}* atingiu o nível de atenção:\n` +
    `• *Situação:* ${status === 'LOW_STOCK' ? 'Estoque Baixo' : 'Estoque Zerado'}\n` +
    `• *Quantidade atual:* ${newQty} ${item.unit}\n` +
    `• *Estoque mínimo:* ${item.minQuantity} ${item.unit}\n\n` +
    `Por favor, verifique a reposição quando possível.`;

  await db.insert(notifications).values({
    id: notifId,
    userId: actorId,
    title,
    body,
    type: 'stock',
    itemId: item.id,
    alertLevel: status,
    waMessage,
  });

  if (io) {
    io.to('estoque').emit('notification:new', { id: notifId, title, body, itemId: item.id, alertLevel: status });
  }

  const waEnabled = (await getSetting('whatsapp.enabled')) === 'true';
  if (waEnabled) {
    enqueueStockAlert({
      itemId: item.id,
      itemName: item.name,
      unit: item.unit,
      newQty,
      minQuantity: item.minQuantity,
      status,
    });
  }

  return true;
}

export const TICK_MS = 15 * 60 * 1000;

/**
 * Escalonamento periódico neutralizado para evitar spam e bloqueio de conta pela Meta.
 * Alertas de estoque são enviados exclusivamente na transição de estado via dispatchStockAlert.
 */
export async function runEscalationOnce(): Promise<number> {
  return 0;
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startAlertEscalation(): void {
  if (timer) return;
  timer = setInterval(() => {
    void runEscalationOnce().catch((err: unknown) =>
      console.error('[escalation] error:', err),
    );
  }, TICK_MS);
}

export function stopAlertEscalation(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
