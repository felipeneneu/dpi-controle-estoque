"use client"

import { useMemo, useState } from "react"
import { RiRefreshLine, RiScanLine, RiAlertFill, RiCheckLine } from "@remixicon/react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { LoadingState } from "@/components/ui/spinner"
import { useMimakiTestJobs, useMimakiTestHealth, useMimakiTestScan, type MimakiTestJob } from "@/lib/queries/mimaki-test"

function fmtTs(ts: string | null | undefined): string {
  if (!ts) return "—"
  const m = ts.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/)
  if (!m) return ts
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`
}

type InkField =
  | "inkCyanCc"
  | "inkMagentaCc"
  | "inkYellowCc"
  | "inkBlackCc"
  | "inkWhite1Cc"
  | "inkWhite2Cc"
  | "inkVarnish1Cc"
  | "inkVarnish2Cc"

const INKS: { key: InkField; label: string; cls: string }[] = [
  { key: "inkCyanCc", label: "C", cls: "text-sky-500" },
  { key: "inkMagentaCc", label: "M", cls: "text-pink-500" },
  { key: "inkYellowCc", label: "Y", cls: "text-yellow-500" },
  { key: "inkBlackCc", label: "K", cls: "text-gray-700" },
  { key: "inkWhite1Cc", label: "B1", cls: "text-gray-400" },
  { key: "inkWhite2Cc", label: "B2", cls: "text-gray-400" },
  { key: "inkVarnish1Cc", label: "V1", cls: "text-purple-500" },
  { key: "inkVarnish2Cc", label: "V2", cls: "text-purple-500" },
]

function ResultBadge({ job }: { job: MimakiTestJob }) {
  if (job.result === "OK") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
        <RiCheckLine className="size-3.5" /> OK
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-600">
      <RiAlertFill className="size-3.5" /> NG
    </span>
  )
}

export function MimakiTestPanel() {
  const [filter, setFilter] = useState<"ALL" | "OK" | "NG">("ALL")

  const jobs = useMimakiTestJobs()
  const health = useMimakiTestHealth()
  const scan = useMimakiTestScan()

  const data = useMemo(() => jobs.data?.data ?? [], [jobs.data])
  const filtered = useMemo(
    () => (filter === "ALL" ? data : data.filter((j) => j.result === filter)),
    [data, filter]
  )

  const stats = useMemo(() => {
    return data.reduce(
      (acc, j) => {
        acc.total += 1
        if (j.result === "OK") acc.ok += 1
        else acc.ng += 1
        acc.ink += j.inkTotalCc ?? 0
        return acc
      },
      { total: 0, ok: 0, ng: 0, ink: 0 }
    )
  }, [data])

  async function handleScan() {
    try {
      const res = await scan.mutateAsync()
      toast.success(
        res.error
          ? `Scan concluído com falha de leitura: ${res.error}`
          : `Scan concluído — ${res.inserted} registro(s) novo(s) em ${res.files} CSV(s)`
      )
    } catch {
      toast.error("Falha ao executar scan manual.")
    }
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-[24px] shadow-sm border-gray-100 bg-card overflow-hidden">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-bold text-gray-900">Mimaki Teste (canal paralelo)</h3>
              <p className="text-xs text-muted-foreground">
                Importação experimental dos CSVs RasterLink — sem impacto no estoque
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => jobs.refetch()} disabled={jobs.isFetching}>
                <RiRefreshLine className={jobs.isFetching ? "animate-spin" : ""} /> Atualizar
              </Button>
              <Button size="sm" className="rounded-xl" onClick={handleScan} disabled={scan.isPending}>
                <RiScanLine className={scan.isPending ? "animate-pulse" : ""} />
                {scan.isPending ? "Escaneando…" : "Scan manual"}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                health.data?.sourceAvailable
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-red-100 text-red-600"
              }`}
            >
              <span className={`size-2 rounded-full ${health.data?.sourceAvailable ? "bg-emerald-500" : "bg-red-500"}`} />
              {health.data?.sourceAvailable ? "Pasta J: acessível" : "Pasta J: indisponível"}
            </span>
            {health.data?.lastScanAt && (
              <span className="text-xs text-muted-foreground">
                Último scan: {new Date(health.data.lastScanAt).toLocaleString("pt-BR")}
                {health.data.lastInserted > 0 && ` · +${health.data.lastInserted} novo(s)`}
              </span>
            )}
            {health.data?.lastScanError && (
              <span className="text-xs text-red-500"> · {health.data.lastScanError}</span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-xs text-muted-foreground">Registros</p>
              <p className="text-xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-emerald-50/60 px-4 py-3">
              <p className="text-xs text-muted-foreground">OK</p>
              <p className="text-xl font-bold text-emerald-700">{stats.ok}</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-red-50/60 px-4 py-3">
              <p className="text-xs text-muted-foreground">NG (erros)</p>
              <p className="text-xl font-bold text-red-600">{stats.ng}</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-xs text-muted-foreground">Tinta total</p>
              <p className="text-xl font-bold text-gray-900">
                {stats.ink.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} cc
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[24px] shadow-sm border-gray-100 bg-card overflow-hidden">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <h3 className="font-bold text-gray-900">Jobs importados</h3>
              <p className="text-xs text-muted-foreground">
                Fim de impressão · arquivo do RasterLink · resultado
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-input p-1">
              {(["ALL", "OK", "NG"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {f === "ALL" ? "Todos" : f}
                </button>
              ))}
            </div>
          </div>

          {jobs.isLoading ? (
            <LoadingState label="Carregando jobs do canal teste…" />
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum registro encontrado ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="text-left text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-gray-100">
                    <th className="py-2 pr-3">Fim</th>
                    <th className="py-2 pr-3">Pedido</th>
                    <th className="py-2 pr-3">Cliente</th>
                    <th className="py-2 pr-3">Arquivo</th>
                    <th className="py-2 pr-3">Bobina</th>
                    <th className="py-2 pr-3">Material</th>
                    <th className="py-2 pr-3 text-right">Metragem</th>
                    <th className="py-2 pr-3 text-right">Tamanho</th>
                    <th className="py-2 pr-3 text-right">Tinta</th>
                    <th className="py-2 pr-3">Estoque</th>
                    <th className="py-2 pr-3">Resultado</th>
                    <th className="py-2">Extração</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((j) => (
                    <tr
                      key={j.id}
                      className={`border-b border-gray-50 ${j.result === "NG" ? "bg-red-50/40" : ""}`}
                    >
                      <td className="py-2 pr-3 tabular-nums text-muted-foreground whitespace-nowrap">
                        {fmtTs(j.printETime ?? j.printSTime)}
                      </td>
                      <td className="py-2 pr-3 font-semibold text-gray-800">{j.parsedOrderCode ?? "—"}</td>
                      <td className="py-2 pr-3 text-gray-700">{j.parsedClient ?? "—"}</td>
                      <td className="py-2 pr-3">
                        <div className="max-w-[220px]">
                          <p className="truncate font-medium text-gray-800" title={j.keyFilename}>
                            {j.keyFilename}
                          </p>
                          <p className="truncate text-[10px] text-muted-foreground" title={j.sourceFile}>
                            {j.sourceFile}
                          </p>
                        </div>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {j.parsedBobinaSerial ? (
                          <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-mono font-bold text-blue-700 border border-blue-200">
                            {j.parsedBobinaSerial}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-gray-600">{j.parsedMaterial ?? "—"}</td>
                      <td className="py-2 pr-3 text-right tabular-nums font-semibold text-gray-800">
                        {j.linearMeters != null ? `${j.linearMeters.toFixed(3)} m` : "—"}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-gray-700">
                        {j.heightMm != null
                          ? `${j.heightMm}mm${j.arrangeCnt ? ` ×${j.arrangeCnt}` : ""}`
                          : j.parsedWidthMm != null && j.parsedHeightMm != null
                          ? `${j.parsedWidthMm}×${j.parsedHeightMm}mm`
                          : "—"}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-gray-800">
                        {(j.inkTotalCc ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          {INKS.filter((i) => (j[i.key] ?? 0) > 0)
                            .map((i) => `${i.label}${j[i.key]}`)
                            .join(" · ")}
                        </span>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {j.stockDeducted ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                            ✓ Baixado
                          </span>
                        ) : j.result === "OK" ? (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            Pendente
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-col gap-0.5">
                          <ResultBadge job={j} />
                          {j.resultDetail && (
                            <span className="text-[10px] font-semibold text-red-600">{j.resultDetail}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2">
                        {j.parseErrors ? (
                          <Badge variant="destructive" className="whitespace-nowrap" title={j.parseErrors}>
                            ⚠ algo pendente
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">ok</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}