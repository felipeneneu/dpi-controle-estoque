"use client"

import { useDeferredValue, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { RiRefreshLine } from "@remixicon/react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner, LoadingState } from "@/components/ui/spinner"
import { MimakiJobsTable } from "@/components/mimaki-jobs-table"
import { MimakiBindDialog } from "@/components/mimaki-bind-dialog"
import { MimakiEditJobDialog } from "@/components/mimaki-edit-job-dialog"
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
