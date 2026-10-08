"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RiLink, RiEditLine, RiEyeLine, RiPencilLine } from "@remixicon/react"
import type { MimakiJob } from "@/lib/queries/mimaki"

export const BRASILIA_TZ = "America/Sao_Paulo"

function formatBRT(dateStr: string | null): string | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  const date = d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: BRASILIA_TZ,
  })
  const time = d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BRASILIA_TZ,
  })
  return `${date} ${time}`
}

function cleanJobName(name?: string | null): string {
  if (!name) return "—"
  return name.replace(/^\d{3,}\s*[-–—]\s*/, "")
}

export function MimakiJobsTable({
  data,
  onBindMaterial,
  onEditJob,
  onViewDetails,
  selectedJobIds = [],
  onToggleSelectJob,
  onToggleSelectAll,
  onRowContextMenu,
}: {
  data: MimakiJob[]
  onBindMaterial?: (job: MimakiJob) => void
  onEditJob?: (job: MimakiJob) => void
  onViewDetails?: (job: MimakiJob) => void
  selectedJobIds?: string[]
  onToggleSelectJob?: (id: string) => void
  onToggleSelectAll?: () => void
  onRowContextMenu?: (e: React.MouseEvent, job: MimakiJob) => void
}) {
  const allSelected = data.length > 0 && data.every((j) => selectedJobIds.includes(j.id))
  const someSelected = data.some((j) => selectedJobIds.includes(j.id))

  return (
    <div className="overflow-auto rounded-xl border border-gray-150 shadow-xs">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-150 bg-muted/50">
            {onToggleSelectJob && (
              <th className="w-10 px-3 py-3 text-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = Boolean(someSelected && !allSelected)
                  }}
                  onChange={onToggleSelectAll}
                  aria-label="Selecionar todos os jobs da página"
                  className="size-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer accent-primary"
                />
              </th>
            )}
            <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">
              Data
            </th>
            <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">
              Job
            </th>
            <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">
              OS
            </th>
            <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">
              Material / Mídia
            </th>
            <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">
              Metragem
            </th>
            <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">
              Status
            </th>
            <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">
              Ações
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((job) => {
            const isSelected = selectedJobIds.includes(job.id)
            const isBound = job.materialStatus === "BOUND"
            const isPendingBind = job.materialStatus === "PENDING_BIND"

            return (
              <tr
                key={job.id}
                onContextMenu={(e) => onRowContextMenu?.(e, job)}
                className={`transition-colors cursor-default ${
                  isSelected ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/30"
                }`}
              >
                {onToggleSelectJob && (
                  <td className="w-10 px-3 py-3 text-center align-top">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelectJob(job.id)}
                      aria-label={`Selecionar job ${job.jobName}`}
                      className="size-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer accent-primary"
                    />
                  </td>
                )}
                <td className="px-4 py-3 align-top">
                  <span className="whitespace-nowrap text-muted-foreground text-xs">
                    {formatBRT(job.createdAt) ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="font-medium text-gray-900 max-w-[280px]">
                    {onViewDetails ? (
                      <button
                        type="button"
                        onClick={() => onViewDetails(job)}
                        className="text-left hover:text-primary hover:underline transition-colors line-clamp-2 break-words"
                        title="Clique para ver todos os detalhes do job"
                      >
                        {cleanJobName(job.jobName)}
                      </button>
                    ) : (
                      <Link
                        href={`/maquinas/job?machineId=${job.machineId}&jobId=${job.id}`}
                        className="text-left hover:text-primary hover:underline transition-colors line-clamp-2 break-words block"
                        title="Clique para ver todos os detalhes do job"
                      >
                        {cleanJobName(job.jobName)}
                      </Link>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 align-top">
                  {job.orderCode ? (
                    <span className="tabular-nums font-mono text-xs text-muted-foreground">{job.orderCode}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3 align-top">
                  {job.stockItemName ? (
                    <div className="flex items-center gap-1.5 group">
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-900">{job.stockItemName}</span>
                        {job.rawMaterialName && job.rawMaterialName !== job.stockItemName && (
                          <span className="text-[11px] text-muted-foreground">Original: {job.rawMaterialName}</span>
                        )}
                      </div>
                      {onBindMaterial && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-50 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
                          title="Alterar material vinculado"
                          onClick={() => onBindMaterial(job)}
                        >
                          <RiPencilLine className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  ) : job.rawMaterialName ? (
                    <div className="flex items-center gap-1.5">
                      <div className="flex flex-col">
                        <span className="text-gray-800 font-medium">{job.rawMaterialName}</span>
                        <span className="text-[11px] text-amber-600 font-medium">Requer vínculo</span>
                      </div>
                      {onBindMaterial && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                          title="Vincular ao estoque"
                          onClick={() => onBindMaterial(job)}
                        >
                          <RiLink className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="text-amber-600 text-xs font-medium">Sem mídia identificada</span>
                      {onBindMaterial && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                          title="Vincular ao estoque"
                          onClick={() => onBindMaterial(job)}
                        >
                          <RiLink className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="flex items-center gap-1.5 group/len">
                    <div className="flex flex-col">
                      {job.lengthMeters != null ? (
                        <span className="tabular-nums font-semibold text-gray-900">{job.lengthMeters.toFixed(3)}m</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {job.widthMm ? (
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          rolo {(job.widthMm / 1000).toFixed(2)}m
                        </span>
                      ) : null}
                    </div>
                    {onEditJob && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-40 hover:opacity-100 group-hover/len:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
                        title="Ajustar metragem ou cópias"
                        onClick={() => onEditJob(job)}
                      >
                        <RiEditLine className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="default" className="bg-gray-100 text-gray-700 hover:bg-gray-200">
                      Concluído
                    </Badge>
                    {job.stockDeducted ? (
                      <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 font-semibold">
                        Debitado
                      </Badge>
                    ) : isPendingBind ? (
                      <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50 font-semibold">
                        Pendente Vínculo
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-gray-100 text-muted-foreground">
                        Não debitado
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                  {onViewDetails ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2.5 text-xs gap-1 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg group"
                      title="Ver todos os dados técnicos e tintas do job"
                      onClick={() => onViewDetails(job)}
                    >
                      <RiEyeLine className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary" />
                      <span>Detalhes</span>
                    </Button>
                  ) : (
                    <Link href={`/maquinas/job?machineId=${job.machineId}&jobId=${job.id}`}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2.5 text-xs gap-1 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg group"
                        title="Ver todos os dados técnicos e tintas do job"
                      >
                        <RiEyeLine className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary" />
                        <span>Detalhes</span>
                      </Button>
                    </Link>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
