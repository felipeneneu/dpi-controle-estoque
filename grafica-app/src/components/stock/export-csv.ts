import { StockItem, CATEGORY_LABEL } from "@/lib/api";

export function exportStockToCsv(items: StockItem[], filename = "estoque.csv") {
  const headers = [
    "Código",
    "Produto",
    "Categoria",
    "Lote Ativo (Serial)",
    "Máquina Lote Ativo",
    "Canal Tinta",
    "Em Espera (Disponível)",
    "Total",
    "Unidade",
    "Status",
    "Largura (m)",
  ];

  const statusMap: Record<string, string> = {
    AVAILABLE: "Disponível",
    LOW_STOCK: "Baixo",
    OUT_OF_STOCK: "Zerado",
  };

  const rows = items.map((item) => {
    const activeSerial = item.activeLot?.serial ?? "";
    const activeMachine = item.activeLot?.machineName ?? "";
    const activeChannel = item.activeLot?.channel ?? "";
    const emEspera = item.category === "INK_SUPPLY" 
      ? (item.availableLots ?? 0)
      : (item.availableLots !== undefined && item.availableLots !== null ? item.availableLots : item.currentQuantity);
    const total = item.category === "INK_SUPPLY"
      ? (item.totalLots ?? item.currentQuantity)
      : item.currentQuantity;

    return [
      item.code ?? "",
      item.name,
      CATEGORY_LABEL[item.category] ?? item.category,
      activeSerial,
      activeMachine,
      activeChannel,
      String(emEspera),
      String(total),
      item.unit,
      statusMap[item.status] ?? item.status,
      item.width ? String(item.width) : "",
    ];
  });

  const escapeCsv = (val: string) => {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const csvContent =
    "\uFEFF" +
    [headers.map(escapeCsv).join(","), ...rows.map((r) => r.map(escapeCsv).join(","))].join("\r\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
