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

const AUTH_DIR = path.join(process.cwd(), 'wa_auth');
const QUEUE: Array<{ phone: string; text: string }> = [];

let sock: WASocket | null = null;
let connectionState: 'connecting' | 'open' | 'close' | 'logged_out' = 'connecting';
let shuttingDown = false;

type QrInfo = { dataUrl: string; generatedAt: number };
let qrCurrent: QrInfo | null = null;

function ensureAuthDir(): void {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
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

export async function sendWhatsApp(phone: string, text: string): Promise<boolean> {
  const digits = normalizedPhone(phone);
  if (!digits) return false;
  if (connectionState === 'open' && sock) {
    try {
      await sock.sendMessage(`${digits}@s.whatsapp.net`, { text });
      return true;
    } catch (err) {
      console.error('[whatsapp] send failed, queueing:', err);
    }
  }
  QUEUE.push({ phone: digits, text });
  return false;
}

async function flushQueue(): Promise<void> {
  while (QUEUE.length > 0 && connectionState === 'open' && sock) {
    const item = QUEUE.shift();
    if (!item) break;
    try {
      await sock.sendMessage(`${item.phone}@s.whatsapp.net`, { text: item.text });
    } catch (err) {
      console.error('[whatsapp] flush failed:', err);
    }
  }
}

function createSocket(): void {
  void (async () => {
    try {
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      const { version } = await fetchLatestBaileysVersion();

      sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        syncFullHistory: false,
        browser: ['GraficaOS', 'Windows', 'Chrome'],
        markOnlineOnConnect: true,
      });

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          QRCode.toDataURL(qr)
            .then((dataUrl: string) => {
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
        } else if (connection === 'close') {
          const statusCode = (
            lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
          )?.output?.statusCode;
          if (statusCode === DisconnectReason.loggedOut) {
            connectionState = 'logged_out';
            console.log('[whatsapp] logged out');
            return;
          }
          connectionState = 'close';
          console.log('[whatsapp] disconnected, reconnecting...');
          if (!shuttingDown) {
            setTimeout(() => createSocket(), 3000);
          }
        }
      });

      sock.ev.on('messages.upsert', () => {
        /* ignore inbound */
      });
    } catch (err) {
      console.error('[whatsapp] connect error:', err);
      connectionState = 'close';
      if (!shuttingDown) {
        setTimeout(() => createSocket(), 5000);
      }
    }
  })();
}

export function startWhatsApp(): void {
  ensureAuthDir();
  createSocket();
}

export async function logoutWhatsApp(): Promise<void> {
  if (sock) {
    try {
      sock.end(new Error('logout'));
    } catch {
      /* ignore */
    }
  }
  connectionState = 'logged_out';
  qrCurrent = null;
}

export function stopWhatsApp(): void {  shuttingDown = true;
  if (sock) {
    try {
      sock.end(new Error('server shutdown'));
    } catch {
      /* ignore */
    }
  }
}
