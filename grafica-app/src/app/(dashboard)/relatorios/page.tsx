"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { api, getUser, type StockItem, type StockTransaction } from "@/lib/api";
import { LoadingState } from "@/components/ui/spinner";

export default function RelatoriosPage() {
  const router = useRouter();
  const [items, setItems] = useState<StockItem[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    Promise.all([api<StockItem[]>("/api/stock-items"), api<StockTransaction[]>("/api/stock-transactions")])
      .then(([it, tx]) => {
        setItems(it);
        setTransactions(tx);
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

  const totalIn = transactions.filter((t) => t.type === "IN").reduce((a, t) => a + t.quantity, 0);
  const totalOut = transactions.filter((t) => t.type === "OUT").reduce((a, t) => a + t.quantity, 0);
  const lowStock = items.filter((i) => i.status !== "AVAILABLE");
  const byItem = new Map<string, { item: StockItem; in: number; out: number }>();
  for (const i of items) byItem.set(i.id, { item: i, in: 0, out: 0 });
  for (const t of transactions) {
    const entry = byItem.get(t.itemId);
    if (!entry) continue;
    if (t.type === "IN") entry.in += t.quantity;
    if (t.type === "OUT") entry.out += t.quantity;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Relatórios</h2>
        <p className="text-sm text-muted-foreground">Resumo de estoque e movimentações</p>
      </div>

      {loading ? (
        <LoadingState label="Carregando relatórios…" />
      ) : (
        <>
          <div className="grid grid-cols-4 gap-6">
            {[
              { label: "Entradas (IN)", value: totalIn, color: "text-emerald-600" },
              { label: "Baixas (OUT)", value: totalOut, color: "text-brand-pink" },
              { label: "Insumos cadastrados", value: items.length, color: "text-primary" },
              { label: "Itens com alerta", value: lowStock.length, color: "text-amber-500" },
            ].map((s) => (
              <Card key={s.label} className="rounded-[24px] p-5 shadow-sm border-gray-100 bg-card">
                <CardContent className="p-0">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="rounded-[24px] p-5 shadow-sm border-gray-100 bg-card">
            <CardContent className="p-0">
              <h3 className="font-bold text-gray-900 mb-4">Movimentação por Insumo</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-gray-100">
                    <th className="py-2">Insumo</th>
                    <th className="py-2">Atual</th>
                    <th className="py-2">Entradas</th>
                    <th className="py-2">Baixas</th>
                    <th className="py-2 text-right">Unidade</th>
                  </tr>
                </thead>
                <tbody>
                  {[...byItem.values()].map(({ item, in: inn, out }) => (
                    <tr key={item.id} className="border-b border-gray-50">
                      <td className="py-2 font-medium text-gray-800">{item.name}</td>
                      <td className="py-2">{item.currentQuantity}</td>
                      <td className="py-2 text-emerald-600">{inn}</td>
                      <td className="py-2 text-brand-pink">{out}</td>
                      <td className="py-2 text-right text-muted-foreground">{item.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
