"use client";

import { useCallback, useEffect, useState } from "react";
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
import {
  api,
  getUser,
  type StockItem,
  type StockCategory,
  CATEGORY_LABEL,
} from "@/lib/api";
import { LoadingState } from "@/components/ui/spinner";
import { RiSearchLine } from "@remixicon/react";

const FILTERS: Array<"TODOS" | StockCategory> = ["TODOS", "PAPER_MEDIA", "INK_SUPPLY", "OTHER"];

function statusBadge(status: StockItem["status"]) {
  if (status === "AVAILABLE") return <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white">Disponível</Badge>;
  if (status === "LOW_STOCK") return <Badge className="bg-amber-500 text-white">Baixo</Badge>;
  return <Badge className="bg-brand-pink text-white">Zerado</Badge>;
}

export default function EstoquePage() {
  const router = useRouter();
  const user = getUser();
  const [items, setItems] = useState<StockItem[]>([]);
  const [filter, setFilter] = useState<"TODOS" | StockCategory>("TODOS");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StockItem | null>(null);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<StockItem[]>("/api/stock-items")
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!getUser()) {
      router.replace("/auth");
      return;
    }
    load();
  }, [load, router]);

  const visible = filter === "TODOS" ? items : items.filter((i) => i.category === filter);
  const visibleSearch = visible.filter((i) => !search.trim() || i.name.toLowerCase().includes(search.trim().toLowerCase()));

  async function submitBaixa() {
    if (!selected || !user) return;
    const quantity = Number(qty);
    if (!quantity || quantity <= 0) return;
    setBusy(true);
    try {
      await api("/api/stock-transactions", {
        method: "POST",
        body: JSON.stringify({
          itemId: selected.id,
          type: "OUT",
          quantity,
          reason,
          userId: user.id,
        }),
      });
      setSelected(null);
      setQty("");
      setReason("");
      load();
    } catch {
      // toast handled later
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Estoque de Mídias</h2>
        <p className="text-sm text-muted-foreground">Papéis, bobinas de vinil e materiais de impressão</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
            className="rounded-xl h-10"
          >
            {f === "TODOS" ? "Todos" : CATEGORY_LABEL[f]}
          </Button>
        ))}
        <div className="relative flex-1 min-w-[220px]">
          <RiSearchLine className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar mídia…"
            className="h-10 pl-11 rounded-xl bg-card"
          />
        </div>
      </div>

      {loading ? (
        <LoadingState label="Carregando estoque…" />
      ) : (
        <div className="grid grid-cols-3 gap-6">
          {visibleSearch.map((item) => (
            <Card key={item.id} className="rounded-[24px] p-5 shadow-sm hover:shadow-md transition-all border-gray-100 bg-card flex flex-col">
              <CardContent className="p-0 flex flex-col flex-1">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-bold text-gray-900 text-lg leading-tight">{item.name}</h3>
                  {statusBadge(item.status)}
                </div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Quantidade</span>
                  <span className="font-bold text-gray-900">{item.currentQuantity} {item.unit}</span>
                </div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Mínimo</span>
                  <span>{item.minQuantity} {item.unit}</span>
                </div>
                {item.width ? (
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Largura</span>
                    <span className="text-primary font-semibold">{item.width} m</span>
                  </div>
                ) : null}
                <div className="mt-auto">
                  <Button
                    variant="outline"
                    className="w-full h-11 border-primary text-primary hover:bg-brand-pink/10 font-semibold rounded-xl"
                    onClick={() => {
                      setSelected(item);
                      setQty("");
                      setReason("");
                    }}
                    disabled={item.currentQuantity <= 0}
                  >
                    Dar Baixa no Estoque
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {visibleSearch.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-3">Nenhum item encontrado nesta categoria.</p>
          )}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Baixa no Estoque</DialogTitle>
            <DialogDescription>
              {selected?.name} — disponível: {selected?.currentQuantity} {selected?.unit}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Quantidade</Label>
              <Input
                type="number"
                min="0"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder={`Ex: 5 (${selected?.unit})`}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Motivo / Observação</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: Ordem de serviço #123"
                className="h-11 rounded-xl"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Cancelar</Button>
            <Button onClick={submitBaixa} disabled={busy || !qty || Number(qty) <= 0}>
              {busy ? "Registrando…" : "Confirmar Baixa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
