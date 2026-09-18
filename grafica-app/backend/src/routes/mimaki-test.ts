import type { FastifyInstance } from 'fastify';
import { eq, and, sql } from 'drizzle-orm';
import { mimakiTestJobs } from '../db/schema.js';
import { db } from '../db/index.js';
import { authenticate } from '../middleware/auth.js';
import {
  scanMimakiTestSource,
  mimakiTestHealth,
  mimakiTestSourceDir,
  MIMAKI_TEST_CHANNEL,
} from '../lib/mimaki-test-watcher.js';

export async function mimakiTestRoutes(app: FastifyInstance) {
  app.get('/api/mimaki-test/health', {
    schema: {
      tags: ['Mimaki Teste'],
      summary: 'Status do canal mimaki-teste',
      response: {
        200: {
          type: 'object',
          properties: {
            sourceAvailable: { type: 'boolean' },
            lastScanAt: { type: ['string', 'null'], nullable: true },
            lastScanError: { type: ['string', 'null'], nullable: true },
            lastInserted: { type: 'number' },
            sourceDir: { type: 'string' },
          },
        },
      },
    },
    preHandler: [authenticate],
  }, async () => ({
    sourceAvailable: mimakiTestHealth.sourceAvailable,
    lastScanAt: mimakiTestHealth.lastScanAt,
    lastScanError: mimakiTestHealth.lastScanError,
    lastInserted: mimakiTestHealth.lastInserted,
    sourceDir: mimakiTestSourceDir(),
  }));

  app.get('/api/mimaki-test/jobs', {
    schema: {
      tags: ['Mimaki Teste'],
      summary: 'Listar jobs do canal mimaki-teste',
      description: 'Lista registros importados dos CSVs RasterLink. Result=NG aparece em destaque na UI.',
      querystring: {
        type: 'object',
        properties: {
          result: { type: 'string', enum: ['OK', 'NG'] },
          channel: { type: 'string' },
          limit: { type: 'number' },
          offset: { type: 'number' },
        },
      },
    },
    preHandler: [authenticate],
  }, async (request) => {
    const query = request.query as {
      result?: string;
      channel?: string;
      limit?: string;
      offset?: string;
    };

    const limit = Math.min(Number(query.limit ?? 100), 500);
    const offset = Number(query.offset ?? 0);
    const conditions = [];

    conditions.push(
      eq(mimakiTestJobs.channel, query.channel ?? MIMAKI_TEST_CHANNEL),
    );

    if (query.result) {
      conditions.push(eq(mimakiTestJobs.result, query.result as 'OK' | 'NG'));
    }

    const where = and(...conditions);

    const [data, [{ count }]] = await Promise.all([
      db
        .select({
          id: mimakiTestJobs.id,
          channel: mimakiTestJobs.channel,
          sourceFile: mimakiTestJobs.sourceFile,
          keyFilename: mimakiTestJobs.keyFilename,
          result: mimakiTestJobs.result,
          resultDetail: mimakiTestJobs.resultDetail,
          arrangeCnt: mimakiTestJobs.arrangeCnt,
          inkCyanCc: mimakiTestJobs.inkCyanCc,
          inkMagentaCc: mimakiTestJobs.inkMagentaCc,
          inkYellowCc: mimakiTestJobs.inkYellowCc,
          inkBlackCc: mimakiTestJobs.inkBlackCc,
          inkWhite1Cc: mimakiTestJobs.inkWhite1Cc,
          inkWhite2Cc: mimakiTestJobs.inkWhite2Cc,
          inkVarnish1Cc: mimakiTestJobs.inkVarnish1Cc,
          inkVarnish2Cc: mimakiTestJobs.inkVarnish2Cc,
          inkTotalCc: mimakiTestJobs.inkTotalCc,
          ripSTime: mimakiTestJobs.ripSTime,
          ripETime: mimakiTestJobs.ripETime,
          printSTime: mimakiTestJobs.printSTime,
          printETime: mimakiTestJobs.printETime,
          parsedOrderCode: mimakiTestJobs.parsedOrderCode,
          parsedClient: mimakiTestJobs.parsedClient,
          parsedMaterial: mimakiTestJobs.parsedMaterial,
          parsedWidthMm: mimakiTestJobs.parsedWidthMm,
          parsedHeightMm: mimakiTestJobs.parsedHeightMm,
          parsedUnits: mimakiTestJobs.parsedUnits,
          parsedCopies: mimakiTestJobs.parsedCopies,
          parsedBobinaSerial: mimakiTestJobs.parsedBobinaSerial,
          heightMm: mimakiTestJobs.heightMm,
          linearMeters: mimakiTestJobs.linearMeters,
          stockDeducted: mimakiTestJobs.stockDeducted,
          stockItemId: mimakiTestJobs.stockItemId,
          bobinaId: mimakiTestJobs.bobinaId,
          mimakiJobId: mimakiTestJobs.mimakiJobId,
          parseErrors: mimakiTestJobs.parseErrors,
          createdAt: mimakiTestJobs.createdAt,
        })
        .from(mimakiTestJobs)
        .where(where)
        .orderBy(sql`${mimakiTestJobs.createdAt} DESC`)
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(mimakiTestJobs)
        .where(where),
    ]);

    return { total: Number(count), limit, offset, data };
  });

  app.post('/api/mimaki-test/scan', {
    schema: {
      tags: ['Mimaki Teste'],
      summary: 'Executar scan manual da pasta de origem',
      description:
        'Força a leitura imediata dos CSVs RasterLink. Retorna quantos registros novos foram inseridos.',
    },
    preHandler: [authenticate],
  }, async (_request, reply) => {
    const result = await scanMimakiTestSource(app);
    return reply.code(200).send(result);
  });
}