import type { FetchResult } from './types.js';

const KONICA_URL = process.env.KONICA_URL || 'http://192.168.234.68:30083';
const KONICA_TIMEOUT_MS = Number(process.env.KONICA_TIMEOUT_MS) || 10_000;
const KONICA_FINISHED_CONTAINER = Number(process.env.KONICA_FINISHED_CONTAINER) || 268435444;
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1_000, 3_000, 5_000];

export const konicaBaseUrl = KONICA_URL;

export async function checkKonicaOnline(timeoutMs = 3000): Promise<boolean> {
  return checkUrlOnline(KONICA_URL, timeoutMs);
}

export async function checkUrlOnline(baseUrl: string, timeoutMs = 3000): Promise<boolean> {
  const url = baseUrl.startsWith('http') ? baseUrl : `http://${baseUrl}/`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface KonicaSession {
  sessionId: string;
  viewId: number;
}

export async function registerSession(baseUrl: string): Promise<KonicaSession | null> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/register.fcgi`, {
        signal: AbortSignal.timeout(KONICA_TIMEOUT_MS),
      });
      if (!res.ok) {
        console.warn(`[Konica] registerSession attempt ${attempt + 1} failed: HTTP ${res.status}`);
        if (attempt < MAX_RETRIES - 1) {
          await sleep(RETRY_DELAYS_MS[attempt]);
        }
        continue;
      }
      const data = (await res.json()) as { sessionId?: string; viewId?: number } | null;
      if (data && typeof data.sessionId === 'string' && data.sessionId.length > 0) {
        return { sessionId: data.sessionId, viewId: typeof data.viewId === 'number' ? data.viewId : 0 };
      }
      console.warn(`[Konica] registerSession attempt ${attempt + 1}: invalid response`);
    } catch (err) {
      console.warn(`[Konica] registerSession attempt ${attempt + 1} error:`, err);
    }
    if (attempt < MAX_RETRIES - 1) {
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  return null;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJobList(
  baseUrl: string,
  session: KonicaSession,
): Promise<unknown | null> {
  const url =
    `${baseUrl}/jobList.fcgi?containerId=${KONICA_FINISHED_CONTAINER}` +
    `&sessionId=${encodeURIComponent(session.sessionId)}&viewId=${session.viewId}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(KONICA_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[Konica] fetchJobList HTTP ${res.status}`);
      return null;
    }
    return res.json();
  } catch (err) {
    console.warn('[Konica] fetchJobList error:', err);
    return null;
  }
}

function isErrorResult(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const result = (raw as Record<string, unknown>).result as Record<string, unknown> | undefined;
  return result?.type === 'error';
}

async function fetchDeviceInfoRaw(
  baseUrl: string,
  session: KonicaSession,
): Promise<unknown | null> {
  const url =
    `${baseUrl}/deviceInfo.fcgi` +
    `?sessionId=${encodeURIComponent(session.sessionId)}&viewId=${session.viewId}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(KONICA_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[Konica] fetchDeviceInfoRaw HTTP ${res.status}`);
      return null;
    }
    return res.json();
  } catch (err) {
    console.warn('[Konica] fetchDeviceInfoRaw error:', err);
    return null;
  }
}

export async function fetchDeviceInfo(
  baseUrl: string = KONICA_URL,
): Promise<
  | { ok: false; reason: 'offline' }
  | { ok: false; reason: 'auth'; status: number }
  | { ok: false; reason: 'error' }
  | { ok: true; raw: unknown }
> {
  const online = await checkKonicaOnline(3000);
  if (!online) return { ok: false, reason: 'offline' };

  let session = await registerSession(baseUrl);
  if (!session) return { ok: false, reason: 'auth', status: 401 };

  let raw = await fetchDeviceInfoRaw(baseUrl, session);

  if (raw == null || isErrorResult(raw)) {
    session = await registerSession(baseUrl);
    if (!session) return { ok: false, reason: 'auth', status: 401 };
    raw = await fetchDeviceInfoRaw(baseUrl, session);
  }

  if (raw == null || isErrorResult(raw)) return { ok: false, reason: 'error' };

  return { ok: true, raw };
}

export async function fetchJobs(baseUrl: string = KONICA_URL): Promise<FetchResult> {
  const online = await checkKonicaOnline(3000);
  if (!online) {
    return { ok: false, reason: 'offline' };
  }

  let session = await registerSession(baseUrl);
  if (!session) {
    return { ok: false, reason: 'auth', status: 401 };
  }

  let raw = await fetchJobList(baseUrl, session);

  if (raw == null || isErrorResult(raw)) {
    session = await registerSession(baseUrl);
    if (!session) return { ok: false, reason: 'auth', status: 401 };
    raw = await fetchJobList(baseUrl, session);
  }

  if (raw == null || isErrorResult(raw)) {
    return { ok: false, reason: 'error' };
  }

  return { ok: true, raw };
}

async function fetchProductionDataRaw(
  baseUrl: string,
  session: KonicaSession,
): Promise<unknown | null> {
  const url =
    `${baseUrl}/productionData.fcgi` +
    `?sessionId=${encodeURIComponent(session.sessionId)}&viewId=${session.viewId}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(KONICA_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[Konica] fetchProductionDataRaw HTTP ${res.status}`);
      return null;
    }
    return res.json();
  } catch (err) {
    console.warn('[Konica] fetchProductionDataRaw error:', err);
    return null;
  }
}

export async function fetchProductionData(
  baseUrl: string = KONICA_URL,
): Promise<
  | { ok: false; reason: 'offline' }
  | { ok: false; reason: 'auth'; status: number }
  | { ok: false; reason: 'error' }
  | { ok: true; raw: unknown }
> {
  const online = await checkKonicaOnline(3000);
  if (!online) return { ok: false, reason: 'offline' };

  let session = await registerSession(baseUrl);
  if (!session) return { ok: false, reason: 'auth', status: 401 };

  let raw = await fetchProductionDataRaw(baseUrl, session);

  if (raw == null || isErrorResult(raw)) {
    session = await registerSession(baseUrl);
    if (!session) return { ok: false, reason: 'auth', status: 401 };
    raw = await fetchProductionDataRaw(baseUrl, session);
  }

  if (raw == null || isErrorResult(raw)) return { ok: false, reason: 'error' };

  return { ok: true, raw };
}
