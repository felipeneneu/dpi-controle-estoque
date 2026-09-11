"use client"

import {
  legacyCreateColumnHelper,
  useLegacyTable,
} from "@tanstack/react-table/legacy"
import { flexRender } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RiEyeLine, RiEyeOffLine, RiPencilLine } from "@remixicon/react"
import type { PrintJobRow } from "@/lib/queries/jobs"
import { isKonicaMachine, type Machine } from "@/lib/api"

export const BRASILIA_TZ = "America/Sao_Paulo"

const STATUS_PT: Record<string, string> = {
  completed: "Concluído",
  printed: "Impresso",
  cancelled: "Cancelado",
  cancel: "Cancelado",
  error: "Erro",
  failed: "Falhou",
}

function statusLabel(status: string | null): string {
  return STATUS_PT[(status ?? "completed").toLowerCase()] ?? status ?? "Concluído"
}

/** Remove o prefixo "OS - " (ex.: "31120 - ") do nome exibido do job. */
function cleanJobName(name: string): string {
  return name.replace(/^\d{3,}\s*[-–—]\s*/, "")
}

function osFromName(name: string): string | null {
  const m = name.match(/^\s*(\d{3,})\s*[-–—]\s*/)
  return m?.[1] ?? null
}

function formatBRT(value: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
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

function formatSheets(val: number | null): string {
  if (val == null) return "—"
  return Number.isInteger(val) ? String(val) : val.toFixed(1)
}

function colorModeLabel(mode: string | null): string | null {
  if (!mode) return null
  const m = mode.toLowerCase()
  if (m === "color" || m === "colorido" || m === "cmyk") return "Colorido"
  if (m === "mono" || m === "monochrome" || m === "grayscale") return "Monocromático"
  return mode
}

const columnHelper = legacyCreateColumnHelper<PrintJobRow>()
type JobsColumns = Parameters<typeof useLegacyTable<PrintJobRow>>[0]["columns"]

function dateColumn() {
  return columnHelper.accessor("printEndDate", {
    header: "Data",
    cell: (info) => {
      const label = formatBRT(info.getValue())
      return (
        <span className="whitespace-nowrap text-muted-foreground">
          {label ?? "—"}
        </span>
      )
    },
  })
}

function jobColumn() {
  return columnHelper.accessor("jobName", {
    header: "Job",
    cell: (info) => {
      const name = info.getValue()
      return (
        <span className="font-medium text-gray-900 max-w-[300px]">
          <span className="line-clamp-2 break-words" title={name}>
            {cleanJobName(name)}
          </span>
        </span>
      )
    },
  })
}

function osColumn() {
  return columnHelper.accessor(
    (row) => row.osNumber ?? osFromName(row.jobName),
    {
      id: "osNumber",
      header: "OS",
      cell: (info) => {
        const os = info.getValue()
        return os ? (
          <span className="tabular-nums text-muted-foreground">{os}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      },
    },
  )
}

const STATUS_BADGE_CLS: Record<string, string> = {
  completed: "",
  printed: "",
  cancelled: "bg-gray-100 text-gray-600",
  error: "bg-red-100 text-red-700",
  failed: "bg-red-100 text-red-700",
}

function konicaColumns(
  onEditMedia?: (job: PrintJobRow) => void,
  onHideJob?: (job: PrintJobRow) => void,
  showHiddenBadge?: boolean,
): JobsColumns {
  return [
    osColumn(),
    jobColumn(),
    dateColumn(),
    columnHelper.accessor("mediaType", {
      header: "Mídia",
      cell: (info) => {
        const val = info.getValue()
        const job = info.row.original
        return (
          <div className="flex items-center gap-1">
            <span>{val ?? <span className="text-muted-foreground">—</span>}</span>
            {onEditMedia && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-50 hover:opacity-100"
                onClick={() => onEditMedia(job)}
              >
                <RiPencilLine className="w-3 h-3" />
              </Button>
            )}
          </div>
        )
      },
    }),
    columnHelper.accessor("pages", {
      header: "Páginas",
      cell: (info) => {
        const val = info.getValue()
        return val != null ? val : <span className="text-muted-foreground">—</span>
      },
    }),
    columnHelper.accessor("sheets", {
      header: "Folhas",
      cell: (info) => {
        const val = formatSheets(info.getValue())
        return <span className="tabular-nums">{val}</span>
      },
    }),
    columnHelper.accessor("colorMode", {
      header: "Tintas",
      cell: (info) => {
        const val = colorModeLabel(info.getValue())
        return val ?? <span className="text-muted-foreground">—</span>
      },
    }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: (info) => {
        const st = info.getValue()
        const isDone = !st || st === "completed" || st === "printed"
        const cls = STATUS_BADGE_CLS[(st ?? "").toLowerCase()] ?? ""
        const deducted = info.row.original.stockDeducted
        const isHidden = Boolean(info.row.original.hidden)
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={isDone ? "default" : "secondary"} className={cls}>
              {statusLabel(st)}
            </Badge>
            <Badge
              variant="secondary"
              className={
                deducted
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-gray-100 text-muted-foreground"
              }
            >
              {deducted ? "Debitado" : "Não debitado"}
            </Badge>
            {showHiddenBadge && isHidden && (
              <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50">
                Oculto
              </Badge>
            )}
          </div>
        )
      },
    }),
    ...(onHideJob
      ? [
          columnHelper.display({
            id: "hideAction",
            header: "",
            cell: (info) => {
              const job = info.row.original
              const isHidden = Boolean(job.hidden)
              return (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-gray-900"
                  title={
                    isHidden
                      ? "Restaurar job (requer senha de Admin)"
                      : "Ocultar job da visualização (requer senha de Admin)"
                  }
                  onClick={() => onHideJob(job)}
                >
                  {isHidden ? (
                    <RiEyeLine className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <RiEyeOffLine className="w-4 h-4 opacity-50 hover:opacity-100" />
                  )}
                </Button>
              )
            },
          }),
        ]
      : []),
  ] as unknown as JobsColumns
}

function parseWidthFromText(text?: string | null): number | null {
  if (!text) return null
  const lower = text.toLowerCase()
  const match = lower.match(/(\d{1,4}(?:[.,]\d{1,3})?)\s*(mm|m\b|m(ts)?\.?|metros)/)
  if (match) {
    const val = parseFloat(match[1].replace(",", "."))
    if (Number.isFinite(val) && val >= 0.3 && val <= 3.5) {
      return match[2].startsWith("mm") ? val / 1000 : val
    }
  }
  const bare = lower.match(/(\d[,.]\d{1,3})/)
  if (bare) {
    const val = parseFloat(bare[1].replace(",", "."))
    if (Number.isFinite(val) && val >= 0.3 && val <= 3.5) return val
  }
  return null
}

function hpColumns(
  onEditMedia?: (job: PrintJobRow) => void,
  machine?: Machine,
  onHideJob?: (job: PrintJobRow) => void,
  showHiddenBadge?: boolean,
): JobsColumns {
  return [
    osColumn(),
    jobColumn(),
    dateColumn(),
    columnHelper.accessor("machineName", {
      header: "Máquina",
      cell: (info) => info.getValue() ?? <span className="text-muted-foreground">—</span>,
    }),
    columnHelper.accessor("mediaType", {
      header: "Mídia",
      cell: (info) => {
        const val = info.getValue()
        const job = info.row.original
        return (
          <div className="flex items-center gap-1">
            <span>{val ?? <span className="text-muted-foreground">—</span>}</span>
            {onEditMedia && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-50 hover:opacity-100"
                onClick={() => onEditMedia(job)}
              >
                <RiPencilLine className="w-3 h-3" />
              </Button>
            )}
          </div>
        )
      },
    }),
    columnHelper.accessor("linearMetersDebited", {
      header: "Metragem (m)",
      cell: (info) => {
        const job = info.row.original
        let linear = info.getValue()
        let rollWidth = job.rollWidthUsed

        if (!rollWidth) {
          rollWidth =
            parseWidthFromText(job.mediaType) ||
            parseWidthFromText(job.jobName) ||
            (machine?.telemetry?.mediaWidthMm
              ? machine.telemetry.mediaWidthMm > 10
                ? machine.telemetry.mediaWidthMm / 1000
                : machine.telemetry.mediaWidthMm
              : 1.52)
        }

        if (linear == null && job.mediaAreaM2 != null && job.mediaAreaM2 > 0 && rollWidth) {
          linear = job.mediaAreaM2 / rollWidth
        }

        if (linear != null) {
          return (
            <div className="flex flex-col">
              <span className="font-semibold text-gray-900 tabular-nums">
                {linear.toFixed(3)}m
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {job.mediaAreaM2 != null ? `${job.mediaAreaM2.toFixed(2)} m²` : ""}
                {rollWidth ? ` · rolo ${rollWidth.toFixed(2)}m` : ""}
              </span>
            </div>
          )
        }

        if (job.mediaAreaM2 != null && job.mediaAreaM2 > 0) {
          return (
            <div className="flex flex-col">
              <span className="font-semibold text-gray-900 tabular-nums">
                {(job.mediaAreaM2 / 1.52).toFixed(3)}m
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {job.mediaAreaM2.toFixed(2)} m² · rolo 1.52m
              </span>
            </div>
          )
        }

        return <span className="text-muted-foreground">—</span>
      },
    }),
    columnHelper.accessor("pages", {
      header: "Páginas",
      cell: (info) => {
        const val = info.getValue()
        return val != null ? val : <span className="text-muted-foreground">—</span>
      },
    }),
    columnHelper.accessor("sheets", {
      header: "Folhas",
      cell: (info) => {
        const val = info.getValue()
        return val != null ? formatSheets(val) : <span className="text-muted-foreground">—</span>
      },
    }),
    columnHelper.accessor("inkTotalMl", {
      header: "Tinta (ml)",
      cell: (info) => {
        const val = info.getValue()
        return val != null ? val.toFixed(1) : <span className="text-muted-foreground">—</span>
      },
    }),
    columnHelper.accessor(
      (row) =>
        `${row.printMode ?? ""}${row.printMode && row.resolutionDpi ? " · " : ""}${row.resolutionDpi ? `${row.resolutionDpi}dpi` : ""}`.trim() ||
        null,
      {
        id: "modeResolution",
        header: "Modo / Resolução",
        cell: (info) => info.getValue() ?? <span className="text-muted-foreground">—</span>,
      },
    ),
    columnHelper.accessor("status", {
      header: "Status",
      cell: (info) => {
        const st = info.getValue() ?? "completed"
        const isDone = st === "completed" || st === "printed"
        const isHidden = Boolean(info.row.original.hidden)
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={isDone ? "default" : "secondary"}>{statusLabel(st)}</Badge>
            {showHiddenBadge && isHidden && (
              <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50">
                Oculto
              </Badge>
            )}
          </div>
        )
      },
    }),
    columnHelper.accessor("stockDeducted", {
      header: "Debitado",
      cell: (info) => {
        const val = info.getValue()
        return val ? (
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">Sim</Badge>
        ) : (
          <Badge variant="secondary">Não</Badge>
        )
      },
    }),
    ...(onHideJob
      ? [
          columnHelper.display({
            id: "hideAction",
            header: "",
            cell: (info) => {
              const job = info.row.original
              const isHidden = Boolean(job.hidden)
              return (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-gray-900"
                  title={
                    isHidden
                      ? "Restaurar job (requer senha de Admin)"
                      : "Ocultar job da visualização (requer senha de Admin)"
                  }
                  onClick={() => onHideJob(job)}
                >
                  {isHidden ? (
                    <RiEyeLine className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <RiEyeOffLine className="w-4 h-4 opacity-50 hover:opacity-100" />
                  )}
                </Button>
              )
            },
          }),
        ]
      : []),
  ] as unknown as JobsColumns
}

export function MachineJobsTable({
  machine,
  data,
  onEditMedia,
  onHideJob,
}: {
  machine: Machine
  data: PrintJobRow[]
  onEditMedia?: (job: PrintJobRow) => void
  onHideJob?: (job: PrintJobRow) => void
}) {
  // showHiddenBadge is derived from whether onHideJob is provided (i.e. DEV_MASTER only)
  const showHiddenBadge = !!onHideJob
  const columns = isKonicaMachine(machine)
    ? konicaColumns(onEditMedia, onHideJob, showHiddenBadge)
    : hpColumns(onEditMedia, machine, onHideJob, showHiddenBadge)
  const table = useLegacyTable({
    data,
    columns,
  })
  return (
    <div className="overflow-auto rounded-xl border border-gray-100">
      <table className="w-full text-sm">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-gray-100 bg-muted/50">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap"
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())
                    }
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const isHidden = Boolean(row.original.hidden)
            return (
              <tr
                key={row.id}
                className={`border-b border-gray-50 hover:bg-muted/30 transition-colors ${
                  showHiddenBadge && isHidden ? "bg-amber-50/40 opacity-80" : ""
                }`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 align-top">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}