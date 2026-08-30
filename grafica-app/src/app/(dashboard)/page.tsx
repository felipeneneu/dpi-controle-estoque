"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  api,
  getUser,
  type StockItem,
  type StockTransaction,
} from "@/lib/api";
import { useRouter } from "next/navigation";
import { RiBox3Line, RiAlertLine, RiSwapLine, RiPrinterLine } from "@remixicon/react";
import { LoadingState } from "@/components/ui/spinner";

export default function DashboardPage() {
  const router = useRouter();
  const user = getUser();
  const [items, setItems] = useState<StockItem[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getUser()) {
      router.replace("/auth");
      return;
    }
    Promise.all([api<StockItem[]>("/api/stock-items"), api<StockTransaction[]>("/api/stock-transactions")])
      .then(([it, tx]) => {
        setItems(it);
        setTransactions(tx);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  const totalItems = items.length;
  const lowStock = items.filter(
    (i) => i.status === "LOW_STOCK" || i.status === "OUT_OF_STOCK"
  );
  const totalValue = items.reduce((acc, i) => acc + i.currentQuantity, 0);
  const recentTx = [...transactions].slice(-6).reverse();

  const stats = [
    { label: "Insumos cadastrados", value: totalItems, icon: RiBox3Line, color: "text-primary bg-primary/10" },
    { label: "Estoque baixo / zerado", value: lowStock.length, icon: RiAlertLine, color: "text-brand-pink bg-brand-pink/10" },
    { label: "Unidades em estoque", value: totalValue, icon: RiSwapLine, color: "text-primary bg-primary/10" },
    { label: "Movimentações", value: transactions.length, icon: RiPrinterLine, color: "text-brand-pink bg-brand-pink/10" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Visão Geral</h2>
        <p className="text-sm text-muted-foreground">
          Bem-vindo, {user?.name || "Operador"} · {user?.role}
        </p>
      </div>

      {loading ? (
        <LoadingState label="Carregando visão geral…" />
      ) : (
        <>
          <div className="grid grid-cols-4 gap-6">
            {stats.map((s) => {
              const Icon = s.icon;
              return (
                <Card key={s.label} className="rounded-[24px] p-5 shadow-sm border-gray-100 bg-card">
                  <CardContent className="p-0 flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${s.color}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900 leading-none">{s.value}</p>
                      <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-6">
            <Card className="rounded-[24px] p-5 shadow-sm border-gray-100 bg-card">
              <CardContent className="p-0">
                <h3 className="font-bold text-gray-900 mb-4">Alertas de Estoque</h3>
                {lowStock.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum alerta no momento.</p>
                ) : (
                  <ul className="space-y-3">
                    {lowStock.map((i) => (
                      <li key={i.id} className="flex items-center justify-between text-sm">
                        <span className="font-medium text-gray-800">{i.name}</span>
                        <span className={`font-bold ${i.status === "OUT_OF_STOCK" ? "text-brand-pink" : "text-amber-500"}`}>
                          {i.currentQuantity} {i.unit}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-[24px] p-5 shadow-sm border-gray-100 bg-card">
              <CardContent className="p-0">
                <h3 className="font-bold text-gray-900 mb-4">Últimas Movimentações</h3>
                {recentTx.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma movimentação recente.</p>
                ) : (
                  <ul className="space-y-3">
                    {recentTx.map((t) => {
                      const item = items.find((i) => i.id === t.itemId);
                      const label = t.type === "IN" ? "Entrada" : t.type === "OUT" ? "Baixa" : "Ajuste";
                      return (
                        <li key={t.id} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{label} · {item?.name || "item"}</span>
                          <span className={`font-bold ${t.type === "IN" ? "text-emerald-600" : t.type === "OUT" ? "text-brand-pink" : "text-amber-500"}`}>
                            {t.type === "IN" ? "+" : "-"}{t.quantity}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
