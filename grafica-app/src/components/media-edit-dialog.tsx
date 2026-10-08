"use client"

import { useState } from "react"
import { toast } from "sonner"
import { RiAddLine, RiArrowLeftLine, RiCheckLine, RiSearchLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { useUpdateJob, type PrintJobRow } from "@/lib/queries/jobs"
import { useStockItems, useCreateStockItem } from "@/lib/queries/stock"
import { isKonicaMachine, type Machine, type StockItem } from "@/lib/api"

interface MediaEditDialogProps {
  job: PrintJobRow | null
  machine?: Machine
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MediaEditDialog({ job, machine, open, onOpenChange }: MediaEditDialogProps) {
  const [search, setSearch] = useState("")
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  // Campos para criação rápida
  const [newName, setNewName] = useState("")
  const [newWidth, setNewWidth] = useState("1.52")
  const [newQuantity, setNewQuantity] = useState("50")
  const [newMinQuantity, setNewMinQuantity] = useState("10")

  const { data: stockItems = [], isLoading: isLoadingStock } = useStockItems("PAPER_MEDIA")
  const updateJob = useUpdateJob()
  const createStockItem = useCreateStockItem()

  // Modo de impressão Konica (Duplex / Simplex) e folhas
  const isKonica = machine ? (isKonicaMachine(machine) || /konica|accurio/i.test(machine.brand) || machine.technology === "Laser") : false
  const [printMode, setPrintMode] = useState<"DUPLEX" | "SIMPLEX">("SIMPLEX")
  const [sheets, setSheets] = useState<string>("")

  // Inicializa o formulário quando o dialog abre para um novo job (adjust during render)
  const [lastInitKey, setLastInitKey] = useState("")
  const initKey = `${job?.id ?? "none"}:${open ? "open" : "closed"}`
  if (initKey !== lastInitKey) {
    setLastInitKey(initKey)
    if (job && open) {
      setSearch(job.mediaType ?? "")
      setIsCreating(false)

      const isDuplexInit = job.printMode === "DUPLEX" || (!job.printMode && /(?:frente[\s_-]*(?:e[\s_-]*)?(?:verso|tr[aá]s|costas)|f[\/_-]v\b|\b[14]\s*[xX]\s*[142]\b|\bduplex\b)/i.test(job.jobName || ""))
      setPrintMode(isDuplexInit ? "DUPLEX" : "SIMPLEX")
      setSheets(job.sheets ? String(job.sheets) : "")

      // Determina largura padrão da máquina
      const defaultW = machine?.telemetry?.mediaWidthMm
        ? machine.telemetry.mediaWidthMm > 10
          ? (machine.telemetry.mediaWidthMm / 1000).toFixed(2)
          : machine.telemetry.mediaWidthMm.toFixed(2)
        : "1.52"
      setNewWidth(defaultW)

      // Tenta encontrar o item atual
      if (job.mediaType && stockItems.length > 0) {
        const found = stockItems.find(
          (i) => i.name.toLowerCase() === job.mediaType?.toLowerCase()
        )
        setSelectedItem(found ?? null)
      } else {
        setSelectedItem(null)
      }
    }
  }

  const filteredItems = stockItems.filter((item) => {
    if (!search.trim()) return true
    return item.name.toLowerCase().includes(search.toLowerCase())
  })

  function handleStartCreate() {
    setNewName(search.trim() || job?.mediaType || "")
    setIsCreating(true)
  }

  async function handleCreateAndBind() {
    if (!newName.trim()) {
      toast.error("Informe o nome da nova mídia.")
      return
    }
    const widthNum = parseFloat(newWidth.replace(",", "."))
    const qtyNum = parseFloat(newQuantity.replace(",", ".")) || 0
    const minNum = parseFloat(newMinQuantity.replace(",", ".")) || 0

    try {
      const createdItem = await createStockItem.mutateAsync({
        name: newName.trim(),
        category: "PAPER_MEDIA",
        unit: "m",
        width: Number.isFinite(widthNum) && widthNum > 0 ? widthNum : 1.52,
        currentQuantity: qtyNum,
        minQuantity: minNum,
        machineIds: machine?.id ? [machine.id] : [],
      })

      if (job) {
        await updateJob.mutateAsync({
          id: job.id,
          mediaType: createdItem.name,
        })
      }

      toast.success(`Mídia "${createdItem.name}" criada e vinculada com sucesso!`)
      onOpenChange(false)
    } catch {
      toast.error("Erro ao cadastrar nova mídia.")
    }
  }

  function handleTogglePrintMode(newMode: "DUPLEX" | "SIMPLEX") {
    setPrintMode(newMode)
    if (!job) return

    const pages = job.pages || 1
    let copies = 1
    try {
      const raw = JSON.parse(job.rawDataJson || "{}")
      copies = Number(raw.copiesPrinted || 1)
    } catch {}
    if (!Number.isFinite(copies) || copies <= 0) copies = 1

    if (newMode === "DUPLEX") {
      const sheetsPerCopy = Math.ceil(pages / 2)
      setSheets(String(Math.max(1, sheetsPerCopy * copies)))
    } else {
      setSheets(String(Math.max(1, pages * copies)))
    }
  }

  async function handleSaveSelection() {
    if (!job) return
    const mediaName = selectedItem ? selectedItem.name : search.trim()
    if (!mediaName) {
      toast.error("Selecione ou digite o nome de uma mídia.")
      return
    }

    try {
      await updateJob.mutateAsync({
        id: job.id,
        mediaType: mediaName,
        printMode: isKonica ? printMode : undefined,
        sheets: isKonica && sheets ? parseFloat(sheets.replace(",", ".")) : undefined,
      })
      toast.success("Job atualizado com sucesso!")
      onOpenChange(false)
    } catch {
      toast.error("Erro ao atualizar mídia do job.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isCreating ? "Cadastrar Nova Mídia" : "Editar Mídia do Job"}</DialogTitle>
          <DialogDescription className="line-clamp-1 break-all">
            {job?.jobName}
          </DialogDescription>
        </DialogHeader>

        {isCreating ? (
          <div className="space-y-3.5 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-700">Nome da Mídia / Perfil</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: STARPAC vinil brilho 1.52m"
                className="h-10 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-700">Largura do rolo (m)</Label>
                <Input
                  value={newWidth}
                  onChange={(e) => setNewWidth(e.target.value)}
                  placeholder="Ex: 1.52 ou 1.06"
                  className="h-10 rounded-xl font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-700">Estoque inicial (m)</Label>
                <Input
                  value={newQuantity}
                  onChange={(e) => setNewQuantity(e.target.value)}
                  placeholder="Ex: 50"
                  className="h-10 rounded-xl font-mono"
                />
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Esta mídia será cadastrada no estoque com categoria Mídia de Rolo (m) e vinculada
              automaticamente à máquina <strong>{machine?.name ?? "atual"}</strong>.
            </p>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="relative">
              <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setSelectedItem(null)
                }}
                placeholder="Buscar mídia no estoque ou digitar nome..."
                className="pl-9 h-10 rounded-xl"
              />
            </div>

            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
              {filteredItems.map((item) => {
                const isSelected =
                  selectedItem?.id === item.id ||
                  search.trim().toLowerCase() === item.name.toLowerCase()
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedItem(item)
                      setSearch(item.name)
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm text-left transition-colors ${
                      isSelected
                        ? "border-primary/60 bg-primary/5 text-primary"
                        : "border-gray-150 hover:bg-gray-50 text-gray-800"
                    }`}
                  >
                    <div>
                      <p className="font-medium text-gray-900">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.currentQuantity} {item.unit}
                        {item.width ? ` · rolo ${item.width}m` : ""}
                      </p>
                    </div>
                    {isSelected && <RiCheckLine className="size-4 text-primary shrink-0" />}
                  </button>
                )
              })}

              {filteredItems.length === 0 && !isLoadingStock && (
                <div className="py-4 text-center space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Nenhuma mídia encontrada com o nome &ldquo;{search}&rdquo;.
                  </p>
                </div>
              )}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleStartCreate}
              className="w-full rounded-xl gap-2 text-xs font-medium border-dashed border-primary/40 text-primary hover:bg-primary/5"
            >
              <RiAddLine className="size-4" />
              {search.trim() ? `Criar mídia "${search.trim()}"` : "Cadastrar nova mídia no estoque"}
            </Button>

            {isKonica && (
              <div className="pt-3 border-t border-gray-150 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-700">Modo de Impressão (Konica)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleTogglePrintMode("SIMPLEX")}
                      className={`px-3 py-2 rounded-xl border text-xs font-medium text-center transition-all ${
                        printMode === "SIMPLEX"
                          ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      Só Frente (Simplex)
                      <span className="block text-[10px] font-normal text-muted-foreground mt-0.5">1 pág = 1 folha</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTogglePrintMode("DUPLEX")}
                      className={`px-3 py-2 rounded-xl border text-xs font-medium text-center transition-all ${
                        printMode === "DUPLEX"
                          ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      Frente e Verso (Duplex)
                      <span className="block text-[10px] font-normal text-muted-foreground mt-0.5">2 págs = 1 folha</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-gray-700">Folhas Físicas a Debitar</Label>
                    <span className="text-[11px] text-muted-foreground">
                      {job?.pages ?? 1} pág(s) no arquivo
                    </span>
                  </div>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={sheets}
                    onChange={(e) => setSheets(e.target.value)}
                    className="h-9 rounded-xl font-mono text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {printMode === "DUPLEX"
                      ? "Frente e verso: cada folha consome 2 páginas do arquivo."
                      : "Só frente: cada página consome 1 folha inteira."}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {isCreating ? (
            <>
              <Button
                variant="outline"
                onClick={() => setIsCreating(false)}
                className="rounded-xl gap-1.5"
              >
                <RiArrowLeftLine className="size-4" />
                Voltar
              </Button>
              <Button
                onClick={handleCreateAndBind}
                disabled={createStockItem.isPending}
                className="rounded-xl font-semibold"
              >
                {createStockItem.isPending ? "Cadastrando..." : "Cadastrar e Vincular"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
                Cancelar
              </Button>
              <Button
                onClick={handleSaveSelection}
                disabled={updateJob.isPending}
                className="rounded-xl font-semibold"
              >
                {updateJob.isPending ? "Salvando..." : "Salvar Mídia"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
