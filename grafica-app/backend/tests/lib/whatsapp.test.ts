import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const baileys = vi.hoisted(() => ({
  makeWASocket: vi.fn(),
  useMultiFileAuthState: vi.fn(),
  fetchLatestBaileysVersion: vi.fn(),
  DisconnectReason: { loggedOut: 401, connectionClosed: 428 },
}));

vi.mock('@whiskeysockets/baileys', () => baileys);

const settings = vi.hoisted(() => ({
  getSetting: vi.fn().mockResolvedValue(null),
  setSetting: vi.fn(),
}));

vi.mock('../../src/lib/settings.js', () => settings);

const qrcode = vi.hoisted(() => ({
  toDataURL: vi.fn(),
}));

vi.mock('qrcode', () => ({ default: qrcode }));

import {
  DisconnectReason,
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode';

const AUTH_DIR = process.env.GRAFICA_WA_AUTH_DIR as string;

type FakeSock = ReturnType<typeof fakeSocket>;
type WaModule = typeof import('../../src/lib/whatsapp.js');

function fakeSocket() {
  const ev = new EventEmitter();
  return {
    ev,
    logout: vi.fn().mockResolvedValue(undefined),
    end: vi.fn(),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  };
}

async function flushPromises() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

function lastSock(): FakeSock {
  const results = makeWASocket.mock.results;
  const last = results[results.length - 1];
  if (!last) throw new Error('nenhum socket criado');
  return last.value as FakeSock;
}

describe('whatsapp lib', () => {
  let wa: WaModule;

  beforeEach(async () => {
    vi.useRealTimers();
    vi.clearAllMocks();
    fetchLatestBaileysVersion.mockResolvedValue({ version: [7, 0, 0] });
    useMultiFileAuthState.mockResolvedValue({ state: { creds: {} }, saveCreds: vi.fn() });
    makeWASocket.mockImplementation(() => fakeSocket());
    qrcode.toDataURL.mockResolvedValue('data:image/png;base64,FAKEQR');
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    vi.resetModules();
    wa = await import('../../src/lib/whatsapp.js');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('gera um QR novo após logout real e limpa a sessão persistida', async () => {
    wa.startWhatsApp();
    await flushPromises();

    const first = lastSock();
    first.ev.emit('connection.update', { connection: 'open' });
    expect((await wa.getStatus()).connected).toBe(true);

    await wa.logoutWhatsApp();
    await flushPromises();

    expect(first.logout).toHaveBeenCalledTimes(1);
    expect(makeWASocket).toHaveBeenCalledTimes(2);
    expect(fs.readdirSync(AUTH_DIR)).toHaveLength(0);

    const status = await wa.getStatus();
    expect(status.connected).toBe(false);
    expect(status.state).toBe('logged_out');
    expect(status.qr).toBeNull();

    const second = lastSock();
    second.ev.emit('connection.update', { qr: 'WA_TEST_QR_TOKEN' });
    await flushPromises();

    const statusWithQr = await wa.getStatus();
    expect(statusWithQr.state).toBe('logged_out');
    expect(statusWithQr.qr).toBe('data:image/png;base64,FAKEQR');
  });

  it('reconecta sozinho após uma desconexão comum (close sem loggedOut)', async () => {
    vi.useFakeTimers();

    wa.startWhatsApp();
    await flushPromises();

    const first = lastSock();
    first.ev.emit('connection.update', { connection: 'close' });

    vi.advanceTimersByTime(3000);
    await flushPromises();

    expect(makeWASocket).toHaveBeenCalledTimes(2);
  });

  it('logout externo (loggedOut) limpa a sessão e reinicia pareamento', async () => {
    vi.useFakeTimers();

    fs.writeFileSync(path.join(AUTH_DIR, 'creds.json'), '{}');

    wa.startWhatsApp();
    await flushPromises();

    const first = lastSock();
    first.ev.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.loggedOut } } },
    });
    await flushPromises();

    expect((await wa.getStatus()).state).toBe('logged_out');
    expect(fs.readdirSync(AUTH_DIR)).toHaveLength(0);

    vi.advanceTimersByTime(500);
    await flushPromises();

    expect(makeWASocket).toHaveBeenCalledTimes(2);
  });

  it('reconnectWhatsApp gera um novo QR a partir de sessão limpa', async () => {
    wa.startWhatsApp();
    await flushPromises();

    const first = lastSock();
    first.ev.emit('connection.update', { connection: 'open' });
    expect((await wa.getStatus()).connected).toBe(true);

    wa.reconnectWhatsApp();
    await flushPromises();

    expect(makeWASocket).toHaveBeenCalledTimes(2);
    expect(fs.readdirSync(AUTH_DIR)).toHaveLength(0);
    expect((await wa.getStatus()).state).toBe('logged_out');

    const second = lastSock();
    second.ev.emit('connection.update', { qr: 'WA_TEST_QR_TOKEN' });
    await flushPromises();

    expect((await wa.getStatus()).qr).toBe('data:image/png;base64,FAKEQR');
  });
});