import type { Server as SocketIOServer } from 'socket.io';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { machines } from '../../db/schema.js';
import { checkPrinterOnline, downloadAccounting, cleanupFile } from './downloader.js';
import { parseXls } from './parser.js';
import { detectNewJobs, insertJob } from './job-detector.js';
import { deductStockForJob } from './stock-deductor.js';
import { getHpTelemetry } from './telemetry.js';
import { persistTelemetry } from './telemetry-store.js';

const TAG = '[HP Agent]';

const HP_IP = process.env.HP_LATEX_IP || '192.168.234.10';
const POLL_INTERVAL_MS = Number(process.env.HP_POLL_INTERVAL_MS) || 60_000;
const DOWNLOAD_TIMEOUT_MS = Number(process.env.HP_DOWNLOAD_TIMEOUT_MS) || 10_000;
const HP_AGENT_ENABLED = process.env.HP_AGENT_ENABLED !== 'false';

const BACKOFF_STEPS = [30_000, 60_000, 120_000, 300_000, 600_000];

let timer: ReturnType<typeof setInterval> | null = null;
let consecutiveFailures = 0;
let sleepLogCount = 0;

function nextBackoffMs(): number {
  const idx = Math.min(consecutiveFailures, BACKOFF_STEPS.length - 1);
  return BACKOFF_STEPS[idx]!;
}

async function pollOnce(io: SocketIOServer): Promise<void> {
  const online = await checkPrinterOnline(HP_IP, 3000);

  const hpMachine = await db.select().from(machines).where(eq(machines.ip, HP_IP)).get();

  const telemetry = await getHpTelemetry(HP_IP);
  if (hpMachine) {
    await persistTelemetry(hpMachine.id, telemetry, io);
  }

  if (!online) {
    consecutiveFailures++;
    console.log(`${TAG} Impressora offline, retry em ${nextBackoffMs() / 1000}s`);
    return;
  }

  consecutiveFailures = 0;

  const machineId = hpMachine?.id;
  if (!machineId) {
    console.log(`${TAG} Máquina com IP ${HP_IP} não encontrada no cadastro; ignorando jobs.`);
    return;
  }

  const result = await downloadAccounting(HP_IP, DOWNLOAD_TIMEOUT_MS);

  if (!result.ok) {
    if (result.reason === 'asleep') {
      // Impressora dormiu: não é falha real. Não incrementa backoff e não tenta parsear HTML.
      sleepLogCount++;
      if (sleepLogCount === 1 || sleepLogCount % 10 === 0) {
        console.log(`${TAG} Impressora em modo sleep - ignorando este ciclo (${sleepLogCount}x)`);
      }
      return;
    }
    consecutiveFailures++;
    console.log(`${TAG} Falha ao obter accounting (status ${result.status ?? 'desconhecido'}), retry em ${nextBackoffMs() / 1000}s`);
    return;
  }

  try {
    const parsed = parseXls(result.filePath);
    const newJobs = await detectNewJobs(parsed);

    if (newJobs.length === 0) {
      console.log(`${TAG} 0 jobs novos`);
      return;
    }

    for (const job of newJobs) {
      await insertJob(job, machineId);
      await deductStockForJob(job, io);
    }

    console.log(`${TAG} ${newJobs.length} jobs processados`);
  } catch (err) {
    consecutiveFailures++;
    console.error(`${TAG} Erro ao processar accounting, retry em ${nextBackoffMs() / 1000}s:`, err);
  } finally {
    await cleanupFile(result.filePath);
  }
}

export function startHpAgent(io: SocketIOServer): () => void {
  if (!HP_AGENT_ENABLED) {
    console.log(`${TAG} Desabilitado (HP_AGENT_ENABLED=false)`);
    return () => {};
  }

  console.log(`${TAG} Iniciando... IP=${HP_IP}, intervalo=${POLL_INTERVAL_MS / 1000}s`);

  void pollOnce(io).catch((err: unknown) => {
    console.error(`${TAG} Erro no primeiro ciclo:`, err);
  });

  timer = setInterval(() => {
    void pollOnce(io).catch((err: unknown) => {
      console.error(`${TAG} Erro no ciclo de polling:`, err);
    });
  }, POLL_INTERVAL_MS);

  return () => stopHpAgent();
}

function stopHpAgent(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  console.log(`${TAG} Parado`);
}
