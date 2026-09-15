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
import { StockItem, Garrafa } from "@/lib/api";
import { useGarrafas, useDischargeGarrafa, useAddGarrafa } from "@/lib/queries/stock";
import { Badge } from "@/components/ui/badge";

export function GarrafasListDialog({
  item,
  onClose,
}: {
  item: StockItem | null;
  onClose: () => void;
}) {
  const query = useGarrafas(item?.id);
  const dischargeMutation = useDischargeGarrafa();
  const garrafas = query.data ?? [];

  const [dischargeTarget, setDischargeTarget] = useState<Garrafa | null>(null);
  const [dischargeReason, setDischargeReason] = useState("");

  const activeGarrafas = garrafas.filter((g) => g.state === "NEW" || g.state === "IN_USE");

  return (
    <>
      <Dialog open={!!item && !dischargeTarget} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Garrafas de Tinta: {item?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {query.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : activeGarrafas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma garrafa ativa encontrada para este item.</p>
            ) : (
              <div className="grid gap-4">
                {activeGarrafas.map((g) => (
                  <div key={g.id} className="p-4 border rounded-xl flex items-center justify-between">
                    <div>
                      <p className="font-bold">Serial: {g.serial}</p>
                      <p className="text-sm text-muted-foreground">Localização: {g.location}</p>
                    </div>
                    <div className="text-right flex flex-col items-end gap-2">
                      <div>
                        <Badge variant={g.state === "IN_USE" ? "default" : "secondary"}>
                          {g.state === "IN_USE" ? "Em Uso" : "Nova"}
                        </Badge>
                        <p className="text-sm mt-1">{g.mlRemaining}ml de {g.mlInitial}ml</p>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setDischargeTarget(g);
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
            <DialogTitle>Dar baixa na Garrafa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Você está dando baixa na garrafa <strong>{dischargeTarget?.serial}</strong> (saldo atual: {dischargeTarget?.mlRemaining}ml).
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

export function AddGarrafaDialog({
  item,
  defaultMl,
  onClose,
}: {
  item: StockItem | null;
  defaultMl?: number;
  onClose: () => void;
}) {
  const addGarrafa = useAddGarrafa();
  const [ml, setMl] = useState(defaultMl ? String(defaultMl) : "1000");

  function confirm() {
    const mlValue = Number(ml);
    if (!item || !mlValue || mlValue <= 0) return;
    addGarrafa.mutate(
      { stockItemId: item.id, mlInitial: mlValue },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar garrafa de tinta</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            <strong>{item?.name}</strong> — uma nova garrafa (frasco) independente será criada com serial gerado automaticamente (ex: TIN-0001).
          </p>
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Volume inicial (ml)</Label>
            <Input
              type="number"
              value={ml}
              onChange={(e) => setMl(e.target.value)}
              placeholder="Ex: 1000"
              className="h-11 rounded-xl"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirm} disabled={addGarrafa.isPending || !ml || Number(ml) <= 0}>
            {addGarrafa.isPending ? "Criando…" : "Criar garrafa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}