"use client"

import { useEffect, useRef, useState, useMemo } from "react"
import { RiCheckLine, RiSearchLine, RiAlertLine, RiInformationLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { useStockItems, useBobinas } from "@/lib/queries/stock"
import { useChangeBobina } from "@/lib/queries/machines"
import type { Machine, Bobina } from "@/lib/api"

interface MediaSelectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  machine: Machine
  activeBobina?: Bobina | null
}

/**
 * Normaliza códigos digitados pelo operador:
 * Aceita "BOB-1042", "BOB:1042", "#1042" ou apenas "1042".
 */
function extractDigits(str: string): string {
  return str.replace(/\D/g, "")
}

export function MediaSelectDialog({ open, onOpenChange, machine, activeBobina }: MediaSelectDialogProps) {
  const [search, setSearch] = useState("")
  const [oldBobinaAction, setOldBobinaAction] = useState<"FINISHED" | "RETURN_TO_STOCK">("FINISHED")
  const [pendingTransfer, setPendingTransfer] = useState<Bobina | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: stockItems = [], isLoading: loadingStock } = useStockItems("PAPER_MEDIA")
  const { data: bobinas = [], isLoading: loadingBobinas } = useBobinas()
  const changeBobina = useChangeBobina()

  const [lastOpen, setLastOpen] = useState(false)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setSearch("")
      setOldBobinaAction("FINISHED")
      setPendingTransfer(null)
      setErrorMessage(null)
    }
  }

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 50)
      return () => clearTimeout(t)
    }
  }, [open])

  const stockNameById = useMemo(() => new Map(stockItems.map((i) => [i.id, i.name])), [stockItems])

  const queryDigits = extractDigits(search)
  const q = search.trim().toLowerCase()

  const filtered = useMemo(() => {
    return bobinas.filter((b) => {
      if (!q) return true
      const name = stockNameById.get(b.stockItemId) ?? ""
      const bDigits = extractDigits(b.serial)

      // Correspondência por dígitos (ex: "1042" encontra "BOB-1042")
      const digitMatch = queryDigits && bDigits.includes(queryDigits)

      return (
        digitMatch ||
        b.serial.toLowerCase().includes(q) ||
        name.toLowerCase().includes(q) ||
        (b.location ?? "").toLowerCase().includes(q)
      )
    })
  }, [bobinas, q, queryDigits, stockNameById])

  // Executa a troca de bobina via API
  async function executeSelect(b: Bobina) {
    if (b.state === "USED") {
      setErrorMessage(`A bobina ${b.serial} já foi encerrada/descartada.`)
      inputRef.current?.select()
      return
    }

    try {
      await changeBobina.mutateAsync({
        machineId: machine.id,
        newBobinaId: b.serial,
        oldBobinaAction: activeBobina ? oldBobinaAction : "FINISHED",
      })
      toast.success(`Bobina ${b.serial} vinculada à ${machine.name}!`)
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao trocar bobina."
      setErrorMessage(msg)
      toast.error(msg)
      inputRef.current?.select()
    }
  }

  // Verifica se há conflito de máquina ativa
  function checkConflict(b: Bobina): boolean {
    if (b.state !== "IN_USE") return false
    if (!b.location) return false
    // Se a bobina já estiver nesta máquina atual, não há conflito de transferência entre máquinas
    if (activeBobina?.id === b.id) return false
    if (machine?.name && b.location.toLowerCase().includes(machine.name.toLowerCase())) return false
    return true
  }

  // Tratamento da seleção (seja por clique ou Enter)
  function handleSelect(b: Bobina) {
    setErrorMessage(null)

    const isConflict = checkConflict(b)
    if (isConflict) {
      if (pendingTransfer?.id === b.id) {
        // Segundo Enter ou clique de confirmação: executa transferência
        executeSelect(b)
      } else {
        // Primeiro Enter: exige confirmação do operador
        setPendingTransfer(b)
        toast.warning(
          `Bobina está ativa na máquina "${b.location}". Pressione Enter novamente para confirmar a transferência.`
        )
      }
    } else {
      executeSelect(b)
    }
  }

  // Manipulador da tecla Enter no campo de busca (ADR-014 Quick-Switch)
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()

      // Se já estava com confirmação de transferência pendente, o segundo Enter executa
      if (pendingTransfer) {
        executeSelect(pendingTransfer)
        return
      }

      if (!search.trim()) {
        if (filtered.length > 0) {
          handleSelect(filtered[0])
        }
        return
      }

      // Procura correspondência exata por código numérico ou serial
      const exactMatch =
        bobinas.find(
          (b) =>
            b.serial.toLowerCase() === q ||
            (queryDigits && extractDigits(b.serial) === queryDigits)
        ) || (filtered.length === 1 ? filtered[0] : null)

      if (exactMatch) {
        handleSelect(exactMatch)
      } else {
        // Regra alinhada no Socratic Gate:
        // Manter o modal F2 aberto com aviso visual de erro, preservando o texto selecionado para correção rápida.
        setErrorMessage(`Nenhuma bobina encontrada para "${search}". Verifique o código.`)
        inputRef.current?.select()
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-[24px]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              Selecionar Bobina
              <Badge variant="outline" className="font-mono text-xs font-semibold">
                F2 Quick-Switch
              </Badge>
            </DialogTitle>
          </div>
          <DialogDescription>
            {machine ? `Canal: ${machine.name}` : "Digite o código da bobina ou nome do material"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {activeBobina && (
            <div className="space-y-1.5 p-2.5 bg-gray-50 border border-gray-150 rounded-xl">
              <Label className="text-xs font-medium text-gray-700">
                Bobina em uso: <span className="font-mono font-bold text-gray-900">{activeBobina.serial}</span>
              </Label>
              <Select value={oldBobinaAction} onValueChange={(v) => v && setOldBobinaAction(v)}>
                <SelectTrigger className="h-9 text-xs bg-white rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FINISHED">Acabou (Descartar)</SelectItem>
                  <SelectItem value="RETURN_TO_STOCK">Voltou para o Estoque</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Alerta de Conflito de Transferência (ADR-014: Confirmação com segundo Enter) */}
          {pendingTransfer && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex flex-col gap-2 animate-in fade-in">
              <div className="flex items-start gap-2">
                <RiAlertLine className="size-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-950">Atenção: Transferência entre Máquinas</p>
                  <p className="mt-0.5">
                    A bobina <span className="font-mono font-bold">{pendingTransfer.serial}</span> consta em uso em{" "}
                    <strong>{pendingTransfer.location}</strong>.
                  </p>
                  <p className="mt-1 font-semibold text-amber-900">
                    Pressione <kbd className="px-1 py-0.5 bg-amber-100 border border-amber-300 rounded font-mono text-[10px]">Enter</kbd> novamente para confirmar.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => executeSelect(pendingTransfer)}
                className="self-end h-7 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold"
              >
                Confirmar Transferência (Enter)
              </Button>
            </div>
          )}

          {/* Alerta de Erro Visual Inline */}
          {errorMessage && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-center gap-2 animate-in fade-in">
              <RiInformationLine className="size-4 shrink-0 text-red-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Input de Busca com Normalização e Captura de Enter */}
          <div className="relative">
            <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setErrorMessage(null)
                if (pendingTransfer) setPendingTransfer(null)
              }}
              onKeyDown={handleKeyDown}
              placeholder="Digite o código (ex: 1042 ou BOB-1042) + Enter..."
              className="pl-9 h-10 rounded-xl"
            />
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
            {filtered.map((b) => {
              const name = stockNameById.get(b.stockItemId) ?? "Mídia desconhecida"
              const isActive = activeBobina?.id === b.id
              const isPendingThis = pendingTransfer?.id === b.id
              const isConflicting = checkConflict(b)

              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => handleSelect(b)}
                  disabled={changeBobina.isPending || b.state === "USED"}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    isPendingThis
                      ? "border-amber-400 bg-amber-50/70 ring-2 ring-amber-300/40"
                      : isActive
                      ? "border-primary/40 bg-primary/5"
                      : "border-gray-150 hover:bg-gray-50 text-gray-800"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{name}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono font-semibold text-gray-800">{b.serial}</span> ·{" "}
                      {b.metersRemaining?.toFixed(2)}m restantes · {b.location}
                      {isActive ? " · em uso nesta máquina" : ""}
                      {isConflicting && !isActive ? ` · ativa em ${b.location}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <Badge
                      variant={
                        b.state === "IN_USE"
                          ? isConflicting
                            ? "outline"
                            : "default"
                          : "secondary"
                      }
                      className={isConflicting ? "border-amber-400 text-amber-700 bg-amber-50" : ""}
                    >
                      {b.state === "IN_USE" ? (isConflicting ? "Em outra máquina" : "Em Uso") : "Nova"}
                    </Badge>
                    {isActive && <RiCheckLine className="size-4 text-primary" />}
                  </div>
                </button>
              )
            })}

            {filtered.length === 0 && !loadingBobinas && !loadingStock && (
              <div className="py-4 text-center space-y-1">
                <p className="text-xs text-muted-foreground">
                  Nenhuma bobina encontrada com &ldquo;{search}&rdquo;.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <span className="text-[11px] text-muted-foreground font-mono">
            Dica: Digite o número e tecle <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-300 rounded font-sans text-[10px]">Enter</kbd>
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}