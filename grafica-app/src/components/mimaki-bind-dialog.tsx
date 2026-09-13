"use client"

import { useState } from "react"
import { toast } from "sonner"
import { RiAddLine, RiArrowLeftLine, RiCheckLine, RiSearchLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { useStockItems, useCreateStockItem, useBobinas } from "@/lib/queries/stock"
import { useBindMaterial, type MimakiJob } from "@/lib/queries/mimaki"

interface MimakiBindDialogProps {
  job: MimakiJob | null
  machineId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MimakiBindDialog({ job, machineId, open, onOpenChange }: MimakiBindDialogProps) {
  const [search, setSearch] = useState("")
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  // Campos para criação rápida
  const [newName, setNewName] = useState("")
  const [newWidth, setNewWidth] = useState("0.75")
  const [newQuantity, setNewQuantity] = useState("50")

  const { data: stockItems = [], isLoading: isLoadingStock } = useStockItems("PAPER_MEDIA")
  const { data: bobinas = [] } = useBobinas()
  const bindMaterial = useBindMaterial()
  const createStockItem = useCreateStockItem()

  // Inicializa o formulário quando o dialog abre para um novo job (adjust during render)
  const [lastInitKey, setLastInitKey] = useState("")
  const [selectedBobinaId, setSelectedBobinaId] = useState<string | null>(null)
  
  const initKey = `${job?.id ?? "none"}:${open ? "open" : "closed"}`
  if (initKey !== lastInitKey) {
    setLastInitKey(initKey)
    if (job && open) {
      setSearch(job.rawMaterialName ?? "")
      setSelectedItemId(job.stockItemId ?? null)
      setSelectedBobinaId(null)
      setIsCreating(false)

      const defaultW = job.widthMm ? (job.widthMm / 1000).toFixed(2) : "0.75"
      setNewWidth(defaultW)
    }
  }

  const filtered = stockItems.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase())
  )

  function handleStartCreate() {
    setNewName(search.trim() || job?.rawMaterialName || "")
    setIsCreating(true)
  }

  async function handleCreateAndBind() {
    if (!job) return
    if (!newName.trim()) {
      toast.error("Informe o nome da nova mídia.")
      return
    }

    const widthNum = parseFloat(newWidth.replace(",", "."))
    const qtyNum = parseFloat(newQuantity.replace(",", ".")) || 0

    try {
      const createdItem = await createStockItem.mutateAsync({
        name: newName.trim(),
        category: "PAPER_MEDIA",
        unit: "m",
        width: Number.isFinite(widthNum) && widthNum > 0 ? widthNum : 0.75,
        currentQuantity: qtyNum,
        minQuantity: 10,
        machineId: machineId ?? job.machineId,
      })

      await bindMaterial.mutateAsync({
        jobId: job.id,
        stockItemId: createdItem.id,
      })

      toast.success(`Mídia "${createdItem.name}" criada e vinculada com sucesso!`)
      onOpenChange(false)
    } catch {
      toast.error("Erro ao cadastrar e vincular nova mídia.")
    }
  }

  async function handleBind() {
    if (!job) return
    if (!selectedItemId && !selectedBobinaId) return
    try {
      await bindMaterial.mutateAsync({ 
        jobId: job.id, 
        stockItemId: selectedItemId || undefined,
        bobinaId: selectedBobinaId || undefined
      })
      toast.success("Material vinculado com sucesso")
      onOpenChange(false)
    } catch {
      toast.error("Falha ao vincular material")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isCreating ? "Cadastrar Nova Mídia Mimaki" : "Vincular Material"}</DialogTitle>
          <DialogDescription className="line-clamp-1 break-all">
            {job?.jobName} — {job?.lengthMeters?.toFixed(3)}m
            {job?.rawMaterialName && ` — "${job.rawMaterialName}"`}
          </DialogDescription>
        </DialogHeader>

        {isCreating ? (
          <div className="space-y-3.5 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-700">Nome do Material / Bobina</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: BOPP Prata 75cm"
                className="h-10 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-700">Largura do rolo (m)</Label>
                <Input
                  value={newWidth}
                  onChange={(e) => setNewWidth(e.target.value)}
                  placeholder="Ex: 0.75 ou 1.06"
                  className="h-10 rounded-xl font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-700">Estoque inicial (m)</Label>
                <Input
                  value={newQuantity}
                  onChange={(e) => setNewQuantity(e.target.value)}
                  placeholder="Ex: 50"
                  className="h-10 rounded-xl font-mono"
                />
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Esta mídia será cadastrada no estoque com categoria Mídia de Rolo (m) e vinculada
              automaticamente à impressora Mimaki.
            </p>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="relative">
              <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setSelectedItemId(null)
                }}
                placeholder="Buscar material no estoque..."
                className="pl-9 h-10 rounded-xl"
              />
            </div>

            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
              {filtered.map((item) => {
                const isSelected = selectedItemId === item.id
                const itemBobinas = bobinas.filter(b => b.stockItemId === item.id)
                return (
                  <div key={item.id} className="space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedItemId(item.id)
                        setSelectedBobinaId(null)
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm text-left transition-colors ${
                        isSelected
                          ? "border-primary/60 bg-primary/5 text-primary"
                          : "border-gray-150 hover:bg-gray-50 text-gray-800"
                      }`}
                    >
                      <div>
                        <p className="font-medium text-gray-900">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.currentQuantity} {item.unit}
                          {item.width ? ` · rolo ${item.width}m` : ""}
                        </p>
                      </div>
                      {isSelected && !selectedBobinaId && <RiCheckLine className="size-4 text-primary shrink-0" />}
                    </button>
                    {isSelected && itemBobinas.length > 0 && (
                      <div className="pl-4 space-y-1">
                        <p className="text-xs font-bold text-gray-500 mt-2 mb-1">Selecione uma Bobina específica (opcional)</p>
                        {itemBobinas.map(b => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => setSelectedBobinaId(b.id)}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs text-left ${
                              selectedBobinaId === b.id
                                ? "border-indigo-400 bg-indigo-50 text-indigo-700 font-medium"
                                : "border-gray-100 bg-gray-50 hover:bg-gray-100 text-gray-600"
                            }`}
                          >
                            <span>Bobina {b.serial} ({b.metersRemaining}m restantes)</span>
                            {selectedBobinaId === b.id && <RiCheckLine className="size-3 text-indigo-600 shrink-0" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}

              {filtered.length === 0 && !isLoadingStock && (
                <div className="py-4 text-center space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Nenhum material encontrado com o nome &ldquo;{search}&rdquo;.
                  </p>
                </div>
              )}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleStartCreate}
              className="w-full rounded-xl gap-2 text-xs font-medium border-dashed border-primary/40 text-primary hover:bg-primary/5"
            >
              <RiAddLine className="size-4" />
              {search.trim() ? `Criar mídia "${search.trim()}"` : "Cadastrar nova mídia no estoque"}
            </Button>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {isCreating ? (
            <>
              <Button
                variant="outline"
                onClick={() => setIsCreating(false)}
                className="rounded-xl gap-1.5"
              >
                <RiArrowLeftLine className="size-4" />
                Voltar
              </Button>
              <Button
                onClick={handleCreateAndBind}
                disabled={createStockItem.isPending || bindMaterial.isPending}
                className="rounded-xl font-semibold"
              >
                {createStockItem.isPending ? "Cadastrando..." : "Cadastrar e Vincular"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
                Cancelar
              </Button>
              <Button
                onClick={handleBind}
                disabled={!selectedItemId || bindMaterial.isPending}
                className="rounded-xl font-semibold"
              >
                {bindMaterial.isPending ? "Vinculando..." : "Vincular"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
