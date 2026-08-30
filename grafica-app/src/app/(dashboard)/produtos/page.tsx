"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner, LoadingState } from "@/components/ui/spinner";
import { RiAddLine, RiSearchLine, RiPencilLine } from "@remixicon/react";
import MachineSelectForItem from "@/components/machine-select-for-item";
import EditStockItemDialog from "@/components/edit-stock-item-dialog";
import { api, getUser, type StockItem, type Machine, CATEGORY_LABEL } from "@/lib/api";

function statusBadge(status: StockItem["status"]) {
  if (status === "AVAILABLE") return <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white">Disponível</Badge>;
  if (status === "LOW_STOCK") return <Badge className="bg-amber-500 text-white">Baixo</Badge>;
  return <Badge className="bg-brand-pink text-white">Zerado</Badge>;
}

function ProdutosContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<StockItem[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editItem, setEditItem] = useState<StockItem | null>(null);

  const cat = searchParams.get("cat") || "todos";

  const load = useCallback(() => {
    Promise.all([api<StockItem[]>("/api/stock-items"), api<Machine[]>("/api/machines")])
      .then(([i, m]) => {
        setItems(i);
        setMachines(m);
      })
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

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((i) => {
      if (cat === "bobinas" && !/bobina|vinil/i.test(`${i.name} ${i.subType ?? ""}`)) return false;
      if (cat === "fotograficos" && !/fotogr|papel/i.test(`${i.name} ${i.subType ?? ""}`)) return false;
      if (term && !i.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [items, search, cat]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Seus Insumos e Máquinas</h2>
          <p className="text-sm text-muted-foreground">Gerencie o estoque e status dos materiais da gráfica</p>
        </div>
        <Link href="/produtos/new">
          <Button className="h-11 rounded-xl font-semibold">
            <RiAddLine className="w-5 h-5" />
            Novo Insumo
          </Button>
        </Link>
      </div>

      <div className="relative max-w-sm">
        <RiSearchLine className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar insumo…"
          className="h-11 pl-11 rounded-xl bg-card"
        />
      </div>

      {loading ? (
        <LoadingState label="Carregando insumos…" />
      ) : (
        <div className="grid grid-cols-3 gap-6">
          {visible.map((item) => (
            <Card key={item.id} className="rounded-[24px] p-5 shadow-sm hover:shadow-md transition-all border-gray-100 bg-card flex flex-col">
              <CardContent className="p-0 flex flex-col flex-1">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-bold text-gray-900 text-lg leading-tight">{item.name}</h3>
                  {statusBadge(item.status)}
                </div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Categoria</span>
                  <span className="text-primary font-semibold">{CATEGORY_LABEL[item.category]}</span>
                </div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Quantidade</span>
                  <span className="font-bold text-gray-900">{item.currentQuantity} {item.unit}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Mínimo</span>
                  <span>{item.minQuantity} {item.unit}</span>
                </div>
                {item.width ? (
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-muted-foreground">Largura</span>
                    <span className="text-primary font-semibold">{item.width} m</span>
                  </div>
                ) : null}
                <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    {item.machineIds?.length
                      ? `Usado em ${item.machineIds.length} máquina${item.machineIds.length === 1 ? "" : "s"}`
                      : "Não requer máquina"}
                  </p>
                  <MachineSelectForItem item={item} machines={machines} onSaved={load} />
                  <Button
                    variant="ghost"
                    className="w-full h-9 rounded-xl font-semibold text-sm text-primary hover:bg-primary/10"
                    onClick={() => setEditItem(item)}
                  >
                    <RiPencilLine className="w-4 h-4" />
                    Editar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {visible.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-3">
              {search ? "Nenhum insumo encontrado para a busca." : "Nenhum insumo nesta categoria."}
            </p>
          )}
        </div>
      )}

      <EditStockItemDialog item={editItem} onClose={() => setEditItem(null)} onSaved={load} />
    </div>
  );
}

export default function ProdutosPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center">
          <Spinner className="size-8 text-primary" />
        </div>
      }
    >
      <ProdutosContent />
    </Suspense>
  );
}