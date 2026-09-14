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
import { StockItem, Bobina } from "@/lib/api";
import { useBobinas, useDischargeBobina } from "@/lib/queries/stock";
import { Badge } from "@/components/ui/badge";

export function BobinasListDialog({
  item,
  onClose,
}: {
  item: StockItem | null;
  onClose: () => void;
}) {
  const query = useBobinas(item?.id);
  const dischargeMutation = useDischargeBobina();
  const bobinas = query.data ?? [];
  
  const [dischargeTarget, setDischargeTarget] = useState<Bobina | null>(null);
  const [dischargeReason, setDischargeReason] = useState("");

  // Only show active bobinas
  const activeBobinas = bobinas.filter(b => b.state === 'NEW' || b.state === 'IN_USE');

  return (
    <>
      <Dialog open={!!item && !dischargeTarget} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bobinas: {item?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {query.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : activeBobinas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma bobina ativa encontrada para este item.</p>
            ) : (
              <div className="grid gap-4">
                {activeBobinas.map((b) => (
                  <div key={b.id} className="p-4 border rounded-xl flex items-center justify-between">
                    <div>
                      <p className="font-bold">ID Curto / Serial: {b.serial}</p>
                      <p className="text-sm text-muted-foreground">Localização: {b.location}</p>
                    </div>
                    <div className="text-right flex flex-col items-end gap-2">
                      <div>
                        <Badge variant={b.state === "IN_USE" ? "default" : "secondary"}>
                          {b.state === "IN_USE" ? "Em Uso" : "Nova"}
                        </Badge>
                        <p className="text-sm mt-1">{b.metersRemaining}m restantes</p>
                      </div>
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => {
                          setDischargeTarget(b);
                          setDischargeReason("");
                        }}
                      >
                        Dar baixa
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dischargeTarget} onOpenChange={(open) => !open && setDischargeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dar baixa na Bobina</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Você está dando baixa na bobina <strong>{dischargeTarget?.serial}</strong> (saldo atual: {dischargeTarget?.metersRemaining}m). 
              Isto irá marcá-la como usada e enviá-la para o cliente.
            </p>
            <div className="space-y-2">
              <Label>Motivo da Baixa (Obrigatório)</Label>
              <Input
                placeholder="Ex: Venda balcão — Cliente X"
                value={dischargeReason}
                onChange={(e) => setDischargeReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDischargeTarget(null)}>Cancelar</Button>
            <Button
              disabled={!dischargeReason.trim() || dischargeMutation.isPending}
              onClick={() => {
                if (dischargeTarget && dischargeReason.trim()) {
                  dischargeMutation.mutate(
                    { id: dischargeTarget.id, reason: dischargeReason.trim() },
                    { onSuccess: () => setDischargeTarget(null) }
                  );
                }
              }}
            >
              Confirmar Baixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
