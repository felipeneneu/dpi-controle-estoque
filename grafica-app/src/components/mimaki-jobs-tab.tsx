"use client"

import { useDeferredValue, useMemo, useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  RiRefreshLine,
  RiFlashlightLine,
  RiDeleteBinLine,
  RiCloseLine,
  RiLink,
  RiEditLine,
  RiEyeLine,
} from "@remixicon/react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Spinner, LoadingState } from "@/components/ui/spinner"
import { MimakiJobsTable } from "@/components/mimaki-jobs-table"
import { MimakiBindDialog } from "@/components/mimaki-bind-dialog"
import { MimakiEditJobDialog } from "@/components/mimaki-edit-job-dialog"
import { BulkDeductDialog } from "@/components/bulk-deduct-dialog"
import { WindowsContextMenu, type WindowsContextMenuItem } from "@/components/ui/windows-context-menu"
import { DeleteJobDialog, type DeleteJobTarget } from "@/components/delete-job-dialog"
import { useMimakiJobs, useSyncMimakiStock, type MimakiJob } from "@/lib/queries/mimaki"
import type { Machine } from "@/lib/api"

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "date-desc", label: "Data (mais recentes)" },
  { value: "date-asc", label: "Data (mais antigas)" },
  { value: "name-asc", label: "Nome (A–Z)" },
  { value: "name-desc", label: "Nome (Z–A)" },
]

export function MimakiJobsTab({ machine }: { machine: Machine }) {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [q, setQ] = useState(searchParams.get("jobQ") ?? "")
  const [statusFilter, setStatusFilter] = useState<string>("ALL")
  const [bindJob, setBindJob] = useState<MimakiJob | null>(null)
  const [editJob, setEditJob] = useState<MimakiJob | null>(null)
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([])
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false)

  const deferredQ = useDeferredValue(q)

  const { data: allJobs = [], isLoading, isError, isFetching, refetch } = useMimakiJobs({
    machine_id: machine.id,
  })

  const syncStock = useSyncMimakiStock()

  async function handleSyncStock() {
    try {
      const res = await syncStock.mutateAsync()
      toast.success(res.message || "Estoque sincronizado com sucesso!")
    } catch {
      toast.error("Erro ao sincronizar estoque da Mimaki.")
    }
  }

  // Filtrar por busca
  const filteredJobs = allJobs.filter((job) => {
    if (!deferredQ) return true
    const searchLower = deferredQ.toLowerCase()
    return (
      job.jobName.toLowerCase().includes(searchLower) ||
      job.orderCode?.toLowerCase().includes(searchLower) ||
      job.rawMaterialName?.toLowerCase().includes(searchLower) ||
      job.stockItemName?.toLowerCase().includes(searchLower)
    )
  })

  // Filtrar por status
  const statusFilteredJobs = filteredJobs.filter((job) => {
    if (statusFilter === "ALL") return true
    return job.materialStatus === statusFilter
  })

  // Ordenar
  const [sort, setSort] = useState("date-desc")
  const [sortBy, sortDir] = sort.split("-") as ["date" | "name", "asc" | "desc"]

  const sortedJobs = [...statusFilteredJobs].sort((a, b) => {
    if (sortBy === "date") {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return sortDir === "asc" ? dateA - dateB : dateB - dateA
    }
    const nameA = a.jobName.toLowerCase()
    const nameB = b.jobName.toLowerCase()
    return sortDir === "asc" ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA)
  })

  // Paginação
  const [page, setPage] = useState(1)
  const pageSize = 20
  const totalPages = Math.max(1, Math.ceil(sortedJobs.length / pageSize))
  const paginatedJobs = sortedJobs.slice((page - 1) * pageSize, page * pageSize)

  // Seleção e Ação em Massa
  const selectedJobs = useMemo(
    () => allJobs.filter((j) => selectedJobIds.includes(j.id)),
    [allJobs, selectedJobIds]
  )

  const selectedStats = useMemo(() => {
    let meters = 0
    for (const job of selectedJobs) {
      meters += job.lengthMeters ?? 0
    }
    return {
      meters: Number(meters.toFixed(3)),
    }
  }, [selectedJobs])

  function handleToggleSelectJob(id: string) {
    setSelectedJobIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  function handleToggleSelectAll() {
    const pageIds = paginatedJobs.map((r) => r.id)
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedJobIds.includes(id))
    if (allSelected) {
      setSelectedJobIds((prev) => prev.filter((id) => !pageIds.includes(id)))
    } else {
      setSelectedJobIds((prev) => Array.from(new Set([...prev, ...pageIds])))
    }
  }

  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    job: MimakiJob
    isMulti: boolean
  } | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTargets, setDeleteTargets] = useState<DeleteJobTarget[]>([])

  function handleRowContextMenu(e: React.MouseEvent, job: MimakiJob) {
    e.preventDefault()
    const isAlreadySelected = selectedJobIds.includes(job.id)

    if (isAlreadySelected && selectedJobIds.length > 1) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        job,
        isMulti: true,
      })
    } else {
      if (!isAlreadySelected) {
        setSelectedJobIds([job.id])
      }
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        job,
        isMulti: false,
      })
    }
  }

  // Atalho de teclado Delete do Windows para itens selecionados
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Delete" || e.key === "Del") {
        const target = e.target as HTMLElement | null
        const tag = target?.tagName?.toLowerCase()
        if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) {
          return
        }
        if (selectedJobIds.length > 0) {
          e.preventDefault()
          setDeleteTargets(
            selectedJobs.map((j) => ({
              id: j.id,
              jobName: j.jobName,
              osNumber: j.orderCode,
            }))
          )
          setDeleteDialogOpen(true)
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedJobIds, selectedJobs])

  const contextMenuItems: WindowsContextMenuItem[] = useMemo(() => {
    if (!contextMenu) return []

    if (contextMenu.isMulti) {
      return [
        {
          label: "Debitar Selecionados em Massa...",
          icon: <RiFlashlightLine className="size-4" />,
          variant: "primary",
          badge: selectedJobIds.length,
          onClick: () => setBulkDialogOpen(true),
        },
        {
          label: `Excluir ${selectedJobIds.length} jobs selecionados...`,
          icon: <RiDeleteBinLine className="size-4" />,
          variant: "destructive",
          shortcut: "Del",
          separatorBelow: true,
          onClick: () => {
            setDeleteTargets(
              selectedJobs.map((j) => ({
                id: j.id,
                jobName: j.jobName,
                osNumber: j.orderCode,
              }))
            )
            setDeleteDialogOpen(true)
          },
        },
        {
          label: "Desmarcar todos",
          icon: <RiCloseLine className="size-4" />,
          onClick: () => setSelectedJobIds([]),
        },
      ]
    }

    const j = contextMenu.job
    const items: WindowsContextMenuItem[] = [
      {
        label: j.materialStatus === "BOUND" ? "Alterar Vínculo de Mídia..." : "Vincular Mídia ao Estoque...",
        icon: <RiLink className="size-4" />,
        onClick: () => setBindJob(j),
      },
      {
        label: "Ajustar Metragem / Cópias...",
        icon: <RiEditLine className="size-4" />,
        onClick: () => setEditJob(j),
      },
      {
        label: "Ver Detalhes do Job...",
        icon: <RiEyeLine className="size-4" />,
        separatorBelow: true,
        onClick: () => router.push(`/maquinas/job?machineId=${machine.id}&jobId=${j.id}`),
      },
      {
        label: "Excluir job...",
        icon: <RiDeleteBinLine className="size-4" />,
        variant: "destructive",
        shortcut: "Del",
        onClick: () => {
          setDeleteTargets([{ id: j.id, jobName: j.jobName, osNumber: j.orderCode }])
          setDeleteDialogOpen(true)
        },
      },
    ]

    return items
  }, [contextMenu, selectedJobIds, selectedJobs, machine.id, router])


  function syncUrl(nextQ: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (nextQ) params.set("jobQ", nextQ)
    else params.delete("jobQ")
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  function onSearchChange(next: string) {
    setQ(next)
    setPage(1)
    syncUrl(next)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap w-full">
        <Input
          placeholder="Buscar job, OS ou material..."
          value={q}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-64"
          aria-label="Buscar job"
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
          aria-label="Filtrar por status"
          className="h-10 rounded-xl border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring"
        >
          <option value="ALL">Todos os status</option>
          <option value="PENDING_BIND">Pendentes</option>
          <option value="BOUND">Vinculados</option>
        </select>
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value)
            setPage(1)
          }}
          aria-label="Ordenar jobs"
          className="h-10 rounded-xl border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {isFetching && !isLoading && <Spinner className="size-4 text-muted-foreground" />}

        <Button
          variant="outline"
          size="sm"
          onClick={handleSyncStock}
          disabled={syncStock.isPending}
          className="ml-auto rounded-xl gap-2 font-medium border-primary/30 hover:border-primary hover:bg-primary/5 text-primary"
        >
          {syncStock.isPending ? (
            <Spinner className="size-4" />
          ) : (
            <RiRefreshLine className="size-4" />
          )}
          {syncStock.isPending ? "Atualizando Estoque..." : "Atualizar Estoque"}
        </Button>
      </div>

      {selectedJobIds.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <Badge variant="default" className="font-mono">
              {selectedJobIds.length}
            </Badge>
            <span className="font-medium text-gray-900">
              job{selectedJobIds.length !== 1 ? "s" : ""} selecionado{selectedJobIds.length !== 1 ? "s" : ""}
            </span>
            <span className="text-muted-foreground">
              · Total: <strong className="text-gray-900 font-mono">{selectedStats.meters}m</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setBulkDialogOpen(true)}
              className="h-8 gap-1.5 rounded-xl font-medium shadow-xs"
            >
              <RiFlashlightLine className="size-3.5" />
              Debitar Selecionados em Massa
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setDeleteTargets(
                  selectedJobs.map((j) => ({
                    id: j.id,
                    jobName: j.jobName,
                    osNumber: j.orderCode,
                  }))
                )
                setDeleteDialogOpen(true)
              }}
              className="h-8 gap-1.5 rounded-xl font-medium shadow-xs"
            >
              <RiDeleteBinLine className="size-3.5" />
              Excluir Selecionados
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedJobIds([])}
              className="h-8 text-xs text-muted-foreground hover:text-gray-900"
            >
              Limpar
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <LoadingState label="Carregando jobs..." />
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">Não foi possível carregar os jobs.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : sortedJobs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <div className="text-3xl">🖨️</div>
          <p className="text-sm font-medium text-gray-900">Nenhum job encontrado</p>
          <p className="text-xs text-muted-foreground">
            {allJobs.length === 0
              ? "Nenhum job registrado para esta máquina."
              : "Nenhum job corresponde aos filtros aplicados."}
          </p>
        </div>
      ) : (
        <div className={isFetching && !isLoading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <MimakiJobsTable
            data={paginatedJobs}
            onBindMaterial={setBindJob}
            onEditJob={setEditJob}
            onViewDetails={(job) => router.push(`/maquinas/job?machineId=${machine.id}&jobId=${job.id}`)}
            selectedJobIds={selectedJobIds}
            onToggleSelectJob={handleToggleSelectJob}
            onToggleSelectAll={handleToggleSelectAll}
            onRowContextMenu={handleRowContextMenu}
          />
        </div>
      )}

      <MimakiBindDialog
        job={bindJob}
        machineId={machine.id}
        open={!!bindJob}
        onOpenChange={(o) => {
          if (!o) setBindJob(null)
        }}
      />

      <MimakiEditJobDialog
        job={editJob}
        open={!!editJob}
        onOpenChange={(o) => {
          if (!o) setEditJob(null)
        }}
      />

      <BulkDeductDialog
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        selectedJobs={selectedJobs}
        machine={machine}
        onSuccess={() => {
          setSelectedJobIds([])
          refetch()
        }}
      />

      <DeleteJobDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        targetJobs={deleteTargets}
        onSuccess={() => {
          setSelectedJobIds([])
          refetch()
        }}
      />

      {contextMenu && (
        <WindowsContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          title={
            contextMenu.isMulti
              ? `Ações em Massa (${selectedJobIds.length} selecionados)`
              : contextMenu.job.jobName
          }
          subtitle={
            !contextMenu.isMulti && contextMenu.job.orderCode
              ? `Pedido: ${contextMenu.job.orderCode}`
              : undefined
          }
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}

      <div className="flex items-center justify-between px-1">
        <span className="text-sm text-muted-foreground">
          {sortedJobs.length} job{sortedJobs.length !== 1 ? "s" : ""} encontrado{sortedJobs.length !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  )
}
