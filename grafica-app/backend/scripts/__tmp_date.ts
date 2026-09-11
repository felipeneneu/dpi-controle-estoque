import { eq, desc, like } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { printJobs } from '../src/db/schema.js';

async function main(): Promise<void> {
  const now = new Date();
  console.log('servidor agora (UTC):', now.toISOString());
  console.log('servidor agora (BRT):', now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }));

  const rows = await db
    .select({ jobName: printJobs.jobName, printEndDate: printJobs.printEndDate, raw: printJobs.rawDataJson, createdAt: printJobs.createdAt })
    .from(printJobs)
    .where(like(printJobs.jobId, 'konica_%'))
    .orderBy(desc(printJobs.printEndDate))
    .limit(8)
    .all();

  for (const r of rows) {
    let rawDate: unknown = null;
    let pagesPrinted: unknown = null;
    let jobId: unknown = null;
    try {
      const parsed = r.raw ? (JSON.parse(r.raw) as Record<string, unknown>) : null;
      jobId = parsed?.jobId;
      rawDate = parsed?.datePrintEnd;
      pagesPrinted = parsed?.pagesPrinted;
    } catch { /* noop */ }
    console.log(
      `jobId=${jobId} rawDatePrintEnd=${rawDate} pagesPrinted=${pagesPrinted} | printEndDate="${r.printEndDate}" | createdAt=${r.createdAt?.toISOString()}`,
    );
  }
}

void main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });