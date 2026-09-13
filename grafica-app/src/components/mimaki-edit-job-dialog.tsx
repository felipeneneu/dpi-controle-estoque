"use client"

import { useState } from "react"
import { toast } from "sonner"
import { RiEditLine, RiInformationLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { useUpdateMimakiJob, type MimakiJob } from "@/lib/queries/mimaki"

interface MimakiEditJobDialogProps {
  job: MimakiJob | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MimakiEditJobDialog({ job, open, onOpenChange }: MimakiEditJobDialogProps) {
  const [copies, setCopies] = useState<number>(1)
  const [lengthMeters, setLengthMeters] = useState<string>("")
  const [orderCode, setOrderCode] = useState<string>("")

  const updateJob = useUpdateMimakiJob()

  // Inicializa os campos quando o job editado muda (adjust during render)
  const [lastJobId, setLastJobId] = useState<string | null>(null)
  if ((job?.id ?? null) !== lastJobId) {
    setLastJobId(job?.id ?? null)
    if (job) {
      setOrderCode(job.orderCode ?? "")
      const currentLen = job.lengthMeters != null ? job.lengthMeters.toFixed(3) : "0.000"
      setLengthMeters(currentLen)

      // Se temos heightMm e pages, tenta inferir se há cópias atuais
      if (job.heightMm && job.heightMm > 0) {
        const singleCopyLen = (job.heightMm * (job.pages || 1)) / 1000
        if (singleCopyLen > 0 && job.lengthMeters) {
          const inferredCopies = Math.round(job.lengthMeters / singleCopyLen)
          setCopies(inferredCopies > 0 ? inferredCopies : 1)
        } else {
          setCopies(1)
        }
      } else {
        setCopies(1)
      }
    }
  }

  function handleCopiesChange(newCopies: number) {
    setCopies(newCopies)
    if (job?.heightMm && newCopies > 0) {
      const calculated = ((job.heightMm * (job.pages || 1) * newCopies) / 1000).toFixed(3)
      setLengthMeters(calculated)
    }
  }

  async function handleSave() {
    if (!job) return
    const numLength = parseFloat(lengthMeters.replace(",", "."))
    if (Number.isNaN(numLength) || numLength <= 0) {
      toast.error("Informe uma metragem válida maior que zero.")
      return
    }

    try {
      const result = await updateJob.mutateAsync({
        jobId: job.id,
        lengthMeters: numLength,
        orderCode: orderCode.trim() ? orderCode.trim() : null,
      })

      if (result.stock_adjusted_diff != null && result.stock_adjusted_diff !== 0) {
        const diffText =
          result.stock_adjusted_diff > 0
            ? `+${result.stock_adjusted_diff.toFixed(3)}m debitados`
            : `${Math.abs(result.stock_adjusted_diff).toFixed(3)}m estornados`
        toast.success(`Job atualizado! Ajuste no estoque: ${diffText}.`)
      } else {
        toast.success("Job atualizado com sucesso!")
      }

      onOpenChange(false)
    } catch {
      toast.error("Falha ao atualizar job Mimaki.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <RiEditLine className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle>Ajustar Job Mimaki</DialogTitle>
              <DialogDescription className="line-clamp-1 break-all">
                {job?.jobName}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {job && (
            <div className="p-3 bg-muted/40 rounded-xl text-xs space-y-1 text-muted-foreground border border-gray-100">
              <div className="flex justify-between">
                <span>Dimensões do RIP:</span>
                <span className="font-medium text-gray-800">
                  {job.widthMm ? `${job.widthMm.toFixed(0)}mm` : "—"} × {job.heightMm ? `${job.heightMm.toFixed(0)}mm` : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Páginas no PDF:</span>
                <span className="font-medium text-gray-800">{job.pages ?? 1}</span>
              </div>
              {job.stockItemName && (
                <div className="flex justify-between">
                  <span>Material vinculado:</span>
                  <span className="font-medium text-gray-800">{job.stockItemName}</span>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">
                Cópias impressas
              </label>
              <Input
                type="number"
                min={1}
                step={1}
                value={copies}
                onChange={(e) => handleCopiesChange(parseInt(e.target.value, 10) || 1)}
                className="h-10 rounded-xl"
              />
              <span className="text-[11px] text-muted-foreground mt-1 block">
                Calcula metragem auto
              </span>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">
                Metragem linear (m)
              </label>
              <Input
                type="text"
                value={lengthMeters}
                onChange={(e) => setLengthMeters(e.target.value)}
                className="h-10 rounded-xl font-mono"
                placeholder="Ex: 1.570"
              />
              <span className="text-[11px] text-muted-foreground mt-1 block">
                Avanço real no rolo
              </span>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">
              Código da OS
            </label>
            <Input
              type="text"
              value={orderCode}
              onChange={(e) => setOrderCode(e.target.value)}
              placeholder="Ex: 30771"
              className="h-10 rounded-xl"
            />
          </div>

          <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-800 text-xs">
            <RiInformationLine className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Se este job já tiver dado saída de estoque, a diferença da metragem será debitada ou estornada do estoque automaticamente.
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateJob.isPending}
            className="rounded-xl font-semibold"
          >
            {updateJob.isPending ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
