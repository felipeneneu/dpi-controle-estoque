import { fetchDeviceInfo } from './fetcher.js';
import { getSetting } from '../../lib/settings.js';

const DEFAULT_TONER_CAPACITY_GRAMS = 300;
const TONER_CAPACITY_KEY = 'konica_toner_capacity_grams';

export interface KonicaToner {
  color: 'C' | 'M' | 'Y' | 'K';
  name: string;
  /** Nível de toner em % (0-100). */
  amountPct: number;
  /** level pode ser 'none' (sem alerta), 'low', 'empty', etc. */
  level: string;
  /** Valor original retornado pelo dispositivo (gramas ou %). */
  rawAmount: number;
}

export interface KonicaTray {
  trayId: string;
  /** Names como "Coucher 150G", "Coucher 250G", A4, etc. */
  paperName: string;
  paperAmount: number;
  targetPaperSize: string;
  mediaType: string;
  mediaWeight: string;
}

export interface KonicaDeviceInfo {
  deviceName: string;
  online: boolean;
  statusSeverity: string;
  statusMessage: string;
  toner: KonicaToner[];
  wasteTonerLevel: string;
  trays: KonicaTray[];
  macAddress?: string;
  ipV4Address?: string;
  holdJobCount?: number;
  totalPageCount?: number;
}

interface RawToner {
  name?: string;
  amount?: number;
  level?: string;
}

interface RawTray {
  trayId?: string;
  MainPaperProfileName?: string;
  paperAmount?: number;
  TargetPaperSize?: string;
  MediaTypeAuto?: string;
  MediaWeightAuto?: string;
}

interface RawDeviceInfo {
  printerInformation?: {
    deviceName?: string;
    statusCount?: number;
    printerStatus?: unknown[];
    toner?: RawToner[];
    inputTrays?: RawTray[];
    boxes?: Array<{ name?: string; level?: string }>;
    macAddress?: string;
    ipV4Address?: string;
    counters?: {
      totalPageCount?: number;
    };
  };
  storedJobInformation?: {
    holdJobCount?: number;
  };
}

const TONER_COLORS: Record<string, KonicaToner['color']> = {
  cyan: 'C',
  magenta: 'M',
  yellow: 'Y',
  black: 'K',
};

function tonerLevelSeverity(level: string | undefined): string {
  const l = (level ?? '').toLowerCase();
  if (l === 'empty' || l === 'low') return 'major';
  if (l === 'warn') return 'minor';
  return 'normal';
}

/** Interpreta o deviceInfo.fcgi do ProfiWEB (AccurioPrint). */
export function parseDeviceInfo(raw: unknown, tonerCapacityGrams?: number): KonicaDeviceInfo {
  const info = (raw as RawDeviceInfo) ?? {};
  const printer = info.printerInformation ?? {};

  const capacity = tonerCapacityGrams ?? DEFAULT_TONER_CAPACITY_GRAMS;

  const toner = (printer.toner ?? [])
    .map((t: RawToner) => {
      const color = TONER_COLORS[(t.name ?? '').toLowerCase()];
      if (!color) return null;
      const rawAmount = typeof t.amount === 'number' ? t.amount : 0;

      let amountPct: number;
      if (rawAmount > 100) {
        amountPct = Math.min(100, Math.max(0, Math.round((rawAmount / capacity) * 100)));
      } else {
        amountPct = Math.min(100, Math.max(0, Math.round(rawAmount)));
      }

      return {
        color,
        name: t.name ?? '',
        amountPct,
        level: t.level ?? 'none',
        rawAmount,
      };
    })
    .filter((t): t is KonicaToner => t !== null);

  const trays = (printer.inputTrays ?? [])
    .map((t: RawTray) => ({
      trayId: t.trayId ?? '?',
      paperName: (t.MainPaperProfileName ?? '').trim(),
      paperAmount: typeof t.paperAmount === 'number' ? t.paperAmount : 0,
      targetPaperSize: t.TargetPaperSize ?? '',
      mediaType: t.MediaTypeAuto ?? '',
      mediaWeight: t.MediaWeightAuto ?? '',
    }))
    .filter((t) => t.paperAmount > 0 || t.paperName);

  const statusCount = printer.statusCount ?? 0;
  const statuses = (printer.printerStatus ?? []) as Array<{ message?: string; code?: string } | string>;

  const isLowPower = statuses.some((s) => {
    const str = typeof s === 'string' ? s : s.message ?? s.code ?? '';
    const lower = str.toLowerCase();
    return lower.includes('sleep') || lower.includes('low power') || lower.includes('energy save') || lower.includes('economia');
  });

  const statusSeverity = isLowPower ? 'info' : statusCount > 0 ? 'major' : 'normal';
  const statusMessage = isLowPower
    ? 'Modo de economia de energia'
    : statuses.length > 0
      ? statuses
          .map((s) => {
            if (typeof s === 'string') return s;
            if (s.message) return s.message;
            if (s.code) return s.code;
            return 'Status indisponível';
          })
          .join('; ')
      : toner.length > 0 && toner.some((t) => t.amountPct <= 15)
        ? 'Nível baixo de toner'
        : 'Operando normalmente';

  const wasteTonerLevel =
    (printer.boxes ?? []).find((b) => (b.name ?? '').toLowerCase().includes('waste'))?.level ?? '';

  return {
    deviceName: printer.deviceName ?? 'AccurioPrint',
    online: true,
    statusSeverity,
    statusMessage,
    toner,
    wasteTonerLevel,
    trays,
    macAddress: printer.macAddress,
    ipV4Address: printer.ipV4Address,
    holdJobCount: info.storedJobInformation?.holdJobCount,
    totalPageCount: printer.counters?.totalPageCount,
  };
}

export type { KonicaDeviceInfo as KonicaTelemetryData };

/**
 * Busca o estado do equipamento e devolve já tipado.
 * `offline`/falhas de sessão devolvem um snapshot marcado offline.
 */
export async function getKonicaDeviceInfo(
  baseUrl?: string,
): Promise<KonicaDeviceInfo> {
  const result = await fetchDeviceInfo(baseUrl);

  if (!result.ok) {
    return {
      deviceName: 'AccurioPrint',
      online: false,
      statusSeverity: 'unknown',
      statusMessage:
        result.reason === 'offline'
          ? 'Impressora offline'
          : result.reason === 'auth'
            ? 'Falha de autenticação no PrintManager'
            : 'Falha ao ler status do equipamento',
      toner: [],
      wasteTonerLevel: '',
      trays: [],
    };
  }

  const capacityStr = await getSetting(TONER_CAPACITY_KEY);
  const capacity = capacityStr ? parseInt(capacityStr, 10) : DEFAULT_TONER_CAPACITY_GRAMS;

  return parseDeviceInfo(result.raw as unknown, capacity);
}

/** Nível de toner em % por cor (usado no snapshot de telemetria). */
export function tonerByColor(info: KonicaDeviceInfo): Record<'C' | 'M' | 'Y' | 'K', number | undefined> {
  const byColor: Record<'C' | 'M' | 'Y' | 'K', number | undefined> = {
    C: undefined,
    M: undefined,
    Y: undefined,
    K: undefined,
  };
  for (const t of info.toner) {
    byColor[t.color] = t.amountPct;
  }
  return byColor;
}

export interface KonicaProductionData {
  activeJobs: number;
  currentPage?: number;
  totalPages?: number;
  jobName?: string;
  status?: string;
  mediaName?: string;
  mediaSize?: string;
}

/** Interpreta o productionData.fcgi do ProfiWEB (AccurioPrint). */
export function parseProductionData(raw: unknown): KonicaProductionData {
  const data = (raw as Record<string, unknown>) ?? {};

  const jobList = data.jobList as Array<Record<string, unknown>> | undefined;
  const activeJobs = Array.isArray(jobList) ? jobList.length : 0;

  let currentPage: number | undefined;
  let totalPages: number | undefined;
  let jobName: string | undefined;
  let status: string | undefined;
  let mediaName: string | undefined;
  let mediaSize: string | undefined;

  if (Array.isArray(jobList) && jobList.length > 0) {
    const active = jobList[0];
    jobName = typeof active.jobName === 'string' ? active.jobName : undefined;
    status = typeof active.status === 'string' ? active.status : undefined;
    currentPage = typeof active.currentPage === 'number' ? active.currentPage : undefined;
    totalPages = typeof active.totalPages === 'number' ? active.totalPages : undefined;
    mediaName = typeof active.mediaName === 'string' ? active.mediaName : undefined;
    mediaSize = typeof active.mediaSize === 'string' ? active.mediaSize : undefined;
  }

  return {
    activeJobs,
    currentPage,
    totalPages,
    jobName,
    status,
    mediaName,
    mediaSize,
  };
}