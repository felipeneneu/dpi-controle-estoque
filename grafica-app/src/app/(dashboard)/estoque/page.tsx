"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { getUser, type StockItem, type StockCategory } from "@/lib/api";
import { useStockItems, useStockTransaction, useAddRoll, useDeleteStockItem } from "@/lib/queries/stock";
import { useMachines } from "@/lib/queries/machines";
import { useStockSocket } from "@/hooks/use-stock-socket";
import { LoadingState } from "@/components/ui/spinner";
import { StockDataTable } from "@/components/stock/stock-data-table";
import { StockSearch } from "@/components/stock/stock-search";
import { StockItemDrilldownDialog } from "@/components/stock/stock-item-drilldown-dialog";
import { StockInkConsumptionDialog } from "@/components/stock/stock-ink-consumption-dialog";
import EditStockItemDialog from "@/components/edit-stock-item-dialog";
import { LabelImpositionDialog } from "@/components/label-imposition-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getUser as getUserApi } from "@/lib/api";

function EstoqueContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const catParam = searchParams.get("cat");
  const selectedCategory: "TODOS" | StockCategory =
    catParam === "PAPER_MEDIA" || catParam === "bobinas" || catParam === "midias"
      ? "PAPER_MEDIA"
      : catParam === "INK_SUPPLY" || catParam === "tintas"
      ? "INK_SUPPLY"
      : catParam === "OTHER"
      ? "OTHER"
      : "TODOS";

  // Socket.IO para sincronização ao vivo (stock:updated)
  useStockSocket();

  const itemsQuery = useStockItems();
  const items = itemsQuery.data ?? [];
  const machines = useMachines().data ?? [];
  const user = getUserApi();
  const userRole = user?.role ?? "OPERATOR";

  const deleteMutation = useDeleteStockItem();

  // Drilldown dialog
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);

  // Modal de exclusão
  const [deleteTarget, setDeleteTarget] = useState<StockItem | null>(null);

  // Modal de movimentação manual (IN / OUT)
  const [transactionTarget, setTransactionTarget] = useState<StockItem | null>(null);
  const [transactionType, setTransactionType] = useState<"IN" | "OUT">("IN");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const transaction = useStockTransaction();

  // Modal de adicionar rolo
  const [rollTarget, setRollTarget] = useState<StockItem | null>(null);
  const addRoll = useAddRoll();

  // Modal de edição do item (nome, quantidade, mínimo)
  const [editTarget, setEditTarget] = useState<StockItem | null>(null);

  // Modal de imposição de etiquetas Konica
  const [labelImpositionOpen, setLabelImpositionOpen] = useState(false);

  // Modal de consumo de tinta
  const [inkConsumptionTarget, setInkConsumptionTarget] = useState<StockItem | null>(null);

  useEffect(() => {
    if (!getUser()) {
      router.replace("/auth");
    }
  }, [router]);

  async function submitTransaction() {
    if (!transactionTarget) return;
    const quantity = Number(qty);
    if (!quantity || quantity <= 0) return;
    try {
      await transaction.mutateAsync({
        itemId: transactionTarget.id,
        type: transactionType,
        quantity,
        reason: reason || undefined,
      });
      toast.success("Lançamento registrado!");
      setTransactionTarget(null);
      setQty("");
      setReason("");
    } catch {
      toast.error("Erro ao registrar lançamento");
    }
  }

  async function confirmAddRoll() {
    if (!rollTarget) return;
    try {
      await addRoll.mutateAsync({ id: rollTarget.id, label: "" });
      toast.success("Rolo criado com sucesso!");
      setRollTarget(null);
    } catch {
      toast.error("Falha ao criar rolo");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success("Material excluído com sucesso!");
      setDeleteTarget(null);
    } catch {
      toast.error("Erro ao excluir material");
    }
  }

  function handleOpenAddLot(item: StockItem) {
    // Só mídia em rolo (unidade "m") cria bobina. Folha (fls) e demais
    // unidades somam quantidade na mesma linha via entrada de estoque (IN).
    if (item.category === "PAPER_MEDIA" && item.unit === "m") {
      setRollTarget(item);
    } else if (item.category === "INK_SUPPLY") {
      setSelectedItem(item);
    } else {
      setQty("");
      setReason("");
      setTransactionTarget(item);
      setTransactionType("IN");
    }
  }

  function handleDeleteItem(item: StockItem) {
    setDeleteTarget(item);
  }

  function handleConsumeInk(item: StockItem) {
    setInkConsumptionTarget(item);
  }

  const loading = itemsQuery.isLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Estoque de Materiais & Insumos</h2>
          <p className="text-sm text-muted-foreground">
            Gestão centralizada de bobinas, papéis, tintas por unidade e químicos
          </p>
        </div>
        <div className="w-full sm:w-auto">
          <StockSearch
            onSelectItem={(item) => {
              const catParam =
                item.category === "PAPER_MEDIA"
                  ? "bobinas"
                  : item.category === "INK_SUPPLY"
                  ? "tintas"
                  : "TODOS";
              router.push(`/estoque?cat=${catParam}`);
              setSelectedItem(item);
            }}
            placeholder="Buscar por SKU (exato) ou nome..."
            autoFocus
          />
        </div>
      </div>

      {loading ? (
        <LoadingState label="Carregando estoque…" />
      ) : (
        <StockDataTable
          items={items}
          machines={machines}
          defaultCategoryFilter={selectedCategory}
          actions={{
            onViewLots: (item) => setSelectedItem(item),
            onQuickTransaction: (item, type) => {
              setTransactionTarget(item);
              setTransactionType(type);
            },
            onAddLot: handleOpenAddLot,
            onEditItem: (item) => setEditTarget(item),
            onDeleteItem: handleDeleteItem,
            onConsumeInk: handleConsumeInk,
            userRole,
          }}
          onPrintLabels={() => setLabelImpositionOpen(true)}
        />
      )}

      {/* Modal de Drill-Down Reorganizado em 3 Seções */}
      <StockItemDrilldownDialog
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
      />

      {/* Modal de Consumo de Tinta/Toner */}
      <StockInkConsumptionDialog
        open={!!inkConsumptionTarget}
        onOpenChange={(open) => !open && setInkConsumptionTarget(null)}
        item={inkConsumptionTarget}
      />

      {/* Modal de Edição do Item (nome, quantidade, mínimo) */}
      <EditStockItemDialog
        item={editTarget}
        onClose={() => setEditTarget(null)}
      />

      {/* Modal de Adicionar Rolo (Bobina) */}
      <Dialog open={!!rollTarget} onOpenChange={(open) => !open && setRollTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar rolo</DialogTitle>
            <DialogDescription>
              {rollTarget?.name} — um novo rolo independente será criado com o mesmo material, largura {rollTarget?.width} m.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-sky-50 border border-sky-200 text-sky-800 p-4 rounded-xl text-sm">
              <strong>Geração Automática:</strong> O ID Curto (Serial) desta bobina será gerado automaticamente pelo sistema para etiquetas com QR Code.
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRollTarget(null)}>Cancelar</Button>
            <Button onClick={confirmAddRoll} disabled={addRoll.isPending}>
              {addRoll.isPending ? "Criando…" : "Criar rolo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Transação Manual (Entrada / Baixa) */}
      <Dialog open={!!transactionTarget} onOpenChange={(open) => !open && setTransactionTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {transactionType === "IN" ? "Adicionar Estoque" : "Dar Baixa"}
            </DialogTitle>
            <DialogDescription>
              {transactionTarget?.name} ({transactionTarget?.unit})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Quantidade</Label>
              <Input
                type="number"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="Ex: 5"
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Motivo (Opcional)</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: Compra NF 1234 / Descarte"
                className="h-11 rounded-xl"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTransactionTarget(null)}>Cancelar</Button>
            <Button
              onClick={submitTransaction}
              disabled={transaction.isPending || !qty || Number(qty) <= 0}
              variant={transactionType === "IN" ? "default" : "destructive"}
            >
              {transaction.isPending ? "Salvando…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação de Exclusão */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open: boolean) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir material?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteTarget?.name}</strong> (SKU: {deleteTarget?.code})?
              Esta ação removerá o item, todas as suas bobinas, cartuchos, lotes de tinta e histórico de transações.
              <br /><br />
              <strong className="text-red-600">Esta ação não pode ser desfeita.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Excluir permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal de Imposição de Etiquetas Konica */}
      <LabelImpositionDialog
        open={labelImpositionOpen}
        onOpenChange={setLabelImpositionOpen}
      />
    </div>
  );
}

export default function EstoquePage() {
  return (
    <Suspense fallback={<LoadingState label="Carregando estoque…" />}>
      <EstoqueContent />
    </Suspense>
  );
}