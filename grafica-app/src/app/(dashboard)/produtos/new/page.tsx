"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { RiArrowLeftLine } from "@remixicon/react";
import { Spinner } from "@/components/ui/spinner";
import { type StockCategory } from "@/lib/api";
import { useCreateStockItem } from "@/lib/queries/stock";
import { useMachines } from "@/lib/queries/machines";
import { getUser } from "@/lib/api";

export default function NovoProdutoPage() {
  const router = useRouter();
  const createStockItem = useCreateStockItem();
  const machinesQuery = useMachines();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<StockCategory>("PAPER_MEDIA");
  const [unit, setUnit] = useState("m");
  const [currentQuantity, setCurrentQuantity] = useState("");
  const [minQuantity, setMinQuantity] = useState("");
  const [width, setWidth] = useState("");
  const [selectedMachines, setSelectedMachines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleCategoryChange = (cat: StockCategory) => {
    setCategory(cat);
    if (cat === "INK_SUPPLY") {
      setUnit("L");
    } else if (cat === "PAPER_MEDIA") {
      setUnit("m");
    }
  };

  const toggleMachine = (id: string) => {
    setSelectedMachines((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!getUser()) {
      router.replace("/auth");
      return;
    }
    setError(null);
    try {
      await createStockItem.mutateAsync({
        name,
        category,
        unit,
        width: (unit === "fls" || category === "INK_SUPPLY") ? undefined : (width ? Number(width) : undefined),
        currentQuantity: Number(currentQuantity) || 0,
        minQuantity: Number(minQuantity) || 0,
        machineIds: selectedMachines,
      });
      router.push("/produtos");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  const busy = createStockItem.isPending;
  const showWidth = unit !== "fls" && category !== "INK_SUPPLY";

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/produtos">
          <Button variant="outline" size="icon" className="rounded-xl">
            <RiArrowLeftLine className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Novo Insumo</h2>
          <p className="text-sm text-muted-foreground">Cadastre um novo material ou tinta no sistema</p>
        </div>
      </div>

      <Card className="rounded-[32px] p-8 shadow-sm border-gray-100">
        <CardContent className="p-0">
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs font-bold text-muted-foreground tracking-wider uppercase">NOME DO INSUMO</Label>
              <Input
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={category === "INK_SUPPLY" ? "Ex: Tinta Cyan 1L" : "Ex: Bobina Vinil Solvente 1.37m"}
                className="h-12 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category" className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Categoria</Label>
                <select
                  id="category"
                  value={category}
                  onChange={(e) => handleCategoryChange(e.target.value as StockCategory)}
                  className="h-12 w-full rounded-xl border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="PAPER_MEDIA">Mídia / Papel</option>
                  <option value="INK_SUPPLY">Tinta / Química</option>
                  <option value="OTHER">Outro</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit" className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Unidade</Label>
                <select
                  id="unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="h-12 w-full rounded-xl border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {category === "INK_SUPPLY" ? (
                    <>
                      <option value="ml">Mililitro (ml)</option>
                      <option value="L">Litro (L)</option>
                    </>
                  ) : (
                    <>
                      <option value="m">Metro (m)</option>
                      <option value="fls">Folhas (fls)</option>
                      <option value="ml">Mililitro (ml)</option>
                      <option value="L">Litro (L)</option>
                    </>
                  )}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="qty" className="text-xs font-bold text-muted-foreground tracking-wider uppercase">
                  {category === "PAPER_MEDIA" && unit === "m" ? "Qtd. inicial (1º rolo)" : category === "INK_SUPPLY" ? "Volume Inicial" : "Qtd. inicial"}
                </Label>
                <Input
                  id="qty"
                  type="number"
                  min="0"
                  value={currentQuantity}
                  onChange={(e) => setCurrentQuantity(e.target.value)}
                  placeholder="Ex: 50"
                  className="h-12 rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="min" className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Estoque mínimo</Label>
                <Input
                  id="min"
                  type="number"
                  min="0"
                  value={minQuantity}
                  onChange={(e) => setMinQuantity(e.target.value)}
                  placeholder="Ex: 10"
                  className="h-12 rounded-xl"
                />
              </div>
              {showWidth && (
                <div className="space-y-2">
                  <Label htmlFor="width" className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Largura do rolo (m)</Label>
                  <Input
                    id="width"
                    type="number"
                    min="0"
                    step="0.01"
                    value={width}
                    onChange={(e) => setWidth(e.target.value)}
                    placeholder="Ex: 1.06"
                    className="h-12 rounded-xl"
                  />
                </div>
              )}
            </div>

            {machinesQuery.data && machinesQuery.data.length > 0 && (
              <div className="space-y-3 pt-2">
                <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Vincular às Máquinas (opcional)</Label>
                <div className="flex flex-wrap gap-2">
                  {machinesQuery.data.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleMachine(m.id)}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
                        selectedMachines.includes(m.id)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-muted-foreground border-input hover:border-primary/50"
                      }`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-sm text-brand-pink font-semibold">{error}</p>}

            <div className="flex gap-4 pt-4 border-t border-gray-100">
              <Button type="button" variant="outline" className="w-1/2 h-12 rounded-xl text-base font-semibold" onClick={() => router.push("/produtos")}>
                Cancelar
              </Button>
              <Button type="submit" className="w-1/2 h-12 rounded-xl text-base font-semibold shadow-md shadow-brand-pink/20" disabled={busy}>
                {busy ? <Spinner className="size-5" /> : null}
                {busy ? "Salvando…" : "Salvar Insumo"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
