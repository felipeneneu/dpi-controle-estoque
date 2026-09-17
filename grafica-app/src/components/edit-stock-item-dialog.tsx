"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { type StockItem, type StockCategory } from "@/lib/api";
import { useUpdateStockItem, useDeleteStockItem } from "@/lib/queries/stock";

type Props = {
  item: StockItem | null;
  onClose: () => void;
};

export default function EditStockItemDialog({ item, onClose }: Props) {
  const updateStockItem = useUpdateStockItem();
  const deleteStockItem = useDeleteStockItem();
  
  const [name, setName] = useState("");
  const [category, setCategory] = useState<StockCategory>("PAPER_MEDIA");
  const [unit, setUnit] = useState("m");
  const [width, setWidth] = useState("");
  const [currentQuantity, setCurrentQuantity] = useState("");
  const [minQuantity, setMinQuantity] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (item) {
      setName(item.name);
      setCategory(item.category);
      setUnit(item.unit);
      setWidth(item.width != null ? String(item.width) : "");
      setCurrentQuantity(String(item.currentQuantity));
      setMinQuantity(String(item.minQuantity));
      setIsDeleting(false);
    }
  }, [item]);

  const busy = updateStockItem.isPending || deleteStockItem.isPending;

  const handleCategoryChange = (cat: StockCategory) => {
    setCategory(cat);
    if (cat === "INK_SUPPLY") {
      setUnit("L");
    } else if (cat === "PAPER_MEDIA" && unit !== "m" && unit !== "fls") {
      setUnit("m");
    }
  };

  async function save() {
    if (!item || !name) return;
    try {
      await updateStockItem.mutateAsync({
        id: item.id,
        name,
        category,
        unit,
        width: (unit === "fls" || category === "INK_SUPPLY") ? undefined : (width ? Number(width) : undefined),
        currentQuantity: currentQuantity ? Number(currentQuantity) : undefined,
        minQuantity: minQuantity ? Number(minQuantity) : undefined,
      });
      toast.success("Insumo atualizado");
      onClose();
    } catch {
      toast.error("Falha ao atualizar");
    }
  }

  async function handleDelete() {
    if (!item) return;
    
    try {
      await deleteStockItem.mutateAsync(item.id);
      toast.success("Insumo excluído com sucesso");
      onClose();
    } catch (err: any) {
      toast.error("Erro ao excluir", { description: err?.message || "Sem permissão ou item em uso." });
    } finally {
      setIsDeleting(false);
    }
  }

  const showWidth = unit !== "fls" && category !== "INK_SUPPLY";

  return (
    <Dialog
      open={!!item}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category === "INK_SUPPLY" ? "Editar Tinta" : "Editar Insumo"}</DialogTitle>
          <DialogDescription>Atualize os dados do material</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Categoria</Label>
              <select
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value as StockCategory)}
                className="h-11 w-full rounded-xl border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="PAPER_MEDIA">Mídia / Papel</option>
                <option value="INK_SUPPLY">Tinta / Química</option>
                <option value="OTHER">Outro</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Unidade</Label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {category === "INK_SUPPLY" ? (
                  <>
                    <option value="ml">Mililitro (ml)</option>
                    <option value="L">Litro (L)</option>
                  </>
                ) : (
                  <>
                    <option value="m">Metro (m)</option>
                    <option value="fls">Folhas (fls)</option>
                    <option value="ml">Mililitro (ml)</option>
                    <option value="L">Litro (L)</option>
                  </>
                )}
              </select>
            </div>
          </div>
          <div className={`grid gap-4 ${showWidth ? "grid-cols-3" : "grid-cols-2"}`}>
            {showWidth && (
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Largura (m)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  placeholder="—"
                  className="h-11 rounded-xl"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">
                {category === "INK_SUPPLY" ? "Volume Atual" : "Qtd. Atual"}
              </Label>
              <Input
                type="number"
                min="0"
                value={currentQuantity}
                onChange={(e) => setCurrentQuantity(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Mínimo</Label>
              <Input
                type="number"
                min="0"
                value={minQuantity}
                onChange={(e) => setMinQuantity(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
          </div>
        </div>
        <DialogFooter className="flex items-center justify-between mt-6">
          <div className="flex-1">
            <Button
              type="button"
              variant="destructive"
              className="rounded-xl font-semibold"
              onClick={() => setIsDeleting(true)}
            >
              Excluir
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={save} disabled={busy || !name} className="rounded-xl font-semibold">
              {busy ? <Spinner className="size-4" /> : null}
              {busy ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </DialogFooter>

        {isDeleting && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-xl">
            <div className="bg-card p-6 rounded-2xl shadow-xl border border-gray-100 max-w-sm w-full mx-4 space-y-4">
              <h3 className="text-lg font-bold text-gray-900">Excluir Insumo?</h3>
              <p className="text-sm text-muted-foreground">
                Tem certeza que deseja apagar permanentemente este insumo? Esta ação não pode ser desfeita e pode afetar o histórico de transações.
              </p>
              <div className="flex gap-3 justify-end pt-2">
                <Button variant="outline" onClick={() => setIsDeleting(false)} disabled={busy}>
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={handleDelete} disabled={busy}>
                  {busy ? <Spinner className="size-4" /> : null}
                  Confirmar Exclusão
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}