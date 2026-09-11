"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { getUser, type StockItem } from "@/lib/api";
import { useStockItems, useStockTransactions } from "@/lib/queries/stock";
import { useMachines } from "@/lib/queries/machines";
import { useConsumptionReport } from "@/lib/queries/reports";
import { LoadingState } from "@/components/ui/spinner";

const INK_COLORS = [
  { key: "inkCyanMl", label: "Ciano", color: "text-sky-500" },
  { key: "inkLightCyanMl", label: "Light Ciano", color: "text-cyan-600" },
  { key: "inkMagentaMl", label: "Magenta", color: "text-pink-500" },
  { key: "inkLightMagentaMl", label: "Light Magenta", color: "text-fuchsia-500" },
  { key: "inkYellowMl", label: "Amarelo", color: "text-yellow-500" },
  { key: "inkBlackMl", label: "Preto", color: "text-gray-800" },
  { key: "inkOptimizerMl", label: "Optimizer", color: "text-purple-500" },
] as const;

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function RelatoriosPage() {
  const router = useRouter();
  const itemsQuery = useStockItems();
  const transactionsQuery = useStockTransactions();
  const machinesQuery = useMachines();

  const [machineId, setMachineId] = useState("");
  const [month, setMonth] = useState(currentMonth());

  const items = itemsQuery.data ?? [];
  const transactions = transactionsQuery.data ?? [];
  const machines = machinesQuery.data ?? [];
  const loading = itemsQuery.isLoading || transactionsQuery.isLoading;

  const report = useConsumptionReport(machineId, month);

  useEffect(() => {
    if (!getUser()) {
      router.replace("/auth");
    }
  }, [router]);

  const totalIn = transactions.filter((t) => t.type === "IN").reduce((a, t) => a + t.quantity, 0);
  const totalOut = transactions.filter((t) => t.type === "OUT").reduce((a, t) => a + t.quantity, 0);
  const lowStock = items.filter((i) => i.status !== "AVAILABLE");
  const byItem = (() => {
    const m = new Map<string, { item: StockItem; in: number; out: number }>();
    for (const i of items) m.set(i.id, { item: i, in: 0, out: 0 });
    for (const t of transactions) {
      const entry = m.get(t.itemId);
      if (!entry) continue;
      if (t.type === "IN") entry.in += t.quantity;
      if (t.type === "OUT") entry.out += t.quantity;
    }
    return [...m.values()];
  })();

  const r = report.data;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Relatórios</h2>
        <p className="text-sm text-muted-foreground">
          Resumo de estoque, movimentações e consumo mensal por equipamento
        </p>
      </div>

      {/* Consumo Mensal */}
      <Card className="rounded-[24px] p-5 shadow-sm border-gray-100 bg-card">
        <CardContent className="p-0">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h3 className="font-bold text-gray-900">Consumo Mensal por Equipamento</h3>
              <p className="text-xs text-muted-foreground">
                Tinta e m² acumulados pelos jobs registrados no mês
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={machineId}
                onChange={(e) => setMachineId(e.target.value)}
                className="h-10 rounded-xl border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring"
              >
                <option value="">Todas as máquinas</option>
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="h-10 rounded-xl border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring"
              />
            </div>
          </div>

          {report.isLoading ? (
            <LoadingState label="Carregando consumo…" />
          ) : r ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-xs text-muted-foreground">Jobs</p>
                  <p className="text-xl font-bold text-gray-900">{r.totals.jobs}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-xs text-muted-foreground">Área impressa</p>
                  <p className="text-xl font-bold text-gray-900">
                    {r.totals.areaM2.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²
                  </p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-xs text-muted-foreground">Tinta total</p>
                  <p className="text-xl font-bold text-gray-900">
                    {r.totals.inkTotalMl.toLocaleString("pt-BR")} ml
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Tinta por cor (ml)
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {INK_COLORS.map((ink) => (
                    <div
                      key={ink.key}
                      className="rounded-xl border border-gray-100 px-3 py-2 flex items-center justify-between"
                    >
                      <span className={`text-sm font-black ${ink.color}`}>{ink.label}</span>
                      <span className="text-sm tabular-nums text-gray-700">
                        {r.totals[ink.key].toLocaleString("pt-BR")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Área por tipo de mídia (m²)
                </p>
                {r.byMedia.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum job registrado para este período.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b border-gray-100">
                        <th className="py-2">Mídia</th>
                        <th className="py-2 text-right">Jobs</th>
                        <th className="py-2 text-right">m²</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.byMedia.map((m) => (
                        <tr key={m.media} className="border-b border-gray-50">
                          <td className="py-2 font-medium text-gray-800">{m.media}</td>
                          <td className="py-2 text-right text-muted-foreground">{m.jobs}</td>
                          <td className="py-2 text-right tabular-nums">
                            {m.m2.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

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
                  {byItem.map(({ item, in: inn, out }) => (
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
