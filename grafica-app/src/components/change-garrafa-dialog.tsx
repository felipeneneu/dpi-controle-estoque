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
import { useChangeGarrafa } from "@/lib/queries/machines";
import { useGarrafas } from "@/lib/queries/stock";
import { toast } from "sonner";
import { Machine } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ChangeGarrafaDialog({
  machine,
  open,
  onClose,
}: {
  machine: Machine;
  open: boolean;
  onClose: () => void;
}) {
  const [serial, setSerial] = useState("");
  const [oldGarrafaAction, setOldGarrafaAction] = useState<"FINISHED" | "RETURN_TO_STOCK">("FINISHED");
  const changeGarrafa = useChangeGarrafa();
  const { data: garrafas = [] } = useGarrafas();

  const activeGarrafas = garrafas.filter(
    (g) => (g.state === "NEW" || g.state === "IN_USE") && g.location === `machine:${machine.id}`,
  );
  const matches = garrafas.filter((g) => g.serial.toLowerCase().includes(serial.trim().toLowerCase()));

  async function handleConfirm() {
    if (!serial.trim()) {
      toast.error("Informe o serial da nova garrafa.");
      return;
    }
    const match = matches.find((g) => g.serial.toLowerCase() === serial.trim().toLowerCase());
    const newGarrafaId = match?.id ?? serial.trim();
    try {
      await changeGarrafa.mutateAsync({
        machineId: machine.id,
        newGarrafaId,
        oldGarrafaAction: activeGarrafas.length > 0 ? oldGarrafaAction : "FINISHED",
      });
      toast.success("Garrafa definida como em uso na máquina!");
      setSerial("");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao definir garrafa.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Definir Garrafa de Tinta - {machine.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {activeGarrafas.length > 0 && (
            <div className="space-y-2">
              <Label>O que fazer com as garrafas em uso?</Label>
              <Select value={oldGarrafaAction} onValueChange={(v) => v && setOldGarrafaAction(v)}>
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
            <Label>Serial da Nova Garrafa (ex: TIN-1234)</Label>
            <Input
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              placeholder="Ex: TIN-1234"
            />
          </div>
          {serial.trim() && matches.length > 0 && (
            <div className="space-y-2">
              {matches.slice(0, 6).map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="w-full text-left p-3 rounded-xl border hover:bg-muted transition-colors"
                  onClick={() => setSerial(g.serial)}
                >
                  <p className="text-sm font-bold">{g.serial}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.mlRemaining}ml de {g.mlInitial}ml · {g.location}
                    {g.state === "IN_USE" ? " · Em uso" : " · Nova"}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={changeGarrafa.isPending}>
            {changeGarrafa.isPending ? "Salvando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}