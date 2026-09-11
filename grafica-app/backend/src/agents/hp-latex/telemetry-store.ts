import type { Server as SocketIOServer } from 'socket.io';
import { eq, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { machineTelemetry } from '../../db/schema.js';
import { newId } from '../../lib/ids.js';
import type { HpTelemetry } from './telemetry.js';

export interface TelemetrySnapshot {
  online: boolean;
  statusSeverity?: string;
  statusMessage?: string;
  mediaName?: string;
  mediaWidthMm?: number;
  inkCyanMl?: number;
  inkLightCyanMl?: number;
  inkMagentaMl?: number;
  inkLightMagentaMl?: number;
  inkYellowMl?: number;
  inkBlackMl?: number;
  inkOptimizerMl?: number;
  inkCapacityMl?: number;
  maintenanceCartridgePct?: number;
  kit1Pct?: number;
  kit2Pct?: number;
  kit3Pct?: number;
  dryingTempC?: number;
  curingTempC?: number;
}

export function mapTelemetry(telemetry: HpTelemetry): TelemetrySnapshot {
  const byColor: Record<string, number | undefined> = {};
  for (const ink of telemetry.inks ?? []) {
    byColor[ink.color] = ink.remainingMl;
  }

  return {
    online: telemetry.online,
    statusSeverity: telemetry.statusSeverity,
    statusMessage: telemetry.statusMessage,
    mediaName: telemetry.mediaName,
    mediaWidthMm: telemetry.mediaWidthMm,
    inkCyanMl: byColor['C'],
    inkLightCyanMl: byColor['LC'],
    inkMagentaMl: byColor['M'],
    inkLightMagentaMl: byColor['LM'],
    inkYellowMl: byColor['Y'],
    inkBlackMl: byColor['K'],
    inkOptimizerMl: byColor['OP'],
    inkCapacityMl: telemetry.capacityMl,
    maintenanceCartridgePct: telemetry.maintenanceCartridgePct,
    kit1Pct: telemetry.kit1Pct,
    kit2Pct: telemetry.kit2Pct,
    kit3Pct: telemetry.kit3Pct,
    dryingTempC: telemetry.dryingTempC,
    curingTempC: telemetry.curingTempC,
  };
}

export async function persistTelemetry(
  machineId: string,
  telemetry: HpTelemetry,
  io: SocketIOServer,
): Promise<void> {
  const snap = mapTelemetry(telemetry);

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
