"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  RiArrowLeftLine,
  RiSettings3Line,
  RiRulerLine,
  RiDropLine,
  RiStackLine,
  RiLink,
  RiEditLine,
  RiRefreshLine,
  RiPrinterLine,
  RiFileTextLine,
  RiCheckLine,
  RiTimeLine,
  RiExternalLinkLine,
} from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { LoadingState } from "@/components/ui/spinner"
import { MimakiBindDialog } from "@/components/mimaki-bind-dialog"
import { MimakiEditJobDialog } from "@/components/mimaki-edit-job-dialog"
import { useMimakiJob, type MimakiJob } from "@/lib/queries/mimaki"
import { useMachines } from "@/lib/queries/machines"

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
  return `${date} às ${time}`
}

function cleanJobName(name?: string | null): string {
  if (!name) return "—"
  return name.replace(/^\d{3,}\s*[-–—]\s*/, "")
}

export function MimakiJobDetailView({
  machineId,
  jobId,
}: {
  machineId: string
  jobId: string
}) {
  const router = useRouter()

  const [bindOpen, setBindOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const { data: job, isLoading, isError, refetch, isFetching } = useMimakiJob(jobId)
  const { data: machines = [] } = useMachines()

  const machine = machines.find((m) => m.id === machineId)
  const machineName = machine?.name || machineId

  if (isLoading) {
    return (
      <div className="py-16">
        <LoadingState label="Carregando detalhes do job Mimaki..." />
      </div>
    )
  }

  if (isError || !job) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="size-16 rounded-full bg-red-50 text-red-500 flex items-center justify-center text-2xl font-bold">
          !
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-gray-900">Job não encontrado</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Não foi possível carregar as informações deste job de impressão. O ID pode ser inválido ou o registro foi removido.
          </p>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <Link href={`/maquinas?id=${machineId}&tab=jobs`}>
            <Button variant="outline" className="rounded-xl gap-2 font-semibold">
              <RiArrowLeftLine className="size-4" />
              Voltar para {machineName}
            </Button>
          </Link>
          <Button onClick={() => refetch()} className="rounded-xl font-semibold">
            Tentar novamente
          </Button>
        </div>
      </div>
    )
  }

  const isBound = job.materialStatus === "BOUND"
  const isDeducted = Boolean(job.stockDeducted)
  const totalPrints = job.totalPrint ?? (job.pages * (job.copyNumber ?? 1))

  const inks = [
    { label: "Cyan", value: job.inkCyanCc, color: "bg-cyan-50 text-cyan-900 border-cyan-200" },
    { label: "Magenta", value: job.inkMagentaCc, color: "bg-pink-50 text-pink-900 border-pink-200" },
    { label: "Yellow", value: job.inkYellowCc, color: "bg-amber-50 text-amber-900 border-amber-200" },
    { label: "Black", value: job.inkBlackCc, color: "bg-gray-100 text-gray-900 border-gray-300" },
    { label: "Branco 1", value: job.inkWhite1Cc, color: "bg-sky-50 text-sky-900 border-sky-200" },
    { label: "Branco 2", value: job.inkWhite2Cc, color: "bg-sky-50 text-sky-900 border-sky-200" },
    { label: "Verniz 1", value: job.inkVarnish1Cc, color: "bg-purple-50 text-purple-900 border-purple-200" },
    { label: "Verniz 2", value: job.inkVarnish2Cc, color: "bg-purple-50 text-purple-900 border-purple-200" },
  ]

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Breadcrumbs & Top Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
          <Link href="/maquinas" className="hover:text-primary transition-colors">
            Máquinas
          </Link>
          <span>/</span>
          <Link href={`/maquinas?id=${machineId}&tab=jobs`} className="hover:text-primary transition-colors font-medium text-gray-700">
            {machineName}
          </Link>
          <span>/</span>
          <span className="text-gray-400">Jobs</span>
          <span>/</span>
          <span className="text-gray-900 font-semibold truncate max-w-xs">
            {cleanJobName(job.jobName)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="rounded-xl gap-1.5 font-medium"
            title="Atualizar dados do job"
          >
            <RiRefreshLine className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
            className="rounded-xl gap-1.5 font-medium"
          >
            <RiEditLine className="size-4 text-primary" />
            <span>Ajustar Metragem</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setBindOpen(true)}
            className="rounded-xl gap-1.5 font-medium border-primary/30 text-primary hover:bg-primary/5"
          >
            <RiLink className="size-4" />
            <span>{isBound ? "Alterar Mídia" : "Vincular Mídia"}</span>
          </Button>

          <Link href={`/maquinas?id=${machineId}&tab=jobs`}>
            <Button variant="ghost" size="sm" className="rounded-xl gap-1.5 font-medium text-muted-foreground hover:text-gray-900">
              <RiArrowLeftLine className="size-4" />
              <span>Voltar</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* 2. Hero Header Banner */}
      <div className="p-6 rounded-[24px] bg-card border border-gray-100 shadow-sm space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 max-w-3xl">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight break-words">
                {cleanJobName(job.jobName)}
              </h1>
            </div>
            {job.jobName !== cleanJobName(job.jobName) && (
              <p className="text-xs font-mono text-muted-foreground break-all">
                Arquivo RIP: {job.jobName}
              </p>
            )}
            <p className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap pt-1">
              <span className="flex items-center gap-1 font-medium text-gray-800">
                <RiPrinterLine className="size-4 text-primary" />
                {machineName}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <RiTimeLine className="size-4 text-muted-foreground" />
                {formatBRT(job.createdAt) ?? "—"}
              </span>
              {job.orderCode && (
                <>
                  <span>•</span>
                  <span className="font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-lg text-xs">
                    OS: {job.orderCode}
                  </span>
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className={`text-xs px-3 py-1 font-semibold ${
                isBound
                  ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                  : "bg-amber-100 text-amber-800 border-amber-200"
              }`}
            >
              {isBound ? "Material Vinculado" : "Vínculo Pendente"}
            </Badge>

            <Badge
              variant="outline"
              className={`text-xs px-3 py-1 font-semibold ${
                isDeducted
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : "bg-gray-100 text-gray-700 border-gray-200"
              }`}
            >
              {isDeducted ? "Estoque Debitado" : "Aguardando Débito"}
            </Badge>
          </div>
        </div>
      </div>

      {/* 3. High-Impact Technical KPIs */}
      <div>
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
          <RiSettings3Line className="size-4 text-primary" />
          Parâmetros do RIP & Produção
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <Card className="rounded-2xl border-primary/30 bg-primary/5 p-4 shadow-none">
            <span className="text-[11px] font-semibold text-primary block">Metragem Total</span>
            <span className="text-xl font-black text-primary tabular-nums mt-1 block">
              {job.lengthMeters != null ? `${job.lengthMeters.toFixed(3)} m` : "—"}
            </span>
          </Card>

          <Card className="rounded-2xl border-gray-100 bg-card p-4 shadow-sm">
            <span className="text-[11px] font-medium text-muted-foreground block">Total Impressões</span>
            <span className="text-xl font-black text-gray-900 tabular-nums mt-1 block">
              {job.totalPrint ?? "—"}
            </span>
          </Card>

          <Card className="rounded-2xl border-gray-100 bg-card p-4 shadow-sm">
            <span className="text-[11px] font-medium text-muted-foreground block">Cópias</span>
            <span className="text-xl font-black text-gray-900 tabular-nums mt-1 block">
              {job.copyNumber ?? "—"}
            </span>
          </Card>

          <Card className="rounded-2xl border-gray-100 bg-card p-4 shadow-sm">
            <span className="text-[11px] font-medium text-muted-foreground block">Páginas</span>
            <span className="text-xl font-black text-gray-900 tabular-nums mt-1 block">
              {job.pages}
            </span>
          </Card>

          <Card className="rounded-2xl border-gray-100 bg-card p-4 shadow-sm">
            <span className="text-[11px] font-medium text-muted-foreground block">Passadas</span>
            <span className="text-xl font-black text-gray-900 tabular-nums mt-1 block">
              {job.passCount ?? "—"}
            </span>
          </Card>

          <Card className="rounded-2xl border-gray-100 bg-card p-4 shadow-sm">
            <span className="text-[11px] font-medium text-muted-foreground block">Resolução</span>
            <span className="text-base font-bold text-gray-900 tabular-nums mt-1 block truncate">
              {job.resolutionDpi ? `${job.resolutionDpi} DPI` : "—"}
            </span>
          </Card>

          <Card className="rounded-2xl border-gray-100 bg-card p-4 shadow-sm">
            <span className="text-[11px] font-medium text-muted-foreground block">Direção</span>
            <span className="text-sm font-bold text-gray-900 mt-1 block truncate" title={job.printDirection ?? ""}>
              {job.printDirection ?? "—"}
            </span>
          </Card>

          <Card className="rounded-2xl border-gray-100 bg-card p-4 shadow-sm">
            <span className="text-[11px] font-medium text-muted-foreground block">Unidades</span>
            <span className="text-xl font-black text-gray-900 tabular-nums mt-1 block">
              {job.quantityUnits}
            </span>
          </Card>
        </div>
      </div>

      {/* 4. Detailed Sections: Left (Dimensions + Substrate) | Right (UV Inks) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Dimensões Físicas & Substrato */}
        <div className="space-y-6">
          {/* Dimensões e Avanço */}
          <Card className="rounded-[24px] border-gray-100 bg-card shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <RiRulerLine className="size-4 text-primary" />
              Dimensões do Arquivo & Cálculo
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                <span className="text-xs text-muted-foreground block font-medium">Largura (X):</span>
                <span className="text-lg font-bold text-gray-900 block mt-0.5">
                  {job.widthMm} mm
                </span>
                <span className="text-xs text-muted-foreground font-mono">
                  ({(job.widthMm / 1000).toFixed(3)} metros)
                </span>
              </div>

              <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                <span className="text-xs text-muted-foreground block font-medium">Altura / Avanço Físico (Y):</span>
                <span className="text-lg font-bold text-gray-900 block mt-0.5">
                  {job.heightMm} mm
                </span>
                <span className="text-xs text-muted-foreground font-mono">
                  ({(job.heightMm / 1000).toFixed(3)} metros)
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-muted/30 border border-gray-100 space-y-1.5">
              <span className="text-xs font-semibold text-gray-700 block">Fórmula de Metragem Linear Aplicada:</span>
              <p className="text-xs font-mono text-gray-800 break-words">
                ({job.heightMm} mm × {totalPrints} impressões) ÷ 1000 ={" "}
                <strong className="text-primary font-bold">{job.lengthMeters?.toFixed(3)} m</strong>
              </p>
              <p className="text-[11px] text-muted-foreground">
                O avanço linear representa o comprimento de bobina consumido na impressora Mimaki.
              </p>
            </div>
          </Card>

          {/* Substrato & Estoque */}
          <Card className="rounded-[24px] border-gray-100 bg-card shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <RiStackLine className="size-4 text-primary" />
                Substrato & Estoque Vinculado
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBindOpen(true)}
                className="h-8 rounded-xl text-xs gap-1.5 font-semibold text-primary border-primary/30 hover:bg-primary/5"
              >
                <RiLink className="size-3.5" />
                {isBound ? "Alterar Vínculo" : "Vincular Agora"}
              </Button>
            </div>

            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-between gap-4">
                <span className="text-xs font-medium text-muted-foreground">Nome da Mídia no RIP:</span>
                <span className="text-sm font-bold text-gray-900 text-right">
                  {job.rawMaterialName || "Não especificado pelo operador"}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-between gap-4">
                <span className="text-xs font-medium text-muted-foreground">Item no Estoque GraficaOS:</span>
                <span className="text-sm font-bold text-gray-900 text-right">
                  {job.stockItemName || (isBound ? "Material Vinculado" : "Nenhum (Pendente)")}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-between gap-4">
                <span className="text-xs font-medium text-muted-foreground">Status do Débito no Estoque:</span>
                <span className="text-xs font-bold text-right">
                  {job.stockDeducted ? (
                    <span className="text-emerald-700 font-semibold flex items-center gap-1">
                      <RiCheckLine className="size-4" /> Metragem debitada com sucesso
                    </span>
                  ) : (
                    <span className="text-amber-700 font-semibold">
                      Débito pendente de vínculo ou sincronização
                    </span>
                  )}
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Consumo de Tintas UV */}
        <div className="space-y-6">
          <Card className="rounded-[24px] border-gray-100 bg-card shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <RiDropLine className="size-4 text-primary" />
                Consumo de Tintas UV (8 Canais)
              </div>
              {job.inkTotalCc != null && (
                <Badge className="bg-primary/10 text-primary border-primary/20 text-xs font-bold px-3 py-1">
                  Total: {job.inkTotalCc.toFixed(4)} cc
                </Badge>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Consumo registrado pelo RIP em centímetros cúbicos (cc / ml) para cada canal de tinta da impressora UV.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              {inks.map((ink) => (
                <div
                  key={ink.label}
                  className={`p-3.5 rounded-2xl border flex flex-col justify-between transition-shadow hover:shadow-xs ${ink.color}`}
                >
                  <span className="text-xs font-bold opacity-90">{ink.label}</span>
                  <span className="text-base font-black tabular-nums mt-2">
                    {ink.value != null ? `${ink.value.toFixed(4)} cc` : "0.0000 cc"}
                  </span>
                </div>
              ))}
            </div>

            <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 space-y-2 text-xs text-muted-foreground mt-4">
              <div className="flex items-center justify-between">
                <span>Total de Canais Coloridos (CMYK):</span>
                <span className="font-bold text-gray-800 tabular-nums">
                  {((job.inkCyanCc || 0) + (job.inkMagentaCc || 0) + (job.inkYellowCc || 0) + (job.inkBlackCc || 0)).toFixed(4)} cc
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Total de Canais Especiais (Branco + Verniz):</span>
                <span className="font-bold text-gray-800 tabular-nums">
                  {((job.inkWhite1Cc || 0) + (job.inkWhite2Cc || 0) + (job.inkVarnish1Cc || 0) + (job.inkVarnish2Cc || 0)).toFixed(4)} cc
                </span>
              </div>
            </div>
          </Card>

          {/* Rastreabilidade e Auditoria */}
          <Card className="rounded-[24px] border-gray-100 bg-card shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <RiFileTextLine className="size-4 text-primary" />
              Metadados de Rastreabilidade
            </div>

            <div className="space-y-2 text-xs font-mono text-muted-foreground">
              <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                <span>ID do Registro:</span>
                <span className="text-gray-900 select-all">{job.id}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                <span>Folder Timestamp:</span>
                <span className="text-gray-900 select-all">{job.folderTimestamp}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                <span>Máquina:</span>
                <span className="text-gray-900">{job.machineId}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Dialogs de Ação */}
      <MimakiBindDialog
        job={job}
        machineId={machineId}
        open={bindOpen}
        onOpenChange={setBindOpen}
      />

      <MimakiEditJobDialog
        job={job}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  )
}