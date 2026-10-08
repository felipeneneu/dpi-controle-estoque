"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  StockItem,
  TintaLote,
  Bobina,
  CATEGORY_LABEL,
} from "@/lib/api";
import {
  useTintaLotes,
  useAddTintaLote,
  useDischargeTintaLote,
  useBobinas,
  useDischargeBobina,
  useAddRoll,
} from "@/lib/queries/stock";
import { useMachines, useChangeTinta, useChangeBobina } from "@/lib/queries/machines";
import { toast } from "sonner";
import {
  RiPrinterLine,
  RiAddLine,
  RiArrowDownSLine,
  RiArrowUpSLine,
  RiCheckLine,
  RiFlashlightLine,
  RiDeleteBinLine,
  RiInboxArchiveLine,
  RiExchangeLine,
} from "@remixicon/react";

export interface StockItemDrilldownDialogProps {
  item: StockItem | null;
  onClose: () => void;
}

export function StockItemDrilldownDialog({
  item,
  onClose,
}: StockItemDrilldownDialogProps) {
  if (!item) return null;

  if (item.category === "INK_SUPPLY") {
    return <TintaDrilldownContent item={item} onClose={onClose} />;
  }

  if (item.category === "PAPER_MEDIA") {
    if (item.unit === "m") {
      return <BobinaDrilldownContent item={item} onClose={onClose} />;
    }
    return <FolhaDrilldownContent item={item} onClose={onClose} />;
  }

  return <GenericItemDrilldownContent item={item} onClose={onClose} />;
}

// ==========================================
// DRILL-DOWN DE TINTA (REMODELADO POR UNIDADE)
// ==========================================
function TintaDrilldownContent({
  item,
  onClose,
}: {
  item: StockItem;
  onClose: () => void;
}) {
  const lotesQuery = useTintaLotes(item.id);
  const lotes = lotesQuery.data ?? [];
  const machinesQuery = useMachines();
  const machines = machinesQuery.data ?? [];

  const addLoteMutation = useAddTintaLote();
  const dischargeMutation = useDischargeTintaLote();
  const changeTintaMutation = useChangeTinta();

  // Estados dos modais secundários
  const [showAddModal, setShowAddModal] = useState(false);
  const [addQty, setAddQty] = useState("1");
  const [addSerial, setAddSerial] = useState("");
  const [addChannel, setAddChannel] = useState("");

  const [dischargeTarget, setDischargeTarget] = useState<TintaLote | null>(null);
  const [dischargeReason, setDischargeReason] = useState("");

  const [quickSwitchTarget, setQuickSwitchTarget] = useState<TintaLote | null>(null);
  const [selectedMachineId, setSelectedMachineId] = useState("");
  const [selectedChannel, setSelectedChannel] = useState("");

  const [showFinished, setShowFinished] = useState(false);

  // Categorização em 3 seções obrigatórias
  const inUseLotes = lotes.filter((l) => l.state === "IN_USE");
  const waitingLotes = lotes.filter((l) => l.state === "NEW");
  const finishedLotes = lotes.filter((l) => l.state === "FINISHED");

  async function handleAddLotes() {
    const qty = parseInt(addQty, 10);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Informe uma quantidade válida");
      return;
    }
    try {
      await addLoteMutation.mutateAsync({
        stockItemId: item.id,
        quantity: qty,
        serial: addSerial.trim() || undefined,
        channel: addChannel.trim() || undefined,
      });
      toast.success(`${qty} frasco(s) de tinta adicionado(s) à prateleira`);
      setShowAddModal(false);
      setAddQty("1");
      setAddSerial("");
      setAddChannel("");
    } catch {
      toast.error("Erro ao adicionar lotes de tinta");
    }
  }

  async function handleDischarge() {
    if (!dischargeTarget || !dischargeReason.trim()) return;
    try {
      await dischargeMutation.mutateAsync({
        id: dischargeTarget.id,
        reason: dischargeReason.trim(),
      });
      toast.success(`Lote ${dischargeTarget.serial} baixado com sucesso`);
      setDischargeTarget(null);
      setDischargeReason("");
    } catch {
      toast.error("Erro ao dar baixa no lote");
    }
  }

  async function handleQuickSwitch() {
    if (!quickSwitchTarget || !selectedMachineId) {
      toast.error("Selecione a máquina para carregar a tinta");
      return;
    }
    try {
      await changeTintaMutation.mutateAsync({
        machineId: selectedMachineId,
        stockItemId: item.id,
        tintaLoteId: quickSwitchTarget.id,
        channel: selectedChannel || quickSwitchTarget.channel || undefined,
      });
      toast.success(
        `Tinta ${quickSwitchTarget.serial} carregada na máquina com sucesso!`
      );
      setQuickSwitchTarget(null);
      setSelectedMachineId("");
      setSelectedChannel("");
    } catch {
      toast.error("Erro no Quick Switch de tinta");
    }
  }

  return (
    <>
      <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-6">
          <DialogHeader className="shrink-0 pb-3 border-b border-gray-100">
            <div className="flex items-center justify-between gap-4">
              <div>
                <DialogTitle className="text-xl font-bold text-gray-900">
                  {item.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Estoque de Tinta por Unidade (Garrafas / Cartuchos) — {item.code ? `Código ${item.code} • ` : ""}
                  Mínimo: {item.minQuantity} un.
                </DialogDescription>
              </div>
              <Button
                size="sm"
                onClick={() => setShowAddModal(true)}
                className="gap-1.5 rounded-xl text-xs font-semibold shadow-2xs shrink-0"
              >
                <RiAddLine className="size-4" />
                Adicionar Frascos
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-6 py-4 pr-1">
            {/* SEÇÃO 1: EM USO (TOP, DESTAQUE MÁXIMO) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  1. Em Uso na Máquina ({inUseLotes.length})
                </h4>
                <span className="text-[11px] text-muted-foreground">
                  (Descontado do disponível contábil)
                </span>
              </div>

              {inUseLotes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 p-4 text-center text-xs text-muted-foreground">
                  Nenhum frasco/cartucho deste produto está carregado em máquina no momento.
                </div>
              ) : (
                <div className="grid gap-2.5">
                  {inUseLotes.map((lote) => {
                    const machine = machines.find((m) => m.id === lote.machineId);
                    return (
                      <div
                        key={lote.id}
                        className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-base font-bold text-emerald-950">
                              {lote.serial}
                            </span>
                            <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold uppercase">
                              EM USO
                            </Badge>
                            {lote.channel ? (
                              <span className="bg-emerald-200/80 text-emerald-900 border border-emerald-300 rounded px-2 py-0.5 text-xs font-bold uppercase">
                                Canal: {lote.channel}
                              </span>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-3 text-xs text-emerald-900">
                            <span className="flex items-center gap-1 font-semibold">
                              <RiPrinterLine className="size-3.5 text-emerald-700" />
                              {machine?.name || "Máquina em produção"}
                            </span>
                            {lote.openedAt ? (
                              <span className="text-emerald-700">
                                Carregado em: {new Date(lote.openedAt).toLocaleString("pt-BR")}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              setDischargeTarget(lote);
                              setDischargeReason("");
                            }}
                            className="rounded-xl text-xs gap-1.5 h-8 font-semibold shadow-2xs"
                          >
                            <RiDeleteBinLine className="size-3.5" />
                            Finalizar / Baixar
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* SEÇÃO 2: EM ESPERA (PRATELEIRA / ESTOQUE DISPONÍVEL) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-sky-500" />
                  2. Em Espera / Prateleira ({waitingLotes.length} disponíveis)
                </h4>
                <span className="text-[11px] font-semibold text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
                  Saldo Real: {waitingLotes.length} unidades NEW
                </span>
              </div>

              {waitingLotes.length === 0 ? (
                <div className="rounded-xl border border-gray-200 bg-amber-50/50 p-4 text-center text-xs text-amber-800">
                  Nenhum frasco disponível na prateleira. Clique em &quot;Adicionar Frascos&quot; acima para registrar novas entradas.
                </div>
              ) : (
                <div className="grid gap-2">
                  {waitingLotes.map((lote) => (
                    <div
                      key={lote.id}
                      className="rounded-xl border border-gray-200 bg-card p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-gray-50/60 transition-colors shadow-2xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-gray-900">
                            {lote.serial}
                          </span>
                          <span className="bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-semibold px-2 py-0.5 rounded">
                            NOVO (PRATELEIRA)
                          </span>
                          {lote.channel ? (
                            <span className="bg-gray-100 text-gray-700 text-[10px] font-semibold px-1.5 py-0.5 rounded">
                              Canal: {lote.channel}
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Local: {lote.location || "deposito"} • Criado em:{" "}
                          {lote.createdAt
                            ? new Date(lote.createdAt).toLocaleDateString("pt-BR")
                            : "—"}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setQuickSwitchTarget(lote);
                            setSelectedMachineId(machines[0]?.id || "");
                            setSelectedChannel(lote.channel || "");
                          }}
                          className="rounded-xl text-xs gap-1.5 h-8 font-semibold border-emerald-500 text-emerald-700 hover:bg-emerald-50"
                        >
                          <RiFlashlightLine className="size-3.5 text-emerald-600" />
                          Carregar na Máquina (Quick Switch)
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setDischargeTarget(lote);
                            setDischargeReason("");
                          }}
                          className="rounded-xl text-xs h-8 text-gray-500 hover:text-red-600"
                        >
                          Baixa
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SEÇÃO 3: BAIXADOS / FINALIZADOS (RECOLHIDO / SECUNDÁRIO) */}
            <div className="border-t border-gray-100 pt-3">
              <button
                onClick={() => setShowFinished(!showFinished)}
                className="w-full flex items-center justify-between py-2 text-xs font-semibold text-muted-foreground hover:text-gray-900 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <RiInboxArchiveLine className="size-4" />
                  3. Histórico de Lotes Finalizados / Baixados ({finishedLotes.length})
                </span>
                {showFinished ? (
                  <RiArrowUpSLine className="size-4" />
                ) : (
                  <RiArrowDownSLine className="size-4" />
                )}
              </button>

              {showFinished && (
                <div className="space-y-2 pt-2">
                  {finishedLotes.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic p-2">
                      Nenhum histórico de baixa registrado para este SKU.
                    </p>
                  ) : (
                    <div className="grid gap-1.5 max-h-48 overflow-y-auto pr-1">
                      {finishedLotes.map((lote) => (
                        <div
                          key={lote.id}
                          className="rounded-lg border border-gray-100 bg-gray-50/70 p-2.5 text-xs flex items-center justify-between text-muted-foreground"
                        >
                          <div>
                            <span className="font-mono font-medium text-gray-700">
                              {lote.serial}
                            </span>
                            {lote.channel ? ` • Canal: ${lote.channel}` : ""}
                          </div>
                          <div>
                            {lote.finishedAt
                              ? `Baixado em ${new Date(lote.finishedAt).toLocaleDateString("pt-BR")}`
                              : "Finalizado"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="shrink-0 pt-3 border-t border-gray-100">
            <Button variant="outline" onClick={onClose} className="rounded-xl">
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL SECUNDÁRIO: ADICIONAR FRASCOS DE TINTA */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Frascos de Tinta</DialogTitle>
            <DialogDescription>
              {item.name} — Registra novas unidades inteiras no estado <strong>NEW</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase">
                Quantidade de Frascos / Cartuchos
              </Label>
              <Input
                type="number"
                min="1"
                value={addQty}
                onChange={(e) => setAddQty(e.target.value)}
                placeholder="Ex: 5"
                className="h-10 rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase">
                Serial / Lote Base (Opcional)
              </Label>
              <Input
                value={addSerial}
                onChange={(e) => setAddSerial(e.target.value)}
                placeholder="Ex: LOTE-2026-A (se vazio, o sistema gera TNK-XXXX)"
                className="h-10 rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase">
                Canal de Cor (Opcional)
              </Label>
              <Input
                value={addChannel}
                onChange={(e) => setAddChannel(e.target.value)}
                placeholder="Ex: Cyan, Magenta, Yellow, Black, White"
                className="h-10 rounded-xl"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAddLotes}
              disabled={addLoteMutation.isPending || !addQty}
            >
              {addLoteMutation.isPending ? "Adicionando..." : "Confirmar Entrada"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL SECUNDÁRIO: QUICK SWITCH DE TINTA NA MÁQUINA */}
      <Dialog
        open={!!quickSwitchTarget}
        onOpenChange={(open) => !open && setQuickSwitchTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RiFlashlightLine className="size-5 text-emerald-600" />
              Quick Switch de Tinta
            </DialogTitle>
            <DialogDescription>
              Carregar frasco <strong>{quickSwitchTarget?.serial}</strong> em máquina sem travar produção.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase">
                Selecione a Máquina
              </Label>
              <select
                value={selectedMachineId}
                onChange={(e) => setSelectedMachineId(e.target.value)}
                className="w-full h-10 rounded-xl bg-card border border-gray-200 px-3 text-sm font-semibold"
              >
                <option value="">Selecione uma máquina...</option>
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.model})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase">
                Canal de Tinta (Ex: Cyan, White)
              </Label>
              <Input
                value={selectedChannel}
                onChange={(e) => setSelectedChannel(e.target.value)}
                placeholder="Ex: Black / Cyan / White"
                className="h-10 rounded-xl"
              />
            </div>

            <p className="text-xs text-muted-foreground bg-gray-50 p-2.5 rounded-xl border border-gray-100">
              ⚡ Ao confirmar, o lote atual em uso neste canal na máquina é finalizado
              automaticamente e o novo lote passa para <strong>IN_USE</strong> em tempo real.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickSwitchTarget(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleQuickSwitch}
              disabled={changeTintaMutation.isPending || !selectedMachineId}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {changeTintaMutation.isPending ? "Carregando..." : "Confirmar Troca"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL SECUNDÁRIO: BAIXA MANUAL DE LOTE */}
      <Dialog
        open={!!dischargeTarget}
        onOpenChange={(open) => !open && setDischargeTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dar Baixa no Lote</DialogTitle>
            <DialogDescription>
              Você está baixando o frasco <strong>{dischargeTarget?.serial}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase">
              Motivo da Baixa (Obrigatório)
            </Label>
            <Input
              value={dischargeReason}
              onChange={(e) => setDischargeReason(e.target.value)}
              placeholder="Ex: Esgotado em produção / Descarte / Venda"
              className="h-10 rounded-xl"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDischargeTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDischarge}
              disabled={dischargeMutation.isPending || !dischargeReason.trim()}
            >
              {dischargeMutation.isPending ? "Baixando..." : "Confirmar Baixa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ==========================================
// DRILL-DOWN DE BOBINAS (REORGANIZADO EM 3 SEÇÕES)
// ==========================================
function BobinaDrilldownContent({
  item,
  onClose,
}: {
  item: StockItem;
  onClose: () => void;
}) {
  const bobinasQuery = useBobinas(item.id);
  const bobinas = bobinasQuery.data ?? [];
  const machines = useMachines().data ?? [];

  const addRoll = useAddRoll();
  const dischargeBobina = useDischargeBobina();
  const changeBobina = useChangeBobina();

  const [dischargeTarget, setDischargeTarget] = useState<Bobina | null>(null);
  const [dischargeReason, setDischargeReason] = useState("");
  const [showFinished, setShowFinished] = useState(false);

  const inUseBobinas = bobinas.filter((b) => b.state === "IN_USE");
  const waitingBobinas = bobinas.filter((b) => b.state === "NEW");
  const finishedBobinas = bobinas.filter((b) => b.state === "USED");

  async function handleAddRoll() {
    try {
      await addRoll.mutateAsync({ id: item.id, label: "" });
      toast.success("Novo rolo criado com sucesso!");
    } catch {
      toast.error("Erro ao criar rolo");
    }
  }

  async function handleDischarge() {
    if (!dischargeTarget || !dischargeReason.trim()) return;
    try {
      await dischargeBobina.mutateAsync({
        id: dischargeTarget.id,
        reason: dischargeReason.trim(),
      });
      toast.success(`Bobina ${dischargeTarget.serial} baixada com sucesso`);
      setDischargeTarget(null);
      setDischargeReason("");
    } catch {
      toast.error("Erro ao dar baixa na bobina");
    }
  }

  return (
    <>
      <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-6">
          <DialogHeader className="shrink-0 pb-3 border-b border-gray-100">
            <div className="flex items-center justify-between gap-4">
              <div>
                <DialogTitle className="text-xl font-bold text-gray-900">
                  {item.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Bobinas de Mídia — Largura {item.width ? `${item.width}m` : "—"} • Mínimo: {item.minQuantity} {item.unit}
                </DialogDescription>
              </div>
              <Button
                size="sm"
                onClick={handleAddRoll}
                disabled={addRoll.isPending}
                className="gap-1.5 rounded-xl text-xs font-semibold shadow-2xs shrink-0"
              >
                <RiAddLine className="size-4" />
                {addRoll.isPending ? "Criando..." : "Adicionar Rolo"}
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-6 py-4 pr-1">
            {/* SEÇÃO 1: BOBINAS EM USO (TOP, DESTAQUE) */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                1. Em Uso na Máquina ({inUseBobinas.length})
              </h4>

              {inUseBobinas.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 p-4 text-center text-xs text-muted-foreground">
                  Nenhuma bobina carregada no momento.
                </div>
              ) : (
                <div className="grid gap-2.5">
                  {inUseBobinas.map((b) => (
                    <div
                      key={b.id}
                      className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-base font-bold text-emerald-950">
                            {b.serial}
                          </span>
                          <Badge className="bg-emerald-600 text-white text-[10px] font-bold">
                            EM USO
                          </Badge>
                          <span className="bg-emerald-200/80 text-emerald-900 font-semibold px-2 py-0.5 rounded text-xs">
                            {b.metersRemaining}m restantes
                          </span>
                        </div>
                        <p className="text-xs text-emerald-800">
                          Localização: {b.location}
                        </p>
                      </div>

                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setDischargeTarget(b);
                          setDischargeReason("");
                        }}
                        className="rounded-xl text-xs gap-1.5 h-8 font-semibold shadow-2xs"
                      >
                        <RiDeleteBinLine className="size-3.5" />
                        Dar Baixa
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SEÇÃO 2: BOBINAS DISPONÍVEIS NA PRATELEIRA */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-sky-500" />
                2. Em Espera / Prateleira ({waitingBobinas.length} bobinas)
              </h4>

              {waitingBobinas.length === 0 ? (
                <div className="rounded-xl border border-gray-200 bg-amber-50/50 p-4 text-center text-xs text-amber-800">
                  Nenhuma bobina disponível na prateleira.
                </div>
              ) : (
                <div className="grid gap-2">
                  {waitingBobinas.map((b) => (
                    <div
                      key={b.id}
                      className="rounded-xl border border-gray-200 bg-card p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-gray-900">
                            {b.serial}
                          </span>
                          <span className="bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-semibold px-2 py-0.5 rounded">
                            LIVRE
                          </span>
                          <span className="font-semibold text-xs text-gray-800">
                            {b.metersRemaining}m
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Local: {b.location}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setDischargeTarget(b);
                            setDischargeReason("");
                          }}
                          className="rounded-xl text-xs h-8 text-gray-500 hover:text-red-600"
                        >
                          Baixa
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SEÇÃO 3: BOBINAS FINALIZADAS */}
            <div className="border-t border-gray-100 pt-3">
              <button
                onClick={() => setShowFinished(!showFinished)}
                className="w-full flex items-center justify-between py-2 text-xs font-semibold text-muted-foreground hover:text-gray-900 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <RiInboxArchiveLine className="size-4" />
                  3. Histórico de Bobinas Utilizadas ({finishedBobinas.length})
                </span>
                {showFinished ? (
                  <RiArrowUpSLine className="size-4" />
                ) : (
                  <RiArrowDownSLine className="size-4" />
                )}
              </button>

              {showFinished && (
                <div className="space-y-2 pt-2 max-h-48 overflow-y-auto pr-1">
                  {finishedBobinas.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic p-2">
                      Nenhuma bobina finalizada.
                    </p>
                  ) : (
                    finishedBobinas.map((b) => (
                      <div
                        key={b.id}
                        className="rounded-lg border border-gray-100 bg-gray-50/70 p-2.5 text-xs flex items-center justify-between text-muted-foreground"
                      >
                        <span className="font-mono font-medium text-gray-700">
                          {b.serial}
                        </span>
                        <span>Usada (0m)</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="shrink-0 pt-3 border-t border-gray-100">
            <Button variant="outline" onClick={onClose} className="rounded-xl">
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE BAIXA NA BOBINA */}
      <Dialog
        open={!!dischargeTarget}
        onOpenChange={(open) => !open && setDischargeTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dar Baixa na Bobina</DialogTitle>
            <DialogDescription>
              Bobina <strong>{dischargeTarget?.serial}</strong> ({dischargeTarget?.metersRemaining}m).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase">
              Motivo da Baixa (Obrigatório)
            </Label>
            <Input
              value={dischargeReason}
              onChange={(e) => setDischargeReason(e.target.value)}
              placeholder="Ex: Fim de bobina / Descarte / Venda"
              className="h-10 rounded-xl"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDischargeTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDischarge}
              disabled={dischargeBobina.isPending || !dischargeReason.trim()}
            >
              {dischargeBobina.isPending ? "Baixando..." : "Confirmar Baixa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ==========================================
// DRILL-DOWN DE MÍDIA PLANA / FOLHAS
// ==========================================
function FolhaDrilldownContent({
  item,
  onClose,
}: {
  item: StockItem;
  onClose: () => void;
}) {
  const isOutOfStock = item.currentQuantity <= 0;
  const isLowStock = !isOutOfStock && item.currentQuantity <= item.minQuantity;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-sky-300 bg-sky-50 text-sky-800 text-[11px] font-semibold">
              Mídia Plana · Folhas
            </Badge>
            {item.subType && (
              <span className="text-xs text-muted-foreground font-medium">
                {item.subType}
              </span>
            )}
          </div>
          <DialogTitle className="text-base text-gray-900 mt-1">{item.name}</DialogTitle>
          <DialogDescription>
            {item.code ? `Código do Material: ${item.code}` : "Item de papel cortado / folha avulsa"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3">
          {/* Card de Saldo */}
          <div className="rounded-xl border border-gray-150 bg-gray-50/70 p-4 space-y-3">
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Saldo em Estoque
                </p>
                <p className="text-2xl font-bold font-mono text-gray-900 mt-0.5">
                  {item.currentQuantity}{" "}
                  <span className="text-sm font-sans font-medium text-muted-foreground">
                    {item.unit}
                  </span>
                </p>
              </div>

              <Badge
                variant="secondary"
                className={
                  isOutOfStock
                    ? "bg-red-100 text-red-700 border-red-200"
                    : isLowStock
                    ? "bg-amber-100 text-amber-800 border-amber-200"
                    : "bg-emerald-100 text-emerald-800 border-emerald-200"
                }
              >
                {isOutOfStock ? "Esgotado" : isLowStock ? "Estoque Baixo" : "Disponível"}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-200/60 text-xs">
              <div>
                <span className="text-muted-foreground">Estoque Mínimo:</span>
                <p className="font-semibold text-gray-800">{item.minQuantity} {item.unit}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Controle Físico:</span>
                <p className="font-semibold text-gray-800">Folhas / Resmas</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-xs text-blue-900 space-y-1">
            <p className="font-semibold flex items-center gap-1.5 text-blue-950">
              ℹ️ Controle por Folhas e Resmas
            </p>
            <p className="text-[11px] text-blue-800 leading-relaxed">
              Este item não utiliza bobinas físicas de rolo. Os débitos operacionais da Konica ou de mesas planas
              são realizados diretamente por contagem de folhas impressas com conversão automática pela unidade.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-xl">
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==========================================
// DRILL-DOWN DE ITEM GENÉRICO
// ==========================================
function GenericItemDrilldownContent({
  item,
  onClose,
}: {
  item: StockItem;
  onClose: () => void;
}) {
  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          <DialogDescription>
            {CATEGORY_LABEL[item.category] ?? item.category} • Código: {item.code || "—"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-3 text-sm">
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Saldo Físico:</span>
            <span className="font-bold text-gray-900">
              {item.currentQuantity} {item.unit}
            </span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Estoque Mínimo:</span>
            <span>
              {item.minQuantity} {item.unit}
            </span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Status Atual:</span>
            <span className="font-semibold">{item.status}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
