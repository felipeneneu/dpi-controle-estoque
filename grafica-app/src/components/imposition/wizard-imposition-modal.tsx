'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  FileUp,
  Layers,
  Cpu,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Play,
  Sparkles,
  RefreshCw,
  FileText,
  RotateCw,
  Grid,
  Check,
  Package,
  Info,
  FolderOpen,
} from 'lucide-react';
import {
  calculateRollImposition,
  RollCalculationResult,
  ImpositionFillMode,
} from '@/lib/imposition-roll-math';
import { useBobinas, useStockItems } from '@/lib/queries/stock';

export type ImpositionEngine = 'CLI_NET' | 'ILLUSTRATOR_COM';

export interface BobinaEstoque {
  id: string;
  codigo?: string;
  nome: string;
  larguraMm: number;
  tipo?: string;
}

export interface WizardImpositionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (jobResult: any) => void;
}

interface SubstratoPreset {
  id: string;
  nome: string;
  categoria: 'Bobina' | 'Chapa' | 'Folha' | 'Personalizado';
  larguraUtilMm: number;
  avancoPadraoMm: number;
  descricao?: string;
}

const PRESET_SUBSTRATOS: SubstratoPreset[] = [
  { id: 'bob-75', nome: 'Bobina 0.75m', categoria: 'Bobina', larguraUtilMm: 665, avancoPadraoMm: 986, descricao: 'Útil 665 mm' },
  { id: 'bob-100', nome: 'Bobina 1.00m', categoria: 'Bobina', larguraUtilMm: 950, avancoPadraoMm: 1000, descricao: 'Útil 950 mm' },
  { id: 'bob-106', nome: 'Bobina 1.06m', categoria: 'Bobina', larguraUtilMm: 1000, avancoPadraoMm: 1000, descricao: 'Útil 1000 mm' },
  { id: 'bob-127', nome: 'Bobina 1.27m', categoria: 'Bobina', larguraUtilMm: 1220, avancoPadraoMm: 1000, descricao: 'Útil 1220 mm' },
  { id: 'bob-137', nome: 'Bobina 1.37m', categoria: 'Bobina', larguraUtilMm: 1300, avancoPadraoMm: 1000, descricao: 'Útil 1300 mm' },
  { id: 'bob-152', nome: 'Bobina 1.52m', categoria: 'Bobina', larguraUtilMm: 1470, avancoPadraoMm: 1000, descricao: 'Útil 1470 mm' },
  { id: 'chp-7010', nome: 'Chapa 70×100', categoria: 'Chapa', larguraUtilMm: 700, avancoPadraoMm: 1000, descricao: '700 × 1000 mm' },
  { id: 'chp-5070', nome: 'Chapa 50×70', categoria: 'Chapa', larguraUtilMm: 500, avancoPadraoMm: 700, descricao: '500 × 700 mm' },
  { id: 'chp-sra3', nome: 'Folha SRA3', categoria: 'Folha', larguraUtilMm: 330, avancoPadraoMm: 480, descricao: '330 × 480 mm' },
  { id: 'custom', nome: 'Personalizado', categoria: 'Personalizado', larguraUtilMm: 700, avancoPadraoMm: 1000, descricao: 'Medidas livres' },
];

async function invokeIpc(channel: string, ...args: any[]) {
  if (typeof window !== 'undefined') {
    const api = (window as any).electronAPI || (window as any).grafica;
    if (api && typeof api.invoke === 'function') {
      return await api.invoke(channel, ...args);
    }
  }
  return null;
}

export function WizardImpositionModal({
  open,
  onOpenChange,
  onSuccess,
}: WizardImpositionModalProps) {
  // Stepper: 1 a 4
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Etapa 1: Arquivo e Inspeção
  const [filePath, setFilePath] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [arteWMm, setArteWMm] = useState<number>(50);
  const [arteHMm, setArteHMm] = useState<number>(50);
  const [detectedTag, setDetectedTag] = useState<string | null>(null);
  const [isInspecting, setIsInspecting] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Etapa 2: Substrato & Grade
  const [selectedSubstratoId, setSelectedSubstratoId] = useState<string>('bob-75');
  const [rollWidthMm, setRollWidthMm] = useState<number>(665);
  const [rollHeightMm, setRollHeightMm] = useState<number>(986);
  const [targetCopies, setTargetCopies] = useState<number>(100);
  const [gapMm, setGapMm] = useState<number>(0);
  const [sideMarginMm, setSideMarginMm] = useState<number>(0);
  const [orientationMode, setOrientationMode] = useState<'auto' | 'direct' | 'rotated'>('auto');
  const [fillMode, setFillMode] = useState<ImpositionFillMode>('fill_row');

  // Bobinas do Estoque (TanStack Query + Fallback Electron IPC)
  const [ipcBobinas, setIpcBobinas] = useState<BobinaEstoque[]>([]);
  const { data: apiBobinas = [] } = useBobinas();
  const { data: stockItems = [] } = useStockItems();

  // Etapa 3: Motor
  const [engine, setEngine] = useState<ImpositionEngine>('CLI_NET');

  // Etapa 4: Execução & Auditoria
  const [jobStatus, setJobStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [jobId, setJobId] = useState<string>('');
  const [executionTimeMs, setExecutionTimeMs] = useState<number>(0);
  const [outputPath, setOutputPath] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Unifica bobinas reais vindas do backend ou do SQLite do Electron
  const allStockBobinas: BobinaEstoque[] = useMemo(() => {
    const list: BobinaEstoque[] = [];
    const stockMap = new Map(stockItems.map((item) => [item.id, item]));

    // Bobinas da API REST
    if (apiBobinas.length > 0) {
      for (const b of apiBobinas) {
        if (b.state === 'USED') continue;
        const item = stockMap.get(b.stockItemId);
        let larguraMm = 1000;
        if (item?.width) {
          larguraMm = item.width < 10 ? Math.round(item.width * 1000) : Math.round(item.width);
        }
        list.push({
          id: `api-bob-${b.id}`,
          codigo: b.serial || undefined,
          nome: item?.name ? `${item.name} (#${b.serial})` : `Bobina #${b.serial}`,
          larguraMm,
          tipo: item?.subType || 'Vinil',
        });
      }
    }

    // Bobinas do IPC Electron (se API não tiver retornado)
    if (list.length === 0 && ipcBobinas.length > 0) {
      list.push(...ipcBobinas);
    }

    return list;
  }, [apiBobinas, stockItems, ipcBobinas]);

  // Carrega bobinas via IPC do Electron ao abrir
  useEffect(() => {
    if (!open) return;
    let isMounted = true;
    (async () => {
      try {
        const res = await invokeIpc('estoque:listar-bobinas');
        if (isMounted && Array.isArray(res) && res.length > 0) {
          const mapped = res.map((r: any) => ({
            id: String(r.id),
            codigo: r.codigo || r.serial || undefined,
            nome: String(r.nome || r.name || `Bobina ${r.id}`),
            larguraMm: Number(r.larguraMm || r.largura_mm || r.width || 1000),
            tipo: r.tipo || 'Bobina',
          }));
          setIpcBobinas(mapped);
        }
      } catch (err) {
        console.warn('[Wizard] Não foi possível carregar bobinas do SQLite:', err);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [open]);

  // Cálculo matemático da grade em tempo real
  const rollCalc: RollCalculationResult | null = useMemo(() => {
    try {
      if (arteWMm <= 0 || arteHMm <= 0 || rollWidthMm <= 0) return null;
      return calculateRollImposition({
        arteWMm,
        arteHMm,
        rollWidthMm,
        sideMarginMm,
        initialLengthMm: rollHeightMm,
        gapMm,
        targetCopies,
        forcedOrientation: orientationMode,
        fillMode,
      });
    } catch {
      return null;
    }
  }, [arteWMm, arteHMm, rollWidthMm, sideMarginMm, rollHeightMm, gapMm, targetCopies, orientationMode, fillMode]);

  // Manipulador de inspeção de arquivo
  const handleInspect = async (selectedPath: string) => {
    if (!selectedPath) return;
    setIsInspecting(true);
    setErrorMessage('');
    try {
      setFilePath(selectedPath);
      const res = await invokeIpc('imposition:inspect-file', selectedPath);
      if (res) {
        setFileName(res.fileName || selectedPath.split(/[\\/]/).pop() || 'arte.pdf');
        if (res.widthMm && res.widthMm > 0) setArteWMm(res.widthMm);
        if (res.heightMm && res.heightMm > 0) setArteHMm(res.heightMm);
        if (res.detectedBobinaTag) {
          setDetectedTag(res.detectedBobinaTag);
          const matching = PRESET_SUBSTRATOS.find((p) =>
            p.id.toLowerCase().includes(res.detectedBobinaTag.toLowerCase())
          );
          if (matching) {
            setSelectedSubstratoId(matching.id);
            setRollWidthMm(matching.larguraUtilMm);
            setRollHeightMm(matching.avancoPadraoMm);
          }
        }
      } else {
        const name = selectedPath.split(/[\\/]/).pop() || 'arte.pdf';
        setFileName(name);
      }
    } catch (err: any) {
      console.error('Erro ao inspecionar:', err);
      setErrorMessage(err.message || 'Falha ao analisar arquivo');
    } finally {
      setIsInspecting(false);
    }
  };

  // Drag and Drop
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const nativePath = (file as any).path || file.name;
      handleInspect(nativePath);
    }
  };

  // Seletor de Arquivo via Dialog Nativo
  const handleBrowseFile = async () => {
    if (typeof window !== 'undefined' && (window as any).grafica?.automation?.pickArt) {
      try {
        const picked = await (window as any).grafica.automation.pickArt();
        if (picked) {
          handleInspect(picked);
          return;
        }
      } catch (_) {}
    }
    fileInputRef.current?.click();
  };

  // Seleção de substrato (Preset ou Bobina do Estoque)
  const handleSelectSubstrato = (id: string) => {
    setSelectedSubstratoId(id);

    // Procura nos presets padrão
    const preset = PRESET_SUBSTRATOS.find((p) => p.id === id);
    if (preset && preset.id !== 'custom') {
      setRollWidthMm(preset.larguraUtilMm);
      setRollHeightMm(preset.avancoPadraoMm);
      return;
    }

    // Procura nas bobinas do estoque
    const stockBob = allStockBobinas.find((b) => b.id === id);
    if (stockBob) {
      setRollWidthMm(stockBob.larguraMm);
    }
  };

  // Execução do Job de Imposição com Auditoria SQLite
  const handleExecute = async () => {
    setStep(4);
    setJobStatus('running');
    setErrorMessage('');
    const startTime = Date.now();

    try {
      const jobName = `IMP-${Date.now()}-${fileName.replace(/\.[^/.]+$/, '')}`;
      const cols = rollCalc?.cols || 1;
      const rows = rollCalc?.rows || 1;
      const totalCopiesProduced = rollCalc?.totalCopies || targetCopies;

      // 1. Cria Job no Banco de Dados (SQLite)
      const createRes = await invokeIpc('imposition:criar-job', {
        nome_job: jobName,
        caminho_origem: filePath,
        motor: engine,
        largura_substrato_mm: rollWidthMm,
        altura_substrato_mm: rollHeightMm,
        copias_solicitadas: targetCopies,
        copias_produzidas: totalCopiesProduced,
        grade_config: JSON.stringify({
          cols,
          rows,
          gapMm,
          sideMarginMm,
          orientation: rollCalc?.orientation || 'direct',
          fillMode,
          surplusCopies: rollCalc?.surplusCopies || 0,
        }),
      });

      const currentJobId = createRes?.id || `local-${Date.now()}`;
      setJobId(currentJobId);

      // 2. Aciona o Motor Unificado
      const execRes = await invokeIpc('imposition:execute-job', {
        motor: engine,
        jobId: currentJobId,
        params: {
          inputPath: filePath,
          sheetWMm: rollWidthMm,
          sheetHMm: rollHeightMm,
          gapMm,
          cols,
          rows,
          arteWMm,
          arteHMm,
          pecaWMm: rollCalc?.pecaWMm ?? arteWMm,
          pecaHMm: rollCalc?.pecaHMm ?? arteHMm,
          rotate: rollCalc?.orientation === 'rotated',
          targetCopies: totalCopiesProduced,
        },
      });

      const elapsed = Date.now() - startTime;
      setExecutionTimeMs(elapsed);

      if (execRes?.success) {
        setJobStatus('completed');
        setOutputPath(execRes.outputPath || '');

        // 3. Atualiza status no SQLite
        await invokeIpc('imposition:atualizar-job', {
          id: currentJobId,
          status: 'concluido',
          caminho_saida: execRes.outputPath || null,
          tempo_execucao_ms: elapsed,
        });

        if (onSuccess) {
          onSuccess(execRes);
        }
      } else {
        throw new Error(execRes?.error || 'Erro desconhecido durante o processamento do motor.');
      }
    } catch (err: any) {
      const elapsed = Date.now() - startTime;
      setExecutionTimeMs(elapsed);
      setJobStatus('failed');
      const msg = err?.message || 'Falha ao executar imposição';
      setErrorMessage(msg);

      if (jobId) {
        await invokeIpc('imposition:atualizar-job', {
          id: jobId,
          status: 'falhou',
          tempo_execucao_ms: elapsed,
          mensagem_erro: msg,
        });
      }
    }
  };

  const resetWizard = () => {
    setStep(1);
    setFilePath('');
    setFileName('');
    setDetectedTag(null);
    setJobStatus('idle');
    setErrorMessage('');
    setOutputPath('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto p-6 bg-background text-foreground">
        <DialogHeader className="mb-3">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Assistente de Imposição Multi-Motor
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Cálculo com fechamento de linha completa, análise de sobras e auditoria no banco
              </DialogDescription>
            </div>
            <Badge variant="outline" className="text-xs font-mono font-semibold">
              Etapa {step} de 4
            </Badge>
          </div>

          {/* Barra de Progresso das Etapas */}
          <div className="grid grid-cols-4 gap-2 pt-1.5">
            <div className={`h-1.5 rounded-full transition-all ${step >= 1 ? 'bg-primary' : 'bg-muted'}`} />
            <div className={`h-1.5 rounded-full transition-all ${step >= 2 ? 'bg-primary' : 'bg-muted'}`} />
            <div className={`h-1.5 rounded-full transition-all ${step >= 3 ? 'bg-primary' : 'bg-muted'}`} />
            <div className={`h-1.5 rounded-full transition-all ${step >= 4 ? 'bg-primary' : 'bg-muted'}`} />
          </div>
        </DialogHeader>

        {/* ========================================================================= */}
        {/* ETAPA 1: DROP & INSPECT */}
        {/* ========================================================================= */}
        {step === 1 && (
          <div className="space-y-4">
            <input
              type="file"
              ref={fileInputRef}
              accept=".pdf,.ai"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const nativePath = (file as any).path || file.name;
                  handleInspect(nativePath);
                }
              }}
            />

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-7 flex flex-col items-center justify-center text-center transition-all ${
                isDragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/30 hover:border-primary/50 bg-muted/10'
              }`}
            >
              <FileUp className="w-10 h-10 text-primary mb-2 animate-pulse" />
              <h3 className="font-semibold text-base">Arraste seu arquivo PDF ou AI aqui</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-md">
                O arquivo será inspecionado automaticamente para extração do MediaBox e identificação de tags
              </p>

              <div className="mt-4 flex flex-wrap gap-2 items-center justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleBrowseFile}
                  className="gap-2 cursor-pointer"
                >
                  <FolderOpen className="w-4 h-4" /> Escolher Arquivo...
                </Button>
                <span className="text-xs text-muted-foreground">ou cole o caminho:</span>
                <Input
                  type="text"
                  placeholder="C:\Artes\rotulo.pdf..."
                  value={filePath}
                  onChange={(e) => setFilePath(e.target.value)}
                  className="w-64 text-xs h-8"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!filePath || isInspecting}
                  onClick={() => handleInspect(filePath)}
                  className="h-8 cursor-pointer"
                >
                  {isInspecting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Inspecionar'}
                </Button>
              </div>
            </div>

            {fileName && (
              <div className="p-4 rounded-lg bg-muted/30 border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <FileText className="w-5 h-5 text-primary shrink-0" />
                    <div>
                      <div className="font-semibold text-sm">{fileName}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-lg">{filePath}</div>
                    </div>
                  </div>
                  {detectedTag && (
                    <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs">
                      Tag Detectada: {detectedTag}
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                  <div>
                    <Label className="text-xs font-medium">Largura da Arte (mm)</Label>
                    <Input
                      type="number"
                      value={arteWMm}
                      onChange={(e) => setArteWMm(Number(e.target.value))}
                      className="mt-1 h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Altura da Arte (mm)</Label>
                    <Input
                      type="number"
                      value={arteHMm}
                      onChange={(e) => setArteHMm(Number(e.target.value))}
                      className="mt-1 h-9"
                    />
                  </div>
                </div>
              </div>
            )}

            {errorMessage && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {errorMessage}
              </div>
            )}

            <div className="flex justify-end pt-3 border-t">
              <Button
                disabled={!filePath || arteWMm <= 0 || arteHMm <= 0}
                onClick={() => setStep(2)}
                className="gap-2"
              >
                Configurar Bobina e Grade <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ETAPA 2: SELEÇÃO DE BOBINA & GRADE INTELIGENTE */}
        {/* ========================================================================= */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Seletor Visual de Substrato */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Selecione a Bobina ou Substrato
                </Label>
                <span className="text-xs text-muted-foreground">
                  Largura Útil Atual: <b className="text-primary">{rollWidthMm} mm</b>
                </span>
              </div>

              {/* Botões Rápidos de Substrato */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PRESET_SUBSTRATOS.map((preset) => {
                  const isSelected = selectedSubstratoId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectSubstrato(preset.id)}
                      className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-primary bg-primary/10 ring-1 ring-primary shadow-xs'
                          : 'border-muted hover:border-muted-foreground/40 bg-card'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-foreground">{preset.nome}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
                      </div>
                      <span className="text-[11px] text-muted-foreground mt-1">{preset.descricao}</span>
                    </button>
                  );
                })}
              </div>

              {/* Seletor de Bobinas Reais do Estoque */}
              {allStockBobinas.length > 0 && (
                <div className="pt-2">
                  <div className="text-[11px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <Package className="w-3.5 h-3.5 text-primary" /> Bobinas em Estoque Ativo:
                  </div>
                  <select
                    aria-label="Bobina do Estoque"
                    value={selectedSubstratoId}
                    onChange={(e) => handleSelectSubstrato(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="" disabled>
                      Selecione uma bobina do estoque...
                    </option>
                    {allStockBobinas.map((bob) => (
                      <option key={bob.id} value={bob.id}>
                        {bob.codigo ? `[${bob.codigo}] ` : ''}{bob.nome} — {bob.larguraMm} mm
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Parâmetros Numéricos & Modo de Preenchimento */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div className="space-y-3 bg-muted/20 p-3.5 rounded-xl border">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <Label className="text-xs">Largura Útil (mm)</Label>
                    <Input
                      type="number"
                      value={rollWidthMm}
                      onChange={(e) => setRollWidthMm(Number(e.target.value))}
                      className="mt-1 h-8 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Avanço / Altura (mm)</Label>
                    <Input
                      type="number"
                      value={rollHeightMm}
                      onChange={(e) => setRollHeightMm(Number(e.target.value))}
                      className="mt-1 h-8 text-xs font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <Label className="text-xs font-bold text-primary">Cópias Solicitadas</Label>
                    <Input
                      type="number"
                      value={targetCopies}
                      onChange={(e) => setTargetCopies(Number(e.target.value))}
                      className="mt-1 h-8 text-xs font-bold"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Espaçamento (Gap mm)</Label>
                    <Input
                      type="number"
                      value={gapMm}
                      onChange={(e) => setGapMm(Number(e.target.value))}
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                </div>

                {/* Alternador de Modo de Preenchimento da Linha/Grade */}
                <div>
                  <Label className="text-xs font-semibold block mb-1.5">
                    Modo de Preenchimento da Grade:
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFillMode('fill_row')}
                      className={`p-2 rounded-lg border text-left transition-all cursor-pointer text-xs ${
                        fillMode === 'fill_row'
                          ? 'border-primary bg-primary/10 ring-1 ring-primary font-semibold'
                          : 'border-muted hover:border-muted-foreground/30 bg-card'
                      }`}
                    >
                      <div className="font-medium text-[11px] text-foreground">Preencher Linha Inteira</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Fecha todas as colunas da última linha (gera sobra de produção)
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFillMode('fill_advance')}
                      className={`p-2 rounded-lg border text-left transition-all cursor-pointer text-xs ${
                        fillMode === 'fill_advance'
                          ? 'border-primary bg-primary/10 ring-1 ring-primary font-semibold'
                          : 'border-muted hover:border-muted-foreground/30 bg-card'
                      }`}
                    >
                      <div className="font-medium text-[11px] text-foreground">Preencher Substrato Total</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Ocupa 100% da altura/avanço de {rollHeightMm}mm
                      </div>
                    </button>
                  </div>
                </div>

                {/* Giro da Arte */}
                <div>
                  <Label className="text-xs">Orientação da Arte</Label>
                  <div className="grid grid-cols-3 gap-1.5 mt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={orientationMode === 'auto' ? 'default' : 'outline'}
                      onClick={() => setOrientationMode('auto')}
                      className="text-xs h-7"
                    >
                      Automática
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={orientationMode === 'direct' ? 'default' : 'outline'}
                      onClick={() => setOrientationMode('direct')}
                      className="text-xs h-7"
                    >
                      0° Direta
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={orientationMode === 'rotated' ? 'default' : 'outline'}
                      onClick={() => setOrientationMode('rotated')}
                      className="text-xs h-7"
                    >
                      90° Girada
                    </Button>
                  </div>
                </div>
              </div>

              {/* CARD DE RESULTADOS MATEMÁTICOS & SOBRAS DE PRODUÇÃO */}
              <div className="bg-muted/30 border rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Grid className="w-4 h-4 text-primary" /> Grade & Análise de Sobras
                    </span>
                    {rollCalc?.orientation === 'rotated' ? (
                      <Badge variant="secondary" className="text-[10px] gap-1 bg-sky-500/10 text-sky-600 border-sky-500/20">
                        <RotateCw className="w-3 h-3" /> 90° Rotacionado
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        0° Direto
                      </Badge>
                    )}
                  </div>

                  {rollCalc ? (
                    <div className="space-y-2.5 mt-3">
                      {/* Grid de Métricas Principais */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-background p-2.5 rounded-lg border">
                          <div className="text-[10px] text-muted-foreground">Distribuição</div>
                          <div className="text-base font-bold text-primary">
                            {rollCalc.cols} col × {rollCalc.rows} lin
                          </div>
                          <div className="text-[11px] font-semibold text-foreground mt-0.5">
                            Total: {rollCalc.totalCopies} peças
                          </div>
                        </div>

                        <div className="bg-background p-2.5 rounded-lg border">
                          <div className="text-[10px] text-muted-foreground">Comprimento Linear</div>
                          <div className="text-base font-bold text-emerald-600">
                            {rollCalc.totalLengthMeters.toFixed(2)} m
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {rollCalc.totalLengthMm.toFixed(0)} mm no rolo
                          </div>
                        </div>
                      </div>

                      {/* DESTAQUE DE SOBRAS DE PRODUÇÃO */}
                      <div className="p-3 rounded-lg border bg-emerald-500/10 border-emerald-500/20 text-emerald-950 dark:text-emerald-100">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                            <Info className="w-4 h-4" /> Balanço de Produção:
                          </span>
                          {rollCalc.surplusCopies > 0 ? (
                            <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px]">
                              +{rollCalc.surplusCopies} Sobras
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              Exato (0 sobras)
                            </Badge>
                          )}
                        </div>

                        <div className="text-xs mt-1.5 leading-relaxed">
                          • Pedido do Cliente: <b>{targetCopies} un</b>
                          <br />
                          • Produção na Grade: <b>{rollCalc.totalCopies} un</b> ({rollCalc.cols} por linha)
                          <br />
                          {rollCalc.surplusCopies > 0 ? (
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              • Preenchendo a linha inteira você ganha +{rollCalc.surplusCopies} unidades extras de sobra!
                            </span>
                          ) : (
                            <span>• A quantidade fecha perfeitamente na linha inteira.</span>
                          )}
                        </div>
                      </div>

                      {/* Capacidade Máxima do Avanço */}
                      <div className="text-[11px] text-muted-foreground bg-background p-2 rounded border">
                        Capacidade do avanço ({rollHeightMm}mm): até <b>{rollCalc.maxCopiesInAdvance} unidades</b> ({rollCalc.maxRowsInAdvance} linhas completas).
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 text-center text-destructive text-xs mt-4">
                      A arte ({arteWMm}×{arteHMm} mm) não cabe na largura útil configurada ({rollWidthMm} mm).
                    </div>
                  )}
                </div>

                <div className="text-[10px] text-muted-foreground mt-2 pt-2 border-t">
                  * Linhas completas evitam faixas vazias na largura da bobina e otimizam o custo por metro linear.
                </div>
              </div>
            </div>

            <div className="flex justify-between pt-3 border-t">
              <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
                <ArrowLeft className="w-4 h-4" /> Voltar
              </Button>
              <Button disabled={!rollCalc} onClick={() => setStep(3)} className="gap-2">
                Selecionar Motor de Imposição <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ETAPA 3: SELEÇÃO DO MOTOR */}
        {/* ========================================================================= */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground">
              Escolha a tecnologia de imposição conforme as exigências do processo gráfico:
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Opção 1: CLI_NET */}
              <div
                onClick={() => setEngine('CLI_NET')}
                className={`cursor-pointer rounded-xl border-2 p-4 transition-all relative ${
                  engine === 'CLI_NET'
                    ? 'border-primary bg-primary/5 shadow-xs'
                    : 'border-muted hover:border-muted-foreground/40'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-primary" />
                    <span className="font-bold text-sm">AutoImposerCLI (.NET 8)</span>
                  </div>
                  {engine === 'CLI_NET' && (
                    <Badge variant="default" className="text-[10px]">
                      Selecionado
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Motor C# compilado de ultra velocidade (&lt; 500ms). Monta a grade diretamente em PDF sem precisar
                  do Illustrator aberto.
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">
                    Ultra Rápido
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    Baixo Consumo de RAM
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    Ideal p/ Bobinas e Chapas
                  </Badge>
                </div>
              </div>

              {/* Opção 2: ILLUSTRATOR_COM */}
              <div
                onClick={() => setEngine('ILLUSTRATOR_COM')}
                className={`cursor-pointer rounded-xl border-2 p-4 transition-all relative ${
                  engine === 'ILLUSTRATOR_COM'
                    ? 'border-primary bg-primary/5 shadow-xs'
                    : 'border-muted hover:border-muted-foreground/40'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Layers className="w-5 h-5 text-amber-500" />
                    <span className="font-bold text-sm">Adobe Illustrator COM</span>
                  </div>
                  {engine === 'ILLUSTRATOR_COM' && (
                    <Badge variant="default" className="text-[10px]">
                      Selecionado
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Automação nativa via ExtendScript JSX. Preserva estritamente as camadas individuais (Faca, Cor e
                  Branco) para bureau e acabamentos especiais.
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">
                    Camadas Isoladas
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    Faca + Cor + Branco
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    Bureau Especializado
                  </Badge>
                </div>
              </div>
            </div>

            {/* Resumo com Sobras */}
            <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1">
              <div className="font-semibold text-foreground">Resumo do Pedido & Grade:</div>
              <div className="text-muted-foreground">
                Arquivo: <b>{fileName}</b> ({arteWMm}×{arteHMm} mm) → Substrato útil: <b>{rollWidthMm} mm</b>.
                <br />
                Produzirá <b>{rollCalc?.totalCopies} unidades</b> ({rollCalc?.cols} cols × {rollCalc?.rows} linhas),
                atendendo as <b>{targetCopies}</b> solicitadas com{' '}
                <b className="text-emerald-600">+{rollCalc?.surplusCopies} sobras na linha</b>.
              </div>
            </div>

            <div className="flex justify-between pt-3 border-t">
              <Button variant="outline" onClick={() => setStep(2)} className="gap-2">
                <ArrowLeft className="w-4 h-4" /> Voltar
              </Button>
              <Button onClick={handleExecute} className="gap-2">
                <Play className="w-4 h-4" /> Executar Imposição
              </Button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ETAPA 4: EXECUÇÃO & STATUS */}
        {/* ========================================================================= */}
        {step === 4 && (
          <div className="py-6 flex flex-col items-center justify-center text-center space-y-4">
            {jobStatus === 'running' && (
              <div className="space-y-3">
                <RefreshCw className="w-12 h-12 text-primary animate-spin mx-auto" />
                <h3 className="font-bold text-lg">Processando Imposição...</h3>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Despachando montagem para o motor <b>{engine}</b> e gravando auditoria no banco de dados.
                </p>
              </div>
            )}

            {jobStatus === 'completed' && (
              <div className="space-y-3 w-full max-w-md">
                <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto animate-in zoom-in-50" />
                <h3 className="font-bold text-xl text-foreground">Imposição Concluída com Sucesso!</h3>
                <div className="bg-muted/50 border rounded-xl p-4 text-left text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ID do Job:</span>
                    <span className="font-mono">{jobId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Motor:</span>
                    <span className="font-semibold">{engine}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tempo de Execução:</span>
                    <span className="font-semibold text-emerald-600">{executionTimeMs} ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Grade Produzida:</span>
                    <span className="font-semibold">
                      {rollCalc?.cols} col × {rollCalc?.rows} lin ({rollCalc?.totalCopies} unidades)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sobra na Linha:</span>
                    <span className="font-semibold text-emerald-600">+{rollCalc?.surplusCopies} unidades</span>
                  </div>
                  {outputPath && (
                    <div className="pt-2 border-t">
                      <div className="text-muted-foreground mb-1">Arquivo Gerado:</div>
                      <div className="font-mono text-[11px] bg-background p-2 rounded border break-all">
                        {outputPath}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 justify-center pt-2">
                  <Button variant="outline" size="sm" onClick={resetWizard}>
                    Novo Trabalho
                  </Button>
                  <Button size="sm" onClick={() => onOpenChange(false)}>
                    Concluir e Fechar
                  </Button>
                </div>
              </div>
            )}

            {jobStatus === 'failed' && (
              <div className="space-y-3 w-full max-w-md">
                <AlertCircle className="w-14 h-14 text-destructive mx-auto" />
                <h3 className="font-bold text-xl text-destructive">Falha na Execução da Imposição</h3>
                <p className="text-xs text-muted-foreground">
                  O motor <b>{engine}</b> retornou um erro durante a geração.
                </p>
                <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-lg p-3 text-xs text-left">
                  {errorMessage || 'Erro inesperado durante o processamento.'}
                </div>

                <div className="flex gap-2 justify-center pt-2">
                  <Button variant="outline" size="sm" onClick={() => setStep(3)}>
                    Trocar Motor
                  </Button>
                  <Button size="sm" onClick={handleExecute}>
                    Tentar Novamente
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
