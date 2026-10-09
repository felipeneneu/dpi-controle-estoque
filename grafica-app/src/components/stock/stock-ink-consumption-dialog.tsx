"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { api, type StockItem, type IndividualStockItem } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useStockTransaction } from "@/lib/queries/stock";
import {
  RiSearchLine,
  RiCloseLine,
  RiInboxLine,
  RiTruckLine,
  RiDeleteBinLine,
  RiArrowRightLine,
} from "@remixicon/react";

interface StockInkConsumptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: StockItem | null;
  onSuccess?: () => void;
}

export function StockInkConsumptionDialog({
  open,
  onOpenChange,
  item,
  onSuccess,
}: StockInkConsumptionDialogProps) {
  const [searchCode, setSearchCode] = useState("");
  const [foundItem, setFoundItem] = useState<StockItem | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [mode, setMode] = useState<"install" | "discharge">("install");
  const [quantity, setQuantity] = useState("");
  const [selectedCartucho, setSelectedCartucho] = useState<IndividualStockItem | null>(null);
  const [channel, setChannel] = useState("");
  const transaction = useStockTransaction();
  const router = useRouter();

  // Busca por código exato quando o usuário para de digitar
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchCode.trim().length < 3) {
        setFoundItem(null);
        return;
      }

      setIsSearching(true);
      try {
        const items = await api<StockItem[]>(
          `/api/stock-items?search=${encodeURIComponent(searchCode.trim())}`
        );
        // Busca exata por code (case-insensitive)
        const exactMatch = items.find(
          (i) => i.code?.toLowerCase() === searchCode.trim().toLowerCase()
        );
        setFoundItem(exactMatch || null);
      } catch (error) {
        console.error("Erro na busca:", error);
        setFoundItem(null);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchCode]);

  const handleSubmit = async () => {
    if (!foundItem || !selectedCartucho) return;

    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      toast.error("Quantidade inválida");
      return;
    }

    if (qty > (selectedCartucho.levelCurrent ?? 0)) {
      toast.error("Quantidade maior que o disponível no cartucho/lote");
      return;
    }

    try {
      if (mode === "discharge") {
        // Registrar saída completa do cartucho (OUT)
        await transaction.mutateAsync({
          itemId: foundItem.id,
          type: "OUT",
          quantity: selectedCartucho.levelCurrent ?? qty,
          reason: `Baixa manual: ${selectedCartucho.serial} - ${quantity} ${foundItem.unit}`,
        });
        toast.success("Saída registrada! Cartucho marcado como usado.");
      } else {
        // Instalar no canal (NEW -> IN_USE)
        // Isso é feito via PATCH no cartucho/lote
        await api(`/api/cartuchos/${selectedCartucho.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            state: "IN_USE",
            location: `machine:${channel}`,
            machineId: channel,
            channel: channel,
          }),
        });
        toast.success(`Cartucho instalado no canal ${channel}!`);
      }

      onSuccess?.();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Erro ao registrar:", error);
      toast.error("Erro ao registrar operação");
    }
  };

  const resetForm = () => {
    setSearchCode("");
    setFoundItem(null);
    setMode("install");
    setQuantity("");
    setSelectedCartucho(null);
    setChannel("");
  };

  useEffect(() => {
    if (!open) resetForm();
  }, [open]);

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Baixa / Instalação de Tinta/Toner</DialogTitle>
          <DialogDescription>
            Busque pelo código (SKU) do item para registrar consumo ou instalação
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Campo 1: Busca por código */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">
              Código do Item (SKU)
            </Label>
            <div className="relative">
              <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
              <Input
                type="text"
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
                placeholder="Ex: CZ683A (busca exata)"
                className="pl-10 pr-10 h-11 rounded-xl"
                autoFocus
              />
              {searchCode && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                  onClick={() => setSearchCode("")}
                >
                  <RiCloseLine className="size-4 text-muted-foreground" />
                </Button>
              )}
            </div>
            {isSearching && <span className="text-xs text-sky-600">Buscando...</span>}
            {!isSearching && searchCode.length >= 3 && !foundItem && (
              <span className="text-xs text-red-600">
                Nenhum item encontrado com o c&oacute;digo &ldquo;{searchCode}&rdquo;. Confira o c&oacute;digo ou use a busca por nome.
              </span>
            )}
          </div>

          {/* Item encontrado */}
          {foundItem && (
            <div className="space-y-4 p-4 bg-gray-50 rounded-xl border">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900">{foundItem.name}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">
                      {foundItem.code}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {foundItem.category === "INK_SUPPLY" ? "Tinta" : "Outro"}
                    </Badge>
                  </div>
                </div>
                <RiArrowRightLine className="size-5 text-sky-500" />
              </div>

              {/* Cartuchos/Lotes disponíveis */}
              {foundItem.individualItems && foundItem.individualItems.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">
                    Selecione o Cartucho/Lote
                  </Label>
                  <div className="grid gap-2 max-h-48 overflow-auto">
                    {foundItem.individualItems.map((cartucho) => (
                      <button
                        key={cartucho.id}
                        type="button"
                        onClick={() => {
                          setSelectedCartucho(cartucho);
                          if (cartucho.levelCurrent !== undefined) {
                            setQuantity(String(cartucho.levelCurrent));
                          }
                        }}
                        className={`relative p-3 rounded-lg border-2 text-left transition-all ${
                          selectedCartucho?.id === cartucho.id
                            ? "border-sky-500 bg-sky-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        {selectedCartucho?.id === cartucho.id && (
                          <div className="absolute -top-2 -right-2 size-5 bg-sky-500 text-white rounded-full flex items-center justify-center">
                            <RiCloseLine className="size-3" />
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-mono text-sm font-medium">{cartucho.serial}</div>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                              <Badge
                                variant={
                                  cartucho.state === "NEW"
                                    ? "outline"
                                    : cartucho.state === "IN_USE"
                                    ? "default"
                                    : "secondary"
                                }
                                className="text-[10px]"
                              >
                                {cartucho.state}
                              </Badge>
                              {cartucho.channel && (
                                <Badge variant="outline" className="text-[10px]">
                                  Canal {cartucho.channel}
                                </Badge>
                              )}
                              {cartucho.machineName && (
                                <Badge variant="outline" className="text-[10px]">
                                  {cartucho.machineName}
                                </Badge>
                              )}
                            </div>
                          </div>
                          {cartucho.levelCurrent !== undefined && cartucho.levelCurrent !== null && cartucho.levelCapacity && (
                            <div className="text-right">
                              <div className="font-mono text-sm font-bold text-gray-900">
                                {cartucho.levelCurrent} / {cartucho.levelCapacity}{" "}
                                {cartucho.unit || foundItem.unit}
                              </div>
                              <div className="w-32 h-1.5 bg-gray-200 rounded-full mt-1 overflow-hidden">
                                <div
                                  className="h-full bg-sky-500 transition-all"
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      (cartucho.levelCurrent / cartucho.levelCapacity) * 100
                                    )}%`,
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Modo de operação */}
              <Separator />
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">
                  Modo de Operação
                </Label>
                <RadioGroup value={mode} onValueChange={(v) => setMode(v as "install" | "discharge")}>
                  <div className="flex flex-col gap-3">
                    <label className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                      <RadioGroupItem value="install" className="mt-0" />
                      <div>
                        <div className="font-medium text-gray-900">Instalar no canal (NEW → IN_USE)</div>
                        <div className="text-xs text-muted-foreground">
                          A tinta continua sendo da empresa, agora na máquina. O saldo só cai quando o cartucho é
                          descartado na troca.
                        </div>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                      <RadioGroupItem value="discharge" className="mt-0" />
                      <div>
                        <div className="font-medium text-gray-900 text-red-600">Registrar saída do depósito (OUT)</div>
                        <div className="text-xs text-muted-foreground">
                          Baixa integral do cartucho/lote selecionado. Para perda, devolução ou uso interno.
                        </div>
                      </div>
                    </label>
                  </div>
                </RadioGroup>
              </div>

              {/* Campo: Canal (apenas para instalar) */}
              {mode === "install" && (
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">
                    Canal de Instalação
                  </Label>
                  <Input
                    type="text"
                    value={channel}
                    onChange={(e) => setChannel(e.target.value.toUpperCase())}
                    placeholder="Ex: C, M, Y, K, LC, LM, OP"
                    className="h-11 rounded-xl text-uppercase"
                    maxLength={2}
                  />
                  <p className="text-xs text-muted-foreground">
                    Canais HP: C, LC, M, LM, Y, K, OP | Canais Konica: C, M, Y, K
                  </p>
                </div>
              )}

              {/* Quantidade */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">
                  Quantidade ({foundItem.unit})
                </Label>
                <Input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Quantidade a consumir/instalar"
                  className="h-11 rounded-xl"
                  min={1}
                  max={selectedCartucho?.levelCurrent ?? undefined}
                />
                {selectedCartucho?.levelCurrent !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    Disponível no cartucho/lote: {selectedCartucho.levelCurrent} {foundItem.unit}
                  </p>
                )}
              </div>
            </div>
          )}

          {!foundItem && searchCode.length >= 3 && !isSearching && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-center gap-2 text-amber-800">
                <RiInboxLine className="size-5" />
                <span className="font-medium">Código não encontrado</span>
              </div>
              <p className="text-sm text-amber-700 mt-1">
                Nenhuma tinta/toner encontrado com o c&oacute;digo <strong>&ldquo;{searchCode}&rdquo;</strong>.
                Confira o c&oacute;digo (ex: CZ683A para Ciano HP, CZ682A para Preto HP) ou use a busca por nome na
                tabela principal.
              </p>
            </div>
          )}

          {foundItem && !selectedCartucho && (
            <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl text-center">
              <RiTruckLine className="size-6 text-sky-500 mx-auto mb-2" />
              <p className="text-sm text-sky-800">
                Selecione um cartucho/lote acima para continuar
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={transaction.isPending || !foundItem || !selectedCartucho || !quantity}
            variant={mode === "discharge" ? "destructive" : "default"}
            className="w-full sm:w-auto"
          >
            {transaction.isPending
              ? "Processando…"
              : mode === "discharge"
              ? "Registrar Saída (OUT)"
              : "Instalar no Canal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}