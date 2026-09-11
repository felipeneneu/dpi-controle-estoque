import path from 'node:path';
import fs from 'node:fs';
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WASocket,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { getSetting } from './settings.js';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { whatsappRecipients } from '../db/schema.js';

const AUTH_DIR = process.env.GRAFICA_WA_AUTH_DIR || path.join(process.cwd(), 'wa_auth');
const QUEUE: Array<{ jid: string; text: string }> = [];

export type RecipientTarget =
  | { kind: 'group'; jid: string; label?: string }
  | { kind: 'individual'; phone: string; label?: string };

export type RecipientResult = { kind: 'group' | 'individual'; target: string; ok: boolean };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let sock: WASocket | null = null;
let connectionState: 'connecting' | 'open' | 'close' | 'logged_out' = 'connecting';
let shuttingDown = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let socketGeneration = 0;

type QrInfo = { dataUrl: string; generatedAt: number };
let qrCurrent: QrInfo | null = null;

function ensureAuthDir(): void {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }
}

function clearAuthDir(): void {
  try {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  try {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
}

function clearReconnectTimer(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(ms: number): void {
  if (shuttingDown) return;
  clearReconnectTimer();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    createSocket();
  }, ms);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function normalizedPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

async function readPhone(): Promise<string | null> {
  try {
    return await getSetting('whatsapp.phone');
  } catch {
    return null;
  }
}

export async function getStatus() {
  const connected = connectionState === 'open';
  let qr: string | null = null;
  if (qrCurrent && !connected) {
    const ageMs = Date.now() - qrCurrent.generatedAt;
    if (ageMs < 45000) {
      qr = qrCurrent.dataUrl;
    }
  }
  let enabled = false;
  try {
    enabled = (await getSetting('whatsapp.enabled')) === 'true';
  } catch {
    /* ignore */
  }
  return {
    connected,
    state: connectionState,
    qr,
    enabled,
    phone: (await readPhone()) ?? '',
    groupId: (await getGroupId()) ?? '',
  };
}

export async function getDestinationPhone(): Promise<string | null> {
  try {
    const raw = await getSetting('whatsapp.phone');
    if (!raw) return null;
    const normalized = normalizedPhone(raw);
    return normalized || null;
  } catch {
    return null;
  }
}

export async function getGroupId(): Promise<string | null> {
  try {
    return await getSetting('whatsapp.groupId');
  } catch {
    return null;
  }
}

export async function sendToJid(jid: string, text: string): Promise<boolean> {
  if (!jid) return false;
  if (connectionState === 'open' && sock) {
    try {
      // Simula comportamento humano de digitação para evitar detecção de bot pela Meta
      try {
        await sock.sendPresenceUpdate('composing', jid);
        // Tempo de digitação proporcional ao tamanho da mensagem (1.8s a 3.5s + jitter)
        const typingDelay = Math.min(3500, Math.max(1800, text.length * 20)) + Math.floor(Math.random() * 700);
        await sleep(typingDelay);
        await sock.sendPresenceUpdate('paused', jid);
        await sleep(300 + Math.floor(Math.random() * 300));
      } catch {
        /* ignore presence update errors */
      }

      await sock.sendMessage(jid, { text });
      return true;
    } catch (err) {
      console.error('[whatsapp] send failed, queueing:', err);
    }
  }
  QUEUE.push({ jid, text });
  return false;
}

export async function sendWhatsApp(phone: string, text: string): Promise<boolean> {
  const digits = normalizedPhone(phone);
  if (!digits) return false;
  return sendToJid(`${digits}@s.whatsapp.net`, text);
}

async function flushQueue(): Promise<void> {
  while (QUEUE.length > 0 && connectionState === 'open' && sock) {
    const item = QUEUE.shift();
    if (!item) break;
    try {
      await sendToJid(item.jid, item.text);
      // Pausa humanizada entre mensagens da fila
      await sleep(2500 + Math.floor(Math.random() * 2000));
    } catch (err) {
      console.error('[whatsapp] flush failed:', err);
    }
  }
}

export async function fetchGroups(): Promise<Array<{ id: string; subject: string }>> {
  if (connectionState !== 'open' || !sock) return [];
  try {
    const groups = await sock.groupFetchAllParticipating();
    return Object.entries(groups).map(([id, meta]) => ({ id, subject: meta.subject ?? '—' }));
  } catch (err) {
    console.error('[whatsapp] group fetch failed:', err);
    return [];
  }
}

export async function resolveRecipients(): Promise<RecipientTarget[]> {
  const targets: RecipientTarget[] = [];

  const groupId = await getGroupId();
  if (groupId) {
    targets.push({ kind: 'group', jid: groupId });
  }

  let recipients: Array<{ phone: string; label: string | null }> = [];
  try {
    recipients = await db
      .select({ phone: whatsappRecipients.phone, label: whatsappRecipients.label })
      .from(whatsappRecipients)
      .where(eq(whatsappRecipients.active, true))
      .all();
  } catch (err) {
    console.error('[whatsapp] failed to load recipients:', err);
  }
  for (const r of recipients) {
    const digits = normalizedPhone(r.phone);
    if (digits) targets.push({ kind: 'individual', phone: digits, label: r.label ?? undefined });
  }

  if (targets.length === 0) {
    const fallback = await getDestinationPhone();
    if (fallback) targets.push({ kind: 'individual', phone: fallback });
  }

  return targets;
}

export interface StockAlertData {
  itemId: string;
  itemName: string;
  unit: string;
  newQty: number;
  minQuantity: number;
  status: 'LOW_STOCK' | 'OUT_OF_STOCK';
}

/**
 * Formata mensagens de alerta de estoque. Se houver 2 ou mais materiais
 * atingindo o limite ao mesmo tempo, agrupa todos na mesma mensagem.
 */
export function formatStockAlertsMessage(alerts: StockAlertData[]): string {
  if (alerts.length === 1) {
    const a = alerts[0]!;
    const situacao = a.status === 'LOW_STOCK' ? 'Estoque Baixo' : 'Estoque Zerado';
    return (
      `📦 *Aviso de Estoque — GraficaOS*\n\n` +
      `Olá! Passando para avisar que o material *${a.itemName}* atingiu o nível de atenção:\n` +
      `• *Situação:* ${situacao}\n` +
      `• *Quantidade atual:* ${a.newQty} ${a.unit}\n` +
      `• *Estoque mínimo:* ${a.minQuantity} ${a.unit}\n\n` +
      `Por favor, verifique a reposição quando possível.`
    );
  }

  const itemsList = alerts
    .map((a) => {
      const situacao = a.status === 'LOW_STOCK' ? 'Estoque Baixo' : 'Estoque Zerado';
      return (
        `• *${a.itemName}*\n` +
        `  Situação: ${situacao} | Atual: ${a.newQty} ${a.unit} (Mín: ${a.minQuantity} ${a.unit})`
      );
    })
    .join('\n\n');

  return (
    `📦 *Aviso de Estoque — GraficaOS*\n\n` +
    `Olá! Passando para avisar que *${alerts.length} materiais* atingiram o nível de atenção:\n\n` +
    `${itemsList}\n\n` +
    `Por favor, verifique a reposição quando possível.`
  );
}

// ---------------------------------------------------------------------------
// Buffer de Agrupamento de Alertas (Debounce & Batching)
// Agrupa múltiplos alertas que cheguem na mesma janela de tempo (ex.: 3.5s)
// ---------------------------------------------------------------------------
const stockAlertBuffer = new Map<string, StockAlertData>();
let stockAlertBatchTimer: ReturnType<typeof setTimeout> | null = null;
const BATCH_WINDOW_MS = 3500;

export function enqueueStockAlert(alert: StockAlertData): void {
  stockAlertBuffer.set(alert.itemId, alert);

  if (!stockAlertBatchTimer) {
    stockAlertBatchTimer = setTimeout(() => {
      stockAlertBatchTimer = null;
      flushStockAlertBatch();
    }, BATCH_WINDOW_MS);
  }
}

export function flushStockAlertBatch(): void {
  if (stockAlertBuffer.size === 0) return;
  const alerts = Array.from(stockAlertBuffer.values());
  stockAlertBuffer.clear();

  const messageText = formatStockAlertsMessage(alerts);
  void enqueueOutboundMessage(messageText);
}

// ---------------------------------------------------------------------------
// Fila Sequencial de Mensagens (Outbound Queue)
// Garante envio ordenado, espaçamento humanizado e previne rajadas concorrentes
// ---------------------------------------------------------------------------
export interface QueuedWhatsAppMessage {
  id: string;
  text: string;
  spacingMs?: number;
  resolve?: (res: RecipientResult[]) => void;
  reject?: (err: unknown) => void;
}

const outboundQueue: QueuedWhatsAppMessage[] = [];
let isProcessingQueue = false;

export function enqueueOutboundMessage(
  text: string,
  options?: { spacingMs?: number },
): Promise<RecipientResult[]> {
  return new Promise((resolve, reject) => {
    // Evita duplicatas idênticas acumuladas na fila
    const isDup = outboundQueue.some((task) => task.text === text);
    if (isDup) {
      resolve([]);
      return;
    }

    outboundQueue.push({
      id: Math.random().toString(36).slice(2),
      text,
      spacingMs: options?.spacingMs,
      resolve,
      reject,
    });

    void processOutboundQueue();
  });
}

export async function processOutboundQueue(): Promise<void> {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  try {
    while (outboundQueue.length > 0) {
      if (connectionState !== 'open' || !sock) {
        // Pausa se desconectado, preservando as mensagens na fila
        break;
      }

      const task = outboundQueue.shift();
      if (!task) break;

      try {
        const results = await sendDirectToRecipients(task.text, task.spacingMs);
        task.resolve?.(results);
      } catch (err) {
        console.error('[whatsapp queue] send failed:', err);
        task.reject?.(err);
      }

      // Intervalo humanizado de descanso entre mensagens consecutivas diferentes (5s a 8s)
      if (outboundQueue.length > 0) {
        const cooldown = 5000 + Math.floor(Math.random() * 3000);
        await sleep(cooldown);
      }
    }
  } finally {
    isProcessingQueue = false;
  }
}

export function getQueueStatus(): { pendingAlerts: number; queuedMessages: number; isProcessing: boolean } {
  return {
    pendingAlerts: stockAlertBuffer.size,
    queuedMessages: outboundQueue.length,
    isProcessing: isProcessingQueue,
  };
}

export function clearOutboundQueueForTest(): void {
  outboundQueue.length = 0;
  stockAlertBuffer.clear();
  if (stockAlertBatchTimer) {
    clearTimeout(stockAlertBatchTimer);
    stockAlertBatchTimer = null;
  }
}

async function sendDirectToRecipients(
  text: string,
  spacingMs?: number,
): Promise<RecipientResult[]> {
  const results: RecipientResult[] = [];
  const targets = await resolveRecipients();

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]!;
    let ok = false;
    if (target.kind === 'group') {
      ok = await sendToJid(target.jid, text);
    } else {
      ok = await sendWhatsApp(target.phone, text);
    }
    results.push({ kind: target.kind, target: target.kind === 'group' ? target.jid : target.phone, ok });
    if (!ok) {
      console.error(
        `[whatsapp] send to ${target.kind} (${target.kind === 'group' ? target.jid : target.phone}) failed`,
      );
    } else {
      console.log(
        `[whatsapp] sent to ${target.kind} (${target.kind === 'group' ? target.jid : target.phone})`,
      );
    }

    // Pausa humanizada entre múltiplos destinatários (não enviar rajada)
    if (i < targets.length - 1) {
      const waitTime = spacingMs !== undefined ? spacingMs : (3000 + Math.floor(Math.random() * 3000));
      if (waitTime > 0) await sleep(waitTime);
    }
  }

  return results;
}

export function sendToRecipients(
  text: string,
  spacingMs?: number,
): Promise<RecipientResult[]> {
  return enqueueOutboundMessage(text, { spacingMs });
}

function createSocket(): void {
  const generation = ++socketGeneration;
  void (async () => {
    try {
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      if (generation !== socketGeneration) return;
      const { version } = await fetchLatestBaileysVersion();
      if (generation !== socketGeneration) return;

      const nextSock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        syncFullHistory: false,
        browser: ['GraficaOS', 'Windows', 'Chrome'],
        markOnlineOnConnect: true,
      });
      if (generation !== socketGeneration) return;
      sock = nextSock;

      sock.ev.on('creds.update', () => {
        if (generation !== socketGeneration) return;
        void saveCreds();
      });

      sock.ev.on('connection.update', (update) => {
        if (generation !== socketGeneration) return;

        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          QRCode.toDataURL(qr)
            .then((dataUrl: string) => {
              if (generation !== socketGeneration) return;
              qrCurrent = { dataUrl, generatedAt: Date.now() };
            })
            .catch((err: unknown) => console.error('[whatsapp] qr gen failed', err));
          return;
        }

        if (connection === 'open') {
          connectionState = 'open';
          qrCurrent = null;
          console.log('[whatsapp] connected');
          void flushQueue();
          void processOutboundQueue();
        } else if (connection === 'close') {
          const statusCode = (
            lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
          )?.output?.statusCode;
          if (statusCode === DisconnectReason.loggedOut) {
            connectionState = 'logged_out';
            qrCurrent = null;
            console.log('[whatsapp] logged out, starting new pairing');
            clearAuthDir();
            scheduleReconnect(500);
            return;
          }
          connectionState = 'close';
          console.log('[whatsapp] disconnected, reconnecting...');
          scheduleReconnect(3000);
        }
      });

      sock.ev.on('messages.upsert', () => {
        /* ignore inbound */
      });
    } catch (err) {
      console.error('[whatsapp] connect error:', err);
      connectionState = 'close';
      scheduleReconnect(5000);
    }
  })();
}

export function startWhatsApp(): void {
  if (shuttingDown) return;
  ensureAuthDir();
  createSocket();
}

export async function logoutWhatsApp(): Promise<void> {
  clearReconnectTimer();
  socketGeneration++;
  if (sock) {
    try {
      await withTimeout(sock.logout(), 5000);
    } catch {
      try {
        sock.end(new Error('logout'));
      } catch {
        /* ignore */
      }
    }
  }
  clearAuthDir();
  connectionState = 'logged_out';
  qrCurrent = null;
  createSocket();
}

export function reconnectWhatsApp(): void {
  clearReconnectTimer();
  socketGeneration++;
  if (sock) {
    try {
      sock.end(new Error('reconnect'));
    } catch {
      /* ignore */
    }
  }
  clearAuthDir();
  connectionState = 'logged_out';
  qrCurrent = null;
  createSocket();
}

export function stopWhatsApp(): void {
  shuttingDown = true;
  clearReconnectTimer();
  socketGeneration++;
  if (sock) {
    try {
      sock.end(new Error('server shutdown'));
    } catch {
      /* ignore */
    }
  }
}
