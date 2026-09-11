"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { type Machine, type StockItem } from "@/lib/api";
import { useUpdateItemMachines } from "@/lib/queries/machines";

type Props = {
  item: StockItem;
  machines: Machine[];
};

export default function MachineSelectForItem({ item, machines }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const updateItemMachines = useUpdateItemMachines();
  const busy = updateItemMachines.isPending;

  function openDialog() {
    setSelected(item.machineIds ?? []);
    setOpen(true);
  }

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    try {
      await updateItemMachines.mutateAsync({ id: item.id, machineIds: selected });
      toast.success("Máquinas atualizadas");
      setOpen(false);
    } catch {
      toast.error("Falha ao salvar");
    }
  }

  return (
    <>
      <Button
        variant="outline"
        className="h-9 rounded-xl font-semibold text-sm w-full"
        onClick={openDialog}
      >
        {selected.length > 0
          ? `${selected.length} máquina${selected.length === 1 ? "" : "s"} selecionada${selected.length === 1 ? "" : "s"}`
          : "Definir máquinas"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{item.name} — máquinas que usam</DialogTitle>
            <DialogDescription>
              Selecione em quais máquinas este material é utilizado. Deixe vazio se não precisa de máquina.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              Atualmente: {selected.length === 0 ? "nenhuma máquina (o material não requer impressão)" : `${item.machineIds?.length ?? 0} máquina(s)`}
            </p>
            {machines.map((m) => (
              <label
                key={m.id}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border text-sm cursor-pointer transition-colors ${
                  selected.includes(m.id) ? "border-primary/60 bg-primary/5" : "border-gray-150 hover:bg-gray-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(m.id)}
                  onChange={() => toggle(m.id)}
                  className="size-4 accent-[var(--brand-purple)]"
                />
                <span className="flex-1 font-medium text-gray-800">{m.name}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={busy} className="rounded-xl font-semibold">
              {busy ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}