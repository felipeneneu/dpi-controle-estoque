"use client";

import { useState } from "react";
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
import { useUpdateStockItem } from "@/lib/queries/stock";

type Props = {
  item: StockItem | null;
  onClose: () => void;
};

export default function EditStockItemDialog({ item, onClose }: Props) {
  const updateStockItem = useUpdateStockItem();
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState<StockCategory>(item?.category ?? "PAPER_MEDIA");
  const [unit, setUnit] = useState(item?.unit ?? "m");
  const [width, setWidth] = useState(item?.width != null ? String(item.width) : "");
  const [currentQuantity, setCurrentQuantity] = useState(item ? String(item.currentQuantity) : "");
  const [minQuantity, setMinQuantity] = useState(item ? String(item.minQuantity) : "");
  const busy = updateStockItem.isPending;

  async function save() {
    if (!item || !name) return;
    try {
      await updateStockItem.mutateAsync({
        id: item.id,
        name,
        category,
        unit,
        width: width ? Number(width) : undefined,
        currentQuantity: currentQuantity ? Number(currentQuantity) : undefined,
        minQuantity: minQuantity ? Number(minQuantity) : undefined,
      });
      toast.success("Insumo atualizado");
      onClose();
    } catch {
      toast.error("Falha ao atualizar");
    }
  }

  return (
    <Dialog
      open={!!item}
      onOpenChange={(o) => {
        if (o && item) {
          setName(item.name);
          setCategory(item.category);
          setUnit(item.unit);
          setWidth(item.width != null ? String(item.width) : "");
          setCurrentQuantity(String(item.currentQuantity));
          setMinQuantity(String(item.minQuantity));
        } else if (!o) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Insumo</DialogTitle>
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
                onChange={(e) => setCategory(e.target.value as StockCategory)}
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
                <option value="m">Metro (m)</option>
                <option value="fls">Folhas (fls)</option>
                <option value="ml">Mililitro (ml)</option>
                <option value="L">Litro (L)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
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
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Qtd. atual</Label>
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
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={busy || !name} className="rounded-xl font-semibold">
            {busy ? <Spinner className="size-4" /> : null}
            {busy ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}