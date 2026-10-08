"use client";

import React, { useMemo, useState } from "react";
import {
  useLegacyTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
} from "@tanstack/react-table/legacy";
import { flexRender, type SortingState, type RowSelectionState } from "@tanstack/react-table";
import { StockItem, StockCategory, StockStatus, CATEGORY_LABEL } from "@/lib/api";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { getStockColumns, StockTableActions } from "./stock-columns";
import { StockToolbar } from "./stock-toolbar";
import { exportStockToCsv } from "./export-csv";
import {
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiArrowDownSLine,
  RiArrowUpSLine,
  RiInboxArchiveLine,
} from "@remixicon/react";

export interface StockDataTableProps {
  items: StockItem[];
  actions: StockTableActions;
  machines?: { id: string; name: string }[];
  defaultCategoryFilter?: "TODOS" | StockCategory;
  onPrintLabels?: () => void;
}

export function StockDataTable({
  items,
  actions,
  machines = [],
  defaultCategoryFilter = "TODOS",
  onPrintLabels,
}: StockDataTableProps) {
  // Estados de busca e filtros
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"TODOS" | StockCategory>(
    defaultCategoryFilter
  );

  React.useEffect(() => {
    setCategoryFilter(defaultCategoryFilter);
  }, [defaultCategoryFilter]);

  const [statusFilter, setStatusFilter] = useState<"TODOS" | StockStatus>("TODOS");
  const [machineFilter, setMachineFilter] = useState("TODAS");

  // Ordenação e Seleção de Linhas
  const [sorting, setSorting] = useState<SortingState>([
    { id: "status", desc: false }, // Mostra Zerado e Baixo no topo por padrão
  ]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // Agrupamento por Categoria (colapsável)
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // Colunas
  const columns = useMemo(() => getStockColumns(actions), [actions]);

  // Filtro combinado client-side de alta performance
  const filteredData = useMemo(() => {
    return items.filter((item) => {
      // 1. Categoria
      if (categoryFilter !== "TODOS" && item.category !== categoryFilter) {
        return false;
      }

      // 2. Status
      if (statusFilter !== "TODOS" && item.status !== statusFilter) {
        return false;
      }

      // 3. Máquina
      if (machineFilter !== "TODAS") {
        const matchesLinked = item.machineIds?.includes(machineFilter);
        const matchesActive = item.activeLot?.machineId === machineFilter;
        if (!matchesLinked && !matchesActive) {
          return false;
        }
      }

      // 4. Busca por texto
      if (search.trim() !== "") {
        const q = search.trim().toLowerCase();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesCode = item.code ? item.code.toLowerCase().includes(q) : false;
        const matchesActiveSerial = item.activeLot?.serial
          ? item.activeLot.serial.toLowerCase().includes(q)
          : false;
        const matchesActiveMachine = item.activeLot?.machineName
          ? item.activeLot.machineName.toLowerCase().includes(q)
          : false;

        if (!matchesName && !matchesCode && !matchesActiveSerial && !matchesActiveMachine) {
          return false;
        }
      }

      return true;
    });
  }, [items, categoryFilter, statusFilter, machineFilter, search]);

  // Instância de TanStack Table via useLegacyTable
  const table = useLegacyTable({
    data: filteredData,
    columns: columns as any,
    state: {
      sorting,
      rowSelection,
    },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: 25,
      },
    },
  });

  // Ações de exportação
  const selectedRows = table.getSelectedRowModel().rows;
  const selectedItems = useMemo(
    () => selectedRows.map((r: { original: StockItem }) => r.original),
    [selectedRows]
  );

  function handleExportAll() {
    exportStockToCsv(filteredData, `estoque-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  function handleExportSelected() {
    if (selectedItems.length === 0) return;
    exportStockToCsv(
      selectedItems,
      `estoque-selecionados-${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  function handleClearSelection() {
    table.resetRowSelection();
  }

  function toggleCategoryCollapse(cat: string) {
    setCollapsedCategories((prev) => ({
      ...prev,
      [cat]: !prev[cat],
    }));
  }

  // Agrupamento por Categoria quando groupByCategory === true
  const groupedData = useMemo(() => {
    if (!groupByCategory) return null;
    const groups: Record<StockCategory, StockItem[]> = {
      PAPER_MEDIA: [],
      INK_SUPPLY: [],
      OTHER: [],
    };
    for (const item of filteredData) {
      if (groups[item.category]) {
        groups[item.category].push(item);
      } else {
        groups.OTHER.push(item);
      }
    }
    return groups;
  }, [groupByCategory, filteredData]);

  return (
    <div className="space-y-4">
      {/* Toolbar Inteligente */}
      <StockToolbar
        search={search}
        onSearchChange={setSearch}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        machineFilter={machineFilter}
        onMachineFilterChange={setMachineFilter}
        machines={machines}
        groupByCategory={groupByCategory}
        onGroupByCategoryChange={setGroupByCategory}
        selectedCount={selectedItems.length}
        totalFilteredCount={filteredData.length}
        onExportAll={handleExportAll}
        onExportSelected={handleExportSelected}
        onClearSelection={handleClearSelection}
        onPrintLabels={onPrintLabels}
      />

      {/* Visualização de Tabela */}
      <div className="rounded-2xl border border-gray-200/80 bg-card overflow-hidden shadow-2xs">
        {groupByCategory && groupedData ? (
          // VISUALIZAÇÃO AGRUPADA POR CATEGORIA
          <div className="divide-y divide-gray-100">
            {(Object.keys(groupedData) as StockCategory[]).map((cat) => {
              const catItems = groupedData[cat];
              if (catItems.length === 0 && categoryFilter !== "TODOS") return null;
              const isCollapsed = !collapsedCategories[cat];

              const lowCount = catItems.filter((i) => i.status === "LOW_STOCK").length;
              const outCount = catItems.filter((i) => i.status === "OUT_OF_STOCK").length;

              return (
                <div key={cat} className="space-y-0">
                  {/* Cabeçalho de Categoria Colapsável */}
                  <button
                    onClick={() => toggleCategoryCollapse(cat)}
                    className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50/75 hover:bg-gray-100/75 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-gray-900 text-sm">
                        {CATEGORY_LABEL[cat] ?? cat}
                      </span>
                      <span className="text-xs bg-gray-200/80 text-gray-700 px-2 py-0.5 rounded-full font-semibold">
                        {catItems.length} {catItems.length === 1 ? "item" : "itens"}
                      </span>
                      {outCount > 0 ? (
                        <span className="text-[11px] bg-red-100 text-red-700 px-2 py-0.5 rounded-md font-semibold">
                          {outCount} zerado(s)
                        </span>
                      ) : null}
                      {lowCount > 0 ? (
                        <span className="text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md font-semibold">
                          {lowCount} baixo(s)
                        </span>
                      ) : null}
                    </div>
                    <div className="text-gray-400">
                      {isCollapsed ? (
                        <RiArrowDownSLine className="size-5" />
                      ) : (
                        <RiArrowUpSLine className="size-5" />
                      )}
                    </div>
                  </button>

                  {!isCollapsed && (
                    <Table>
                      <TableHeader className="bg-gray-50/40">
                        {table.getHeaderGroups().map((headerGroup: any) => (
                          <TableRow key={headerGroup.id}>
                            {headerGroup.headers.map((header: any) => (
                              <TableHead key={header.id} className="text-xs font-semibold">
                                {header.isPlaceholder
                                  ? null
                                  : flexRender(
                                      header.column.columnDef.header,
                                      header.getContext()
                                    )}
                              </TableHead>
                            ))}
                          </TableRow>
                        ))}
                      </TableHeader>
                      <TableBody>
                        {catItems.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={columns.length}
                              className="h-20 text-center text-xs text-muted-foreground"
                            >
                              Nenhum item encontrado nesta categoria com os filtros atuais.
                            </TableCell>
                          </TableRow>
                        ) : (
                          // Renderiza as linhas correspondentes a esta categoria
                          table
                            .getRowModel()
                            .rows.filter((row: any) => row.original.category === cat)
                            .map((row: any) => (
                              <TableRow
                                key={row.id}
                                data-state={row.getIsSelected() && "selected"}
                                className="hover:bg-gray-50/60 transition-colors"
                              >
                                {row.getVisibleCells().map((cell: any) => (
                                  <TableCell key={cell.id} className="py-3">
                                    {flexRender(
                                      cell.column.columnDef.cell,
                                      cell.getContext()
                                    )}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))
                        )}
                      </TableBody>
                    </Table>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          // VISUALIZAÇÃO PLANA (TABELA NORMAL COM TANSTACK PAGINATION)
          <Table>
            <TableHeader className="bg-gray-50/75">
              {table.getHeaderGroups().map((headerGroup: any) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header: any) => (
                    <TableHead key={header.id} className="text-xs font-semibold">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row: any) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className="hover:bg-gray-50/60 transition-colors"
                  >
                    {row.getVisibleCells().map((cell: any) => (
                      <TableCell key={cell.id} className="py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-32 text-center text-muted-foreground"
                  >
                    <div className="flex flex-col items-center justify-center gap-1.5 py-4">
                      <RiInboxArchiveLine className="size-8 text-gray-300" />
                      <p className="text-sm font-semibold text-gray-700">
                        Nenhum item de estoque encontrado
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Tente ajustar a busca ou os filtros de categoria/status/máquina.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Paginação da Tabela Plana */}
      {!groupByCategory && filteredData.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1 py-1 text-xs text-muted-foreground">
          <div>
            Mostrando{" "}
            <span className="font-semibold text-gray-900">
              {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}
            </span>{" "}
            até{" "}
            <span className="font-semibold text-gray-900">
              {Math.min(
                (table.getState().pagination.pageIndex + 1) *
                  table.getState().pagination.pageSize,
                filteredData.length
              )}
            </span>{" "}
            de{" "}
            <span className="font-semibold text-gray-900">{filteredData.length}</span> itens
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Itens por página:</span>
            <select
              value={table.getState().pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className="h-8 rounded-lg bg-card border border-gray-200 px-2 text-xs font-semibold"
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1 ml-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="size-8 p-0 rounded-lg"
              >
                <RiArrowLeftSLine className="size-4" />
              </Button>
              <span className="px-2 font-medium">
                Pág. {table.getState().pagination.pageIndex + 1} de{" "}
                {table.getPageCount() || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="size-8 p-0 rounded-lg"
              >
                <RiArrowRightSLine className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
