"use client";

import { StockCategory, StockStatus, CATEGORY_LABEL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  RiSearchLine,
  RiFileExcel2Line,
  RiPrinterLine,
  RiCloseLine,
  RiLayoutGridLine,
  RiListCheck2,
  RiFilterLine,
} from "@remixicon/react";

export interface StockToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  categoryFilter: "TODOS" | StockCategory;
  onCategoryFilterChange: (val: "TODOS" | StockCategory) => void;
  statusFilter: "TODOS" | StockStatus;
  onStatusFilterChange: (val: "TODOS" | StockStatus) => void;
  machineFilter: string;
  onMachineFilterChange: (val: string) => void;
  machines: { id: string; name: string }[];
  groupByCategory: boolean;
  onGroupByCategoryChange: (val: boolean) => void;
  selectedCount: number;
  totalFilteredCount: number;
  onExportAll: () => void;
  onExportSelected: () => void;
  onClearSelection: () => void;
  onPrintLabels?: () => void;
}

const CATEGORIES: Array<"TODOS" | StockCategory> = [
  "TODOS",
  "PAPER_MEDIA",
  "INK_SUPPLY",
  "OTHER",
];

const STATUSES: Array<{ value: "TODOS" | StockStatus; label: string }> = [
  { value: "TODOS", label: "Todos os Status" },
  { value: "AVAILABLE", label: "Disponível" },
  { value: "LOW_STOCK", label: "Baixo" },
  { value: "OUT_OF_STOCK", label: "Zerado" },
];

export function StockToolbar({
  search,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  statusFilter,
  onStatusFilterChange,
  machineFilter,
  onMachineFilterChange,
  machines,
  groupByCategory,
  onGroupByCategoryChange,
  selectedCount,
  totalFilteredCount,
  onExportAll,
  onExportSelected,
  onClearSelection,
  onPrintLabels,
}: StockToolbarProps) {
  const hasActiveFilters =
    search.trim() !== "" ||
    categoryFilter !== "TODOS" ||
    statusFilter !== "TODOS" ||
    machineFilter !== "TODAS";

  function clearAllFilters() {
    onSearchChange("");
    onCategoryFilterChange("TODOS");
    onStatusFilterChange("TODOS");
    onMachineFilterChange("TODAS");
  }

  return (
    <div className="space-y-3.5">
      {/* Linha 1: Campo de busca + Seleção em lote ou botões de topo */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <RiSearchLine className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar por nome, código ou serial do lote..."
            className="h-10 pl-10 pr-9 rounded-xl bg-card border-gray-200 shadow-2xs"
          />
          {search && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <RiCloseLine className="size-4" />
            </button>
          )}
        </div>

        {/* Botões de Ação e Exportação */}
        <div className="flex items-center gap-2 flex-wrap">
          {selectedCount > 0 ? (
            <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 px-3 py-1.5 rounded-xl animate-in fade-in">
              <span className="text-xs font-semibold text-primary">
                {selectedCount} {selectedCount === 1 ? "selecionado" : "selecionados"}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={onExportSelected}
                className="h-7 text-xs gap-1.5 rounded-lg border-primary/30 text-primary hover:bg-primary/20 font-semibold"
              >
                <RiFileExcel2Line className="size-3.5" />
                Exportar Seleção
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearSelection}
                className="h-7 text-xs text-muted-foreground hover:text-gray-900 rounded-lg px-2"
              >
                Desmarcar
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={onExportAll}
              className="h-10 text-xs gap-2 rounded-xl border-gray-200 text-gray-700 hover:bg-gray-50 font-semibold shadow-2xs"
            >
              <RiFileExcel2Line className="size-4 text-emerald-600" />
              Exportar CSV ({totalFilteredCount})
            </Button>
          )}

          <Button
            variant={groupByCategory ? "default" : "outline"}
            size="sm"
            onClick={() => onGroupByCategoryChange(!groupByCategory)}
            className="h-10 text-xs gap-1.5 rounded-xl font-semibold shadow-2xs"
            title="Alternar agrupamento colapsável por categoria"
          >
            {groupByCategory ? (
              <>
                <RiListCheck2 className="size-4" />
                Agrupado
              </>
            ) : (
              <>
                <RiLayoutGridLine className="size-4" />
                Agrupar
              </>
            )}
          </Button>

          {onPrintLabels ? (
            <Button
              onClick={onPrintLabels}
              className="h-10 text-xs gap-2 font-semibold rounded-xl shadow-2xs shrink-0"
            >
              <RiPrinterLine className="size-4" />
              Imprimir Etiquetas
            </Button>
          ) : null}
        </div>
      </div>

      {/* Linha 2: Filtros Combinados (Categoria, Status, Máquina) */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {/* Pills de Categoria */}
        <div className="flex items-center gap-1 bg-gray-100/80 p-1 rounded-xl">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => onCategoryFilterChange(cat)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                categoryFilter === cat
                  ? "bg-white text-gray-900 shadow-2xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {cat === "TODOS" ? "Todas Categorias" : CATEGORY_LABEL[cat]}
            </button>
          ))}
        </div>

        {/* Filtro de Status */}
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value as any)}
            className="h-8 pl-3 pr-7 text-xs font-semibold rounded-xl bg-card border border-gray-200 text-gray-700 shadow-2xs appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {STATUSES.map((st) => (
              <option key={st.value} value={st.value}>
                {st.label}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
            <RiFilterLine className="size-3.5" />
          </div>
        </div>

        {/* Filtro de Máquina */}
        {machines.length > 0 ? (
          <div className="relative">
            <select
              value={machineFilter}
              onChange={(e) => onMachineFilterChange(e.target.value)}
              className="h-8 pl-3 pr-7 text-xs font-semibold rounded-xl bg-card border border-gray-200 text-gray-700 shadow-2xs appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="TODAS">Todas as Máquinas</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
              <RiPrinterLine className="size-3.5" />
            </div>
          </div>
        ) : null}

        {/* Botão limpar filtros se ativo */}
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="text-xs text-muted-foreground hover:text-gray-900 underline ml-1"
          >
            Limpar filtros
          </button>
        )}
      </div>
    </div>
  );
}
