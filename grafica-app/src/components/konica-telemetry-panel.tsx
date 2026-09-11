"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { type Machine, type MachineTelemetry, type KonicaTray } from "@/lib/api";
import { cn } from "@/lib/utils";

const TONER_META: { key: "C" | "M" | "Y" | "K"; label: string; color: string; bar: string }[] = [
  { key: "C", label: "Ciano", color: "text-sky-500", bar: "bg-sky-500" },
  { key: "M", label: "Magenta", color: "text-pink-500", bar: "bg-pink-500" },
  { key: "Y", label: "Amarelo", color: "text-yellow-500", bar: "bg-yellow-500" },
  { key: "K", label: "Preto", color: "text-gray-800", bar: "bg-gray-800" },
];

function tonerValue(telemetry: MachineTelemetry, key: "C" | "M" | "Y" | "K"): number | undefined {
  const live = telemetry.live;
  if (live) {
    const map: Record<string, number | undefined> = {
      C: live.tonerCyanPct,
      M: live.tonerMagentaPct,
      Y: live.tonerYellowPct,
      K: live.tonerBlackPct,
    };
    return map[key];
  }
  const map: Record<string, number | undefined> = {
    C: telemetry.tonerCyanPct,
    M: telemetry.tonerMagentaPct,
    Y: telemetry.tonerYellowPct,
    K: telemetry.tonerBlackPct,
  };
  return map[key];
}

function onLine(telemetry: MachineTelemetry): boolean {
  return telemetry.live?.online ?? telemetry.online;
}

function traysOf(telemetry: MachineTelemetry): KonicaTray[] {
  return telemetry.live?.trays ?? telemetry.trays ?? [];
}

export function KonicaTelemetryPanel({
  machine,
  telemetry,
}: {
  machine: Machine;
  telemetry?: MachineTelemetry;
}) {
  const loading = telemetry === undefined;
  const online = telemetry ? onLine(telemetry) : false;
  const trays = telemetry ? traysOf(telemetry) : [];
  const severity = telemetry?.live?.statusSeverity ?? telemetry?.statusSeverity;
  const message = telemetry?.live?.statusMessage ?? telemetry?.statusMessage;
  const waste = telemetry?.live?.wasteTonerLevel ?? telemetry?.wasteTonerLevel;

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
                    : severity === "info"
                    ? "bg-blue-50 text-blue-700"
                    : severity === "minor"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-red-50 text-red-700"
                )}
              >
                {message}
              </div>
            )}

            <div className="space-y-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Nível de toner (CMYK)
              </p>
              {TONER_META.map((toner) => {
                const val = tonerValue(telemetry!, toner.key);
                return (
                  <div key={toner.key} className="flex items-center gap-3">
                    <span className={cn("w-8 text-xs font-black", toner.color)}>{toner.key}</span>
                    <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          toner.bar,
                          val !== undefined && val <= 15 && "bg-red-500"
                        )}
                        style={{ width: `${val ?? 0}%` }}
                      />
                    </div>
                    <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                      {val !== undefined ? `${val}%` : "—"}
                    </span>
                  </div>
                );
              })}
              {waste ? (
                <p className="text-[10px] text-muted-foreground pt-1">
                  Reservatório de toner residual: {waste}
                </p>
              ) : null}
            </div>

            {trays.length > 0 && (
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Bandejas de papel
                </p>
                {trays.map((t) => (
                  <div key={t.trayId} className="text-sm flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-800 truncate">
                      {t.paperName || "—"}
                      <span className="text-muted-foreground font-normal">
                        {t.targetPaperSize ? ` · ${t.targetPaperSize}` : ""}
                      </span>
                    </span>
                    <span className="tabular-nums text-muted-foreground whitespace-nowrap">
                      {t.paperAmount} folhas
                    </span>
                  </div>
                ))}
              </div>
            )}

            {!online && (
              <p className="text-xs text-red-600 font-semibold">
                Sem conexão com o PrintManager — mostrando último snapshot registrado.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}