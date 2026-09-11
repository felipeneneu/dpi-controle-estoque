"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { LoadingState } from "@/components/ui/spinner"
import { useConsumptionReport } from "@/lib/queries/reports"
import type { Machine } from "@/lib/api"

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

const INK_COLORS = [
  { key: "inkCyanCc", label: "Ciano", color: "text-sky-500" },
  { key: "inkMagentaCc", label: "Magenta", color: "text-pink-500" },
  { key: "inkYellowCc", label: "Amarelo", color: "text-yellow-500" },
  { key: "inkBlackCc", label: "Preto", color: "text-gray-800" },
  { key: "inkWhite1Cc", label: "Branco 1", color: "text-gray-400" },
  { key: "inkWhite2Cc", label: "Branco 2", color: "text-gray-400" },
  { key: "inkVarnish1Cc", label: "Verniz 1", color: "text-purple-500" },
  { key: "inkVarnish2Cc", label: "Verniz 2", color: "text-purple-500" },
] as const

export function MimakiConsumoTab({ machine }: { machine: Machine }) {
  const [month, setMonth] = useState(currentMonth())
  const report = useConsumptionReport(machine.id, month)
  const r = report.data

  return (
    <Card className="rounded-[24px] p-5 shadow-sm border-gray-100 bg-card">
      <CardContent className="p-0">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="font-bold text-gray-900">Consumo Mensal - Mimaki</h3>
            <p className="text-xs text-muted-foreground">
              Tinta (cc) e comprimento (m) registrados nos jobs deste equipamento
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
        ) : r?.mimakiTotals ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-xs text-muted-foreground">Jobs</p>
                <p className="text-xl font-bold text-gray-900">{r.mimakiTotals.jobs}</p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-xs text-muted-foreground">Comprimento total</p>
                <p className="text-xl font-bold text-gray-900">
                  {r.mimakiTotals.lengthMeters.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} m
                </p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-xs text-muted-foreground">Tinta total</p>
                <p className="text-xl font-bold text-gray-900">
                  {r.mimakiTotals.inkTotalCc.toLocaleString("pt-BR")} cc
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Tinta por cor (cc)
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {INK_COLORS.map((ink) => (
                  <div
                    key={ink.key}
                    className="rounded-xl border border-gray-100 px-3 py-2 flex items-center justify-between"
                  >
                    <span className={`text-sm font-black ${ink.color}`}>{ink.label}</span>
                    <span className="text-sm tabular-nums text-gray-700">
                      {r.mimakiTotals![ink.key as keyof typeof r.mimakiTotals].toLocaleString("pt-BR")}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Comprimento por material (m)
              </p>
              {r.byMedia.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum job registrado para este período.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-gray-100">
                      <th className="py-2">Material</th>
                      <th className="py-2 text-right">Jobs</th>
                      <th className="py-2 text-right">Metros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.byMedia.map((m) => (
                      <tr key={m.media} className="border-b border-gray-50">
                        <td className="py-2 font-medium text-gray-800">{m.media}</td>
                        <td className="py-2 text-right text-muted-foreground">{m.jobs}</td>
                        <td className="py-2 text-right tabular-nums">
                          {(m.lengthMeters ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <div className="text-3xl">📊</div>
            <p className="text-sm font-medium text-gray-900">Sem dados de consumo</p>
            <p className="text-xs text-muted-foreground">
              Nenhum job registrado para esta máquina neste período.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
