import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { printJobs, machines } from '../src/db/schema.js';
import { materialTokens, extractMediaLabel } from '../src/agents/konica/parser.js';

const konica = await db
  .select({ id: machines.id })
  .from(machines)
  .where(eq(machines.ip, '192.168.234.68'))
  .get();

const gramOf = (n: string): number | null => {
  const m = n.match(/(\d{2,3})\s*g/i);
  return m ? Number(m[1]) : null;
};

const jobs = await db
  .select({ id: printJobs.id, jobName: printJobs.jobName, mediaType: printJobs.mediaType })
  .from(printJobs)
  .where(eq(printJobs.machineId, konica.id))
  .all();

let updated = 0;
for (const j of jobs) {
  const tokens = materialTokens(j.jobName);
  if (tokens.length === 0) continue;
  const label = extractMediaLabel(j.jobName, j.mediaType ?? '', gramOf(j.jobName));
  if (label !== j.mediaType) {
    await db.update(printJobs).set({ mediaType: label }).where(eq(printJobs.id, j.id));
    updated++;
  }
}
console.log(`jobs atualizados (media_type ← material do nome): ${updated}/${jobs.length}`);