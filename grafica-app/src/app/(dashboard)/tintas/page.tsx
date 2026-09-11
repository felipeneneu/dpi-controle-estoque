"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import { getUser, type StockItem } from "@/lib/api";
import { useStockItems, useStockTransaction } from "@/lib/queries/stock";
import { LoadingState } from "@/components/ui/spinner";

function statusBadge(status: StockItem["status"]) {
  if (status === "AVAILABLE") return <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white">Disponível</Badge>;
  if (status === "LOW_STOCK") return <Badge className="bg-amber-500 text-white">Baixo</Badge>;
  return <Badge className="bg-brand-pink text-white">Zerado</Badge>;
}

export default function TintasPage() {
  const router = useRouter();
  const itemsQuery = useStockItems("INK_SUPPLY");
  const items = itemsQuery.data ?? [];
  const [selected, setSelected] = useState<StockItem | null>(null);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const transaction = useStockTransaction();

  useEffect(() => {
    if (!getUser()) {
      router.replace("/auth");
    }
  }, [router]);

  async function submitRestock() {
    if (!selected) return;
    const quantity = Number(qty);
    if (!quantity || quantity <= 0) return;
    try {
      await transaction.mutateAsync({
        itemId: selected.id,
        type: "IN",
        quantity,
        reason: reason || undefined,
      });
      setSelected(null);
      setQty("");
      setReason("");
    } catch {
    }
  }

  const loading = itemsQuery.isLoading;
  const busy = transaction.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Tintas & Química</h2>
        <p className="text-sm text-muted-foreground">Control de tintas, solventes e insumos químicos</p>
      </div>

      {loading ? (
        <LoadingState label="Carregando tintas…" />
      ) : (
        <div className="grid grid-cols-3 gap-6">
          {items.map((item) => (
            <Card key={item.id} className="rounded-[24px] p-5 shadow-sm hover:shadow-md transition-all border-gray-100 bg-card flex flex-col">
              <CardContent className="p-0 flex flex-col flex-1">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-bold text-gray-900 text-lg leading-tight">{item.name}</h3>
                  {statusBadge(item.status)}
                </div>
                {item.subType && <p className="text-sm text-muted-foreground mb-2">{item.subType}</p>}
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Quantidade</span>
                  <span className="font-bold text-gray-900">{item.currentQuantity} {item.unit}</span>
                </div>
                <div className="flex items-center justify-between text-sm mb-3">
                  <span className="text-muted-foreground">Mínimo</span>
                  <span>{item.minQuantity} {item.unit}</span>
                </div>
                <div className="mt-auto">
                  <Button
                    variant="outline"
                    className="w-full h-11 border-brand-pink text-brand-pink hover:bg-brand-pink/10 font-semibold rounded-xl"
                    onClick={() => {
                      setSelected(item);
                      setQty("");
                      setReason("");
                    }}
                  >
                    Registrar Entrada
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-3">Nenhuma tinta/químico cadastrado.</p>
          )}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Entrada (Restock)</DialogTitle>
            <DialogDescription>
              {selected?.name} — atual: {selected?.currentQuantity} {selected?.unit}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Quantidade adicionada</Label>
              <Input
                type="number"
                min="0"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder={`Ex: 1000 (${selected?.unit})`}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Observação</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: Recebimento de pedido"
                className="h-11 rounded-xl"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Cancelar</Button>
            <Button onClick={submitRestock} disabled={busy || !qty || Number(qty) <= 0}>
              {busy ? "Registrando…" : "Confirmar Entrada"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
