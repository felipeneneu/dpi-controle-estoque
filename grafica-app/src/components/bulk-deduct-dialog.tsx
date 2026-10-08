"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  RiFlashlightLine,
  RiFilePaperLine,
  RiExchangeLine,
  RiAlertLine,
  RiCheckLine,
} from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { useBulkDeductJobs, type PrintJobRow } from "@/lib/queries/jobs"
import { useStockItems, useBobinas } from "@/lib/queries/stock"
import { isKonicaMachine, type Machine, type StockItem } from "@/lib/api"

export interface DeductJobItem {
  id: string
  jobName: string
  mediaType?: string | null
  rawMaterialName?: string | null
  linearMetersDebited?: number | null
  lengthMeters?: number | null
  mediaAreaM2?: number | null
  sheets?: number | null
  pages?: number | null
  quantityUnits?: number | null
}

interface BulkDeductDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedJobs: DeductJobItem[]
  machine: Machine
  onSuccess: () => void
}

export function BulkDeductDialog({
  open,
  onOpenChange,
  selectedJobs,
  machine,
  onSuccess,
}: BulkDeductDialogProps) {
  const isKonica = isKonicaMachine(machine)
  const bulkDeduct = useBulkDeductJobs()

  const { data: stockItems = [], isLoading: isLoadingStock } = useStockItems("PAPER_MEDIA")

  const [selectedItemId, setSelectedItemId] = useState<string>("")
  const [selectedBobinaId, setSelectedBobinaId] = useState<string>("")
  const [customReason, setCustomReason] = useState<string>("")

  // Bobinas para o material selecionado (apenas se for máquina de rolo)
  const { data: bobinas = [] } = useBobinas(selectedItemId || undefined)
  const inUseBobinas = useMemo(
    () => bobinas.filter((b) => b.state === "IN_USE"),
    [bobinas]
  )

  // Determina e soma o total selecionado
  const { totalSheets, totalMeters, detectedMediaTypes } = useMemo(() => {
    let sheets = 0
    let meters = 0
    const mediaSet = new Set<string>()

    for (const job of selectedJobs) {
      const mName = job.mediaType ?? job.rawMaterialName
      if (mName) {
        mediaSet.add(mName)
      }

      // Konica / folhas
      const s = job.sheets ?? job.quantityUnits ?? job.pages ?? 0
      sheets += s

      // HP / Mimaki: metros lineares
      let linear = job.lengthMeters ?? job.linearMetersDebited
      if (!linear || linear <= 0) {
        linear = job.mediaAreaM2 && job.mediaAreaM2 > 0 ? job.mediaAreaM2 / 1.52 : 1
      }
      meters += linear
    }

    return {
      totalSheets: sheets,
      totalMeters: Number(meters.toFixed(3)),
      detectedMediaTypes: Array.from(mediaSet),
    }
  }, [selectedJobs])

  // Inicialização inteligente quando o modal abre
  const [lastInitKey, setLastInitKey] = useState("")
  const initKey = `${selectedJobs.map((j) => j.id).join(",")}:${open ? "open" : "closed"}`

  if (initKey !== lastInitKey) {
    setLastInitKey(initKey)
    if (open && selectedJobs.length > 0) {
      // Tentar adivinhar o material pelo primeiro tipo de mídia detectado
      const firstMedia = detectedMediaTypes[0]
      let matchedItem: StockItem | undefined

      if (firstMedia && stockItems.length > 0) {
        const cleanTarget = firstMedia.toLowerCase().replace(/[\s\-_,./()ºª]+/g, "")
        matchedItem = stockItems.find((item) => {
          const cleanItem = item.name.toLowerCase().replace(/[\s\-_,./()ºª]+/g, "")
          return cleanItem.includes(cleanTarget) || cleanTarget.includes(cleanItem)
        })
      }

      const defaultItem = matchedItem ?? stockItems[0]
      const itemId = defaultItem?.id ?? ""
      setSelectedItemId(itemId)
      setSelectedBobinaId("")
      setCustomReason("")
    }
  }

  const selectedItem = stockItems.find((i) => i.id === selectedItemId)

  async function handleConfirm() {
    if (!selectedItemId) {
      toast.error("Selecione o material a ser debitado.")
      return
    }

    const jobIds = selectedJobs.map((j) => j.id)

    try {
      const res = await bulkDeduct.mutateAsync({
        jobIds,
        stockItemId: selectedItemId,
        bobinaId: !isKonica && selectedBobinaId ? selectedBobinaId : undefined,
        reason: customReason.trim() || undefined,
        machineId: machine.id,
      })

      toast.success(res.message || `${jobIds.length} job(s) debitados com sucesso!`)
      onSuccess()
      onOpenChange(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao debitar jobs em massa."
      toast.error(msg)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <RiFlashlightLine className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                {isKonica
                  ? "Débito em Massa — Folhas / Papel (Konica)"
                  : "Débito em Massa — Bobina / Mídia em Rolo"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Debita {selectedJobs.length} job(s) selecionados de uma só vez no estoque.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Card explicativo de distinção de domínio */}
          <div
            className={`p-3.5 rounded-xl border text-xs leading-relaxed space-y-1.5 ${
              isKonica
                ? "bg-blue-50/60 border-blue-200 text-blue-900"
                : "bg-emerald-50/60 border-emerald-200 text-emerald-900"
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              {isKonica ? (
                <>
                  <RiFilePaperLine className="size-4 text-blue-700" />
                  <span>Máquina de Folhas Avulsas ({machine.name})</span>
                </>
              ) : (
                <>
                  <RiExchangeLine className="size-4 text-emerald-700" />
                  <span>Máquina de Bobina Contínua ({machine.name})</span>
                </>
              )}
            </div>
            <p className="text-[11px] opacity-90">
              {isKonica
                ? "O papel é contabilizado em folhas/resmas inteiras. O toner é telemetrado por cartucho e NÃO é debitado por job."
                : "A mídia é contabilizada em metros lineares da bobina. O estoque de tinta é contado em unidades inteiras (ADR-057) e não é deduzido por job."}
            </p>
          </div>

          {/* Resumo da seleção */}
          <div className="bg-muted/40 p-3 rounded-xl border border-gray-100 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Jobs selecionados:</span>
              <span className="font-semibold text-gray-900">{selectedJobs.length} serviço(s)</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {isKonica ? "Total a debitar:" : "Metragem linear total:"}
              </span>
              <span className="font-bold text-base text-primary">
                {isKonica ? `${totalSheets} folhas` : `${totalMeters.toFixed(3)} m lineares`}
              </span>
            </div>

            {detectedMediaTypes.length > 0 && (
              <div className="pt-1 border-t border-gray-100 flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-muted-foreground">Detectado nos jobs:</span>
                {detectedMediaTypes.map((m) => (
                  <Badge key={m} variant="secondary" className="text-[10px] py-0 px-1.5">
                    {m}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Seleção do SKU de estoque */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-900">
              {isKonica ? "Material / Papel no Estoque" : "Material / Bobina no Estoque"}
            </Label>
            {isLoadingStock ? (
              <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                <Spinner className="size-3" />
                Carregando materiais...
              </div>
            ) : (
              <select
                value={selectedItemId}
                onChange={(e) => {
                  setSelectedItemId(e.target.value)
                  setSelectedBobinaId("")
                }}
                className="w-full h-10 rounded-xl border border-input bg-transparent px-3 text-xs outline-none focus-visible:border-ring"
              >
                <option value="">-- Selecione o material --</option>
                {stockItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.currentQuantity} {item.unit} disponíveis)
                  </option>
                ))}
              </select>
            )}
            {selectedItem && (
              <p className="text-[11px] text-muted-foreground">
                Saldo atual: <strong>{selectedItem.currentQuantity} {selectedItem.unit}</strong>
                {selectedItem.width ? ` · Largura: ${selectedItem.width}m` : ""}
              </p>
            )}
          </div>

          {/* Seleção de Bobina (se máquina de rolo) */}
          {!isKonica && selectedItemId && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-900">
                Bobina Ativa (Opcional)
              </Label>
              <select
                value={selectedBobinaId}
                onChange={(e) => setSelectedBobinaId(e.target.value)}
                className="w-full h-10 rounded-xl border border-input bg-transparent px-3 text-xs outline-none focus-visible:border-ring"
              >
                <option value="">
                  {inUseBobinas.length > 0
                    ? `Automático (detectar bobina EM USO desta máquina)`
                    : `-- Nenhuma bobina em uso (debitará do saldo do item) --`}
                </option>
                {bobinas.map((b) => (
                  <option key={b.id} value={b.id}>
                    Bobina #{b.serial || b.id.slice(0, 8)} ({b.metersRemaining}m restantes) — [{b.state}]
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground">
                Se não selecionar uma bobina específica, o sistema debita da bobina atualmente carregada na máquina.
              </p>
            </div>
          )}

          {/* Observação / Motivo */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-900">
              Observação / Motivo no Histórico
            </Label>
            <Input
              placeholder={`Ex: Baixa em massa de ${selectedJobs.length} jobs`}
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              className="text-xs h-9"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={bulkDeduct.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleConfirm}
            disabled={bulkDeduct.isPending || !selectedItemId || selectedJobs.length === 0}
            className="gap-1.5 font-semibold"
          >
            {bulkDeduct.isPending ? (
              <>
                <Spinner className="size-3.5" />
                Processando...
              </>
            ) : (
              <>
                <RiCheckLine className="size-4" />
                Confirmar Débito em Massa
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
