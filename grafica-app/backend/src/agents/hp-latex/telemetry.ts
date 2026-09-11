export interface InkCartridge {
  color: 'C' | 'LC' | 'M' | 'LM' | 'Y' | 'K' | 'OP';
  sku: string;
  remainingMl: number;
  capacityMl: number;
  status: string;
}

export interface HpTelemetry {
  online: boolean;
  statusSeverity?: string;
  statusMessage?: string;
  mediaName?: string;
  mediaWidthMm?: number;
  inks?: InkCartridge[];
  capacityMl?: number;
  maintenanceCartridgePct?: number;
  kit1Pct?: number;
  kit2Pct?: number;
  kit3Pct?: number;
  dryingTempC?: number;
  curingTempC?: number;
}

const SUPPLIES_URL = (ip: string) => `http://${ip}/hp/device/webAccess/index.htm?content=supplies`;
const STATUS_URL = (ip: string) => `http://${ip}/hp/device/webAccess/printer_status_core.jsp`;
const ROOT_URL = (ip: string) => `http://${ip}/`;

const STATUS_TIMEOUT_MS = 5000;
const SUPPLIES_TIMEOUT_MS = 7000;
const ONLINE_TIMEOUT_MS = 3000;

const INK_COLORS: { key: InkCartridge['color']; sku: string }[] = [
  { key: 'M', sku: 'CZ684A' },
  { key: 'LM', sku: 'CZ687A' },
  { key: 'LC', sku: 'CZ686A' },
  { key: 'C', sku: 'CZ683A' },
  { key: 'OP', sku: 'CZ706A' },
  { key: 'Y', sku: 'CZ685A' },
  { key: 'K', sku: 'CZ682A' },
];

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

async function checkOnline(ip: string): Promise<boolean> {
  try {
    const res = await fetch(ROOT_URL(ip), { signal: AbortSignal.timeout(ONLINE_TIMEOUT_MS) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchPrinterStatus(
  ip: string,
): Promise<{ severity: string; message: string }> {
  const res = await fetch(STATUS_URL(ip), {
    method: 'POST',
    signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HP status returned ${res.status}`);
  const text = await res.text();
  const parts = text.split('|');
  return {
    severity: (parts[0] ?? '').trim(),
    message: (parts[1] ?? '').trim(),
  };
}

async function fetchSupplies(
  ip: string,
): Promise<{
  mediaName?: string;
  mediaWidthMm?: number;
  inks: InkCartridge[];
  capacityMl?: number;
  maintenanceCartridgePct?: number;
  kit1Pct?: number;
  kit2Pct?: number;
  kit3Pct?: number;
}> {
  const res = await fetch(SUPPLIES_URL(ip), {
    signal: AbortSignal.timeout(SUPPLIES_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HP supplies returned ${res.status}`);
  const html = await res.text();

  const inks: InkCartridge[] = [];
  const result: {
    mediaName?: string;
    mediaWidthMm?: number;
    inks: InkCartridge[];
    capacityMl?: number;
    maintenanceCartridgePct?: number;
    kit1Pct?: number;
    kit2Pct?: number;
    kit3Pct?: number;
  } = { inks };

  for (const cfg of INK_COLORS) {
    const skuIdx = html.indexOf(cfg.sku);
    if (skuIdx === -1) continue;

    const before = html.slice(Math.max(0, skuIdx - 500), skuIdx + 250);
    const remainingMatch = before.match(/(\d+(?:[.,]\d+)?)\s*ml/i);
    const clean = before.replace(/<[^>]+>/g, ' ');
    const statusMatch = clean.match(/\b(OK|LOW|OUT|VARYING|EMPTY)\b/i);

    const remainingMl = remainingMatch ? parseFloat(remainingMatch[1].replace(',', '.')) : undefined;
    if (remainingMl !== undefined) {
      result.capacityMl = result.capacityMl ?? 775;
      inks.push({
        color: cfg.key,
        sku: cfg.sku,
        remainingMl,
        capacityMl: 775,
        status: statusMatch ? statusMatch[1].toUpperCase() : 'OK',
      });
    }
  }

  const mediaMatch = html.match(
    /(?:loadMediaName|currentMedia|rollName|mediaLoaded|substrateName|\bm[ée]dia\b|Substrate)[^>]*>\s*([^<]+?)\s*<(?:\/|td)/i,
  ) || html.match(/\<caption\>Substrate\<\/caption\>[\s\S]*?\<td\>[^<]*\<\/td\>\s*\<td\>([^<]+?)\<\/td\>/i);
  if (mediaMatch) {
    const raw = mediaMatch[1];
    if (raw && !/^(substrate|roll|type)$/i.test(raw.trim())) {
      result.mediaName = decodeEntities(raw).trim();
    }
  }

  const widthMatch =
    html.match(/(?:width|largura|rollWidth)[^>]*>\s*([\d.,]+)/i) ||
    html.match(/Width:\s*([\d.,]+)\s*mm/i);
  if (widthMatch) {
    const w = parseFloat(widthMatch[1].replace(',', '.'));
    if (Number.isFinite(w) && w > 0 && w < 5000) result.mediaWidthMm = w;
  }

  const maintMatch = html.match(/maintenance[^>]*cartridge[^>]*>\s*([\d]+)\s*%/i);
  if (maintMatch) result.maintenanceCartridgePct = parseInt(maintMatch[1], 10);

  const kitMatch = html.match(/preventive[^>]*kit/i);
  if (kitMatch) {
    const block = html.slice(kitMatch.index ?? 0, (kitMatch.index ?? 0) + 2500);
    const pcts = [...block.matchAll(/([\d]+)\s*%/g)].map((m) => parseInt(m[1], 10));
    if (pcts[0] !== undefined) result.kit1Pct = pcts[0];
    if (pcts[1] !== undefined) result.kit2Pct = pcts[1];
    if (pcts[2] !== undefined) result.kit3Pct = pcts[2];
  }

  return result;
}

export async function getHpTelemetry(ip: string): Promise<HpTelemetry> {
  const online = await checkOnline(ip);
  const base: HpTelemetry = { online };

  if (!online) return base;

  try {
    const status = await fetchPrinterStatus(ip);
    base.statusSeverity = status.severity;
    base.statusMessage = status.message;
  } catch {
    base.statusSeverity = 'unknown';
    base.statusMessage = 'Falha ao ler status do EWS';
  }

  try {
    const supplies = await fetchSupplies(ip);
    base.mediaName = supplies.mediaName;
    base.mediaWidthMm = supplies.mediaWidthMm;
    base.inks = supplies.inks;
    base.capacityMl = supplies.capacityMl;
    base.maintenanceCartridgePct = supplies.maintenanceCartridgePct;
    base.kit1Pct = supplies.kit1Pct;
    base.kit2Pct = supplies.kit2Pct;
    base.kit3Pct = supplies.kit3Pct;
  } catch {
    // best-effort
  }

  return base;
}
