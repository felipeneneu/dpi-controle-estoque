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
import { toast } from "sonner";
import { getUser, type StockItem, type StockCategory, CATEGORY_LABEL } from "@/lib/api";
import { useStockItems, useStockTransaction, useAddRoll } from "@/lib/queries/stock";
import { LoadingState } from "@/components/ui/spinner";
import { RiSearchLine } from "@remixicon/react";
import { BobinasListDialog } from "@/components/bobinas-list-dialog";

const FILTERS: Array<"TODOS" | StockCategory> = ["TODOS", "PAPER_MEDIA", "INK_SUPPLY", "OTHER"];

function statusBadge(status: StockItem["status"]) {
  if (status === "AVAILABLE") return <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white">Disponível</Badge>;
  if (status === "LOW_STOCK") return <Badge className="bg-amber-500 text-white">Baixo</Badge>;
  return <Badge className="bg-brand-pink text-white">Zerado</Badge>;
}

export default function EstoquePage() {
  const router = useRouter();
  const itemsQuery = useStockItems();
  const items = itemsQuery.data ?? [];
  const [filter, setFilter] = useState<"TODOS" | StockCategory>("TODOS");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<StockItem | null>(null);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const transaction = useStockTransaction();

  const [rollTarget, setRollTarget] = useState<StockItem | null>(null);
  const [rollLabel, setRollLabel] = useState("");
  const addRoll = useAddRoll();

  useEffect(() => {
    if (!getUser()) {
      router.replace("/auth");
    }
  }, [router]);

  const visible = filter === "TODOS" ? items : items.filter((i) => i.category === filter);
  const visibleSearch = visible.filter(
    (i) =>
      !search.trim() ||
      i.name.toLowerCase().includes(search.trim().toLowerCase()) ||
      (i.code ? i.code.toLowerCase().includes(search.trim().toLowerCase()) : false),
  );

  async function submitBaixa() {
    if (!selected) return;
    const quantity = Number(qty);
    if (!quantity || quantity <= 0) return;
    try {
      await transaction.mutateAsync({
        itemId: selected.id,
        type: "OUT",
        quantity,
        reason: reason || undefined,
      });
      setSelected(null);
      setQty("");
      setReason("");
    } catch {
      // toast handled later
    }
  }

  const loading = itemsQuery.isLoading;

  function openAddRoll(item: StockItem) {
    setRollTarget(item);
    setRollLabel("");
  }

  async function confirmAddRoll() {
    if (!rollTarget) return;
    const label = rollLabel.trim() || `Rolo ${rollTarget.name.split(",")[0].trim()}`;
    try {
      await addRoll.mutateAsync({ id: rollTarget.id, label });
      toast.success("Rolo criado");
      setRollTarget(null);
    } catch {
      toast.error("Falha ao criar rolo");
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
                {item.code ? (
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Código</span>
                    <span className="text-gray-700 font-semibold">{item.code}</span>
                  </div>
                ) : null}
                {item.label ? (
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Rolo</span>
                    <span className="text-gray-700 font-semibold">{item.label}</span>
                  </div>
                ) : null}
                <div className="mt-auto flex flex-col gap-2">
                  <Button
                    variant="outline"
                    className="w-full h-11 border-primary text-primary hover:bg-brand-pink/10 font-semibold rounded-xl"
                    onClick={() => {
                      setSelected(item);
                    }}
                  >
                    Ver Bobinas
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full h-9 text-muted-foreground font-semibold rounded-xl"
                    onClick={() => openAddRoll(item)}
                  >
                    + Adicionar rolo
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

      <BobinasListDialog item={selected} onClose={() => setSelected(null)} />

      <Dialog open={!!rollTarget} onOpenChange={(open) => !open && setRollTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar rolo</DialogTitle>
            <DialogDescription>
              {rollTarget?.name} — um novo rolo independente será criado com o mesmo material, largura {rollTarget?.width} m.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Identificação do rolo</Label>
              <Input
                value={rollLabel}
                onChange={(e) => setRollLabel(e.target.value)}
                placeholder="Ex: Rolo B"
                className="h-11 rounded-xl"
              />
              <p className="text-xs text-muted-foreground">Deixe vazio para usar o nome padrão.</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRollTarget(null)}>Cancelar</Button>
            <Button onClick={confirmAddRoll} disabled={addRoll.isPending}>
              {addRoll.isPending ? "Criando…" : "Criar rolo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
