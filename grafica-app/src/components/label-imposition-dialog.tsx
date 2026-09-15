"use client"

import React, { useState, useMemo, useEffect } from "react"
import QRCode from "qrcode"
import {
  RiPrinterLine,
  RiSearchLine,
  RiAddLine,
  RiRefreshLine,
  RiCloseLine,
  RiFlashlightLine,
} from "@remixicon/react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"
import { useStockItems, useBobinas, useGarrafas } from "@/lib/queries/stock"
import {
  type LabelItem,
  generateImpositionPdf,
  openPdfInBrowser,
} from "@/lib/labels/imposition"

interface LabelImpositionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Thumbnail de QR Code gerado 100% localmente no client-side (offline/intranet)
 */
function LocalQrThumbnail({ payload }: { payload: string }) {
  const [dataUrl, setDataUrl] = useState<string>("")

  useEffect(() => {
    let active = true
    QRCode.toDataURL(payload, {
      margin: 0,
      width: 100,
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (active) setDataUrl(url)
      })
      .catch((err) => {
        console.error("Erro gerando QR local:", err)
      })
    return () => {
      active = false
    }
  }, [payload])

  if (!dataUrl) {
    return (
      <div className="w-full h-full bg-neutral-200 text-[7px] text-neutral-600 flex items-center justify-center font-mono font-bold shrink-0 rounded-[1px]">
        QR
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={dataUrl} alt="QR" className="w-full h-full object-contain p-0.5" />
  )
}

// Itens padrão para demonstração ou caso o estoque esteja temporariamente vazio
const DEMO_ITEMS: LabelItem[] = [
  { id: "demo-1", code: "#5431", title: "Bobina Vinil 1.37m", type: "bobina", subtitle: "1.37m", details: "50m · Estoque Central", qrPayload: "BOB:5431" },
  { id: "demo-2", code: "#0374", title: "Lona 280g Brilho 1.60m", type: "bobina", subtitle: "1.60m", details: "50m · Depósito A", qrPayload: "BOB:0374" },
  { id: "demo-3", code: "#9519", title: "Lona 280g Brilho 1.60m", type: "bobina", subtitle: "1.60m", details: "50m · Depósito A", qrPayload: "BOB:9519" },
  { id: "demo-4", code: "#1157", title: "DP100GTS Brilho 1.06m", type: "bobina", subtitle: "1.06m", details: "50m · Prateleira B", qrPayload: "BOB:1157" },
  { id: "demo-5", code: "#T-CY", title: "Tinta Cyan UV Mimaki", type: "tinta", subtitle: "Cyan UV", details: "1000ml · Estoque", qrPayload: "TNK:TCY" },
  { id: "demo-6", code: "#T-MG", title: "Tinta Magenta UV Mimaki", type: "tinta", subtitle: "Magenta UV", details: "1000ml · Estoque", qrPayload: "TNK:TMG" },
  { id: "demo-7", code: "#T-YL", title: "Tinta Yellow UV Mimaki", type: "tinta", subtitle: "Yellow UV", details: "1000ml · Estoque", qrPayload: "TNK:TYL" },
  { id: "demo-8", code: "#T-BK", title: "Tinta Black UV Mimaki", type: "tinta", subtitle: "Black UV", details: "1000ml · Estoque", qrPayload: "TNK:TBK" },
]

export function LabelImpositionDialog({ open, onOpenChange }: LabelImpositionDialogProps) {
  const [activeTab, setActiveTab] = useState<"TODOS" | "BOBINA" | "TINTA">("TODOS")
  const [searchTerm, setSearchTerm] = useState("")

  // Parâmetros de Montagem Preps
  // isVertical: true = 35x90mm (8x5 = 40 un) | false = 90x35mm (3x12 = 36 un)
  const [isVertical, setIsVertical] = useState(true)
  const [gapMm, setGapMm] = useState<number>(3)
  const [marginMm, setMarginMm] = useState<number>(5)
  const [zoom, setZoom] = useState<number>(100)

  // Grade da Folha com a nova matemática (90x35mm)
  const cols = isVertical ? 8 : 3
  const rows = isVertical ? 5 : 12
  const totalSlots = cols * rows

  const [sheet, setSheet] = useState<(LabelItem | null)[]>(() => Array(40).fill(null))
  const [draggedFromIndex, setDraggedFromIndex] = useState<number | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  // Dados reais do estoque
  const { data: stockItems = [], isLoading: loadingStock } = useStockItems()
  const { data: bobinas = [], isLoading: loadingBobinas } = useBobinas()
  const { data: garrafas = [], isLoading: loadingGarrafas } = useGarrafas()

  const stockMap = useMemo(() => new Map(stockItems.map((i) => [i.id, i])), [stockItems])

  // Transforma todas as bobinas ativas em LabelItems
  const bobinaLabelItems: LabelItem[] = useMemo(() => {
    return bobinas
      .filter((b) => b.state !== "USED")
      .map((b) => {
        const item = stockMap.get(b.stockItemId)
        const digits = b.serial.replace(/\D/g, "") || b.serial
        return {
          id: `bob-${b.id}`,
          type: "bobina" as const,
          code: `#${digits}`,
          title: item?.name || "Bobina de Mídia",
          subtitle: item?.width ? `${item.width}m` : (item?.subType || "Mídia"),
          details: `${b.metersRemaining?.toFixed(1) ?? 0}m · ${b.location || "Estoque"}`,
          qrPayload: `BOB:${digits}`,
        }
      })
  }, [bobinas, stockMap])

  // Transforma todas as garrafas ativas em LabelItems
  const garrafaLabelItems: LabelItem[] = useMemo(() => {
    return garrafas
      .filter((g) => g.state !== "USED")
      .map((g) => {
        const item = stockMap.get(g.stockItemId)
        const digits = g.serial.replace(/\D/g, "") || g.serial
        return {
          id: `tnk-${g.id}`,
          type: "tinta" as const,
          code: `#${digits}`,
          title: item?.name || "Insumo de Tinta",
          subtitle: item?.subType || "Tinta",
          details: `${g.mlRemaining ?? 0}ml · ${g.location || "Estoque"}`,
          qrPayload: `TNK:${digits}`,
        }
      })
  }, [garrafas, stockMap])

  // Lista agregada de materiais do estoque com fallback para demonstração
  const allItems = useMemo(() => {
    const list = [...bobinaLabelItems, ...garrafaLabelItems]
    return list.length > 0 ? list : DEMO_ITEMS
  }, [bobinaLabelItems, garrafaLabelItems])

  // Filtro de itens da lista lateral
  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      const matchesTab =
        activeTab === "TODOS" ||
        (activeTab === "BOBINA" && item.type === "bobina") ||
        (activeTab === "TINTA" && item.type === "tinta")

      const q = searchTerm.trim().toLowerCase()
      const matchesSearch =
        !q ||
        item.code.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(q))

      return matchesTab && matchesSearch
    })
  }, [allItems, activeTab, searchTerm])

  // Alterna orientação recalculando a chapa
  const toggleOrientation = () => {
    const nextVertical = !isVertical
    const newTotal = nextVertical ? 8 * 5 : 3 * 12
    setIsVertical(nextVertical)
    setSheet((prev) => {
      const next = Array(newTotal).fill(null)
      for (let i = 0; i < Math.min(prev.length, newTotal); i++) {
        next[i] = prev[i]
      }
      return next
    })
  }

  // Drag & Drop Handlers (destravados com e.preventDefault())
  const handleDragStartFromList = (e: React.DragEvent, item: LabelItem) => {
    setDraggedFromIndex(null)
    e.dataTransfer.setData("application/json", JSON.stringify(item))
  }

  const handleDragStartFromSlot = (e: React.DragEvent, index: number) => {
    const item = sheet[index]
    if (!item) return
    setDraggedFromIndex(index)
    e.dataTransfer.setData("application/json", JSON.stringify(item))
  }

  const handleDropOnSlot = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    const rawData = e.dataTransfer.getData("application/json")
    if (!rawData) return

    try {
      const droppedItem: LabelItem = JSON.parse(rawData)
      const newSheet = [...sheet]

      if (draggedFromIndex !== null) {
        // Movendo de um slot para outro (Swap ou Move)
        const existingTargetItem = newSheet[targetIndex]
        newSheet[targetIndex] = droppedItem
        newSheet[draggedFromIndex] = existingTargetItem
      } else {
        // Vindo da lista lateral
        newSheet[targetIndex] = droppedItem
      }

      setSheet(newSheet)
      setDraggedFromIndex(null)
    } catch (err) {
      console.error(err)
    }
  }

  // AutoGang: Preenche slots vazios com os itens filtrados
  const handleAutoGang = () => {
    if (filteredItems.length === 0) {
      toast.warning("Nenhum insumo disponível para AutoGang.")
      return
    }
    const newSheet = [...sheet]
    let itemIdx = 0
    for (let i = 0; i < newSheet.length; i++) {
      if (!newSheet[i]) {
        newSheet[i] = filteredItems[itemIdx % filteredItems.length]
        itemIdx++
      }
    }
    setSheet(newSheet)
    toast.success("Chapa preenchida via AutoGang!")
  }

  // Gerar PDF para Konica
  const handleGeneratePdf = async () => {
    const occupied = sheet.filter(Boolean)
    if (occupied.length === 0) {
      toast.warning("A chapa está vazia. Adicione ao menos uma etiqueta.")
      return
    }

    setIsGenerating(true)
    try {
      const pdfBytes = await generateImpositionPdf(sheet, {
        rotation: isVertical ? 90 : 0,
        marginMm,
        gapMm,
      })
      openPdfInBrowser(
        pdfBytes,
        `imposicao-konica-90x35mm-${isVertical ? "vertical" : "horizontal"}-${Date.now()}.pdf`
      )
      toast.success("PDF pronto para a Konica gerado com sucesso!")
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : "Erro ao gerar PDF de imposição.")
    } finally {
      setIsGenerating(false)
    }
  }

  const filledCount = sheet.filter(Boolean).length
  const occupancyPercent = Math.round((filledCount / totalSlots) * 100)
  const isLoading = loadingStock || loadingBobinas || loadingGarrafas

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[98vw] w-[98vw] h-[95vh] max-h-[960px] p-0 flex flex-col gap-0 rounded-[20px] overflow-hidden bg-neutral-950 text-neutral-200 select-none font-sans border border-neutral-800 shadow-2xl">
        <DialogTitle className="sr-only">Mesa de Imposição SRA3</DialogTitle>

        {/* 1. BARRA DE FERRAMENTAS ESTILO KODAK PREPS */}
        <header className="h-14 bg-neutral-900 border-b border-neutral-800 px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-bold text-sm text-white tracking-wide">Mesa de Imposição SRA3</span>
            </div>

            <div className="h-4 w-px bg-neutral-700 hidden sm:block" />

            {/* Ajuste de Margem e Gap em tempo real */}
            <div className="flex items-center gap-3 text-xs text-neutral-300">
              <label className="flex items-center gap-1.5">
                <span>Gap:</span>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={gapMm}
                  onChange={(e) => setGapMm(Math.max(0, Number(e.target.value)))}
                  className="w-12 bg-neutral-950 border border-neutral-700 rounded px-1.5 py-0.5 text-center text-white focus:outline-none focus:border-amber-500 font-mono"
                />
                <span className="text-neutral-500">mm</span>
              </label>

              <label className="flex items-center gap-1.5">
                <span>Margem:</span>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={marginMm}
                  onChange={(e) => setMarginMm(Math.max(0, Number(e.target.value)))}
                  className="w-12 bg-neutral-950 border border-neutral-700 rounded px-1.5 py-0.5 text-center text-white focus:outline-none focus:border-amber-500 font-mono"
                />
                <span className="text-neutral-500">mm</span>
              </label>
            </div>
          </div>

          {/* Controles Centrais e Ações */}
          <div className="flex items-center gap-2.5">
            {/* Zoom estilo Preps */}
            <div className="flex items-center bg-neutral-950 border border-neutral-800 rounded p-0.5 text-xs">
              <button
                onClick={() => setZoom((z) => Math.max(z - 15, 50))}
                className="px-2 py-1 hover:bg-neutral-800 text-neutral-300 rounded transition font-bold"
                title="Reduzir Zoom"
              >
                −
              </button>
              <span className="px-2 font-mono text-[11px] text-neutral-400 min-w-[45px] text-center">
                {zoom}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(z + 15, 180))}
                className="px-2 py-1 hover:bg-neutral-800 text-neutral-300 rounded transition font-bold"
                title="Aumentar Zoom"
              >
                +
              </button>
              <button
                onClick={() => setZoom(100)}
                className="px-2 py-1 border-l border-neutral-800 hover:bg-neutral-800 text-[10px] text-neutral-400 transition"
              >
                100%
              </button>
            </div>

            {/* Alternar Orientação */}
            <button
              onClick={toggleOrientation}
              className="text-xs px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-neutral-200 transition font-medium flex items-center gap-1.5"
            >
              <RiRefreshLine className="size-3.5 text-neutral-400" />
              {isVertical ? "Vertical (8×5 = 40 un)" : "Horizontal (3×12 = 36 un)"}
            </button>

            {/* AutoGang */}
            <button
              onClick={handleAutoGang}
              className="text-xs px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg shadow-md shadow-amber-950/40 transition flex items-center gap-1.5"
            >
              <RiFlashlightLine className="size-3.5" />
              AutoGang
            </button>

            {/* Limpar Chapa */}
            <button
              onClick={() => setSheet(Array(totalSlots).fill(null))}
              className="text-xs text-neutral-400 hover:text-red-400 px-2 py-1 transition rounded-lg hover:bg-neutral-800"
            >
              Limpar
            </button>

            {/* Fechar */}
            <button
              onClick={() => onOpenChange(false)}
              className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition ml-1"
            >
              <RiCloseLine className="size-5" />
            </button>
          </div>
        </header>

        {/* 2. ÁREA DE TRABALHO (2 COLUNAS) */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* LATERAL: BANCO DE ETIQUETAS */}
          <aside className="w-80 bg-neutral-900/60 border-r border-neutral-800 flex flex-col shrink-0">
            {/* Abas */}
            <div className="flex border-b border-neutral-800 bg-neutral-900">
              {(["TODOS", "BOBINA", "TINTA"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2.5 text-xs font-semibold transition border-b-2 ${
                    activeTab === tab
                      ? "border-amber-500 text-amber-400 bg-neutral-800/40"
                      : "border-transparent text-neutral-400 hover:text-white"
                  }`}
                >
                  {tab === "TODOS" ? "Todos" : tab === "BOBINA" ? "Bobinas" : "Tintas"}
                </button>
              ))}
            </div>

            {/* Busca */}
            <div className="p-3 border-b border-neutral-800/60">
              <div className="relative">
                <RiSearchLine className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-neutral-500" />
                <input
                  type="text"
                  placeholder="Buscar código (#5431) ou nome..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 pl-8 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Lista de Itens com Drag */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
              <div className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider mb-1 flex items-center justify-between">
                <span>Arraste para a chapa ou clique no (+)</span>
                <span>{filteredItems.length} un</span>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center h-40 gap-2 text-xs text-neutral-400">
                  <Spinner className="size-4" /> Carregando insumos…
                </div>
              ) : (
                filteredItems.map((item) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => handleDragStartFromList(e, item)}
                    className="p-2.5 bg-neutral-900 border border-neutral-800 hover:border-amber-500/70 rounded-md cursor-grab active:cursor-grabbing transition group flex items-center justify-between"
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="font-mono text-xs font-bold text-amber-400">
                          {item.code}
                        </span>
                        <span className="text-[9px] px-1 py-0.2 bg-neutral-800 text-neutral-400 rounded font-semibold font-mono">
                          {item.subtitle}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-200 truncate font-medium">{item.title}</p>
                      <p className="text-[10px] text-neutral-500 truncate mt-0.5">{item.details}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        // Adiciona no primeiro slot livre
                        const firstEmpty = sheet.findIndex((s) => s === null)
                        if (firstEmpty !== -1) {
                          const newSheet = [...sheet]
                          newSheet[firstEmpty] = item
                          setSheet(newSheet)
                        } else {
                          toast.warning("A folha está cheia.")
                        }
                      }}
                      className="w-7 h-7 rounded bg-neutral-800 hover:bg-amber-600 text-neutral-300 hover:text-white flex items-center justify-center font-bold text-sm transition shrink-0"
                      title="Colocar no próximo slot vazio"
                    >
                      <RiAddLine className="size-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </aside>

          {/* CENTRO: MESA DE MONTAGEM (CANVAS COM ZOOM E MARCAS PREPS) */}
          <main className="flex-1 bg-neutral-950 p-8 overflow-auto flex items-center justify-center relative">
            {/* Prancha SRA3 (Escala base 330 x 480 mm) */}
            <div
              style={{
                transform: `scale(${zoom / 100})`,
                transformOrigin: "center center",
                transition: "transform 0.15s ease-out",
                width: isVertical ? "920px" : "840px",
                height: isVertical ? "650px" : "680px",
              }}
              className="bg-white text-black p-3 rounded shadow-2xl relative border border-neutral-400 shrink-0 select-none"
            >
              {/* Header da chapa com dados técnicos */}
              <div className="absolute -top-6 left-0 right-0 flex justify-between text-[11px] font-mono text-neutral-400 px-1">
                <span>FOLHA SRA3: 330 × 480 mm</span>
                <span>
                  ÁREA ÚTIL: {330 - marginMm * 2} × {480 - marginMm * 2} mm
                </span>
                <span>
                  MARGEM: {marginMm}mm | GAP: {gapMm}mm | ETIQUETA: 90×35mm
                </span>
              </div>

              {/* Linha de Margem de Segurança da Konica (5mm) */}
              <div className="w-full h-full border border-dashed border-red-400 p-1 relative flex flex-col">
                {/* Grid de Imposição das Etiquetas */}
                <div
                  className="w-full h-full grid"
                  style={{
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                    gap: `${gapMm}px`,
                  }}
                >
                  {sheet.map((slot, idx) => (
                    <div
                      key={idx}
                      onDragOver={(e) => {
                        e.preventDefault() // Crucial: destrava o Drop no navegador
                        e.dataTransfer.dropEffect = "copy"
                      }}
                      onDrop={(e) => handleDropOnSlot(e, idx)}
                      draggable={!!slot}
                      onDragStart={(e) => handleDragStartFromSlot(e, idx)}
                      className={`relative border border-black flex flex-col justify-between overflow-hidden transition ${
                        slot
                          ? "bg-white cursor-grab active:cursor-grabbing hover:ring-1 hover:ring-amber-500"
                          : "border-dashed border-neutral-300 bg-neutral-100/50 hover:bg-amber-50/80 hover:border-amber-400"
                      }`}
                    >
                      {slot ? (
                        <div className="w-full h-full flex p-1 items-center gap-1.5 relative pointer-events-none">
                          {/* QR Code Vetorial Dinâmico Offline */}
                          <div className="w-9 h-9 bg-neutral-100 border border-neutral-300 flex items-center justify-center shrink-0">
                            <LocalQrThumbnail payload={slot.qrPayload} />
                          </div>

                          {/* Dados da Etiqueta */}
                          <div className="min-w-0 flex-1 leading-none">
                            <span className="font-mono font-black text-[11px] block text-black">
                              {slot.code}
                            </span>
                            <span className="text-[8px] font-bold block text-neutral-800 truncate mt-0.5">
                              {slot.title}
                            </span>
                            <span className="text-[7px] text-neutral-500 block mt-0.5">
                              {slot.subtitle} · {slot.details}
                            </span>
                          </div>

                          {/* Botão de Remover Slot */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              const newSheet = [...sheet]
                              newSheet[idx] = null
                              setSheet(newSheet)
                            }}
                            className="pointer-events-auto absolute top-0.5 right-0.5 text-neutral-400 hover:text-red-600 text-[10px] font-bold px-1 rounded hover:bg-neutral-100 transition"
                            title="Remover da chapa"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center pointer-events-none">
                          <span className="text-[9px] font-mono text-neutral-300">
                            #{idx + 1}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </main>
        </div>

        {/* 3. RODAPÉ DE STATUS E IMPRESSÃO */}
        <footer className="h-12 bg-neutral-900 border-t border-neutral-800 px-6 flex items-center justify-between shrink-0">
          <div className="text-xs text-neutral-400 font-mono">
            Ocupação da chapa: <strong className="text-white font-mono">{filledCount}</strong> de{" "}
            <strong className="text-white font-mono">{totalSlots}</strong> posições (
            <span className="text-amber-400 font-bold font-mono">{occupancyPercent}%</span>)
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleGeneratePdf}
              disabled={isGenerating || filledCount === 0}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs px-5 py-2 rounded shadow transition flex items-center gap-2"
            >
              {isGenerating ? (
                <>
                  <Spinner className="size-4" /> Gerando PDF SRA3…
                </>
              ) : (
                <>
                  <RiPrinterLine className="size-4" /> Gerar PDF SRA3 para Konica ({filledCount} un)
                </>
              )}
            </button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
