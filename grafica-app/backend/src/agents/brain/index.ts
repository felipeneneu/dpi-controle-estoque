import { eq, desc, sql, and, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { stockItems, machines, machineTelemetry, printJobs, cartuchos, whatsappRecipients } from '../../db/schema.js';
import { saldosDerivados, cartuchosEmDeposito } from '../../lib/ink-balance.js';
import { sendToRecipients } from '../../lib/whatsapp.js';

const POLL_INTERVAL_MS = 60_000;
let io: { to: (room: string) => { emit: (event: string, payload: unknown) => void } } | null = null;

interface Alert {
  key: string;
  message: string;
}

function emitSystemMessage(message: string) {
  if (!io) return;
  io.to('geral').emit('chat:message', {
    id: `brain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    room: 'geral',
    recipientId: null,
    content: message,
    senderId: 'system',
    senderName: 'GraficaOS Brain',
    senderAvatar: null,
    createdAt: new Date().toISOString(),
    isCommand: true,
  });
}

async function sendWhatsAppAlert(message: string): Promise<void> {
  await sendToRecipients(message);
}

const sentAlerts = new Map<string, number>();
const ALERT_COOLDOWN_MS = 30_600_000; // 8.5h

function shouldAlert(key: string): boolean {
  const lastSent = sentAlerts.get(key);
  if (!lastSent) return true;
  return Date.now() - lastSent > ALERT_COOLDOWN_MS;
}

function markAlerted(key: string) {
  sentAlerts.set(key, Date.now());
}

/**
 * Alerta de estoque baixo/zerado usando saldo derivado (BR-052 / BR-054).
 *
 * Para itens rastreados por cartucho/tinta_lotes/bobinas, usa o saldo derivado
 * (soma dos ativos NEW | IN_USE). Para itens sem ativo (folhas, solventes),
 * cai no currentQuantity agregado.
 *
 * Nao avisa se ha cartucho/lote/bobina NEW em deposito (gate de reposicao).
 */
async function checkLowStock(): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const items = await db.select().from(stockItems).all();

  // Busca saldos derivados em lote para itens com cartucho
  const idsComCartucho = items
    .filter(i => i.category === 'INK_SUPPLY')
    .map(i => i.id);
  const saldosCartucho = await saldosDerivados(idsComCartucho);

  for (const item of items) {
    // Pula itens sem minQuantity configurado
    if (!item.minQuantity || item.minQuantity <= 0) continue;

    // Determina o saldo real do item
    let currentQty: number;
    let origemSaldo: string;

    if (item.category === 'PAPER_MEDIA' && item.unit === 'm') {
      // Bobinas: soma metersRemaining de NEW | IN_USE
      // (ja calculado na rota /api/stock-items, aqui simplificado)
      currentQty = item.currentQuantity;
      origemSaldo = 'agregado';
    } else if (item.category === 'INK_SUPPLY') {
      const saldoCartucho = saldosCartucho.get(item.id);
      if (saldoCartucho !== undefined) {
        currentQty = saldoCartucho;
        origemSaldo = 'cartuchos';
      } else {
        // Fallback: tinta_lotes ou garrafas ou agregado
        // A rota /api/stock-items ja resolve isso; aqui usamos currentQuantity como proxy
        currentQty = item.currentQuantity;
        origemSaldo = 'agregado';
      }
    } else {
      currentQty = item.currentQuantity;
      origemSaldo = 'agregado';
    }

    // Gate de reposicao: nao avisa se ha ativo NEW em deposito
    // (BR-054: so avisa se cartucho carregado <= 15% E nao ha NEW em deposito)
    let temEmDeposito = false;
    if (item.category === 'INK_SUPPLY' && origemSaldo === 'cartuchos') {
      temEmDeposito = await cartuchosEmDeposito(item.id) > 0;
    }

    if (currentQty === 0) {
      const key = `stock-out-${item.id}`;
      if (shouldAlert(key)) {
        alerts.push({
          key,
          message: `**[Estoque Zerado]** ${item.name} — 0 ${item.unit} disponível (${origemSaldo}). Reposição urgente!`
        });
        markAlerted(key);
      }
    } else if (currentQty <= item.minQuantity && !temEmDeposito) {
      const key = `stock-low-${item.id}`;
      if (shouldAlert(key)) {
        alerts.push({
          key,
          message: `**[Estoque Baixo]** ${item.name} — ${currentQty} ${item.unit} (mínimo: ${item.minQuantity}) [${origemSaldo}]`
        });
        markAlerted(key);
      }
    } else if (temEmDeposito) {
      // Curou: limpa cooldown se tinha alerta ativo
      sentAlerts.delete(`stock-out-${item.id}`);
      sentAlerts.delete(`stock-low-${item.id}`);
    }
  }
  return alerts;
}

async function checkMachineStatus(): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const allMachines = await db.select().from(machines).all();
  for (const m of allMachines) {
    if (m.status !== 'ACTIVE') continue;
    const telemetry = await db
      .select()
      .from(machineTelemetry)
      .where(eq(machineTelemetry.machineId, m.id))
      .orderBy(desc(machineTelemetry.createdAt))
      .limit(1)
      .get();

    const key = `machine-offline-${m.id}`;
    if (telemetry && !telemetry.online) {
      if (shouldAlert(key)) {
        alerts.push({ key, message: `**[Máquina Offline]** ${m.name} (${m.model}) está offline. Verificar conexão.` });
        markAlerted(key);
      }
    } else {
      sentAlerts.delete(key);
    }
  }
  return alerts;
}

async function checkFailedJobs(): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const failedJobs = await db
    .select()
    .from(printJobs)
    .where(eq(printJobs.status, 'FAILED'))
    .orderBy(desc(printJobs.createdAt))
    .limit(3)
    .all();

  for (const job of failedJobs) {
    const key = `job-failed-${job.id}`;
    if (shouldAlert(key)) {
      alerts.push({ key, message: `**[Job Falhou]** ${job.jobName || 'Sem nome'} — ${job.mediaType || 'N/A'}. Verificar máquina.` });
      markAlerted(key);
    }
  }
  return alerts;
}

/**
 * Alerta de reposicao de cartucho/tinta por canal (BR-054).
 *
 * Dispara quando:
 * - Cartucho IN_USE tem levelCurrent / levelCapacity * 100 <= 15%
 * - NAO existe nenhum cartucho do mesmo item com state = NEW e location = deposito
 *
 * Chave de dedupe: por cartucho (reposicao-<cartuchoId>)
 * Cooldown: 8.5h (ALERT_COOLDOWN_MS)
 */
async function checkLowInkCartridges(): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const THRESHOLD_PCT = 15;

  // Todos cartuchos IN_USE com machineId
  const inUseCartuchos = await db
    .select()
    .from(cartuchos)
    .where(and(
      eq(cartuchos.state, 'IN_USE'),
      sql`${cartuchos.machineId} IS NOT NULL`
    ))
    .all();

  if (inUseCartuchos.length === 0) return alerts;

  // Agrupa por stockItemId para buscar machine e item info
  const stockItemIds = [...new Set(inUseCartuchos.map(c => c.stockItemId))];
  const items = await db
    .select()
    .from(stockItems)
    .where(inArray(stockItems.id, stockItemIds))
    .all();
  const itemMap = new Map(items.map(i => [i.id, i]));

  const allMachines = await db.select().from(machines).all();
  const machineMap = new Map(allMachines.map(m => [m.id, m]));

  for (const cartucho of inUseCartuchos) {
    if (!cartucho.levelCapacity || cartucho.levelCapacity <= 0) continue;

    const pct = (cartucho.levelCurrent / cartucho.levelCapacity) * 100;
    if (pct > THRESHOLD_PCT) {
      // Curou: limpa cooldown
      sentAlerts.delete(`reposicao-${cartucho.id}`);
      continue;
    }

    const item = itemMap.get(cartucho.stockItemId);
    const machine = cartucho.machineId ? machineMap.get(cartucho.machineId) : null;

    // Gate de estoque: tem cartucho NEW em deposito?
    const temEmDeposito = await cartuchosEmDeposito(cartucho.stockItemId) > 0;
    if (temEmDeposito) {
      sentAlerts.delete(`reposicao-${cartucho.id}`);
      continue;
    }

    const key = `reposicao-${cartucho.id}`;
    if (shouldAlert(key)) {
      const levelStr = cartucho.unit === 'ml'
        ? `${Math.round(cartucho.levelCurrent)} ml de ${cartucho.levelCapacity} ml`
        : `${Math.round(pct)}%`;

      const message = `**[Repor Tinta/Toner]** ${item?.name ?? 'Item desconhecido'} — canal ${cartucho.channel} em ${levelStr} na ${machine?.name ?? 'máquina desconhecida'}. Sem cartucho em depósito. Comprar.`;

      alerts.push({ key, message });
      markAlerted(key);

      // Envia WhatsApp
      await sendWhatsAppAlert(message);
    }
  }
  return alerts;
}

export async function startBrain(ioInstance: typeof io) {
  io = ioInstance;
  console.log('[Brain] Iniciando monitor 24/7...');

  async function tick() {
    try {
      const alerts = await Promise.all([
        checkLowStock(),
        checkMachineStatus(),
        checkFailedJobs(),
        checkLowInkCartridges(),
      ]);

      const allAlerts = alerts.flat();
      for (const alert of allAlerts) {
        emitSystemMessage(alert.message);
      }
    } catch (err) {
      console.error('[Brain] Erro no tick:', err);
    }
  }

  await tick();
  setInterval(tick, POLL_INTERVAL_MS);
}