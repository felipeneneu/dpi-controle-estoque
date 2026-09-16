'use client';

import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FolderOpen, Disc } from 'lucide-react';
import { calculateRollImposition } from '@/lib/imposition-roll-math';
import {
  useCreateImpositionJob,
  useRunImpositionElectron,
  pickArtPdf,
} from '@/lib/queries/automation';

const PREDEFINICOES = [
  { id: 'bob-75', nome: 'Bobina 0.75m', tipo: 'Bobina', w: 665, h: 986 },
  { id: 'bob-106', nome: 'Bobina 1.06m', tipo: 'Bobina', w: 1000, h: 1000 },
  { id: 'bob-137', nome: 'Bobina 1.37m', tipo: 'Bobina', w: 1300, h: 1000 },
  { id: 'chp-7010', nome: 'Chapa 70×100', tipo: 'Chapa', w: 700, h: 1000 },
  { id: 'chp-acm', nome: 'Chapa Router', tipo: 'Chapa', w: 1220, h: 2440 },
];

export interface NewImpositionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExecute?: (payload: {
    jobName: string;
    inputPdfPath: string;
    sheetWMm: number;
    sheetHMm: number;
    targetCopies: number;
    engine: 'ILLUSTRATOR_COM' | 'CLI_NET';
    cols: number;
    rows: number;
    pecaWMm: number;
    pecaHMm: number;
    orientation: 'direct' | 'rotated';
  }) => void;
}

export function NewImpositionModal({ open, onOpenChange, onExecute }: NewImpositionModalProps) {
  const createJob = useCreateImpositionJob();
  const runElectron = useRunImpositionElectron();
  const isDesktop = typeof window !== 'undefined' && !!window.grafica?.automation;

  const [selectedPreset, setSelectedPreset] = useState('bob-75');
  const [activeTab, setActiveTab] = useState<'config' | 'modelos'>('config');

  // Geral
  const [jobName, setJobName] = useState('31188 - Galgani - Item 3 - Selo Dr Gean');
  const [inputPdfPath, setInputPdfPath] = useState('J:\\DPI\\Artes\\Selo_Dr_Gean.pdf');
  const [colorMode, setColorMode] = useState<'CMYK' | 'RGB'>('CMYK');
  const [engine, setEngine] = useState<'ILLUSTRATOR_COM' | 'CLI_NET'>('ILLUSTRATOR_COM');

  // Dimensões da Arte e Grade
  const [arteWMm] = useState(34);
  const [arteHMm] = useState(19);
  const [gapMm, setGapMm] = useState(0);
  const [orientationMode, setOrientationMode] = useState<'auto' | 'direct' | 'rotated'>('auto');

  // Substrato (largura útil / avanço inicial)
  const [sheetWMm, setSheetWMm] = useState(665);
  const [sheetHMm, setSheetHMm] = useState(986);
  const [targetCopies, setTargetCopies] = useState(1015);

  const rollCalc = useMemo(() => {
    try {
      return calculateRollImposition({
        arteWMm,
        arteHMm,
        rollWidthMm: sheetWMm,
        sideMarginMm: 0,
        topBottomMarginMm: 0,
        initialLengthMm: sheetHMm,
        gapMm,
        targetCopies,
        forcedOrientation: orientationMode,
      });
    } catch {
      return null;
    }
  }, [arteWMm, arteHMm, sheetWMm, sheetHMm, gapMm, targetCopies, orientationMode]);

  const cols = rollCalc?.cols ?? 0;
  const rows = rollCalc?.rows ?? 0;
  const totalCopies = rollCalc?.totalCopies ?? 0;
  const totalLengthMm = rollCalc?.totalLengthMm ?? 0;
  const orientationLabel = rollCalc?.orientation === 'rotated' ? '90°' : '0°';

  const handlePickArt = async () => {
    const file = await pickArtPdf();
    if (file) setInputPdfPath(file);
  };

  const handleExecute = async () => {
    const finalLength = rollCalc?.totalLengthMm ?? sheetHMm;
    const rotation = rollCalc?.orientation === 'rotated' ? '90' : '0';

    if (onExecute) {
      onExecute({
        jobName,
        inputPdfPath,
        sheetWMm,
        sheetHMm: finalLength,
        targetCopies: rollCalc?.totalCopies ?? targetCopies,
        engine,
        cols: rollCalc?.cols ?? 1,
        rows: rollCalc?.rows ?? 1,
        pecaWMm: rollCalc?.pecaWMm ?? 0,
        pecaHMm: rollCalc?.pecaHMm ?? 0,
        orientation: rollCalc?.orientation ?? 'direct',
      });
      onOpenChange(false);
      return;
    }

    // Fallback: enfileira no backend e executa o AutoImposerCLI via Electron.
    const common = {
      jobName,
      inputPdf: inputPdfPath.trim(),
      sheetWMm,
      sheetHMm: finalLength,
      gapMm,
      marginTopMm: 0,
      marginRightMm: 0,
      marginBottomMm: 0,
      marginLeftMm: 0,
      rotation: rotation as '0' | '90',
    };

    try {
      const job = await createJob.mutateAsync(common);

      if (isDesktop) {
        const runRes = await runElectron.mutateAsync({
          jobId: job.id,
          inputPdf: job.inputPdf,
          sheetWMm: common.sheetWMm,
          sheetHMm: common.sheetHMm,
          gapMm: common.gapMm,
          marginTopMm: 0,
          marginRightMm: 0,
          marginBottomMm: 0,
          marginLeftMm: 0,
          rotation: common.rotation,
          cols: rollCalc?.cols,
          rows: rollCalc?.rows,
          pecaWMm: rollCalc?.pecaWMm,
          pecaHMm: rollCalc?.pecaHMm,
        });
        if (runRes.success) {
          toast.success(`Imposição concluída (${runRes.result?.grid?.units ?? totalCopies} unidades).`);
        } else {
          toast.error(`Falha na imposição: ${runRes.error ?? 'erro desconhecido'}`);
        }
      } else {
        toast.success(`Job "${job.jobName}" enfileirado.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao submeter job de imposição';
      toast.error(msg);
    } finally {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[1080px] max-w-[1080px] sm:max-w-[1080px] h-[85vh] min-h-[640px] p-0 gap-0 bg-[#F5F5F5] dark:bg-[#1E1E1E] border-[#D1D1D1] dark:border-[#333] text-zinc-800 dark:text-zinc-200 rounded-md shadow-xl flex flex-col font-sans text-xs select-none">

        {/* Cabeçalho CorelDRAW */}
        <div className="h-10 px-4 bg-white dark:bg-[#252526] border-b border-[#E0E0E0] dark:border-[#2D2D2D] flex items-center justify-between shrink-0">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Criar um novo documento de imposição</span>
        </div>

        {/* Abas Superiores */}
        <div className="h-10 px-4 bg-[#EAEAEA] dark:bg-[#222] border-b border-[#DCDCDC] dark:border-[#2D2D2D] flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('config')}
            className={`px-3 h-full border-b-2 font-medium transition-colors cursor-pointer ${
              activeTab === 'config'
                ? 'border-blue-600 bg-white dark:bg-[#1E1E1E] text-zinc-900 dark:text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
            }`}
          >
            Configurações da Mídia
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('modelos')}
            className={`px-3 h-full border-b-2 font-medium transition-colors cursor-pointer ${
              activeTab === 'modelos'
                ? 'border-blue-600 bg-white dark:bg-[#1E1E1E] text-zinc-900 dark:text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
            }`}
          >
            Predefinições do Sistema
          </button>
        </div>

        {/* Corpo Principal: Esquerda (Presets) + Direita (Inspetor) */}
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* Coluna Esquerda: Formatos de Substrato */}
          <div className="w-1/2 p-3 bg-white dark:bg-[#1A1A1A] border-r border-[#E0E0E0] dark:border-[#2D2D2D] flex flex-col">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#EEE] dark:border-[#282828]">
              <span className="text-[11px] font-semibold text-zinc-500">FORMATOS RECENTES</span>
              <span className="text-[11px] text-zinc-400">Padrão Indústria</span>
            </div>

            <div className="grid grid-cols-2 gap-2 overflow-y-auto pr-1">
              {PREDEFINICOES.map((preset) => {
                const isSelected = selectedPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setSelectedPreset(preset.id);
                      setSheetWMm(preset.w);
                      setSheetHMm(preset.h);
                    }}
                    className={`h-32 p-3 rounded border flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20 ring-1 ring-blue-500'
                        : 'border-[#DCDCDC] dark:border-[#333] hover:border-zinc-400 dark:hover:border-[#444] bg-[#FAFAFA] dark:bg-[#202020]'
                    }`}
                  >
                    <div className="w-10 h-12 border border-dashed border-zinc-400 dark:border-zinc-600 mb-1.5 flex items-center justify-center">
                      <Disc className="w-4 h-4 text-zinc-400" />
                    </div>
                    <span className="font-semibold text-[11px] text-zinc-800 dark:text-zinc-200">{preset.nome}</span>
                    <span className="text-[10px] text-zinc-500">{preset.w} × {preset.h} mm</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Coluna Direita: Formulário Técnico de Produção */}
          <div className="w-1/2 p-4 bg-[#F9F9F9] dark:bg-[#1E1E1E] overflow-y-auto space-y-3.5">

            {/* Seção Geral */}
            <div className="space-y-1.5">
              <span className="font-bold text-[11px] text-zinc-600 dark:text-zinc-400 uppercase tracking-wider block">
                Geral
              </span>
              <div className="grid grid-cols-4 items-center gap-2">
                <Label className="col-span-1 text-[11px] text-zinc-500">Nome:</Label>
                <Input
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                  className="col-span-3 h-8 text-[13px] bg-white dark:bg-[#141414] border-[#CCC] dark:border-[#3A3A3A]"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-2">
                <Label className="col-span-1 text-[11px] text-zinc-500">Arte:</Label>
                <div className="col-span-3 flex gap-1">
                  <Input
                    value={inputPdfPath}
                    onChange={(e) => setInputPdfPath(e.target.value)}
                    className="h-8 text-[12px] font-mono bg-white dark:bg-[#141414] border-[#CCC] dark:border-[#3A3A3A] truncate"
                  />
                  <Button size="sm" variant="outline" type="button" onClick={handlePickArt} className="h-8 px-2.5 border-[#CCC] dark:border-[#3A3A3A] cursor-pointer">
                    <FolderOpen className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Dimensões do Substrato */}
            <div className="space-y-1.5 pt-2 border-t border-[#E5E5E5] dark:border-[#2D2D2D]">
              <span className="font-bold text-[11px] text-zinc-600 dark:text-zinc-400 uppercase tracking-wider block">
                Dimensões do Substrato
              </span>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <Label className="w-14 text-[11px] text-zinc-500">Largura:</Label>
                  <Input
                    type="number"
                    value={sheetWMm}
                    onChange={(e) => setSheetWMm(Number(e.target.value))}
                    className="h-8 text-[13px] bg-white dark:bg-[#141414] border-[#CCC] dark:border-[#3A3A3A]"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="w-14 text-[11px] text-zinc-500">Avanço:</Label>
                  <Input
                    type="number"
                    value={sheetHMm}
                    onChange={(e) => setSheetHMm(Number(e.target.value))}
                    className="h-8 text-[13px] bg-white dark:bg-[#141414] border-[#CCC] dark:border-[#3A3A3A]"
                  />
                </div>
              </div>

              {/* Orientação & Modo de Cor */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <Label className="w-14 text-[11px] text-zinc-500">Cores:</Label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="radio" checked={colorMode === 'CMYK'} onChange={() => setColorMode('CMYK')} name="colorMode" />
                      <span>CMYK</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="radio" checked={colorMode === 'RGB'} onChange={() => setColorMode('RGB')} name="colorMode" />
                      <span>RGB</span>
                    </label>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Label className="w-14 text-[11px] text-zinc-500">Giro:</Label>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      type="button"
                      variant={orientationMode === 'auto' ? 'default' : 'outline'}
                      onClick={() => setOrientationMode('auto')}
                      className={`h-7 px-2.5 text-[11px] cursor-pointer ${orientationMode === 'auto' ? 'bg-blue-600 text-white' : 'border-[#CCC] dark:border-[#3A3A3A]'}`}
                    >
                      Auto
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      variant={orientationMode === 'direct' ? 'default' : 'outline'}
                      onClick={() => setOrientationMode('direct')}
                      className={`h-7 px-2.5 text-[11px] cursor-pointer ${orientationMode === 'direct' ? 'bg-zinc-700 text-white' : 'border-[#CCC] dark:border-[#3A3A3A]'}`}
                    >
                      0°
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      variant={orientationMode === 'rotated' ? 'default' : 'outline'}
                      onClick={() => setOrientationMode('rotated')}
                      className={`h-7 px-2.5 text-[11px] cursor-pointer ${orientationMode === 'rotated' ? 'bg-zinc-700 text-white' : 'border-[#CCC] dark:border-[#3A3A3A]'}`}
                    >
                      90°
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Grade & Tiragem */}
            <div className="space-y-1.5 pt-2 border-t border-[#E5E5E5] dark:border-[#2D2D2D]">
              <span className="font-bold text-[11px] text-zinc-600 dark:text-zinc-400 uppercase tracking-wider block">
                Grade & Tiragem
              </span>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[10px] text-zinc-500">Arte (L × A mm)</Label>
                  <div className="text-[11px] font-mono mt-1 font-semibold">{arteWMm} × {arteHMm} mm</div>
                </div>
                <div>
                  <Label className="text-[10px] text-zinc-500">Tiragem Alvo</Label>
                  <Input
                    type="number"
                    value={targetCopies}
                    onChange={(e) => setTargetCopies(Number(e.target.value))}
                    className="h-8 text-[13px] font-bold bg-white dark:bg-[#141414] border-[#CCC] dark:border-[#3A3A3A]"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-zinc-500">Gap (mm)</Label>
                  <Input
                    type="number"
                    value={gapMm}
                    onChange={(e) => setGapMm(Number(e.target.value))}
                    className="h-8 text-[13px] bg-white dark:bg-[#141414] border-[#CCC] dark:border-[#3A3A3A]"
                  />
                </div>
              </div>

              {/* Barra Técnica de Aproveitamento */}
              {rollCalc ? (
                <div className="p-2 rounded bg-[#EBEBEB] dark:bg-[#141414] border border-[#DDD] dark:border-[#2B2B2B] text-[11px] flex justify-between items-center">
                  <span>
                    Matriz: <strong>{cols} col × {rows} lin</strong> ({orientationLabel})
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    {totalCopies} cópias • {totalLengthMm} mm
                  </span>
                </div>
              ) : (
                <div className="p-2 rounded bg-[#EBEBEB] dark:bg-[#141414] border border-[#DDD] dark:border-[#2B2B2B] text-[11px] text-zinc-500">
                  Ajuste as dimensões da arte ou do substrato.
                </div>
              )}
            </div>

            {/* Motor de Execução */}
            <div className="pt-2 border-t border-[#E5E5E5] dark:border-[#2D2D2D]">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-zinc-500">Motor de Saída:</Label>
                <Select value={engine} onValueChange={(v) => setEngine((v ?? engine) as 'ILLUSTRATOR_COM' | 'CLI_NET')}>
                  <SelectTrigger className="h-8 w-64 text-[13px] bg-white dark:bg-[#141414] border-[#CCC] dark:border-[#3A3A3A]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="text-xs">
                    <SelectItem value="ILLUSTRATOR_COM">Adobe Illustrator (Preserva 3 Camadas)</SelectItem>
                    <SelectItem value="CLI_NET">AutoImposer CLI (.NET Rápido)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

          </div>
        </div>

        {/* Rodapé Padrão Corel / Windows */}
        <div className="h-12 px-4 bg-[#EAEAEA] dark:bg-[#252526] border-t border-[#DCDCDC] dark:border-[#2D2D2D] flex items-center justify-end gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-8 text-[13px] border-[#CCC] dark:border-[#3A3A3A] px-4 cursor-pointer"
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleExecute}
            disabled={!rollCalc}
            className="h-8 text-[13px] bg-blue-600 hover:bg-blue-500 text-white font-medium px-5 cursor-pointer"
          >
            OK
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
}
export default NewImpositionModal;