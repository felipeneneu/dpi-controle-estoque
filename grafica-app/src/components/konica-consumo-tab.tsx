"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { type Machine } from "@/lib/api";
import { useConsumptionReport } from "@/lib/queries/reports";
import { LoadingState } from "@/components/ui/spinner";

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface KonicaConsumoData {
  month: string;
  machineId: string | null;
  machineName: string | null;
  isKonica: boolean;
  totals: {
    jobs: number;
    areaM2: number;
    inkTotalMl: number;
    inkCyanMl: number;
    inkLightCyanMl: number;
    inkMagentaMl: number;
    inkLightMagentaMl: number;
    inkYellowMl: number;
    inkBlackMl: number;
    inkOptimizerMl: number;
  };
  konicaTotals: {
    totalPages: number;
    totalSheets: number;
  };
  byMedia: Array<{
    media: string;
    m2: number;
    sheets: number;
    jobs: number;
  }>;
}

export function KonicaConsumoTab({ machine }: { machine: Machine }) {
  const [month, setMonth] = useState(currentMonth());
  const report = useConsumptionReport(machine.id, month);
  const r = report.data as KonicaConsumoData | undefined;

  return (
    <Card className="rounded-[24px] p-5 shadow-sm border-gray-100 bg-card">
      <CardContent className="p-0">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="font-bold text-gray-900">Consumo Mensal</h3>
            <p className="text-xs text-muted-foreground">
              Páginas, folhas e tipos de mídia impressos neste equipamento
            </p>
          </div>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-10 rounded-xl border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring"
          />
        </div>

        {report.isLoading ? (
          <LoadingState label="Carregando consumo…" />
        ) : r ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-xs text-muted-foreground">Jobs</p>
                <p className="text-xl font-bold text-gray-900">{r.totals.jobs}</p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-xs text-muted-foreground">Total de páginas</p>
                <p className="text-xl font-bold text-gray-900">
                  {r.konicaTotals.totalPages.toLocaleString("pt-BR")}
                </p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-xs text-muted-foreground">Total de folhas</p>
                <p className="text-xl font-bold text-gray-900">
                  {r.konicaTotals.totalSheets.toLocaleString("pt-BR")}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Consumo por tipo de mídia
              </p>
              {r.byMedia.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum job registrado para este período.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-gray-100">
                      <th className="py-2">Mídia</th>
                      <th className="py-2 text-right">Jobs</th>
                      <th className="py-2 text-right">Folhas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.byMedia.map((m) => (
                      <tr key={m.media} className="border-b border-gray-50">
                        <td className="py-2 font-medium text-gray-800">{m.media}</td>
                        <td className="py-2 text-right text-muted-foreground">{m.jobs}</td>
                        <td className="py-2 text-right tabular-nums">
                          {m.sheets.toLocaleString("pt-BR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-xs text-muted-foreground">
                * Toner: Nível atual disponível na telemetria do equipamento
              </p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
