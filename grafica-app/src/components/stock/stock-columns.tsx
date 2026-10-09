"use client";

import { legacyCreateColumnHelper, useLegacyTable } from "@tanstack/react-table/legacy";
import { StockItem, CATEGORY_LABEL } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  RiArrowUpDownLine,
  RiArrowUpLine,
  RiArrowDownLine,
  RiEyeLine,
  RiAddLine,
  RiPrinterLine,
  RiExchangeLine,
  RiDeleteBinLine,
  RiPencilLine,
} from "@remixicon/react";

export interface StockTableActions {
  onViewLots: (item: StockItem) => void;
  onQuickTransaction?: (item: StockItem, type: "IN" | "OUT") => void;
  onAddLot?: (item: StockItem) => void;
  onEditItem?: (item: StockItem) => void;
  onDeleteItem?: (item: StockItem) => void;
  onConsumeInk?: (item: StockItem) => void;
  userRole?: string;
}

export function statusBadge(status: StockItem["status"]) {
  if (status === "AVAILABLE") {
    return <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white font-medium">Disponível</Badge>;
  }
  if (status === "LOW_STOCK") {
    return <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-medium">Baixo</Badge>;
  }
  return <Badge className="bg-red-500 hover:bg-red-600 text-white font-medium">Zerado</Badge>;
}

export function breakdownBadge(item: StockItem) {
  const individual = item.individualItems ?? [];
  const inUse = individual.filter(i => i.state === 'IN_USE').length;
  const available = individual.filter(i => i.state === 'NEW').length;
  const used = individual.filter(i => i.state === 'USED' || i.state === 'SCRAPPED' || i.state === 'FINISHED').length;

  const parts: React.ReactNode[] = [];
  if (inUse > 0) {
    parts.push(
      <span key="inuse" className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 text-xs font-medium">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        {inUse} em uso
      </span>
    );
  }
  if (available > 0) {
    parts.push(
      <span key="avail" className="inline-flex items-center gap-1 bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-2 py-0.5 text-xs font-medium">
        {available} disponível{available > 1 ? 's' : ''}
      </span>
    );
  }
  if (used > 0) {
    parts.push(
      <span key="used" className="inline-flex items-center gap-1 bg-gray-50 text-gray-700 border border-gray-200 rounded-full px-2 py-0.5 text-xs font-medium">
        {used} usado{used > 1 ? 's' : ''}
      </span>
    );
  }
  if (parts.length === 0) {
    return <span className="text-xs text-muted-foreground italic">—</span>;
  }
  return <div className="flex flex-wrap gap-1.5">{parts}</div>;
}

// Ordem de criticidade para status: OUT_OF_STOCK (1º), LOW_STOCK (2º), AVAILABLE (3º)
const STATUS_PRIORITY: Record<string, number> = {
  OUT_OF_STOCK: 0,
  LOW_STOCK: 1,
  AVAILABLE: 2,
};

const columnHelper = legacyCreateColumnHelper<StockItem>();
export type StockColumns = Parameters<typeof useLegacyTable<StockItem>>[0]["columns"];

export function getStockColumns(actions: StockTableActions): StockColumns {
  return [
    columnHelper.display({
      id: "select",
      header: ({ table }) => (
        <div className="flex items-center justify-center pl-2">
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Selecionar todos os itens da página"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex items-center justify-center pl-2">
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Selecionar linha"
          />
        </div>
      ),
      size: 40,
    }),

    columnHelper.accessor("name", {
      header: ({ column }) => {
        const sorted = column.getIsSorted();
        return (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-8 font-semibold text-gray-700 hover:text-gray-900"
            onClick={() => column.toggleSorting(sorted === "asc")}
          >
            Produto
            {sorted === "asc" ? (
              <RiArrowUpLine className="ml-1 size-3.5" />
            ) : sorted === "desc" ? (
              <RiArrowDownLine className="ml-1 size-3.5" />
            ) : (
              <RiArrowUpDownLine className="ml-1 size-3.5 opacity-40" />
            )}
          </Button>
        );
      },
      cell: (info) => {
        const item = info.row.original;
        return (
          <div className="space-y-0.5 max-w-[280px]">
            <div className="font-semibold text-gray-900 leading-snug line-clamp-2">
              {item.name}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              {item.code ? (
                <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 font-medium">
                  {item.code}
                </span>
              ) : null}
              {item.width ? (
                <span className="bg-sky-50 text-sky-700 border border-sky-100 px-1.5 py-0.5 rounded font-medium">
                  Largura: {item.width}m
                </span>
              ) : null}
              {item.subType ? (
                <span className="text-gray-500">{item.subType}</span>
              ) : null}
            </div>
          </div>
        );
      },
    }),

    columnHelper.accessor("category", {
      header: "Categoria",
      cell: (info) => {
        const cat = info.getValue();
        const color =
          cat === "PAPER_MEDIA"
            ? "border-sky-200 bg-sky-50 text-sky-800"
            : cat === "INK_SUPPLY"
            ? "border-purple-200 bg-purple-50 text-purple-800"
            : "border-gray-200 bg-gray-50 text-gray-800";

        return (
          <span
            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${color}`}
          >
            {CATEGORY_LABEL[cat] ?? cat}
          </span>
        );
      },
    }),

    columnHelper.accessor((row) => row.activeLot?.serial ?? "", {
      id: "activeLot",
      header: "Lote Ativo",
      cell: (info) => {
        const item = info.row.original;
        const active = item.activeLot;
        const isRoll = item.category === "PAPER_MEDIA" && item.unit === "m";
        const isInk = item.category === "INK_SUPPLY";

        if (!active) {
          if (!isRoll && !isInk) {
            return (
              <span className="text-xs text-muted-foreground/60 italic font-normal">
                — n/a (folhas) —
              </span>
            );
          }
          if (isInk) {
            return (
              <span className="text-xs text-muted-foreground italic font-normal">
                — nenhum em uso —
              </span>
            );
          }
          return (
            <span className="text-xs text-muted-foreground italic font-normal">
              — nenhum carregado —
            </span>
          );
        }

        return (
          <div className="flex flex-col gap-1 items-start">
            <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg px-2 py-1 text-xs font-semibold shadow-xs">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-mono">{active.serial}</span>
              {active.channel ? (
                <span className="bg-emerald-200/60 text-emerald-900 rounded px-1 py-0.2 text-[10px] font-bold uppercase tracking-wider">
                  {active.channel}
                </span>
              ) : null}
            </div>
            {active.machineName ? (
              <span className="text-[11px] text-gray-500 flex items-center gap-1 font-medium">
                <RiPrinterLine className="size-3 text-gray-400" />
                {active.machineName}
              </span>
            ) : null}
          </div>
        );
      },
      sortFn: (rowA: { original: StockItem }, rowB: { original: StockItem }) => {
        const aHas = !!rowA.original.activeLot;
        const bHas = !!rowB.original.activeLot;
        if (aHas && !bHas) return -1;
        if (!aHas && bHas) return 1;
        return (rowA.original.activeLot?.serial ?? "").localeCompare(
          rowB.original.activeLot?.serial ?? ""
        );
      },
    }),

    columnHelper.accessor(
      (row) => {
        if (row.category === "INK_SUPPLY") {
          return row.availableLots ?? row.currentQuantity;
        }
        if (row.category === "PAPER_MEDIA" && row.unit === "m") {
          return row.availableLots ?? 0;
        }
        return row.currentQuantity;
      },
      {
        id: "waiting",
        header: ({ column }) => {
          const sorted = column.getIsSorted();
          return (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 h-8 font-semibold text-gray-700 hover:text-gray-900"
              onClick={() => column.toggleSorting(sorted === "asc")}
            >
              Em Espera
              {sorted === "asc" ? (
                <RiArrowUpLine className="ml-1 size-3.5" />
              ) : sorted === "desc" ? (
                <RiArrowDownLine className="ml-1 size-3.5" />
              ) : (
                <RiArrowUpDownLine className="ml-1 size-3.5 opacity-40" />
              )}
            </Button>
          );
        },
        cell: (info) => {
          const item = info.row.original;
          const isRoll = item.category === "PAPER_MEDIA" && item.unit === "m";
          const isSheet = item.category === "PAPER_MEDIA" && item.unit !== "m";

          if (isRoll) {
            const avail = item.availableLots ?? 0;
            return (
              <div className="text-sm">
                <span className="font-bold text-gray-900">{avail}</span>
                <span className="text-xs text-muted-foreground ml-1">
                  {avail === 1 ? "bobina livre" : "bobinas livres"}
                </span>
              </div>
            );
          }

          if (isSheet) {
            return (
              <div className="text-sm">
                <span className="font-bold text-gray-900">{item.currentQuantity}</span>
                <span className="text-xs text-muted-foreground ml-1">{item.unit}</span>
              </div>
            );
          }

          if (item.category === "INK_SUPPLY") {
            const hasLots = item.origemSaldo === "tinta_lotes" || (item.availableLots !== null && item.availableLots !== undefined);
            if (hasLots) {
              const avail = item.availableLots ?? 0;
              return (
                <div className="text-sm">
                  <span className="font-bold text-gray-900">{avail}</span>
                  <span className="text-xs text-muted-foreground ml-1">
                    {avail === 1 ? "unidade NEW" : "unidades NEW"}
                  </span>
                </div>
              );
            }
            return (
              <div className="text-sm">
                <span className="font-bold text-gray-900">{item.currentQuantity}</span>
                <span className="text-xs text-muted-foreground ml-1">{item.unit}</span>
              </div>
            );
          }

          return (
            <div className="text-sm">
              <span className="font-bold text-gray-900">{item.currentQuantity}</span>
              <span className="text-xs text-muted-foreground ml-1">{item.unit}</span>
            </div>
          );
        },
      }
    ),

    columnHelper.accessor(
      (row) => {
        if (row.category === "INK_SUPPLY" && row.totalLots !== null && row.totalLots !== undefined) {
          return row.totalLots;
        }
        return row.currentQuantity;
      },
      {
        id: "total",
        header: ({ column }) => {
          const sorted = column.getIsSorted();
          return (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 h-8 font-semibold text-gray-700 hover:text-gray-900"
              onClick={() => column.toggleSorting(sorted === "asc")}
            >
              Total
              {sorted === "asc" ? (
                <RiArrowUpLine className="ml-1 size-3.5" />
              ) : sorted === "desc" ? (
                <RiArrowDownLine className="ml-1 size-3.5" />
              ) : (
                <RiArrowUpDownLine className="ml-1 size-3.5 opacity-40" />
              )}
            </Button>
          );
        },
        cell: (info) => {
          const item = info.row.original;
          const isInkWithLots = item.category === "INK_SUPPLY" && (item.totalLots !== null && item.totalLots !== undefined);
          const total = isInkWithLots ? item.totalLots : item.currentQuantity;
          const unitLabel = isInkWithLots
            ? (total === 1 ? "frasco" : "frascos")
            : item.unit;

          return (
            <div className="text-sm">
              <span className="font-bold text-gray-900">{total}</span>
              <span className="text-xs text-muted-foreground ml-1">
                {unitLabel}
              </span>
              <div className="text-[11px] text-muted-foreground">
                Mín: {item.minQuantity} {item.unit}
              </div>
            </div>
          );
        },
      }
    ),

    columnHelper.accessor("status", {
      header: ({ column }) => {
        const sorted = column.getIsSorted();
        return (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-8 font-semibold text-gray-700 hover:text-gray-900"
            onClick={() => column.toggleSorting(sorted === "asc")}
          >
            Status
            {sorted === "asc" ? (
              <RiArrowUpLine className="ml-1 size-3.5" />
            ) : sorted === "desc" ? (
              <RiArrowDownLine className="ml-1 size-3.5" />
            ) : (
              <RiArrowUpDownLine className="ml-1 size-3.5 opacity-40" />
            )}
          </Button>
        );
      },
      cell: (info) => statusBadge(info.getValue()),
      sortFn: (rowA: { original: StockItem }, rowB: { original: StockItem }) => {
        const pA = STATUS_PRIORITY[rowA.original.status] ?? 99;
        const pB = STATUS_PRIORITY[rowB.original.status] ?? 99;
        return pA - pB;
      },
    }),

    columnHelper.accessor(
      (row) => row,
      {
        id: "breakdown",
        header: "Unidades",
        cell: (info) => breakdownBadge(info.getValue()),
        size: 160,
      }
    ),

    columnHelper.display({
      id: "actions",
      header: () => <div className="text-right pr-2">Ações</div>,
      cell: ({ row }) => {
        const item = row.original;
        const isInk = item.category === "INK_SUPPLY";
        const isMedia = item.category === "PAPER_MEDIA";
        // Bobina = mídia em rolo (unidade "m"). Folha (fls) e demais unidades
        // são itens unitários e nunca passam pelo fluxo de bobina.
        const isRoll = isMedia && item.unit === "m";
        const isSheet = isMedia && item.unit !== "m";
        const canDelete = actions.userRole === "DEV_MASTER" || actions.userRole === "ADMIN";

        return (
          <div className="flex items-center justify-end gap-1.5 pr-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-lg border-gray-200 text-xs font-semibold hover:bg-gray-50 shadow-xs"
              onClick={() => actions.onViewLots(item)}
            >
              <RiEyeLine className="size-3.5 text-gray-600" />
              {isInk ? "Ver Frascos" : isRoll ? "Ver Bobinas" : isSheet ? "Ver Folhas" : "Ver Lotes"}
            </Button>

            {actions.onAddLot && (isInk || isMedia) ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 rounded-lg text-xs font-semibold text-muted-foreground hover:text-gray-900"
                onClick={() => actions.onAddLot?.(item)}
                title={isInk ? "Adicionar frasco de tinta" : isRoll ? "Adicionar bobina" : "Adicionar folhas (entrada de estoque)"}
              >
                <RiAddLine className="size-4" />
              </Button>
            ) : null}

            {actions.onEditItem ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 rounded-lg text-xs font-semibold text-muted-foreground hover:text-gray-900"
                onClick={() => actions.onEditItem?.(item)}
                title="Editar item (nome, quantidade, mínimo)"
              >
                <RiPencilLine className="size-4" />
              </Button>
            ) : null}

            {actions.onConsumeInk && isInk ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 rounded-lg text-xs font-semibold text-purple-600 hover:text-purple-900"
                onClick={() => actions.onConsumeInk?.(item)}
                title="Dar baixa manual em tinta/toner"
              >
                <RiExchangeLine className="size-4" />
              </Button>
            ) : null}

            {actions.onQuickTransaction && !isInk && !isMedia ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 rounded-lg text-xs font-semibold text-muted-foreground hover:text-gray-900"
                onClick={() => actions.onQuickTransaction?.(item, "IN")}
                title="Registrar movimentação manual"
              >
                <RiExchangeLine className="size-4" />
              </Button>
            ) : null}

            {canDelete && actions.onDeleteItem ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 rounded-lg text-xs font-semibold text-red-600 hover:text-red-900"
                onClick={() => actions.onDeleteItem?.(item)}
                title="Excluir material (apenas DEV_MASTER/ADMIN)"
              >
                <RiDeleteBinLine className="size-4" />
              </Button>
            ) : null}
          </div>
        );
      },
      size: 180,
    }),
  ] as unknown as StockColumns;
}
