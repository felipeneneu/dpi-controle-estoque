"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { useUpdateMachineMaterials } from "@/lib/queries/machines"
import { toast } from "sonner"
import type { Machine, StockItem } from "@/lib/api"

interface AddMaterialDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  machine: Machine
  allItems: StockItem[]
  currentlyLinkedIds: string[]
}

export function AddMaterialDialog({
  open,
  onOpenChange,
  machine,
  allItems,
  currentlyLinkedIds,
}: AddMaterialDialogProps) {
  const [search, setSearch] = useState("")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const updateMaterials = useUpdateMachineMaterials()

  // Filtrar apenas materiais PAPER_MEDIA
  const paperMediaItems = useMemo(() => {
    return allItems.filter((item) => item.category === "PAPER_MEDIA")
  }, [allItems])

  // Filtrar por busca
  const filteredItems = useMemo(() => {
    if (!search.trim()) return paperMediaItems
    const lowerSearch = search.toLowerCase()
    return paperMediaItems.filter((item) =>
      item.name.toLowerCase().includes(lowerSearch)
    )
  }, [paperMediaItems, search])

  // Itens já vinculados (desabilitados)
  const linkedItems = useMemo(() => {
    return filteredItems.filter((item) => currentlyLinkedIds.includes(item.id))
  }, [filteredItems, currentlyLinkedIds])

  // Itens disponíveis para seleção
  const availableItems = useMemo(() => {
    return filteredItems.filter((item) => !currentlyLinkedIds.includes(item.id))
  }, [filteredItems, currentlyLinkedIds])

  function toggleItem(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  async function handleAdd() {
    if (selectedIds.length === 0) return

    try {
      // Combinar materiais já vinculados com os novos selecionados
      const newItemIds = [...currentlyLinkedIds, ...selectedIds]
      
      await updateMaterials.mutateAsync({
        id: machine.id,
        stockItemIds: newItemIds,
      })

      toast.success(
        `${selectedIds.length} material(is) adicionado(s) com sucesso!`
      )
      setSelectedIds([])
      setSearch("")
      onOpenChange(false)
    } catch {
      toast.error("Falha ao adicionar materiais")
    }
  }

  function handleClose() {
    setSelectedIds([])
    setSearch("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Adicionar Material</DialogTitle>
          <DialogDescription>
            Selecione os materiais do tipo Mídia para vincular a esta máquina.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Campo de busca */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">
              Buscar Material
            </Label>
            <Input
              placeholder="Digite o nome do material..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>

          {/* Lista de materiais */}
          <div className="flex-1 overflow-y-auto space-y-2">
            {filteredItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {search
                  ? "Nenhum material encontrado para a busca."
                  : "Nenhum material do tipo Mídia disponível."}
              </p>
            ) : (
              <>
                {/* Itens já vinculados (desabilitados) */}
                {linkedItems.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">
                      Já Vinculados
                    </p>
                    {linkedItems.map((item) => (
                      <label
                        key={item.id}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 border border-gray-100 bg-gray-50 text-sm cursor-not-allowed opacity-60"
                      >
                        <input
                          type="checkbox"
                          disabled
                          className="size-4 accent-[var(--brand-purple)]"
                        />
                        <span className="flex-1 font-medium text-gray-600">
                          {item.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {item.currentQuantity} {item.unit}
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Itens disponíveis */}
                {availableItems.length > 0 && (
                  <div className="space-y-1">
                    {linkedItems.length > 0 && (
                      <p className="text-xs font-semibold text-muted-foreground uppercase">
                        Disponíveis
                      </p>
                    )}
                    {availableItems.map((item) => (
                      <label
                        key={item.id}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border text-sm cursor-pointer transition-colors ${
                          selectedIds.includes(item.id)
                            ? "border-primary/60 bg-primary/5"
                            : "border-gray-150 hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => toggleItem(item.id)}
                          className="size-4 accent-[var(--brand-purple)]"
                        />
                        <span className="flex-1 font-medium text-gray-800">
                          {item.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {item.currentQuantity} {item.unit}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleAdd}
            disabled={selectedIds.length === 0 || updateMaterials.isPending}
            className="rounded-xl font-semibold"
          >
            {updateMaterials.isPending
              ? "Adicionando…"
              : `Adicionar ${selectedIds.length > 0 ? `(${selectedIds.length})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
