import { read as readXls, utils as xlsxUtils } from 'xlsx';

export interface RawJobRow {
  Document?: string;
  'Job type'?: string;
  Status?: string;
  'Substrate type'?: string;
  'Substrate usage m²'?: string | number;
  'Ink used ml'?: string | number;
  'Printing time'?: string;
  'Print mode'?: string;
  'Cost type'?: string;
  [key: string]: unknown;
}

export interface ParsedJob {
  jobName: string;
  mediaType: string;
  mediaAreaM2: number;
  inkTotalMl: number;
  inkCyanMl: number;
  inkLightCyanMl: number;
  inkMagentaMl: number;
  inkLightMagentaMl: number;
  inkYellowMl: number;
  inkBlackMl: number;
  inkOptimizerMl: number;
  printEndDate: string;
  printMode: string;
  resolutionDpi: number | null;
  passCount: number | null;
  printDirection: string | null;
  optimizerEnabled: boolean;
  inkProfile: string | null;
  status: string;
  rawData: RawJobRow;
}

function parseDecimalPtBR(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = value.replace(/[^\d,.]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(dateStr: string | undefined): string {
  if (!dateStr) return new Date().toISOString();
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return new Date().toISOString();
    return d.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function parsePrintMode(mode: string | undefined): {
  resolutionDpi: number | null;
  passCount: number | null;
  printDirection: string | null;
  optimizerEnabled: boolean;
  inkProfile: string | null;
} {
  if (!mode) {
    return { resolutionDpi: null, passCount: null, printDirection: null, optimizerEnabled: false, inkProfile: null };
  }

  const dpiMatch = mode.match(/(\d+)dpi/i);
  const passMatch = mode.match(/(\d+)P\b/i);
  const dirMatch = mode.match(/\b(Bidi|Unidi)\b/i);
  const oeMatch = mode.match(/\bOE\b/);
  const inkMatch = mode.match(/Ink-(\d+)/i);

  return {
    resolutionDpi: dpiMatch ? parseInt(dpiMatch[1], 10) : null,
    passCount: passMatch ? parseInt(passMatch[1], 10) : null,
    printDirection: dirMatch
      ? dirMatch[1].toLowerCase() === 'bidi'
        ? 'bidirectional'
        : 'unidirectional'
      : null,
    optimizerEnabled: !!oeMatch,
    inkProfile: inkMatch ? inkMatch[1] : null,
  };
}

function mapStatus(raw: string | undefined): string {
  if (!raw) return 'completed';
  const lower = raw.toLowerCase();
  if (lower.includes('cancel')) return 'cancelled';
  if (lower.includes('error') || lower.includes('erro')) return 'error';
  return 'completed';
}

function extractInkPerColor(rows: RawJobRow[], jobIndex: number): {
  cyan: number;
  lightCyan: number;
  magenta: number;
  lightMagenta: number;
  yellow: number;
  black: number;
  optimizer: number;
} {
  const result = { cyan: 0, lightCyan: 0, magenta: 0, lightMagenta: 0, yellow: 0, black: 0, optimizer: 0 };

  for (let i = jobIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const doc = (row.Document ?? '').toString().trim();
    if (doc) break;

    const costType = (row['Cost type'] ?? '').toString().trim();
    const inkVal = parseDecimalPtBR(String(row['Ink used ml'] ?? 0));

    if (costType === 'Ink - C' || costType === 'Ink - Cyan') result.cyan = inkVal;
    else if (costType === 'Ink - LC' || costType === 'Ink - Light cyan') result.lightCyan = inkVal;
    else if (costType === 'Ink - M' || costType === 'Ink - Magenta') result.magenta = inkVal;
    else if (costType === 'Ink - LM' || costType === 'Ink - Light magenta') result.lightMagenta = inkVal;
    else if (costType === 'Ink - Y' || costType === 'Ink - Yellow') result.yellow = inkVal;
    else if (costType === 'Ink - K' || costType === 'Ink - Black') result.black = inkVal;
    else if (costType === 'Ink - OP' || costType === 'Ink - Optimizer') result.optimizer = inkVal;
  }

  return result;
}

export function parseXls(filePath: string): ParsedJob[] {
  const workbook = readXls(filePath, { type: 'file' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]!];
  if (!sheet) return [];

  const jsonData = xlsxUtils.sheet_to_json<RawJobRow>(sheet, { defval: '' });

  const jobs: ParsedJob[] = [];

  for (let i = 0; i < jsonData.length; i++) {
    const row = jsonData[i]!;
    const jobName = (row.Document ?? '').toString().trim();
    if (!jobName) continue;

    // Some "Print" rows are summaries (Job type = 'Print'); ignore non-print rows just in case.
    const ink = extractInkPerColor(jsonData, i);
    const totalFromRow = parseDecimalPtBR(row['Ink used ml']);
    const totalCalculated = ink.cyan + ink.lightCyan + ink.magenta + ink.lightMagenta + ink.yellow + ink.black + ink.optimizer;

    const mode = parsePrintMode(String(row['Print mode'] ?? '').trim() || undefined);

    jobs.push({
      jobName,
      mediaType: String(row['Substrate type'] ?? '').trim(),
      mediaAreaM2: parseDecimalPtBR(row['Substrate usage m²']),
      inkTotalMl: totalFromRow || totalCalculated,
      inkCyanMl: ink.cyan,
      inkLightCyanMl: ink.lightCyan,
      inkMagentaMl: ink.magenta,
      inkLightMagentaMl: ink.lightMagenta,
      inkYellowMl: ink.yellow,
      inkBlackMl: ink.black,
      inkOptimizerMl: ink.optimizer,
      printEndDate: parseDate(String(row['Printing time'] ?? '').trim() || undefined),
      printMode: String(row['Print mode'] ?? '').trim(),
      resolutionDpi: mode.resolutionDpi,
      passCount: mode.passCount,
      printDirection: mode.printDirection,
      optimizerEnabled: mode.optimizerEnabled,
      inkProfile: mode.inkProfile,
      status: mapStatus(String(row.Status ?? '').trim() || undefined),
      rawData: row,
    });
  }

  return jobs;
}
