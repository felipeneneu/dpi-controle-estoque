import type { KonicaJob } from './types.js';

/** Classe de papel "MediaTypeAuto" do ProfiWEB → token de matching. */
const MEDIA_CLASS_TOKEN: Record<string, string> = {
  CoatedG: 'couche',
  CoatedA: 'couche',
  Plain: 'sulfite',
  NoSet: '',
};

/** "TargetPaperSize" do ProfiWEB → token de tamanho (lowercase). */
function sizeToken(size: string | undefined | null): string {
  if (!size) return '';
  const lower = size.trim().toLowerCase();
  // 'auto'/'noset'/'custom' não dizem o tamanho real — descartar p/ não viciar o match.
  if (lower === 'auto' || lower === 'noset' || lower === 'none' || lower === 'custom') return '';
  return lower;
}

function parseDecimalPtBR(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = value.replace(/[^\d,.]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Converte o datePrintEnd do ProfiWEB (unix epoch).
 * O relógio da AccurioPrint está adiantado (~11h); se o valor cair no futuro
 * em relação à hora real do servidor, o horário real (momento da ingestão)
 * é usado — assim a data/hora exibida fica em Brasília, sem ficar no futuro.
 */
function parseDate(unixSeconds: string | number | null | undefined): string {
  const secs = parseDecimalPtBR(String(unixSeconds ?? ''));
  if (secs > 0) {
    const d = new Date(secs * 1000);
    if (!isNaN(d.getTime())) {
      return d.getTime() > Date.now() ? new Date().toISOString() : d.toISOString();
    }
  }
  return new Date().toISOString();
}

function mapStatus(result: string | undefined): string {
  if (!result) return 'completed';
  const lower = result.toLowerCase();
  if (lower.includes('cancel')) return 'cancelled';
  if (lower.includes('error') || lower.includes('erro') || lower.includes('failed')) return 'error';
  return 'completed';
}

/** Extrai a gramatura (g/m²) informada no nome do job, ex.: "couche 250g" → 250. */
function extractGram(jobName: string): number | null {
  const m = jobName.match(/(\d{2,3})\s*(?:g|gsm|g\/m[²2])/i);
  if (!m) return null;
  const g = parseInt(m[1]!, 10);
  return Number.isFinite(g) && g >= 40 && g <= 500 ? g : null;
}

/**
 * Número de OS (ordem de serviço) no início do nome, ex.: "31120 - o boticario".
 * Exige pelo menos 3 dígitos + separador para não capturar nomes como "Loja 49".
 */
function extractOsNumber(jobName: string): string | null {
  const m = jobName.match(/^\s*(\d{3,})\s*[-–—]\s*/);
  return m?.[1] ?? null;
}

/**
 * Materiais reais da AccurioPrint (33x48cm, exceto sulfite A4): couché, adesivo couché,
 * vinil (branco/fosco/brilho/transparente), sulfite, reciclado, kraft, offset, vergê.
 * Quando o NOME do job cita o material, ele manda (a classe MediaTypeAuto do device
 * é genérica demais — ex.: vinil chega como "Plain"). "etiqueta" NÃO é material.
 */
const MEDIA_BASE_TOKENS: Array<[RegExp, string, string[]]> = [
  [/vinil\s*transparente|vini\s*transparente/i, 'Vinil Transparente', ['vinil', 'transparente']],
  [/vinil\s*branco|vinil\s*brilho|vini\s*branco|vini\s*brilho/i, 'Vinil Branco', ['vinil', 'branco']],
  [/vinil\s*fosco|vini\s*fosco/i, 'Vinil Fosco', ['vinil', 'fosco']],
  [/reciclado/i, 'Reciclado', ['reciclado']],
  [/verge/i, 'Vergê', ['verge']],
  [/couch/i, 'Couché', ['couche']],
  [/sulfite/i, 'Sulfite', ['sulfite']],
  [/offset/i, 'Offset', ['offset']],
  [/fotografic|fotográfic/i, 'Papel Fotográfico', ['fotografic']],
  [/kraft/i, 'Kraft', ['kraft']],
];

const GRAMMED_LABELS = new Set(['Couché', 'Sulfite', 'Offset', 'Vergê', 'Reciclado', 'Kraft']);

/**
 * Tokens de matching derivados do material citado no nome do job.
 * Ex.: "adesivo couche 250g" → ['adesivo','couche']; "vinil fosco" → ['vinil','fosco'].
 * Agrega 'adesivo' como prefixo quando presente junto a um material.
 */
export function materialTokens(jobName: string): string[] {
  const lower = jobName.toLowerCase();
  const isAdesivo = /adesivo/.test(lower);
  for (const [rx, , tokens] of MEDIA_BASE_TOKENS) {
    if (rx.test(lower)) {
      const isCouche = tokens.includes('couche');
      return isAdesivo && isCouche ? ['adesivo', ...tokens] : tokens;
    }
  }
  return [];
}

/** Mídia para exibição: prefere o MATERIAL citado no nome (ex.: "Adesivo Couché 250g"). */
export function extractMediaLabel(jobName: string, fallback: string, gram: number | null): string {
  const lower = jobName.toLowerCase();
  const isAdesivo = /adesivo/.test(lower);
  for (const [rx, base, tokens] of MEDIA_BASE_TOKENS) {
    if (rx.test(lower)) {
      const isCouche = tokens.includes('couche');
      const label = isAdesivo && isCouche ? `Adesivo ${base}` : base;
      return GRAMMED_LABELS.has(base) && gram ? `${label} ${gram}g` : label;
    }
  }
  return fallback;
}

interface RawJob {
  jobId?: unknown;
  name?: unknown;
  owner?: unknown;
  pages?: unknown;
  pagesPrinted?: unknown;
  copiesPrinted?: unknown;
  monochromePagesPrinted?: unknown;
  colorPagesPrinted?: unknown;
  datePrintEnd?: unknown;
  result?: unknown;
  printFeatures?: {
    TargetPaperSize?: unknown;
    MediaTypeAuto?: unknown;
    mainPaperProfileName?: unknown;
  };
  [key: string]: unknown;
}

/** Lê o JSON do jobList.fcgi ({jobLists: [{containerId, jobs}]}) e devolve os
 *  jobs efetivamente impressos (completed). `sheets` = pagesPrinted (impressões
 *  físicas, já inclui cópias); papel derivado de MediaTypeAuto + TargetPaperSize. */
export function parseJobs(raw: unknown): KonicaJob[] {
  if (raw == null) return [];

  let rows: unknown[] = [];
  if (Array.isArray(raw)) {
    rows = raw;
  } else if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.jobLists)) {
      for (const list of obj.jobLists as unknown[]) {
        if (list && typeof list === 'object') {
          const jobs = (list as Record<string, unknown>).jobs;
          if (Array.isArray(jobs)) rows = rows.concat(jobs);
        }
      }
    } else {
      for (const key of ['jobs', 'data', 'items', 'rows', 'printJobs', 'records']) {
        if (Array.isArray(obj[key])) {
          rows = obj[key] as unknown[];
          break;
        }
      }
    }
  }

  const jobs: KonicaJob[] = [];

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as RawJob;

    const jobName = String(r.name ?? r.jobName ?? r.documentName ?? r.filename ?? '').trim();
    if (!jobName) continue;

    const pagesPrinted = Math.round(parseDecimalPtBR(String(r.pagesPrinted ?? 0)));
    const datePrintEndSecs = parseDecimalPtBR(String(r.datePrintEnd ?? 0));

    // Apenas jobs realmente impressos e concluídos (datePrintEnd==0 = nunca saiu).
    if (pagesPrinted <= 0 || datePrintEndSecs <= 0) continue;
    if (mapStatus(String(r.result ?? '').trim() || undefined) !== 'completed') continue;

    const mediaClass = MEDIA_CLASS_TOKEN[String(r.printFeatures?.MediaTypeAuto ?? '').trim()] ?? '';
    const size = sizeToken(String(r.printFeatures?.TargetPaperSize ?? '').trim() || undefined);
    // O material citado no nome do job manda (ex.: vinil, adesivo couche); senão,
    // usa a classe do papel que o equipamento registrou para o job.
    const nameMaterial = materialTokens(jobName);
    const paperName =
      nameMaterial.length > 0
        ? nameMaterial.join(' ')
        : [mediaClass, size].filter(Boolean).join(' ');

    const colorPagesPrinted = Math.round(parseDecimalPtBR(String(r.colorPagesPrinted ?? 0)));
    const copies = Math.round(parseDecimalPtBR(String(r.copiesPrinted ?? 0)));
    const pages = Math.round(parseDecimalPtBR(String(r.pages ?? 0)));

    const gram = extractGram(jobName);

    jobs.push({
      jobName,
      paperName,
      mediaLabel: extractMediaLabel(jobName, paperName, gram),
      osNumber: extractOsNumber(jobName),
      gram,
      pages,
      sheets: pagesPrinted,
      pagesPrinted,
      copies,
      colorMode: colorPagesPrinted > 0 ? 'Color' : 'Mono',
      status: 'completed',
      printEndDate: parseDate(datePrintEndSecs),
      rawData: row,
    });
  }

  return jobs;
}