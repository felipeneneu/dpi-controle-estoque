"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RiLink, RiEditLine, RiEyeLine } from "@remixicon/react"
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
}: {
  data: MimakiJob[]
  onBindMaterial?: (job: MimakiJob) => void
  onEditJob?: (job: MimakiJob) => void
  onViewDetails?: (job: MimakiJob) => void
}) {
  return (
    <div className="overflow-auto rounded-xl border border-gray-100">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-muted/50">
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
              Material
            </th>
            <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">
              Comp.
            </th>
            <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">
              Status
            </th>
            <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">
              Detalhes
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((job) => {
            const hasMaterial = Boolean(job.stockItemName || job.stockItemId)
            return (
              <tr
                key={job.id}
                className="border-b border-gray-50 hover:bg-muted/30 transition-colors"
              >
                <td className="px-4 py-3 align-top">
                  <span className="whitespace-nowrap text-muted-foreground">
                    {formatBRT(job.createdAt) ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="font-medium text-gray-900 max-w-[300px]">
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
                    <span className="tabular-nums text-muted-foreground">{job.orderCode}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3 align-top">
                  {job.stockItemName ? (
                    <div className="flex items-center gap-1.5 group">
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-800">{job.stockItemName}</span>
                        {job.rawMaterialName && job.rawMaterialName !== job.stockItemName && (
                          <span className="text-[11px] text-muted-foreground">{job.rawMaterialName}</span>
                        )}
                      </div>
                      {onBindMaterial && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
                          title="Alterar material vinculado"
                          onClick={() => onBindMaterial(job)}
                        >
                          <RiLink className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  ) : job.rawMaterialName ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-800">{job.rawMaterialName}</span>
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
                      <span className="text-amber-600 text-xs font-medium">Não vinculado</span>
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
                    {job.lengthMeters != null ? (
                      <span className="tabular-nums font-medium">{job.lengthMeters.toFixed(3)}m</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
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
                  <div className="flex flex-col gap-1 items-start">
                    <Badge
                      className={
                        job.materialStatus === "BOUND"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }
                    >
                      {job.materialStatus === "BOUND" ? "Vinculado" : "Pendente"}
                    </Badge>
                    {job.materialStatus === "BOUND" && (
                      <span className="text-[10px] text-muted-foreground">
                        {job.stockDeducted ? "Estoque debitado" : "Débito pendente"}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                  {onViewDetails ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg group"
                      title="Ver todos os dados técnicos e tintas do job"
                      onClick={() => onViewDetails(job)}
                    >
                      <RiEyeLine className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary" />
                      <span>Ver</span>
                    </Button>
                  ) : (
                    <Link href={`/maquinas/job?machineId=${job.machineId}&jobId=${job.id}`}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg group"
                        title="Ver todos os dados técnicos e tintas do job"
                      >
                        <RiEyeLine className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary" />
                        <span>Ver</span>
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
