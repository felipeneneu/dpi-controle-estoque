import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { stockItems, machines, machineTelemetry, printJobs } from '../../db/schema.js';

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

const sentAlerts = new Map<string, number>();
const ALERT_COOLDOWN_MS = 30_600_000;

function shouldAlert(key: string): boolean {
  const lastSent = sentAlerts.get(key);
  if (!lastSent) return true;
  return Date.now() - lastSent > ALERT_COOLDOWN_MS;
}

function markAlerted(key: string) {
  sentAlerts.set(key, Date.now());
}

async function checkLowStock(): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const items = await db.select().from(stockItems).all();
  for (const item of items) {
    if (item.currentQuantity === 0) {
      const key = `stock-out-${item.id}`;
      if (shouldAlert(key)) {
        alerts.push({ key, message: `**[Estoque Zerado]** ${item.name} — 0 ${item.unit} disponível. Reposição urgente!` });
        markAlerted(key);
      }
    } else if (item.currentQuantity <= item.minQuantity) {
      const key = `stock-low-${item.id}`;
      if (shouldAlert(key)) {
        alerts.push({ key, message: `**[Estoque Baixo]** ${item.name} — ${item.currentQuantity} ${item.unit} (mínimo: ${item.minQuantity})` });
        markAlerted(key);
      }
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

async function checkLowToner(): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const allMachines = await db.select().from(machines).all();
  for (const m of allMachines) {
    if (m.technology !== 'LASER') continue;
    const telemetry = await db
      .select()
      .from(machineTelemetry)
      .where(eq(machineTelemetry.machineId, m.id))
      .orderBy(desc(machineTelemetry.createdAt))
      .limit(1)
      .get();

    if (!telemetry) continue;

    const toners = [
      { name: 'Ciano', pct: telemetry.tonerCyanPct },
      { name: 'Magenta', pct: telemetry.tonerMagentaPct },
      { name: 'Amarelo', pct: telemetry.tonerYellowPct },
      { name: 'Preto', pct: telemetry.tonerBlackPct },
    ];

    for (const t of toners) {
      if (t.pct != null && t.pct <= 15) {
        const key = `toner-low-${m.id}-${t.name}`;
        if (shouldAlert(key)) {
          alerts.push({ key, message: `**[Toner Baixo]** ${m.name} — ${t.name} em ${Math.round(t.pct)}%. Considerar reposição.` });
          markAlerted(key);
        }
      }
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
        checkLowToner(),
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
