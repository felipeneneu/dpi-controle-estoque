import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useChangeBobina } from "@/lib/queries/machines";
import { toast } from "sonner";
import { Machine, Bobina } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ChangeBobinaDialog({
  machine,
  activeBobina,
  open,
  onClose,
}: {
  machine: Machine;
  activeBobina?: Bobina | null;
  open: boolean;
  onClose: () => void;
}) {
  const [newBobinaSerial, setNewBobinaSerial] = useState("");
  const [oldBobinaAction, setOldBobinaAction] = useState<"FINISHED" | "RETURN_TO_STOCK">("FINISHED");
  const changeBobina = useChangeBobina();

  async function handleConfirm() {
    if (!newBobinaSerial.trim()) {
      toast.error("Informe o Serial / ID Curto da nova bobina.");
      return;
    }
    try {
      await changeBobina.mutateAsync({
        machineId: machine.id,
        newBobinaSerial,
        oldBobinaAction: activeBobina ? oldBobinaAction : "FINISHED",
      });
      toast.success("Bobina trocada com sucesso!");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Erro ao trocar bobina.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trocar Bobina - {machine.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {activeBobina && (
            <div className="space-y-2">
              <Label>O que fazer com a bobina atual ({activeBobina.serial})?</Label>
              <Select value={oldBobinaAction} onValueChange={(v: any) => setOldBobinaAction(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FINISHED">Acabou (Descartar)</SelectItem>
                  <SelectItem value="RETURN_TO_STOCK">Voltou para Estoque</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Serial / ID Curto da Nova Bobina</Label>
            <Input
              value={newBobinaSerial}
              onChange={(e) => setNewBobinaSerial(e.target.value)}
              placeholder="Ex: BOB-1234"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={changeBobina.isPending}>
            {changeBobina.isPending ? "Trocando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
