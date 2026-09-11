import { eq, like } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { printJobs } from '../src/db/schema.js';

const BASE_TOKENS: Array<[RegExp, string]> = [
  [/vinil\s*brilho|vini\s*brilho/i, 'Vinil Brilho'],
  [/vinil\s*fosco|vini\s*fosco/i, 'Vinil Fosco'],
  [/verge/i, 'Vergê'],
  [/couch/i, 'Couché'],
  [/sulfite/i, 'Sulfite'],
  [/offset/i, 'Offset'],
  [/fotografic|fotográfic/i, 'Papel Fotográfico'],
  [/kraft/i, 'Kraft'],
];
const GRAMMED = new Set(['Couché', 'Sulfite', 'Offset', 'Vergê']);

function mediaLabel(jobName: string, fallback: string, gram: number | null): string {
  const lower = jobName.toLowerCase();
  const isAdesivo = /adesivo/.test(lower);
  for (const [rx, base] of BASE_TOKENS) {
    if (rx.test(lower)) {
      const label =
        base === 'Vinil Brilho' || base === 'Vinil Fosco' || !isAdesivo ? base : `Adesivo ${base}`;
      return GRAMMED.has(base) && gram ? `${label} ${gram}g` : label;
    }
  }
  return fallback;
}

function deviceFallback(raw: Record<string, unknown> | null): string {
  const feats = (raw?.printFeatures ?? {}) as Record<string, unknown>;
  const cls = String(feats.MediaTypeAuto ?? '').trim();
  const clsToken = cls === 'CoatedG' || cls === 'CoatedA' ? 'couche' : cls === 'Plain' ? 'sulfite' : '';
  const size = String(feats.TargetPaperSize ?? '')
    .trim()
    .toLowerCase();
  return [clsToken, size].filter((s) => s && s !== 'auto' && s !== 'custom').join(' ');
}

async function main(): Promise<void> {
  const now = Date.now();
  const rows = await db
    .select({
      id: printJobs.id,
      jobName: printJobs.jobName,
      printEndDate: printJobs.printEndDate,
      createdAt: printJobs.createdAt,
      raw: printJobs.rawDataJson,
    })
    .from(printJobs)
    .where(like(printJobs.jobId, 'konica_%'))
    .all();

  type Row = (typeof rows)[number];
  const parsed = rows.map((r) => {
    let raw: Record<string, unknown> | null = null;
    try {
      raw = r.raw ? (JSON.parse(r.raw) as Record<string, unknown>) : null;
    } catch { /* noop */ }
    const devMs = Number(raw?.datePrintEnd ?? 0) * 1000;
    return { r, raw, devMs };
  });

  // Âncora real: maior createdAt do lote detectado juntos == momento real da impressão do job mais novo.
  const maxCreated = parsed.reduce((a, p) => Math.max(a, p.r.createdAt?.getTime() ?? 0), 0);
  const maxDev = parsed.reduce((a, p) => Math.max(a, p.devMs), 0);
  const skew = maxCreated - maxDev;
  console.log(
    'jobs:', parsed.length,
    'maxCreated:', new Date(maxCreated).toISOString(),
    'maxDev:', new Date(maxDev).toISOString(),
    'skew(ms):', skew,
  );

  let mediaFixed = 0;
  let dateFixed = 0;
  for (const p of parsed) {
    const name = p.r.jobName;
    const gramRaw = name.match(/(\d{2,3})\s*(?:g|gsm|g\/m[²2])/i)?.[1];
    const gram = gramRaw ? parseInt(gramRaw, 10) : null;

    const fallback = deviceFallback(p.raw);
    const media = mediaLabel(name, fallback, gram);
    if (media !== p.r.printEndDate) {
      await db.update(printJobs).set({ mediaType: media || undefined }).where(eq(printJobs.id, p.r.id));
      mediaFixed++;
    }

    const oldMs = p.r.printEndDate ? new Date(p.r.printEndDate).getTime() : 0;
    if (oldMs > now) {
      const corrected = new Date(p.devMs + skew);
      const iso = isValid(corrected) ? corrected.toISOString() : new Date(maxCreated).toISOString();
      await db
        .update(printJobs)
        .set({ printEndDate: iso })
        .where(eq(printJobs.id, p.r.id));
      dateFixed++;
    }
  }
  console.log('mediaFixed:', mediaFixed, 'dateFixed:', dateFixed);

  const after = await db
    .select({ jobName: printJobs.jobName, printEndDate: printJobs.printEndDate, media: printJobs.mediaType })
    .from(printJobs)
    .where(like(printJobs.jobId, 'konica_%'))
    .orderBy(printJobs.printEndDate, 'desc')
    .limit(10)
    .all();
  for (const a of after) {
    console.log(`${a.printEndDate} | "${a.media}" | ${a.jobName}`);
  }
}

function isValid(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

void main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });