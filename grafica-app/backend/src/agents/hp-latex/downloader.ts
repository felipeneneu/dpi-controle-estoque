import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HP_ROOT = (ip: string) => `http://${ip}/`;
const HP_ACCOUNTING = (ip: string) => `http://${ip}/hp/device/webAccess/accounting.xls?cost=y`;

export type DownloadResult =
  | { ok: true; filePath: string; fileName: string }
  | { ok: false; reason: 'asleep' | 'unexpected'; status?: number };

export async function checkPrinterOnline(ip: string, timeoutMs = 3000): Promise<boolean> {
  try {
    const res = await fetch(HP_ROOT(ip), {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function isSleepPage(text: string): boolean {
  const firstBytes = text.slice(0, 4096);
  return (
    /state="sleeping"/i.test(firstBytes) ||
    /Modo de economia de energia/i.test(firstBytes) ||
    /Modo de inatividade/i.test(firstBytes) ||
    /name="WakeUp"/i.test(firstBytes)
  );
}

export async function downloadAccounting(
  ip: string,
  timeoutMs = 10_000,
): Promise<DownloadResult> {
  const res = await fetch(HP_ACCOUNTING(ip), {
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    return { ok: false, reason: 'unexpected', status: res.status };
  }

  const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
  if (contentType.includes('html')) {
    const text = await res.text();
    if (isSleepPage(text)) {
      // HP Latex entrou em modo de economia de energia: o accounting.xls não é servido.
      return { ok: false, reason: 'asleep' };
    }
    return { ok: false, reason: 'unexpected', status: 200 };
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const ts = Date.now();
  const fileName = `hp-accounting-${ts}.xls`;
  const filePath = join(tmpdir(), fileName);

  await writeFile(filePath, buffer);

  return { ok: true, filePath, fileName };
}

export async function cleanupFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // file may not exist — ignore
  }
}
