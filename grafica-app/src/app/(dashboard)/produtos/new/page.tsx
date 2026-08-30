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
import { api, getUser, type StockCategory } from "@/lib/api";

export default function NovoProdutoPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<StockCategory>("PAPER_MEDIA");
  const [unit, setUnit] = useState("m");
  const [currentQuantity, setCurrentQuantity] = useState("");
  const [minQuantity, setMinQuantity] = useState("");
  const [width, setWidth] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!getUser()) {
      router.replace("/auth");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/api/stock-items", {
        method: "POST",
        body: JSON.stringify({
          name,
          category,
          unit,
          width: width ? Number(width) : undefined,
          currentQuantity: Number(currentQuantity) || 0,
          minQuantity: Number(minQuantity) || 0,
        }),
      });
      router.push("/produtos");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

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
          <p className="text-sm text-muted-foreground">Cadastre um novo material ou máquina no sistema</p>
        </div>
      </div>

      <Card className="rounded-[32px] p-8 shadow-sm border-gray-100">
        <CardContent className="p-0">
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs font-bold text-muted-foreground tracking-wider uppercase">NOME DO MATERIAL</Label>
              <Input
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Bobina Vinil Solvente 1.37m"
                className="h-12 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category" className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Categoria</Label>
                <select
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as StockCategory)}
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
                  <option value="m">Metro (m)</option>
                  <option value="fls">Folhas (fls)</option>
                  <option value="ml">Mililitro (ml)</option>
                  <option value="L">Litro (L)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="qty" className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Qtd. inicial</Label>
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

            <div className="space-y-2">
              <Label htmlFor="width" className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Largura do rolo (m) — opcional</Label>
              <Input
                id="width"
                type="number"
                min="0"
                step="0.01"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                placeholder="Ex: 1.06 / 0.75 / 1.57"
                className="h-12 rounded-xl"
              />
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
            </div>

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
