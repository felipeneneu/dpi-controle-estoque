export type ImpositionFillMode = 'fill_row' | 'fill_advance';

export interface RollCalculationInput {
  arteWMm: number;
  arteHMm: number;
  rollWidthMm: number;        // Largura útil da bobina ou chapa (ex: 665 mm ou 700 mm)
  sideMarginMm: number;       // Margem lateral (ex: 0 mm)
  topBottomMarginMm?: number; // Margem topo/base (ex: 0 mm)
  initialLengthMm: number;    // Avanço inicial do rolo ou altura da chapa (ex: 986 mm ou 1000 mm)
  gapMm: number;              // Espaçamento entre peças (ex: 0 mm ou 2 mm)
  targetCopies: number;       // Cópias solicitadas (ex: 1015)
  forcedOrientation?: 'auto' | 'direct' | 'rotated';
  forcedCols?: number;
  fillMode?: ImpositionFillMode; // 'fill_row' (preenche linha inteira) ou 'fill_advance' (preenche o avanço/chapa total)
}

export interface GridOption {
  orientation: 'direct' | 'rotated';
  pecaWMm: number;
  pecaHMm: number;
  cols: number;
  rows: number;
  total: number;
  surplusCopies: number;
  lengthMm: number;
  isExact: boolean;
  fits: boolean;
}

export interface RollCalculationResult {
  orientation: 'direct' | 'rotated';
  pecaWMm: number;
  pecaHMm: number;
  cols: number;
  rows: number;
  targetCopies: number;
  totalCopies: number;
  surplusCopies: number; // Quantas peças a mais foram geradas pela linha completa ou pelo preenchimento total
  totalLengthMm: number;
  totalLengthMeters: number;
  fitsInInitialLength: boolean;
  isExactMatch: boolean;
  utilWidthMm: number;
  maxCopiesInAdvance: number; // Quantas peças caberiam se preenchesse 100% da chapa/avanço
  maxRowsInAdvance: number;
  fillMode: ImpositionFillMode;
  alternativeGrids: GridOption[];
}

export function calculateRollImposition(input: RollCalculationInput): RollCalculationResult {
  const marginTB = input.topBottomMarginMm ?? 0;
  const utilWidthMm = Math.max(0, input.rollWidthMm - 2 * input.sideMarginMm);
  const fillMode = input.fillMode ?? 'fill_row';

  const orientations: Array<'direct' | 'rotated'> =
    input.forcedOrientation === 'direct'
      ? ['direct']
      : input.forcedOrientation === 'rotated'
        ? ['rotated']
        : ['direct', 'rotated'];

  const allGrids: GridOption[] = [];

  for (const ori of orientations) {
    const pW = ori === 'rotated' ? input.arteHMm : input.arteWMm;
    const pH = ori === 'rotated' ? input.arteWMm : input.arteHMm;

    const maxCols = Math.floor((utilWidthMm + input.gapMm) / (pW + input.gapMm));
    if (maxCols <= 0) continue;

    // Calcula capacidade máxima se preencher o avanço/altura total do substrato
    const maxRowsInLength = Math.max(1, Math.floor((input.initialLengthMm - 2 * marginTB + input.gapMm) / (pH + input.gapMm)));

    for (let c = maxCols; c >= Math.max(1, maxCols - 25); c--) {
      let r: number;

      if (fillMode === 'fill_advance') {
        // Modo: Preenche todo o avanço/altura da chapa
        r = maxRowsInLength;
      } else {
        // Modo: Preenche até fechar a linha completa que atenda as cópias solicitadas
        r = Math.ceil(Math.max(1, input.targetCopies) / c);
      }

      const total = c * r;
      const lengthMm = r * pH + (r - 1) * input.gapMm + 2 * marginTB;
      const fits = lengthMm <= input.initialLengthMm;
      const surplusCopies = Math.max(0, total - input.targetCopies);

      allGrids.push({
        orientation: ori,
        pecaWMm: pW,
        pecaHMm: pH,
        cols: c,
        rows: r,
        total,
        surplusCopies,
        lengthMm,
        isExact: total === input.targetCopies,
        fits,
      });
    }
  }

  if (allGrids.length === 0) {
    throw new Error(`A arte (${input.arteWMm}×${input.arteHMm}mm) não cabe na largura útil configurada (${utilWidthMm}mm).`);
  }

  // Ordena por aproveitamento ótimo
  allGrids.sort((a, b) => {
    if (fillMode === 'fill_advance') {
      // No modo preencher avanço, prefere o que produz mais peças e aproveita melhor a largura
      if (b.total !== a.total) return b.total - a.total;
      return a.lengthMm - b.lengthMm;
    }
    // No modo preencher linha, prefere o que atende dentro do comprimento inicial com menor desperdício
    if (a.fits && !b.fits) return -1;
    if (!a.fits && b.fits) return 1;
    if (a.isExact && !b.isExact) return -1;
    if (!a.isExact && b.isExact) return 1;
    return a.lengthMm - b.lengthMm;
  });

  let selected = allGrids[0];

  if (input.forcedCols && input.forcedCols > 0) {
    const forced = allGrids.find((g) => g.cols === input.forcedCols);
    if (forced) selected = forced;
  }

  // Capacidade máxima no avanço com a orientação selecionada
  const pHSelected = selected.pecaHMm;
  const maxRowsAdvance = Math.max(1, Math.floor((input.initialLengthMm - 2 * marginTB + input.gapMm) / (pHSelected + input.gapMm)));
  const maxCopiesAdvance = selected.cols * maxRowsAdvance;

  return {
    orientation: selected.orientation,
    pecaWMm: selected.pecaWMm,
    pecaHMm: selected.pecaHMm,
    cols: selected.cols,
    rows: selected.rows,
    targetCopies: input.targetCopies,
    totalCopies: selected.total,
    surplusCopies: Math.max(0, selected.total - input.targetCopies),
    totalLengthMm: selected.lengthMm,
    totalLengthMeters: Number((selected.lengthMm / 1000).toFixed(3)),
    fitsInInitialLength: selected.lengthMm <= input.initialLengthMm,
    isExactMatch: selected.isExact,
    utilWidthMm,
    maxCopiesInAdvance: maxCopiesAdvance,
    maxRowsInAdvance: maxRowsAdvance,
    fillMode,
    alternativeGrids: allGrids,
  };
}