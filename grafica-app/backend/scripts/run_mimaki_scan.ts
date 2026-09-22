import { scanMimakiTestSource } from '../src/lib/mimaki-test-watcher.js';
import { db } from '../src/db/index.js';
import { mimakiJobs, mimakiTestJobs } from '../src/db/schema.js';
import { desc, like, or } from 'drizzle-orm';

async function main() {
  console.log('--- INICIANDO SCAN MANUAL MIMAKI TESTE ---');
  const mockApp = {
    log: {
      info: (msg: string) => console.log('[INFO]', msg),
      warn: (msg: string) => console.warn('[WARN]', msg),
      error: (msg: string) => console.error('[ERROR]', msg),
    },
    io: null,
  } as any;

  const result = await scanMimakiTestSource(mockApp);
  console.log('\n--- RESULTADO DO SCAN ---', result);

  console.log('\n--- VERIFICANDO TABELA mimaki_test_jobs (31188 / SELECT) ---');
  const testRows = await db
    .select({
      id: mimakiTestJobs.id,
      keyFilename: mimakiTestJobs.keyFilename,
      result: mimakiTestJobs.result,
      resultDetail: mimakiTestJobs.resultDetail,
      heightMm: mimakiTestJobs.heightMm,
      linearMeters: mimakiTestJobs.linearMeters,
      inkTotalCc: mimakiTestJobs.inkTotalCc,
      printSTime: mimakiTestJobs.printSTime,
      stockDeducted: mimakiTestJobs.stockDeducted,
    })
    .from(mimakiTestJobs)
    .where(or(like(mimakiTestJobs.keyFilename, '%31188%'), like(mimakiTestJobs.keyFilename, '%SELECT%')))
    .orderBy(desc(mimakiTestJobs.printSTime))
    .all();

  testRows.forEach((r) => {
    console.log(
      `TEST JOB: "${r.keyFilename}" | PrintS: ${r.printSTime} | Dim: ${r.heightMm}mm (${r.linearMeters}m) | Ink: ${r.inkTotalCc}cc | Detail: ${r.resultDetail} | Deducted: ${r.stockDeducted}`
    );
  });

  console.log('\n--- VERIFICANDO TABELA mimaki_jobs (PRODUÇÃO / ABA JOBS) ---');
  const prodRows = await db
    .select({
      id: mimakiJobs.id,
      jobName: mimakiJobs.jobName,
      orderCode: mimakiJobs.orderCode,
      folderTimestamp: mimakiJobs.folderTimestamp,
      widthMm: mimakiJobs.widthMm,
      heightMm: mimakiJobs.heightMm,
      lengthMeters: mimakiJobs.lengthMeters,
      inkTotalCc: mimakiJobs.inkTotalCc,
      stockDeducted: mimakiJobs.stockDeducted,
    })
    .from(mimakiJobs)
    .where(or(like(mimakiJobs.jobName, '%31188%'), like(mimakiJobs.jobName, '%SELECT%')))
    .orderBy(desc(mimakiJobs.folderTimestamp))
    .all();

  prodRows.forEach((r) => {
    console.log(
      `PROD JOB: "${r.jobName}" | FolderTS: ${r.folderTimestamp} | Order: ${r.orderCode} | Dim: ${r.widthMm}x${r.heightMm}mm | Len: ${r.lengthMeters}m | Ink: ${r.inkTotalCc}cc | Deducted: ${r.stockDeducted}`
    );
  });

  process.exit(0);
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
