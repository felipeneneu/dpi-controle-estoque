"use client"

import { useState } from "react"
import { toast } from "sonner"
import { RiDeleteBinLine, RiAlertLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { useDeleteJob, useBulkDeleteJobs } from "@/lib/queries/jobs"

export interface DeleteJobTarget {
  id: string
  jobName: string
  osNumber?: string | null
}

interface DeleteJobDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  targetJobs: DeleteJobTarget[]
  onSuccess?: () => void
}

export function DeleteJobDialog({
  open,
  onOpenChange,
  targetJobs,
  onSuccess,
}: DeleteJobDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const deleteSingle = useDeleteJob()
  const deleteBulk = useBulkDeleteJobs()

  const count = targetJobs.length
  const isMultiple = count > 1
  const singleJob = targetJobs[0]

  async function handleConfirmDelete() {
    if (count === 0) return
    setIsDeleting(true)

    try {
      if (isMultiple) {
        const ids = targetJobs.map((j) => j.id)
        const res = await deleteBulk.mutateAsync(ids)
        toast.success(res.message || `${count} jobs excluídos com sucesso.`)
      } else if (singleJob) {
        const res = await deleteSingle.mutateAsync(singleJob.id)
        toast.success(res.message || "Job excluído com sucesso.")
      }

      onSuccess?.()
      onOpenChange(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao excluir job(s)."
      toast.error(msg)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !isDeleting && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5 text-red-600 dark:text-red-400">
            <div className="flex size-9 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/50">
              <RiDeleteBinLine className="size-5" />
            </div>
            <DialogTitle className="text-base font-semibold text-gray-900 dark:text-neutral-100">
              {isMultiple
                ? `Excluir ${count} Jobs Selecionados`
                : "Excluir Job de Impressão"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground pt-1">
            {isMultiple
              ? `Tem certeza que deseja excluir os ${count} jobs selecionados da tabela? Esta ação remove os registros definitivamente.`
              : "Tem certeza que deseja excluir este job da tabela? Esta ação remove o registro definitivamente."}
          </DialogDescription>
        </DialogHeader>

        <div className="my-2 rounded-lg border border-red-200/60 bg-red-50/40 p-3 dark:border-red-900/40 dark:bg-red-950/20 text-xs">
          {isMultiple ? (
            <div className="space-y-1.5">
              <span className="font-semibold text-gray-800 dark:text-neutral-200">
                Jobs que serão excluídos ({count}):
              </span>
              <ul className="max-h-36 overflow-y-auto space-y-1 pl-1 pr-1 font-mono text-[11px] text-gray-700 dark:text-neutral-300">
                {targetJobs.slice(0, 8).map((job) => (
                  <li key={job.id} className="truncate flex items-center gap-1.5">
                    <span className="size-1 rounded-full bg-red-400 shrink-0" />
                    <span className="truncate">{job.jobName}</span>
                  </li>
                ))}
                {count > 8 && (
                  <li className="text-muted-foreground italic pl-2.5">
                    ... e mais {count - 8} outro(s)
                  </li>
                )}
              </ul>
            </div>
          ) : singleJob ? (
            <div className="space-y-1">
              <div className="font-medium text-gray-900 dark:text-neutral-100 break-words">
                {singleJob.jobName}
              </div>
              {singleJob.osNumber && (
                <div className="text-[11px] text-muted-foreground">
                  OS: <span className="font-mono">{singleJob.osNumber}</span>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-md border border-amber-200/50 dark:border-amber-900/30">
          <RiAlertLine className="size-4 shrink-0" />
          <span>Essa ação é irreversível e removerá o item da visualização.</span>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 mt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleConfirmDelete}
            disabled={isDeleting}
            className="gap-1.5"
          >
            {isDeleting ? <Spinner className="size-3.5" /> : <RiDeleteBinLine className="size-3.5" />}
            {isDeleting ? "Excluindo..." : "Excluir Definitivamente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
