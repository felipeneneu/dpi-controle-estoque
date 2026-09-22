import { toPrecision } from './math.js';

const HEADER_KEY = 'KEY_FILENAME';

type InkKeys = {
  cyan: number;
  magenta: number;
  yellow: number;
  black: number;
  white1: number;
  white2: number;
  varnish1: number;
  varnish2: number;
  total: number;
};

export interface MimakiTestParsedRow {
  keyFilename: string;
  result: 'OK' | 'NG';
  resultDetail: string | null;
  arrangeCnt: number | null;
  inks: InkKeys;
  ripSTime: string | null;
  ripETime: string | null;
  printSTime: string | null;
  printETime: string | null;
  rawFilenames?: string[];
  layers?: string[];
  filenameMeta: FilenameMeta;
}

export interface FilenameMeta {
  orderCode: string | null;
  client: string | null;
  material: string | null;
  widthMm: number | null;
  heightMm: number | null;
  units: number | null;
  copies: number | null;
  bobinaSerial: string | null;
  isImposto?: boolean;
  impostoWidthMm?: number | null;
  impostoHeightMm?: number | null;
  unitPieceWidthMm?: number | null;
  unitPieceHeightMm?: number | null;
  estimatedLinearMeters?: number | null;
  layers?: string[];
  parseErrors: string[];
}

export function extractBobinaSerial(filename: string): string | null {
  const match = filename.match(/(?:^|[\s\-_#[\](])(BOB[-_]?[A-Z0-9]{3,8})(?:$|[\s\-_#[\])])/i);
  if (!match) return null;
  let raw = match[1].toUpperCase().replace('_', '-');
  if (!raw.includes('-')) {
    raw = raw.replace(/^BOB([A-Z0-9]+)/i, 'BOB-$1');
  }
  return raw;
}

const ORDER_CODE_RE = /^\d{5}$/;
const ITEM_DESC_RE = /^item\s*\d+$/i;
const IMPOSTO_SIZE_RE = /(?:IMPOSTO|MONTAGEM|ROLO)[_\-\s]+(\d+(?:[.,]\d+)?)\s*[xX]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?/i;
const IMPOSTO_WIDTH_RE = /(?:IMPOSTO|MONTAGEM|ROLO)[_\-\s]+(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?/i;
const PIECE_SIZE_RE = /(\d+(?:[.,]\d+)?)\s*[xX]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?/i;
const UNITS_RE = /(\d+)\s*un(?:id(?:ade)?s?)?\b/i;
const COPIES_RE = /(\d+)\s*copi(?:a|as)\b/i;
const MATERIAL_KEYWORD_RE = /vinil|adesivo|bopp|bopet|papel|couro|etiqueta|metalizado|transparente|brilho|fosco|lona|clear/i;
const TIMESTAMP_RE = /^\d{8}_\d{6}$/;

/**
 * Divide uma linha de CSV respeitando aspas duplas.
 * Tolerante a vírgulas extras dentro de campos entre aspas.
 */
function splitCsvLine(line: string): string[] {
  const cols: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cols.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cols.push(current.trim());
  return cols;
}

function normalizeTimestamp(value: string | undefined): { ts: string | null; error?: string } {
  const v = value?.trim() ?? '';
  if (!v) return { ts: null };
  if (TIMESTAMP_RE.test(v)) return { ts: v };
  return { ts: null, error: `timestamp inválido: ${v}` };
}

/**
 * Parseia o campo KEY_INKUSE ("Cyan:1.277cc Magenta:1.062cc ...") nos 8 canais UV.
 * White×2 e Clear×2 viram white1/white2 e varnish1/varnish2 respectivamente.
 */
function parseInkUse(inkUse: string | undefined): { inks: InkKeys; errors: string[] } {
  const errors: string[] = [];
  const counts: Record<string, number> = {};
  const values: Partial<InkKeys> = {};
  let total = 0;

  const tokens = (inkUse ?? '').match(/[A-Za-z]+:\d+(?:\.\d+)?/g) ?? [];
  for (const token of tokens) {
    const m = token.match(/^([A-Za-z]+):(\d+(?:\.\d+)?)/);
    if (!m) continue;
    const name = m[1];
    const value = Math.abs(parseFloat(m[2])) || 0;
    counts[name] = (counts[name] ?? 0) + 1;
    const occurrence = counts[name];
    total += value;

    const colorMap: Record<string, string> = {
      Cyan: 'cyan',
      Magenta: 'magenta',
      Yellow: 'yellow',
      Black: 'black',
      White: occurrence === 1 ? 'white1' : 'white2',
      Clear: occurrence === 1 ? 'varnish1' : 'varnish2',
    };
    const target = colorMap[name];
    if (target && values[target as keyof InkKeys] === undefined) {
      (values as Record<string, number>)[target] = toPrecision(value, 3);
    }
  }

  if (tokens.length === 0) {
    errors.push('KEY_INKUSE sem canais reconhecidos (armazenado como cru)');
  }

  return {
    inks: {
      cyan: values.cyan ?? 0,
      magenta: values.magenta ?? 0,
      yellow: values.yellow ?? 0,
      black: values.black ?? 0,
      white1: values.white1 ?? 0,
      white2: values.white2 ?? 0,
      varnish1: values.varnish1 ?? 0,
      varnish2: values.varnish2 ?? 0,
      total: toPrecision(total, 3),
    },
    errors,
  };
}

function parseNumber(value: string): number | null {
  const normalized = value.replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function normalizeDimensionToMm(val: number | null, unit: string | undefined): number | null {
  if (val == null) return null;
  const u = (unit ?? 'mm').toLowerCase().trim();
  if (u === 'cm') return Number((val * 10).toFixed(2));
  if (u === 'm') return Number((val * 1000).toFixed(2));
  return Number(val.toFixed(2));
}

/**
 * Estima o avanço linear no rolo de 700mm considerando o tamanho da peça e quantidade de unidades.
 * Testa ambas as orientações da peça no rolo para encontrar o melhor encaixe (menor avanço).
 */
export function estimateGeometricAdvanceMm(
  pieceWMm: number | null,
  pieceHMm: number | null,
  units: number | null,
  usableRollWMm = 700,
): number | null {
  if (!pieceWMm || !pieceHMm || !units || units <= 0) return null;

  // Orientação A: W na largura do rolo, H no avanço
  const colsA = Math.max(1, Math.floor(usableRollWMm / (pieceWMm + 2)));
  const rowsA = Math.ceil(units / colsA);
  const advanceA = rowsA * (pieceHMm + 2);

  // Orientação B: H na largura do rolo, W no avanço
  const colsB = Math.max(1, Math.floor(usableRollWMm / (pieceHMm + 2)));
  const rowsB = Math.ceil(units / colsB);
  const advanceB = rowsB * (pieceWMm + 2);

  return Math.min(advanceA, advanceB);
}

export function detectLayer(filename: string): 'BRANCO' | 'COR' | 'VERNIZ' | null {
  const clean = filename.replace(/\.pdf$/i, '').trim();
  if (/[-_\s]BRANCO$/i.test(clean)) return 'BRANCO';
  if (/[-_\s]COR$/i.test(clean)) return 'COR';
  if (/[-_\s](?:VERNIZ|CLEAR)$/i.test(clean)) return 'VERNIZ';
  return null;
}

export function cleanLayerSuffix(filename: string): string {
  const isPdf = /\.pdf$/i.test(filename);
  let base = filename.replace(/\.pdf$/i, '').trim();
  base = base.replace(/[-_\s]+(?:BRANCO|COR|VERNIZ|CLEAR)$/i, '').trim();
  return isPdf ? `${base}.pdf` : base;
}

/**
 * Extrai metadados do nome do arquivo PDF (best-effort).
 * Dá prioridade a tags de imposição (IMPOSTO_666x924mm) sobre tamanho de peça unitária.
 * Converte corretamente cm e m para mm.
 */
export function extractFilenameMeta(keyFilename: string): FilenameMeta {
  const base = keyFilename.replace(/\.pdf$/i, '').trim();
  const errors: string[] = [];

  if (!base) {
    return {
      orderCode: null,
      client: null,
      material: null,
      widthMm: null,
      heightMm: null,
      units: null,
      copies: null,
      bobinaSerial: null,
      parseErrors: ['KEY_FILENAME vazio'],
    };
  }

  const detectedL = detectLayer(base);
  const layers = detectedL ? [detectedL] : [];

  const bobinaSerial = extractBobinaSerial(base);

  const rawSegments = base.split(' - ').map((s) => s.trim());
  const segments = rawSegments.filter((seg) => {
    const b = extractBobinaSerial(seg);
    return !b || seg.length > b.length + 3;
  });

  // 1. Código do pedido (5 dígitos) no primeiro segmento
  let orderCode: string | null = null;
  let cursor = 0;
  const first = segments[cursor];
  if (first && ORDER_CODE_RE.test(first)) {
    orderCode = first;
    cursor++;
  }

  // 2. Pula descritores de item ("Item 1", "Item 2")
  while (cursor < segments.length && ITEM_DESC_RE.test(segments[cursor])) cursor++;

  // 3. Cliente = próximo segmento
  const client = cursor < segments.length ? segments[cursor] : null;
  cursor++;

  // 4. Unidades e cópias
  const unitsMatch = base.match(UNITS_RE);
  const units = unitsMatch ? parseInt(unitsMatch[1], 10) : null;
  const copiesMatch = base.match(COPIES_RE);
  const copies = copiesMatch ? parseInt(copiesMatch[1], 10) : null;

  // 5. Tamanho da peça unitária e Imposição
  let widthMm: number | null = null;
  let heightMm: number | null = null;
  let isImposto = false;
  let impostoWidthMm: number | null = null;
  let impostoHeightMm: number | null = null;
  let unitPieceWidthMm: number | null = null;
  let unitPieceHeightMm: number | null = null;
  let estimatedLinearMeters: number | null = null;

  // Verifica se há tag de imposição completa (ex: IMPOSTO_666x924mm)
  const impostoSizeMatch = base.match(IMPOSTO_SIZE_RE);
  // Verifica se há tag de imposição apenas com largura (ex: IMPOSTO_700mm)
  const impostoWidthMatch = base.match(IMPOSTO_WIDTH_RE);
  // Tamanho padrão de peça
  const pieceSizeMatch = base.match(PIECE_SIZE_RE);

  if (pieceSizeMatch) {
    unitPieceWidthMm = normalizeDimensionToMm(parseNumber(pieceSizeMatch[1]), pieceSizeMatch[3]);
    unitPieceHeightMm = normalizeDimensionToMm(parseNumber(pieceSizeMatch[2]), pieceSizeMatch[3]);
    if (!pieceSizeMatch[3]) errors.push('tamanho sem unidade — assumido mm');
  }

  if (impostoSizeMatch) {
    isImposto = true;
    impostoWidthMm = normalizeDimensionToMm(parseNumber(impostoSizeMatch[1]), impostoSizeMatch[3]);
    impostoHeightMm = normalizeDimensionToMm(parseNumber(impostoSizeMatch[2]), impostoSizeMatch[3]);
    widthMm = impostoWidthMm;
    heightMm = impostoHeightMm;
  } else if (impostoWidthMatch && unitPieceWidthMm && unitPieceHeightMm && units) {
    isImposto = true;
    impostoWidthMm = normalizeDimensionToMm(parseNumber(impostoWidthMatch[1]), impostoWidthMatch[2]);
    const geoAdvance = estimateGeometricAdvanceMm(unitPieceWidthMm, unitPieceHeightMm, units, impostoWidthMm ?? 700);
    if (geoAdvance) {
      heightMm = geoAdvance;
      widthMm = impostoWidthMm;
      estimatedLinearMeters = Number((geoAdvance / 1000).toFixed(3));
    }
  } else if (unitPieceWidthMm && unitPieceHeightMm) {
    widthMm = unitPieceWidthMm;
    heightMm = unitPieceHeightMm;
    if (units) {
      const geoAdvance = estimateGeometricAdvanceMm(widthMm, heightMm, units, 700);
      if (geoAdvance) {
        estimatedLinearMeters = Number((geoAdvance / 1000).toFixed(3));
      }
    }
  } else {
    errors.push('tamanho não reconhecido no nome');
  }

  // 6. Material = segmentos entre cliente e tamanho/imposto
  let material: string | null = null;
  const afterClient = segments.slice(cursor);
  const sizeIdx = afterClient.findIndex((seg) => PIECE_SIZE_RE.test(seg) || IMPOSTO_SIZE_RE.test(seg));
  const between = sizeIdx > 0 ? afterClient.slice(0, sizeIdx) : [];
  if (between.length > 0) {
    material = between.join(' ');
  }
  const keywordHit = afterClient.find((seg) => MATERIAL_KEYWORD_RE.test(seg));
  if (keywordHit && tagHits(keywordHit) > tagHits(material ?? '')) {
    material = keywordHit;
  }

  return {
    orderCode,
    client,
    material,
    widthMm,
    heightMm,
    units,
    copies,
    bobinaSerial,
    isImposto,
    impostoWidthMm,
    impostoHeightMm,
    unitPieceWidthMm,
    unitPieceHeightMm,
    estimatedLinearMeters,
    layers,
    parseErrors: errors,
  };
}

function tagHits(value: string): number {
  const words = MATERIAL_KEYWORD_RE;
  let hits = 0;
  const re = new RegExp(words.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(value))) hits++;
  return hits;
}

/**
 * Consolida linhas que pertencem à mesma impressão física sobreposta (ex: BRANCO + COR).
 * O RasterLink gera uma linha por camada no mesmo CSV compartilhando o mesmo printSTime e
 * já reporta o consumo cumulativo total de tintas repetido nas linhas.
 */
export function consolidateCompositeRows(rows: MimakiTestParsedRow[]): MimakiTestParsedRow[] {
  if (rows.length <= 1) return rows;

  const groups = new Map<string, MimakiTestParsedRow[]>();

  for (const row of rows) {
    // Chave de agrupamento: printSTime compartilhado (ou ripSTime)
    const key = row.printSTime ?? row.ripSTime ?? row.keyFilename;
    const existing = groups.get(key) ?? [];
    existing.push(row);
    groups.set(key, existing);
  }

  const consolidated: MimakiTestParsedRow[] = [];

  for (const [, group] of groups) {
    if (group.length === 1) {
      const single = group[0];
      single.rawFilenames = [single.keyFilename];
      single.layers = single.filenameMeta.layers ?? (detectLayer(single.keyFilename) ? [detectLayer(single.keyFilename)!] : []);
      consolidated.push(single);
      continue;
    }

    // Múltiplas camadas do mesmo print físico
    const rawFilenames = group.map((r) => r.keyFilename);
    const layers = Array.from(
      new Set(
        group.flatMap(
          (r) => r.filenameMeta.layers ?? (detectLayer(r.keyFilename) ? [detectLayer(r.keyFilename)!] : []),
        ),
      ),
    );

    // Nome unificado sem sufixo de camada
    const cleanFilename = cleanLayerSuffix(group[0].keyFilename);

    // Tintas: pega o máximo por canal (para não duplicar quando o RasterLink repete totais)
    const inks: InkKeys = {
      cyan: toPrecision(Math.max(...group.map((r) => r.inks.cyan)), 3),
      magenta: toPrecision(Math.max(...group.map((r) => r.inks.magenta)), 3),
      yellow: toPrecision(Math.max(...group.map((r) => r.inks.yellow)), 3),
      black: toPrecision(Math.max(...group.map((r) => r.inks.black)), 3),
      white1: toPrecision(Math.max(...group.map((r) => r.inks.white1)), 3),
      white2: toPrecision(Math.max(...group.map((r) => r.inks.white2)), 3),
      varnish1: toPrecision(Math.max(...group.map((r) => r.inks.varnish1)), 3),
      varnish2: toPrecision(Math.max(...group.map((r) => r.inks.varnish2)), 3),
      total: 0,
    };
    inks.total = toPrecision(
      inks.cyan + inks.magenta + inks.yellow + inks.black + inks.white1 + inks.white2 + inks.varnish1 + inks.varnish2,
      3,
    );

    const hasNg = group.some((r) => r.result === 'NG');
    const result: 'OK' | 'NG' = hasNg ? 'NG' : 'OK';
    const resultDetails = Array.from(new Set(group.map((r) => r.resultDetail).filter(Boolean))) as string[];
    const resultDetail = resultDetails.length > 0 ? resultDetails.join('; ') : null;

    const arrangeCnt = Math.max(...group.map((r) => r.arrangeCnt ?? 1));

    const ripSTimes = group.map((r) => r.ripSTime).filter(Boolean) as string[];
    const ripETimes = group.map((r) => r.ripETime).filter(Boolean) as string[];
    const printETimes = group.map((r) => r.printETime).filter(Boolean) as string[];

    const ripSTime = ripSTimes.length > 0 ? ripSTimes.sort()[0] : null;
    const ripETime = ripETimes.length > 0 ? ripETimes.sort().reverse()[0] : null;
    const printSTime = group[0].printSTime;
    const printETime = printETimes.length > 0 ? printETimes.sort().reverse()[0] : null;

    const filenameMeta = extractFilenameMeta(cleanFilename);
    filenameMeta.layers = layers;

    // Combina erros de parse de todas as linhas
    const allErrors = Array.from(
      new Set(group.flatMap((r) => r.filenameMeta.parseErrors).concat(filenameMeta.parseErrors)),
    );
    filenameMeta.parseErrors = allErrors;

    consolidated.push({
      keyFilename: cleanFilename,
      rawFilenames,
      layers,
      result,
      resultDetail,
      arrangeCnt,
      inks,
      ripSTime,
      ripETime,
      printSTime,
      printETime,
      filenameMeta,
    });
  }

  return consolidated;
}

/**
 * Converte o textContent de um CSV RasterLink em registros de impressão.
 * Por padrão consolida variantes sobrepostas (BRANCO+COR) de um mesmo job.
 */
export function parsePrintCsv(
  text: string,
  options: { consolidate?: boolean } = { consolidate: true },
): MimakiTestParsedRow[] {
  const rows: MimakiTestParsedRow[] = [];

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const cols = splitCsvLine(line);
    if (cols.length === 0) continue;
    if (cols[0] === HEADER_KEY) continue;

    const keyFilename = cols[0] ?? '';
    const resultRaw = (cols[1] ?? '').toUpperCase();

    if (!keyFilename) continue;
    if (resultRaw !== 'OK' && resultRaw !== 'NG') continue;

    const { inks, errors: inkErrors } = parseInkUse(cols[2]);
    const { ts: ripSTime, error: ripSErr } = normalizeTimestamp(cols[3]);
    const { ts: ripETime, error: ripEErr } = normalizeTimestamp(cols[4]);
    const { ts: printSTime, error: printSErr } = normalizeTimestamp(cols[5]);
    const { ts: printETime, error: printEErr } = normalizeTimestamp(cols[6]);

    const arrangeRaw = cols[7]?.trim();
    const arrangeCnt = arrangeRaw ? parseInt(arrangeRaw, 10) || null : null;

    const resultDetail = (cols[8] ?? '').trim() || null;
    const filenameMeta = extractFilenameMeta(keyFilename);

    rows.push({
      keyFilename,
      result: resultRaw as 'OK' | 'NG',
      resultDetail,
      arrangeCnt,
      inks,
      ripSTime,
      ripETime,
      printSTime,
      printETime,
      filenameMeta,
    });

    // Sinais de parse em timestamp cru vão para o registro para visibilidade na UI
    for (const err of [ripSErr, ripEErr, printSErr, printEErr]) {
      if (err) filenameMeta.parseErrors.push(err);
    }
    filenameMeta.parseErrors.push(...inkErrors);
  }

  if (options.consolidate !== false) {
    return consolidateCompositeRows(rows);
  }

  return rows;
}