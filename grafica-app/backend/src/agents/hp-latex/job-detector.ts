import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { printJobs } from '../../db/schema.js';
import { newId } from '../../lib/ids.js';
import type { ParsedJob } from './parser.js';

function makeJobId(jobName: string, printEndDate: string): string {
  const base = `${jobName}::${printEndDate}`;
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    hash = ((hash << 5) - hash + base.charCodeAt(i)) | 0;
  }
  return `hp_${Math.abs(hash).toString(36)}`;
}

export interface NewJob extends ParsedJob {
  jobId: string;
}

export async function detectNewJobs(parsedJobs: ParsedJob[]): Promise<NewJob[]> {
  const existing = await db.select({ jobId: printJobs.jobId }).from(printJobs).all();
  const existingSet = new Set(existing.map((r) => r.jobId));

  const newJobs: NewJob[] = [];

  for (const job of parsedJobs) {
    const jobId = makeJobId(job.jobName, job.printEndDate);
    if (!existingSet.has(jobId)) {
      newJobs.push({ ...job, jobId });
    }
  }

  return newJobs;
}

export async function insertJob(job: NewJob, machineId: string): Promise<void> {
  await db.insert(printJobs).values({
    id: newId(),
    jobId: job.jobId,
    jobName: job.jobName,
    machineId,
    ripType: 'hp-ews',
    inkCyanMl: job.inkCyanMl,
    inkLightCyanMl: job.inkLightCyanMl,
    inkMagentaMl: job.inkMagentaMl,
    inkLightMagentaMl: job.inkLightMagentaMl,
    inkYellowMl: job.inkYellowMl,
    inkBlackMl: job.inkBlackMl,
    inkOptimizerMl: job.inkOptimizerMl,
    inkTotalMl: job.inkTotalMl,
    mediaType: job.mediaType,
    mediaAreaM2: job.mediaAreaM2,
    resolutionDpi: job.resolutionDpi,
    passCount: job.passCount,
    printDirection: job.printDirection,
    printMode: job.printMode,
    optimizerEnabled: job.optimizerEnabled,
    inkProfile: job.inkProfile,
    status: job.status,
    printEndDate: job.printEndDate,
    stockDeducted: false,
    rawDataJson: JSON.stringify(job.rawData),
  });
}
