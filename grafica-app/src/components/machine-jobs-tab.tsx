"use client"

import { useDeferredValue, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { RiRefreshLine, RiEyeLine, RiEyeOffLine } from "@remixicon/react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner, LoadingState } from "@/components/ui/spinner"
import { MachineJobsTable } from "@/components/machine-jobs-table"
import { MediaEditDialog } from "@/components/media-edit-dialog"
import { HideJobDialog } from "@/components/hide-job-dialog"
import { useJobs, useSyncMachineJobsStock, type PrintJobRow } from "@/lib/queries/jobs"
import { useUser } from "@/hooks/use-user"
import type { Machine } from "@/lib/api"

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "date-desc", label: "Data (mais recentes)" },
  { value: "date-asc", label: "Data (mais antigas)" },
  { value: "name-asc", label: "Nome (A–Z)" },
  { value: "name-desc", label: "Nome (Z–A)" },
]

export function JobsTab({ machine }: { machine: Machine }) {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [month, setMonth] = useState(searchParams.get("jobMonth") ?? currentMonth())
  const [q, setQ] = useState(searchParams.get("jobQ") ?? "")
  const [page, setPage] = useState(Number(searchParams.get("jobPage")) || 1)
  const [sort, setSort] = useState("date-desc")
  const [sortBy, sortDir] = sort.split("-") as ["date" | "name", "asc" | "desc"]
  const [editJob, setEditJob] = useState<PrintJobRow | null>(null)
  const [hideJobTarget, setHideJobTarget] = useState<PrintJobRow | null>(null)
  const [showHidden, setShowHidden] = useState(false)

  const user = useUser()
  const canManageHidden = user?.role === "DEV_MASTER"

  const deferredQ = useDeferredValue(q)

  const { data, isLoading, isError, isFetching, refetch } = useJobs({
    machineId: machine.id,
    month,
    q: deferredQ || undefined,
    includeHidden: showHidden && canManageHidden,
    sortBy,
    sortDir,
    page,
    pageSize: 20,
  })

  const syncStock = useSyncMachineJobsStock(machine.id)

  async function handleSyncStock() {
    try {
      const res = await syncStock.mutateAsync()
      toast.success(res.message || "Estoque sincronizado com sucesso!")
    } catch {
      toast.error("Erro ao sincronizar estoque da máquina.")
    }
  }

  const total = data?.total ?? 0
  const pageSize = data?.pageSize ?? 20
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function syncUrl(nextMonth: string, nextQ: string, nextPage: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("jobMonth", nextMonth)
    if (nextQ) params.set("jobQ", nextQ)
    else params.delete("jobQ")
    if (nextPage > 1) params.set("jobPage", String(nextPage))
    else params.delete("jobPage")
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  function onMonthChange(next: string) {
    setMonth(next)
    setPage(1)
    syncUrl(next, q, 1)
  }

  function onSearchChange(next: string) {
    setQ(next)
    setPage(1)
    syncUrl(month, next, 1)
  }

  function goTo(nextPage: number) {
    setPage(nextPage)
    syncUrl(month, q, nextPage)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap w-full">
        <Input
          type="month"
          value={month}
          onChange={(e) => onMonthChange(e.target.value)}
          className="w-64"
          aria-label="Mês"
        />
        <Input
          placeholder="Buscar job ou mídia..."
          value={q}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-64"
          aria-label="Buscar job ou mídia"
        />
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

        {canManageHidden && (
          <Button
            variant={showHidden ? "secondary" : "outline"}
            size="sm"
            onClick={() => {
              setShowHidden((prev) => !prev)
              setPage(1)
            }}
            className={`rounded-xl gap-1.5 text-xs font-medium ${
              showHidden
                ? "bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title={showHidden ? "Ocultar jobs arquivados da visualização" : "Exibir jobs ocultos"}
          >
            {showHidden ? (
              <RiEyeOffLine className="size-4 text-amber-800" />
            ) : (
              <RiEyeLine className="size-4 text-muted-foreground" />
            )}
            {showHidden ? "Ocultos exibidos" : "Mostrar ocultos"}
          </Button>
        )}

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
      ) : data && data.rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <div className="text-3xl">🗂️</div>
          <p className="text-sm font-medium text-gray-900">Nenhum job encontrado</p>
          <p className="text-xs text-muted-foreground">Nenhum job registrado para este período.</p>
        </div>
      ) : (
        <div className={isFetching && !isLoading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <MachineJobsTable
            machine={machine}
            data={data?.rows ?? []}
            onEditMedia={setEditJob}
            onHideJob={canManageHidden ? setHideJobTarget : undefined}
          />
        </div>
      )}

      <MediaEditDialog
        job={editJob}
        machine={machine}
        open={!!editJob}
        onOpenChange={(o) => !o && setEditJob(null)}
      />

      {canManageHidden && (
        <HideJobDialog
          job={hideJobTarget}
          open={!!hideJobTarget}
          onOpenChange={(o) => !o && setHideJobTarget(null)}
        />
      )}

      <div className="flex items-center justify-between px-1">
        <span className="text-sm text-muted-foreground">
          {total} job{total !== 1 ? "s" : ""} encontrado{total !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => goTo(page - 1)}
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
            onClick={() => goTo(page + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  )
}
