"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  type Machine,
  type MachineTelemetry,
  type InkChannel,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const INK_META: { key: InkChannel["color"]; label: string; short: string; color: string; bar: string }[] = [
  { key: "C", label: "Ciano", short: "C", color: "text-sky-500", bar: "bg-sky-500" },
  { key: "LM", label: "Light Magenta", short: "LM", color: "text-fuchsia-500", bar: "bg-fuchsia-500" },
  { key: "M", label: "Magenta", short: "M", color: "text-pink-500", bar: "bg-pink-500" },
  { key: "LC", label: "Light Ciano", short: "LC", color: "text-cyan-600", bar: "bg-cyan-600" },
  { key: "Y", label: "Amarelo", short: "Y", color: "text-yellow-500", bar: "bg-yellow-500" },
  { key: "K", label: "Preto", short: "K", color: "text-gray-800", bar: "bg-gray-800" },
  { key: "OP", label: "Optimizer", short: "OP", color: "text-purple-500", bar: "bg-purple-500" },
];

function inkValue(telemetry: MachineTelemetry, key: InkChannel["color"]): number | undefined {
  const live = telemetry.live;
  const liveInk = live?.inks?.find((i) => i.color === key);
  if (liveInk) return liveInk.remainingMl;
  if (live) return undefined;
  const map: Record<string, number | undefined> = {
    C: telemetry.inkCyanMl,
    LC: telemetry.inkLightCyanMl,
    M: telemetry.inkMagentaMl,
    LM: telemetry.inkLightMagentaMl,
    Y: telemetry.inkYellowMl,
    K: telemetry.inkBlackMl,
    OP: telemetry.inkOptimizerMl,
  };
  return map[key];
}

function capacityOf(telemetry: MachineTelemetry): number {
  return telemetry.live?.capacityMl ?? telemetry.inkCapacityMl ?? 775;
}

function onLine(telemetry: MachineTelemetry): boolean {
  return telemetry.live?.online ?? telemetry.online;
}

export function MachineTelemetryPanel({
  machine,
  telemetry,
}: {
  machine: Machine;
  telemetry?: MachineTelemetry;
}) {
  const loading = telemetry === undefined;
  const online = telemetry ? onLine(telemetry) : false;
  const capacity = telemetry ? capacityOf(telemetry) : 775;

  const mediaName = telemetry?.live?.mediaName ?? telemetry?.mediaName;
  const mediaWidth = telemetry?.live?.mediaWidthMm ?? telemetry?.mediaWidthMm;
  const severity = telemetry?.live?.statusSeverity ?? telemetry?.statusSeverity;
  const message = telemetry?.live?.statusMessage ?? telemetry?.statusMessage;

  return (
    <Card className="rounded-[24px] p-5 shadow-sm border-gray-100 bg-card">
      <CardContent className="p-0 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <span className="text-base">{machine.name}</span>
            <Badge className="bg-purple-800 text-white">{machine.model}</Badge>
          </h3>
          {!loading && (
            <Badge
              variant="outline"
              className={cn(
                "rounded-full",
                online ? "border-emerald-500 text-emerald-600" : "border-red-400 text-red-600"
              )}
            >
              {online ? "● Online" : "● Offline"}
            </Badge>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-4 w-full rounded-md bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {message && severity && (
              <div
                className={cn(
                  "rounded-xl px-3 py-2 text-xs font-semibold",
                  severity === "normal" || severity === "ok"
                    ? "bg-emerald-50 text-emerald-700"
                    : severity === "minor"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-red-50 text-red-700"
                )}
              >
                {message}
              </div>
            )}

            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Mídia carregada
              </p>
              <p className="text-sm font-semibold text-gray-800">
                {mediaName ?? "—"}
                {mediaWidth ? <span className="text-muted-foreground font-normal"> · {mediaWidth} mm</span> : null}
              </p>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Nível no cartucho da máquina
                </p>
                <span className="text-[10px] text-muted-foreground font-medium">
                  {capacity} ml / cartucho
                </span>
              </div>
              {INK_META.map((ink) => {
                const val = inkValue(telemetry!, ink.key);
                const pct = val !== undefined ? Math.round((val / capacity) * 100) : undefined;
                return (
                  <div key={ink.key} className="flex items-center gap-3">
                    <span className={cn("w-8 text-xs font-black", ink.color)}>{ink.short}</span>
                    <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          ink.bar,
                          pct !== undefined && pct <= 15 && "bg-red-500"
                        )}
                        style={{ width: `${pct ?? 0}%` }}
                      />
                    </div>
                    <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">
                      {val !== undefined ? `${val} ml` : "—"}
                    </span>
                  </div>
                );
              })}
              <p className="text-[11px] text-muted-foreground pt-1 bg-muted/40 p-2 rounded-lg border border-gray-100">
                💡 Nível real do cartucho em uso na impressora ({capacity} ml). Cartuchos fechados de reserva são gerenciados na tela de Estoque.
              </p>
            </div>

            {telemetry!.maintenanceCartridgePct !== undefined ||
            telemetry!.live?.maintenanceCartridgePct !== undefined ? (
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 space-y-1 text-sm">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Manutenção
                </p>
                <p>
                  Cartucho de manutenção:{" "}
                  <span className="font-semibold">
                    {telemetry!.live?.maintenanceCartridgePct ?? telemetry!.maintenanceCartridgePct}%
                  </span>
                </p>
                <p>
                  Kits:{" "}
                  <span className="font-semibold">
                    #1 {telemetry!.live?.kit1Pct ?? telemetry!.kit1Pct ?? "—"}% · #2{" "}
                    {telemetry!.live?.kit2Pct ?? telemetry!.kit2Pct ?? "—"}% · #3{" "}
                    {telemetry!.live?.kit3Pct ?? telemetry!.kit3Pct ?? "—"}%
                  </span>
                </p>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
