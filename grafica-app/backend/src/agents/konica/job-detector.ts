import { db } from '../../db/index.js';
import { printJobs } from '../../db/schema.js';
import { newId } from '../../lib/ids.js';
import type { KonicaJob } from './types.js';

/** O PrintManager expõe um jobId numérico monotônico — chave ideal de dedupe. */
function makeJobId(job: KonicaJob): string {
  const raw = job.rawData as { jobId?: unknown } | null;
  const jobId = raw?.jobId;
  if (typeof jobId === 'number' && Number.isFinite(jobId) && jobId > 0) {
    return `konica_${jobId}`;
  }
  if (typeof jobId === 'string' && jobId.trim() !== '') {
    return `konica_${jobId.trim()}`;
  }
  // Fallback: hash de nome + data (mesmo padrão do HP).
  const base = `${job.jobName}::${job.printEndDate}`;
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    hash = ((hash << 5) - hash + base.charCodeAt(i)) | 0;
  }
  return `konica_${Math.abs(hash).toString(36)}`;
}

export interface NewKonicaJob extends KonicaJob {
  jobId: string;
}

export async function detectNewJobs(parsedJobs: KonicaJob[]): Promise<NewKonicaJob[]> {
  const existing = await db.select({ jobId: printJobs.jobId }).from(printJobs).all();
  const existingSet = new Set(existing.map((r) => r.jobId));

  const newJobs: NewKonicaJob[] = [];

  for (const job of parsedJobs) {
    const jobId = makeJobId(job);
    if (!existingSet.has(jobId)) {
      newJobs.push({ ...job, jobId });
    }
  }

  return newJobs;
}

export async function insertKonicaJob(job: NewKonicaJob, machineId: string): Promise<void> {
  await db.insert(printJobs).values({
    id: newId(),
    jobId: job.jobId,
    jobName: job.jobName,
    machineId,
    ripType: 'konica-printmanager',
    mediaType: job.mediaLabel || job.paperName,
    osNumber: job.osNumber,
    colorMode: job.colorMode,
    pages: job.pages,
    sheets: job.sheets,
    status: job.status,
    printEndDate: job.printEndDate,
    stockDeducted: false,
    rawDataJson: JSON.stringify(job.rawData),
  });
}