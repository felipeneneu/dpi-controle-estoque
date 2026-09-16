"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  RiAddLine,
  RiSearchLine,
  RiFileLine,
  RiErrorWarningLine,
  RiCheckLine,
  RiTimeLine,
  RiLoader4Line,
} from "@remixicon/react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LoadingState } from "@/components/ui/spinner"
import { WizardImpositionModal } from "@/components/imposition/wizard-imposition-modal"
import { getUser } from "@/lib/api"
import type { ImpositionJob, ImpositionJobStatus } from "@/lib/api"
import { useAutomationJobs } from "@/lib/queries/automation"
import { cn } from "@/lib/utils"

function statusBadge(status: ImpositionJobStatus) {
  switch (status) {
    case "done":
      return (
        <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white">
          <RiCheckLine className="h-3 w-3" /> Concluído
        </Badge>
      )
    case "running":
      return (
        <Badge className="bg-sky-500 hover:bg-sky-600 text-white">
          <RiLoader4Line className="h-3 w-3 animate-spin" /> Executando
        </Badge>
      )
    case "failed":
      return (
        <Badge className="bg-rose-500 hover:bg-rose-600 text-white">
          <RiErrorWarningLine className="h-3 w-3" /> Falhou
        </Badge>
      )
    case "cancelled":
      return (
        <Badge variant="outline" className="text-muted-foreground">Cancelado</Badge>
      )
    default:
      return (
        <Badge className="bg-amber-500 hover:bg-amber-600 text-white">
          <RiTimeLine className="h-3 w-3" /> Na fila
        </Badge>
      )
  }
}

function formatDuration(ms: number | null): string {
  if (!ms) return "—"
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function rotationLabel(job: ImpositionJob): string {
  if (job.rotation === "0") return "0°"
  if (job.rotation === "90") return "90°"
  return "Automático"
}

function filenameFromPath(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

function AutomationContent() {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [modalOpen, setModalOpen] = useState(false)
  const [modalSession, setModalSession] = useState(0)
  const jobsQuery = useAutomationJobs({ q: search.trim() || undefined, pageSize: 50 })

  useEffect(() => {
    if (!getUser()) {
      router.replace("/auth")
    }
  }, [router])

  const rows = jobsQuery.data?.rows ?? []

  return (
    <div className="space-y-6">
      <WizardImpositionModal
        key={modalSession}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSuccess={() => jobsQuery.refetch()}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-xl font-semibold">Automação de Imposição</h1>
          <p className="text-sm text-muted-foreground">
            Jobs headless de montagem 70×100 cm via AutoImposerCLI (ADR-017).
          </p>
        </div>
        <Button onClick={() => { setModalSession((s) => s + 1); setModalOpen(true) }}>
          <RiAddLine /> Nova imposição
        </Button>
      </div>

      <Card>
        <CardHeader className="flex-row items-center gap-3 space-y-0">
          <CardTitle className="flex-1 text-base">Fila de jobs</CardTitle>
          <div className="relative w-full max-w-60">
            <RiSearchLine className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Buscar por nome/arquivo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {jobsQuery.isLoading && <LoadingState label="Carregando jobs…" />}

          {!jobsQuery.isLoading && rows.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
              <RiFileLine className="h-8 w-8" />
              <p className="text-sm">Nenhum job de imposição encontrado.</p>
            </div>
          )}

          {rows.length > 0 && (
            <ul className="divide-y divide-border">
              {rows.map((job) => (
                <li key={job.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm break-all">{job.jobName}</span>
                      {statusBadge(job.status)}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground truncate">
                      {filenameFromPath(job.inputPdf)} · Chapa {job.sheetWMm}×{job.sheetHMm} mm · Gap {job.gapMm} mm · Margens{" "}
                      {job.marginTopMm}/{job.marginRightMm}/{job.marginBottomMm}/{job.marginLeftMm} · Rotação {rotationLabel(job)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(job.createdAt)} ·{" "}
                      {job.status === "done"
                        ? `${job.outputUnits ?? "?"} unidades em ${formatDuration(job.durationMs)}`
                        : job.status === "failed"
                          ? "Veja o erro abaixo"
                          : `${job.status}…`}
                    </p>
                    {job.status === "failed" && job.error && (
                      <p className={cn("mt-1 rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive break-all")}>
                        {job.error}
                      </p>
                    )}
                  </div>

                  {job.outputPath && (
                    <div className="text-right text-xs text-muted-foreground shrink-0">
                      <p className="max-w-52 truncate">{filenameFromPath(job.outputPath)}</p>
                      {job.outputBytes !== null && job.outputBytes !== undefined && (
                        <p>{(job.outputBytes / 1024).toFixed(1)} KB</p>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {jobsQuery.isError && (
            <p className="py-6 text-center text-sm font-medium text-destructive">
              {jobsQuery.error instanceof Error ? jobsQuery.error.message : "Erro ao carregar jobs."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function AutomationPage() {
  return <AutomationContent />
}