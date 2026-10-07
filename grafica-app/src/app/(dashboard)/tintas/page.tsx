"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUser, type StockItem } from "@/lib/api";
import { useStockItems } from "@/lib/queries/stock";
import { useMachines } from "@/lib/queries/machines";
import { useStockSocket } from "@/hooks/use-stock-socket";
import { LoadingState } from "@/components/ui/spinner";
import { StockDataTable } from "@/components/stock/stock-data-table";
import { StockItemDrilldownDialog } from "@/components/stock/stock-item-drilldown-dialog";

export default function TintasPage() {
  const router = useRouter();

  // Socket.IO para sincronização ao vivo
  useStockSocket();

  const itemsQuery = useStockItems("INK_SUPPLY");
  const items = itemsQuery.data ?? [];
  const machines = useMachines().data ?? [];

  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);

  useEffect(() => {
    if (!getUser()) {
      router.replace("/auth");
    }
  }, [router]);

  const loading = itemsQuery.isLoading;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Tintas & Química</h2>
        <p className="text-sm text-muted-foreground">
          Controle de frascos e cartuchos de tinta por unidade, solventes e insumos químicos
        </p>
      </div>

      {loading ? (
        <LoadingState label="Carregando tintas…" />
      ) : (
        <StockDataTable
          items={items}
          machines={machines}
          defaultCategoryFilter="INK_SUPPLY"
          actions={{
            onViewLots: (item) => setSelectedItem(item),
            onAddLot: (item) => setSelectedItem(item),
          }}
        />
      )}

      {/* Modal de Drill-Down Reorganizado em 3 Seções com Quick Switch */}
      <StockItemDrilldownDialog
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </div>
  );
}
