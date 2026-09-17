'use client';

import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { calculateRollImposition } from '@/lib/imposition-roll-math';
import { 
  FolderOpen, 
  X, 
  Search, 
  Plus, 
  Minus, 
  HelpCircle, 
  ChevronRight, 
  ChevronDown 
} from 'lucide-react';

interface PresetItem {
  id: string;
  nome: string;
  tipo: 'Bobina' | 'Chapa' | 'Folha';
  largura: number;
  altura: number;
}

const PRESETS: PresetItem[] = [
  { id: 'bob-75', nome: 'Bobina 0.75m', tipo: 'Bobina', largura: 665, altura: 986 },
  { id: 'bob-100', nome: 'Bobina 1.00m', tipo: 'Bobina', largura: 950, altura: 1000 },
  { id: 'bob-106', nome: 'Bobina 1.06m', tipo: 'Bobina', largura: 1000, altura: 1000 },
  { id: 'bob-127', nome: 'Bobina 1.27m', tipo: 'Bobina', largura: 1220, altura: 1000 },
  { id: 'bob-137', nome: 'Bobina 1.37m', tipo: 'Bobina', largura: 1300, altura: 1000 },
  { id: 'bob-152', nome: 'Bobina 1.52m', tipo: 'Bobina', largura: 1470, altura: 1000 },
  { id: 'chp-7010', nome: 'Chapa 70×100', tipo: 'Chapa', largura: 700, altura: 1000 },
  { id: 'chp-5070', nome: 'Chapa 50×70', tipo: 'Chapa', largura: 500, altura: 700 },
  { id: 'flh-sra3', nome: 'Folha SRA3', tipo: 'Folha', largura: 320, altura: 450 },
];

export function WizardImpositionModal({ open, onOpenChange, onFinished }: any) {
  const [activeTab, setActiveTab] = useState<'config' | 'modelos'>('config');
  const [selectedPresetId, setSelectedPresetId] = useState('bob-75');
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('Todos');

  // Dados Gerais
  const [nomeJob, setNomeJob] = useState('Sem título-1');
  const [caminhoArte, setCaminhoArte] = useState('J:\\DPI\\Artes\\Selo_Dr_Gean.pdf');
  const [tiragem, setTiragem] = useState(1015);
  const [corPrimaria, setCorPrimaria] = useState<'CMYK' | 'RGB'>('CMYK');

  // Dimensões do Substrato
  const [larguraMidia, setLarguraMidia] = useState(665);
  const [alturaMidia, setAlturaMidia] = useState(986);
  const [orientacao, setOrientacao] = useState<'retrato' | 'paisagem'>('retrato');

  // Arte
  const [arteWMm, setArteWMm] = useState(34);
  const [arteHMm, setArteHMm] = useState(19);
  const [gapMm, setGapMm] = useState(0);

  // Motor e Acordeon
  const [motor, setMotor] = useState<'ILLUSTRATOR_COM' | 'CLI_NET'>('ILLUSTRATOR_COM');
  const [layoutAberto, setLayoutAberto] = useState(true);
  
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCaminhoArte(file.path || file.name);
      setNomeJob(file.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setCaminhoArte(file.path || file.name);
      setNomeJob(file.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleSelectPreset = (p: PresetItem) => {
    setSelectedPresetId(p.id);
    setLarguraMidia(p.largura);
    setAlturaMidia(p.altura);
  };

  const rollCalc = useMemo(() => {
    return calculateRollImposition({
      arteWMm,
      arteHMm,
      rollWidthMm: larguraMidia,
      sideMarginMm: 0,
      topBottomMarginMm: 0,
      initialLengthMm: alturaMidia,
      gapMm,
      targetCopies: tiragem,
      forcedOrientation: orientacao === 'retrato' ? 'rotated' : 'direct',
    });
  }, [arteWMm, arteHMm, larguraMidia, alturaMidia, gapMm, tiragem, orientacao]);

  const presetsFiltrados = PRESETS.filter(p => {
    const matchBusca = p.nome.toLowerCase().includes(searchTerm.toLowerCase());
    const matchTipo = filtroTipo === 'Todos' || p.tipo === filtroTipo;
    return matchBusca && matchTipo;
  });

  const handleConfirmar = async () => {
    if ((window as any).electronAPI) {
      await (window as any).electronAPI.invoke('imposition:execute-job', {
        jobId: `JOB-${Date.now()}`,
        engine: motor,
        params: {
          inputPath: caminhoArte,
          inputWidthMm: arteWMm,
          inputHeightMm: arteHMm,
          sheetWidthMm: larguraMidia,
          sheetHeightMm: rollCalc.totalLengthMm,
          gapMm: gapMm,
          targetCopies: rollCalc.totalCopies,
          rotacionar90: rollCalc.orientation === 'rotated',
          cols: rollCalc.cols,
          rows: rollCalc.rows,
        },
      });
    }
    onFinished?.();
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent 
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        style={{ width: '960px', minWidth: '960px', maxWidth: '960px', height: '620px' }}
        className="p-0 gap-0 bg-[#F5F5F5] dark:bg-[#1E1E1E] border border-[#BCBCBC] dark:border-[#333333] text-zinc-900 dark:text-zinc-200 rounded-none shadow-2xl flex flex-col font-sans select-none overflow-hidden [&>button]:hidden"
      >
        <input 
          type="file" 
          accept=".pdf,.ai,.eps,.svg" 
          className="hidden" 
          ref={fileInputRef} 
          onChange={handleFileSelect} 
        />
        {/* BARRA DE TÍTULO */}
        <div className="h-7 px-3 bg-white dark:bg-[#252526] border-b border-[#D8D8D8] dark:border-[#2D2D2D] flex items-center justify-between">
          <span className="text-xs font-normal text-zinc-800 dark:text-zinc-300">
            Criar um novo documento
          </span>
          <button 
            onClick={() => onOpenChange(false)}
            className="text-zinc-500 hover:text-black dark:hover:text-white p-0.5"
          >
            <X className="w-3.5 h-3.5"/>
          </button>
        </div>

        {/* ABAS SUPERIORES */}
        <div className="h-7 px-3 bg-[#EAEAEA] dark:bg-[#222222] border-b border-[#D0D0D0] dark:border-[#2D2D2D] flex items-center gap-1 text-xs">
          <button
            onClick={() => setActiveTab('config')}
            className={`px-3 h-full border-b-2 transition-colors ${
              activeTab === 'config'
                ? 'border-blue-600 bg-white dark:bg-[#1E1E1E] text-zinc-900 dark:text-white font-medium'
                : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
            }`}
          >
            Configurações do documento
          </button>
          <button
            onClick={() => setActiveTab('modelos')}
            className={`px-3 h-full border-b-2 transition-colors ${
              activeTab === 'modelos'
                ? 'border-blue-600 bg-white dark:bg-[#1E1E1E] text-zinc-900 dark:text-white font-medium'
                : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
            }`}
          >
            Modelos
          </button>
        </div>

        {/* CORPO PRINCIPAL */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* LADO ESQUERDO: GRADE DE SUBSTRATOS (540px cravados) */}
          <div style={{ width: '540px', minWidth: '540px' }} className="p-3 bg-white dark:bg-[#181818] border-r border-[#D8D8D8] dark:border-[#2D2D2D] flex flex-col">
            <div className="flex items-center gap-2 pb-2 mb-2 border-b border-[#EEEEEE] dark:border-[#262626]">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-zinc-400"/>
                <input
                  type="text"
                  placeholder="Pesquisar predefinições"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-7 pl-7 pr-2 text-xs bg-white dark:bg-[#141414] border border-[#CCCCCC] dark:border-[#383838] rounded-none focus:outline-none focus:border-blue-600"
                />
              </div>
              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
                className="h-7 text-xs bg-white dark:bg-[#141414] border border-[#CCCCCC] dark:border-[#383838] px-2 text-zinc-700 dark:text-zinc-300 rounded-none focus:outline-none"
              >
                <option value="Todos">Tipo de página</option>
                <option value="Bobina">Bobinas</option>
                <option value="Chapa">Chapas</option>
                <option value="Folha">Folhas</option>
              </select>
            </div>

            <div className="flex-1 grid grid-cols-3 gap-2 overflow-y-auto pr-1 content-start">
              {presetsFiltrados.map((p) => {
                const isSelected = selectedPresetId === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => handleSelectPreset(p)}
                    className={`h-28 p-2 border cursor-pointer flex flex-col items-center justify-between text-center transition-all ${
                      isSelected
                        ? 'border-2 border-blue-600 bg-blue-50/20 dark:bg-blue-950/20'
                        : 'border-[#E2E2E2] dark:border-[#2C2C2C] hover:border-zinc-400 bg-white dark:bg-[#1C1C1C]'
                    }`}
                  >
                    <div className="w-10 h-12 border border-zinc-400 dark:border-zinc-600 rounded-[1px] flex items-center justify-center bg-zinc-50 dark:bg-[#161616] mt-0.5 shadow-sm">
                      <div className="w-6 h-8 border border-dashed border-zinc-300 dark:border-zinc-700" />
                    </div>
                    <div>
                      <span className="font-medium text-xs text-zinc-800 dark:text-zinc-200 block truncate w-32">
                        {p.nome}
                      </span>
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block font-mono">
                        {p.largura} × {p.altura} mm
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="h-6 flex items-center gap-2 pt-2 border-t border-[#EEEEEE] dark:border-[#262626]">
              <button className="text-zinc-600 dark:text-zinc-400 hover:text-black p-0.5"><Plus className="w-3.5 h-3.5"/></button>
              <button className="text-zinc-600 dark:text-zinc-400 hover:text-black p-0.5"><Minus className="w-3.5 h-3.5"/></button>
            </div>
          </div>

          {/* LADO DIREITO: CONFIGURAÇÕES TÉCNICAS (420px flexíveis) */}
          <div className="flex-1 p-4 bg-[#F9F9F9] dark:bg-[#1E1E1E] overflow-y-auto text-xs space-y-4">
            <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 block pb-1">
              Configurações do documento
            </span>

            {/* GERAL */}
            <div className="space-y-2">
              <span className="font-semibold text-[11px] text-zinc-700 dark:text-zinc-300 block">Geral</span>
              
              <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                <Label className="text-[11px] text-zinc-600 dark:text-zinc-400 font-normal">Nome:</Label>
                <Input onChange={(e) => setNomeJob(e.target.value)} value={nomeJob}
                  className="h-6 text-xs bg-white dark:bg-[#141414] border-[#CCCCCC] dark:border-[#383838] rounded-none px-2"
                />
              </div>

              <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                <Label className="text-[11px] text-zinc-600 dark:text-zinc-400 font-normal">Arte:</Label>
                <div className="flex gap-1">
                  <Input onChange={(e) => setCaminhoArte(e.target.value)} value={caminhoArte}
                    className="h-6 text-[11px] font-mono bg-white dark:bg-[#141414] border-[#CCCCCC] dark:border-[#383838] rounded-none px-2 truncate"
                  />
                  <Button 
                    onClick={() => fileInputRef.current?.click()}
                    className="h-6 px-2 rounded-none border-[#CCCCCC] dark:border-[#383838]" size="sm" variant="outline">
                    <FolderOpen className="w-3 h-3"/>
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                <Label className="text-[11px] text-zinc-600 dark:text-zinc-400 font-normal">Tiragem:</Label>
                <Input onChange={(e) => setTiragem(Number(e.target.value))} type="number" value={tiragem}
                  className="h-6 text-xs bg-white dark:bg-[#141414] border-[#CCCCCC] dark:border-[#383838] rounded-none px-2 font-bold w-32"
                />
              </div>

              <div className="grid grid-cols-[70px_1fr] items-center gap-2 pt-1">
                <Label className="text-[11px] text-zinc-600 dark:text-zinc-400 font-normal">Modo de cor:</Label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1 text-[11px] cursor-pointer">
                    <input
                      type="radio"
                      checked={corPrimaria === 'CMYK'}
                      onChange={() => setCorPrimaria('CMYK')}
                      name="cores"
                    />
                    <span>CMYK</span>
                  </label>
                  <label className="flex items-center gap-1 text-[11px] cursor-pointer">
                    <input
                      type="radio"
                      checked={corPrimaria === 'RGB'}
                      onChange={() => setCorPrimaria('RGB')}
                      name="cores"
                    />
                    <span>RGB</span>
                  </label>
                </div>
              </div>
            </div>

            {/* DIMENSÕES */}
            <div className="space-y-2 pt-2 border-t border-[#E5E5E5] dark:border-[#2C2C2C]">
              <span className="font-semibold text-[11px] text-zinc-700 dark:text-zinc-300 block">Dimensões</span>

              <div className="grid grid-cols-[70px_120px_1fr] items-center gap-2">
                <Label className="text-[11px] text-zinc-600 dark:text-zinc-400 font-normal">Largura:</Label>
                <Input onChange={(e) => setLarguraMidia(Number(e.target.value))} type="number" value={larguraMidia}
                  className="h-6 text-xs bg-white dark:bg-[#141414] border-[#CCCCCC] dark:border-[#383838] rounded-none px-2"
                />
                <span className="text-[11px] text-zinc-500">milímetros</span>
              </div>

              <div className="grid grid-cols-[70px_120px_1fr] items-center gap-2">
                <Label className="text-[11px] text-zinc-600 dark:text-zinc-400 font-normal">Altura:</Label>
                <Input onChange={(e) => setAlturaMidia(Number(e.target.value))} type="number" value={alturaMidia}
                  className="h-6 text-xs bg-white dark:bg-[#141414] border-[#CCCCCC] dark:border-[#383838] rounded-none px-2"
                />
                <span className="text-[11px] text-zinc-500">milímetros</span>
              </div>

              {/* Botões de Orientação */}
              <div className="grid grid-cols-[70px_1fr] items-center gap-2 pt-1">
                <Label className="text-[11px] text-zinc-600 dark:text-zinc-400 font-normal">Orientação:</Label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setOrientacao('retrato')}
                    className={`h-6 w-8 border flex items-center justify-center transition-all ${
                      orientacao === 'retrato'
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-600'
                        : 'border-[#CCCCCC] dark:border-[#383838] bg-white dark:bg-[#141414]'
                    }`}
                  >
                    <div className="w-2.5 h-4 border border-current" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrientacao('paisagem')}
                    className={`h-6 w-8 border flex items-center justify-center transition-all ${
                      orientacao === 'paisagem'
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-600'
                        : 'border-[#CCCCCC] dark:border-[#383838] bg-white dark:bg-[#141414]'
                    }`}
                  >
                    <div className="w-4 h-2.5 border border-current" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-[70px_120px_1fr] items-center gap-2">
                <Label className="text-[11px] text-zinc-600 dark:text-zinc-400 font-normal">Gap / Sangra:</Label>
                <Input onChange={(e) => setGapMm(Number(e.target.value))} type="number" value={gapMm}
                  className="h-6 text-xs bg-white dark:bg-[#141414] border-[#CCCCCC] dark:border-[#383838] rounded-none px-2"
                />
                <span className="text-[11px] text-zinc-500">mm</span>
              </div>
            </div>

            {/* EXPANSÍVEIS (LAYOUT & MOTOR) */}
            <div className="pt-2 border-t border-[#E5E5E5] dark:border-[#2C2C2C] space-y-2">
              <button
                type="button"
                onClick={() => setLayoutAberto(!layoutAberto)}
                className="flex items-center gap-1 font-semibold text-[11px] text-zinc-700 dark:text-zinc-300 w-full text-left"
              >
                {layoutAberto ? <ChevronDown className="w-3 h-3"/> : <ChevronRight className="w-3 h-3"/>}
                Layout & Motor de Produção
              </button>

              {layoutAberto && (
                <div className="pl-4 space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-zinc-600 dark:text-zinc-400">Motor:</span>
                    <select
                      value={motor}
                      onChange={(e: any) => setMotor(e.target.value)}
                      className="h-6 text-xs bg-white dark:bg-[#141414] border border-[#CCCCCC] dark:border-[#383838] px-2 rounded-none focus:outline-none"
                    >
                      <option value="ILLUSTRATOR_COM">Adobe Illustrator COM (3 Camadas)</option>
                      <option value="CLI_NET">AutoImposer CLI (.NET Rápido)</option>
                    </select>
                  </div>

                  <div className="p-2 bg-white dark:bg-[#141414] border border-[#DCDCDC] dark:border-[#2E2E2E] text-[11px]">
                    <div className="flex justify-between font-mono">
                      <span>Grade: {rollCalc.cols} col × {rollCalc.rows} lin</span>
                      <span className="text-blue-600 font-semibold">{rollCalc.totalCopies} peças</span>
                    </div>
                    <div className="flex justify-between text-zinc-500 text-[10px] mt-0.5">
                      <span>Comprimento final:</span>
                      <span>{rollCalc.totalLengthMm} mm ({rollCalc.totalLengthMeters} m)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* RODAPÉ */}
        <div className="h-10 px-4 bg-[#EAEAEA] dark:bg-[#252526] border-t border-[#D6D6D6] dark:border-[#2E2E2E] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button className="w-5 h-5 border border-[#CCCCCC] dark:border-[#444] bg-white dark:bg-[#1A1A1A] flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100">
              <HelpCircle className="w-3.5 h-3.5"/>
            </button>
            <label className="flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-400 cursor-pointer">
              <input type="checkbox" className="rounded-none border-zinc-400" />
              <span>Não mostrar esta caixa de diálogo novamente</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <Button className="h-6 px-5 text-xs bg-blue-600 hover:bg-blue-700 text-white font-normal rounded-none border border-blue-700" onClick={handleConfirmar} size="sm">
              OK
            </Button>
            <Button onClick={() => onOpenChange(false)} size="sm" variant="outline"
              className="h-6 px-4 text-xs bg-white dark:bg-[#1E1E1E] border-[#CCCCCC] dark:border-[#444] rounded-none hover:bg-zinc-100 font-normal"
            >
              Cancelar
            </Button>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
