import type { Server as SocketIOServer } from 'socket.io';
import { eq, like, and } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { machines } from '../../db/schema.js';
import { fetchJobs, checkKonicaOnline, konicaBaseUrl } from './fetcher.js';
import { parseJobs } from './parser.js';
import { detectNewJobs, insertKonicaJob } from './job-detector.js';
import { deductStockForJob } from './stock-deductor.js';
import { getKonicaDeviceInfo } from './device-info.js';
import { persistKonicaTelemetry } from './telemetry-store.js';

const TAG = '[Konica Agent]';

const KONICA_IP = process.env.KONICA_IP || '192.168.234.68';
const POLL_INTERVAL_MS = Number(process.env.KONICA_POLL_INTERVAL_MS) || 30_000;
const KONICA_AGENT_ENABLED = process.env.KONICA_AGENT_ENABLED !== 'false';
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_MS = 600_000;

let timer: ReturnType<typeof setInterval> | null = null;
let consecutiveFailures = 0;
let circuitOpenUntil = 0;

function nextBackoffMs(): number {
  const BACKOFF_STEPS = [15_000, 30_000, 60_000, 120_000, 300_000];
  const idx = Math.min(consecutiveFailures, BACKOFF_STEPS.length - 1);
  return BACKOFF_STEPS[idx]!;
}

function isCircuitOpen(): boolean {
  if (consecutiveFailures < CIRCUIT_BREAKER_THRESHOLD) return false;
  if (Date.now() < circuitOpenUntil) return true;
  console.log(`${TAG} Circuit breaker resetado após ${CIRCUIT_BREAKER_RESET_MS / 1000}s`);
  consecutiveFailures = 0;
  return false;
}

async function pollOnce(io: SocketIOServer): Promise<void> {
  if (isCircuitOpen()) {
    console.log(`${TAG} Circuit breaker aberto, aguardando ${CIRCUIT_BREAKER_RESET_MS / 1000}s`);
    return;
  }

  const online = await checkKonicaOnline(3000);

  if (!online) {
    consecutiveFailures++;
    if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_RESET_MS;
      console.log(`${TAG} Circuit breaker aberto após ${consecutiveFailures} falhas`);
    }
    io.to('geral').emit('chat:message', {
      id: `konica-offline-${Date.now()}`,
      room: 'geral',
      recipientId: null,
      content: `**[Máquina Offline]** AccurioPrint está offline. Verificar conexão.`,
      senderId: 'system',
      senderName: 'GraficaOS Brain',
      senderAvatar: null,
      createdAt: new Date().toISOString(),
      isCommand: true,
    });
    console.log(`${TAG} Impressora offline, retry em ${nextBackoffMs() / 1000}s`);
    return;
  }

  let konicaMachine = await db.select().from(machines).where(eq(machines.ip, KONICA_IP)).get();
  if (!konicaMachine) {
    konicaMachine = await db
      .select()
      .from(machines)
      .where(and(like(machines.brand, 'Konica%'), eq(machines.technology, 'Laser')))
      .get();
  }

  const machineId = konicaMachine?.id;
  if (!machineId) {
    console.log(`${TAG} Máquina Konica não encontrada no cadastro; ignorando jobs.`);
    return;
  }

  const [deviceResult, jobsResult] = await Promise.all([
    getKonicaDeviceInfo(konicaBaseUrl).catch((err) => {
      console.warn(`${TAG} Falha ao buscar device info:`, err);
      return null;
    }),
    fetchJobs(konicaBaseUrl),
  ]);

  if (deviceResult) {
    try {
      await persistKonicaTelemetry(machineId, deviceResult, io);
    } catch (err) {
      console.warn(`${TAG} Falha ao registrar telemetria:`, err);
    }
  }

  if (!jobsResult.ok) {
    consecutiveFailures++;
    if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_RESET_MS;
      console.log(`${TAG} Circuit breaker aberto após ${consecutiveFailures} falhas`);
    }
    console.log(`${TAG} Falha ao obter jobs (${jobsResult.reason}${jobsResult.status ? `, status ${jobsResult.status}` : ''}), retry em ${nextBackoffMs() / 1000}s`);
    return;
  }

  consecutiveFailures = 0;

  try {
    const parsed = parseJobs(jobsResult.raw);
    const newJobs = await detectNewJobs(parsed);

    if (newJobs.length === 0) {
      console.log(`${TAG} 0 jobs novos`);
      return;
    }

    for (const job of newJobs) {
      await insertKonicaJob(job, machineId);
      await deductStockForJob(job, io);
    }

    console.log(`${TAG} ${newJobs.length} jobs processados`);
  } catch (err) {
    consecutiveFailures++;
    console.error(`${TAG} Erro ao processar jobs, retry em ${nextBackoffMs() / 1000}s:`, err);
  }
}

export function startKonicaAgent(io: SocketIOServer): () => void {
  if (!KONICA_AGENT_ENABLED) {
    console.log(`${TAG} Desabilitado (KONICA_AGENT_ENABLED=false)`);
    return () => {};
  }

  console.log(`${TAG} Iniciando... IP=${KONICA_IP}, URL=${konicaBaseUrl}, intervalo=${POLL_INTERVAL_MS / 1000}s`);

  void pollOnce(io).catch((err: unknown) => {
    console.error(`${TAG} Erro no primeiro ciclo:`, err);
  });

  timer = setInterval(() => {
    void pollOnce(io).catch((err: unknown) => {
      console.error(`${TAG} Erro no ciclo de polling:`, err);
    });
  }, POLL_INTERVAL_MS);

  return () => stopKonicaAgent();
}

function stopKonicaAgent(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  console.log(`${TAG} Parado`);
}
