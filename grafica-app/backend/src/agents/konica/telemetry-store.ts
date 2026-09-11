import type { Server as SocketIOServer } from 'socket.io';
import { eq, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { machineTelemetry } from '../../db/schema.js';
import { newId } from '../../lib/ids.js';
import { getSetting, setSetting } from '../../lib/settings.js';
import type { KonicaDeviceInfo, KonicaTray } from './device-info.js';
import { tonerByColor } from './device-info.js';

const DEFAULT_TONER_CAPACITY = 20000; // Padrão: 20.000 páginas por toner
const TONER_CAPACITY_KEY = 'konica_toner_capacity_pages';
const TONER_PAGES_PRINTED_KEY = 'konica_toner_pages_printed';

export interface KonicaTelemetrySnapshot {
  online: boolean;
  statusSeverity?: string;
  statusMessage?: string;
  tonerCyanPct?: number;
  tonerMagentaPct?: number;
  tonerYellowPct?: number;
  tonerBlackPct?: number;
  wasteTonerLevel?: string;
  traysJson?: string;
}

/**
 * Calcula o percentual de toner baseado na contagem de páginas.
 * Usa a capacidade configurada e o total de páginas impressas.
 */
async function calculateTonerFromPageCount(totalPageCount: number): Promise<{
  C: number;
  M: number;
  Y: number;
  K: number;
}> {
  const capacityStr = await getSetting(TONER_CAPACITY_KEY);
  const capacity = capacityStr ? parseInt(capacityStr, 10) : DEFAULT_TONER_CAPACITY;

  const pagesPrintedStr = await getSetting(TONER_PAGES_PRINTED_KEY);
  const pagesPrinted = pagesPrintedStr ? parseInt(pagesPrintedStr, 10) : 0;

  // Se temos totalPageCount do dispositivo, usamos ele
  const effectivePrinted = totalPageCount > 0 ? totalPageCount : pagesPrinted;

  // Calcula percentual (inverso: mais páginas = menos toner)
  const pct = Math.max(0, Math.min(100, Math.round(((capacity - effectivePrinted) / capacity) * 100)));

  return { C: pct, M: pct, Y: pct, K: pct };
}

/**
 * Atualiza o contador de páginas impressas no settings.
 * Chamado após cada job ser processado.
 */
export async function incrementPagesPrinted(pages: number): Promise<void> {
  const currentStr = await getSetting(TONER_PAGES_PRINTED_KEY);
  const current = currentStr ? parseInt(currentStr, 10) : 0;
  await setSetting(TONER_PAGES_PRINTED_KEY, String(current + pages));
}

/**
 * Reseta o contador de páginas (quando o toner é substituído).
 */
export async function resetTonerPageCounter(): Promise<void> {
  await setSetting(TONER_PAGES_PRINTED_KEY, '0');
}

export function mapKonicaTelemetry(info: KonicaDeviceInfo): KonicaTelemetrySnapshot {
  const byColor = tonerByColor(info);
  return {
    online: info.online,
    statusSeverity: info.statusSeverity,
    statusMessage: info.statusMessage,
    tonerCyanPct: byColor.C,
    tonerMagentaPct: byColor.M,
    tonerYellowPct: byColor.Y,
    tonerBlackPct: byColor.K,
    wasteTonerLevel: info.wasteTonerLevel || undefined,
    traysJson: info.trays.length > 0 ? JSON.stringify(info.trays satisfies KonicaTray[]) : undefined,
  };
}

/**
 * Mapeia telemetria com fallback para contagem de páginas.
 * Se o toner não for exposto pelo dispositivo, calcula baseado no totalPageCount.
 */
export async function mapKonicaTelemetryWithFallback(
  info: KonicaDeviceInfo,
): Promise<KonicaTelemetrySnapshot> {
  const byColor = tonerByColor(info);

  // Se temos dados de toner do dispositivo, usa eles
  if (byColor.C !== undefined || byColor.M !== undefined || byColor.Y !== undefined || byColor.K !== undefined) {
    return {
      online: info.online,
      statusSeverity: info.statusSeverity,
      statusMessage: info.statusMessage,
      tonerCyanPct: byColor.C,
      tonerMagentaPct: byColor.M,
      tonerYellowPct: byColor.Y,
      tonerBlackPct: byColor.K,
      wasteTonerLevel: info.wasteTonerLevel || undefined,
      traysJson: info.trays.length > 0 ? JSON.stringify(info.trays satisfies KonicaTray[]) : undefined,
    };
  }

  // Fallback: calcula toner baseado na contagem de páginas
  const pageCountToner = info.totalPageCount
    ? await calculateTonerFromPageCount(info.totalPageCount)
    : { C: 100, M: 100, Y: 100, K: 100 }; // Default: 100% se não houver dados

  return {
    online: info.online,
    statusSeverity: info.statusSeverity,
    statusMessage: info.statusMessage,
    tonerCyanPct: pageCountToner.C,
    tonerMagentaPct: pageCountToner.M,
    tonerYellowPct: pageCountToner.Y,
    tonerBlackPct: pageCountToner.K,
    wasteTonerLevel: info.wasteTonerLevel || undefined,
    traysJson: info.trays.length > 0 ? JSON.stringify(info.trays satisfies KonicaTray[]) : undefined,
  };
}

export async function persistKonicaTelemetry(
  machineId: string,
  info: KonicaDeviceInfo,
  io: SocketIOServer,
): Promise<void> {
  const snap = await mapKonicaTelemetryWithFallback(info);

  await db.insert(machineTelemetry).values({
    id: newId(),
    machineId,
    ...snap,
  });

  const latest = await db
    .select()
    .from(machineTelemetry)
    .where(eq(machineTelemetry.machineId, machineId))
    .orderBy(desc(machineTelemetry.createdAt))
    .limit(1)
    .get();

  io.to('estoque').emit('machine:telemetry', latest ?? { machineId, ...snap });
}