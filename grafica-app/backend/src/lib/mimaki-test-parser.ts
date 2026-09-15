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
  parseErrors: string[];
}

const ORDER_CODE_RE = /^\d{5}$/;
const ITEM_DESC_RE = /^item\s*\d+$/i;
const SIZE_RE = /(\d+(?:[.,]\d+)?)\s*[xX]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?/;
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

/**
 * Extrai metadados do nome do arquivo PDF (best-effort).
 * Nunca lança: o que não reconhecer vira parse_errors.
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
      parseErrors: ['KEY_FILENAME vazio'],
    };
  }

  const segments = base.split(' - ').map((s) => s.trim());

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

  // 4. Tamanho no filename
  const sizeMatch = base.match(SIZE_RE);
  let widthMm: number | null = null;
  let heightMm: number | null = null;
  if (sizeMatch) {
    widthMm = parseNumber(sizeMatch[1]);
    heightMm = parseNumber(sizeMatch[2]);
    const unit = sizeMatch[3];
    if (!unit) errors.push('tamanho sem unidade — assumido mm');
  } else {
    errors.push('tamanho não reconhecido no nome');
  }

  // 5. Material = segmentos entre cliente e o segmento que contém o tamanho;
  //    se houver segmento com palavra-chave de material, prefere-o.
  let material: string | null = null;
  const afterClient = segments.slice(cursor);
  const sizeIdx = afterClient.findIndex((seg) => SIZE_RE.test(seg));
  const between = sizeIdx > 0 ? afterClient.slice(0, sizeIdx) : [];
  if (between.length > 0) {
    material = between.join(' ');
  }
  const keywordHit = afterClient.find((seg) => MATERIAL_KEYWORD_RE.test(seg));
  if (keywordHit && (tagHits(keywordHit) > tagHits(material ?? ''))) {
    material = keywordHit;
  }

  // 6. Unidades e cópias
  const unitsMatch = base.match(UNITS_RE);
  const units = unitsMatch ? parseInt(unitsMatch[1], 10) : null;
  const copiesMatch = base.match(COPIES_RE);
  const copies = copiesMatch ? parseInt(copiesMatch[1], 10) : null;

  return { orderCode, client, material, widthMm, heightMm, units, copies, parseErrors: errors };
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
 * Converte o textContent de um CSV RasterLink em registros de impressão.
 * Ignora o header; aceita múltiplas linhas (variantes BRANCO+COR de um mesmo job).
 */
export function parsePrintCsv(text: string): MimakiTestParsedRow[] {
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

  return rows;
}