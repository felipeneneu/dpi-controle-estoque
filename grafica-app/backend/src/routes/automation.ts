import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, or, like, sql, desc } from 'drizzle-orm';
import { impositionJobs } from '../db/schema.js';
import { db } from '../db/index.js';
import { newId } from '../lib/ids.js';
import { authenticate } from '../middleware/auth.js';
import { runnerAuth } from '../middleware/runner-auth.js';

const JOB_STATUSES = ['queued', 'running', 'done', 'failed', 'cancelled'] as const;
type JobStatus = (typeof JOB_STATUSES)[number];

const createJobSchema = z.object({
  jobName: z.string().min(1).max(200),
  inputPdf: z.string().min(1).max(1000),
  sheetWMm: z.number().positive().max(5000).default(700),
  sheetHMm: z.number().positive().max(5000).default(1000),
  marginTopMm: z.number().min(0).max(500).optional(),
  marginRightMm: z.number().min(0).max(500).optional(),
  marginBottomMm: z.number().min(0).max(500).optional(),
  marginLeftMm: z.number().min(0).max(500).optional(),
  gapMm: z.number().min(0).max(100).default(2),
  rotation: z.enum(['auto', '0', '90']).default('auto'),
  machineId: z.string().optional(),
  presetName: z.string().max(100).optional(),
  iccProfile: z.string().max(200).optional(),
});

const resultPatchSchema = z
  .object({
    status: z.enum(JOB_STATUSES).optional(),
    outputPath: z.string().optional(),
    outputBytes: z.number().int().nonnegative().optional(),
    outputUnits: z.number().int().nonnegative().optional(),
    checksum: z.string().optional(),
    durationMs: z.number().int().nonnegative().optional(),
    error: z.string().optional(),
  })
  .refine((v) => v.status !== undefined || Object.keys(v).length > 0, {
    message: 'Informe ao menos status ou um campo de resultado',
  });

function rotationToDb(rotation: 'auto' | '0' | '90'): number {
  if (rotation === '0') return 0;
  if (rotation === '90') return 90;
  return -1; // auto
}

function rotationFromDb(deg: number | null): 'auto' | '0' | '90' {
  if (deg === 0) return '0';
  if (deg === 90) return '90';
  return 'auto';
}

const jobResponseSchema = {
  type: 'object',
  additionalProperties: true,
} as const;

/**
 * Valida a transição de status do job de imposição (ADR-017):
 *   queued → running → done | failed
 * Estados terminais (done|failed|cancelled) não aceitam mais transição.
 */
function isAllowedTransition(current: JobStatus, next: JobStatus): boolean {
  if (current === next) return true;
  if (current === 'queued') return ['running', 'done', 'failed', 'cancelled'].includes(next);
  if (current === 'running') return ['done', 'failed'].includes(next);
  return false;
}

export async function automationRoutes(app: FastifyInstance) {
  app.post('/api/automation/jobs', {
    schema: {
      tags: ['Automação'],
      summary: 'Criar job de imposição (chapa 70x100)',
      description:
        'Abre um job na fila de imposição headless (AutoImposerCLI). O runner do Electron executa o CLI e reporta o resultado via PATCH /:id/result.',
      body: {
        type: 'object',
        required: ['jobName', 'inputPdf'],
        properties: {
          jobName: { type: 'string', minLength: 1, maxLength: 200 },
          inputPdf: { type: 'string', description: 'Caminho absoluto do PDF de arte no host' },
          sheetWMm: { type: 'number', default: 700 },
          sheetHMm: { type: 'number', default: 1000 },
          marginTopMm: { type: 'number' },
          marginRightMm: { type: 'number' },
          marginBottomMm: { type: 'number' },
          marginLeftMm: { type: 'number' },
          gapMm: { type: 'number', default: 2 },
          rotation: { type: 'string', enum: ['auto', '0', '90'], default: 'auto' },
          machineId: { type: 'string' },
          presetName: { type: 'string' },
          iccProfile: { type: 'string' },
        },
      },
      response: {
        201: jobResponseSchema,
        400: { type: 'object', properties: { error: { type: 'string' } } },
        500: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const parsed = createJobSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const body = parsed.data;
    const id = newId();

    const row = await db
      .insert(impositionJobs)
      .values({
        id,
        jobName: body.jobName,
        inputPdf: body.inputPdf,
        sheetWMm: body.sheetWMm,
        sheetHMm: body.sheetHMm,
        gapMm: body.gapMm,
        marginTopMm: body.marginTopMm,
        marginRightMm: body.marginRightMm,
        marginBottomMm: body.marginBottomMm,
        marginLeftMm: body.marginLeftMm,
        rotationDeg: rotationToDb(body.rotation),
        machineId: body.machineId ?? null,
        createdBy: request.userId ?? null,
        presetName: body.presetName ?? null,
        iccProfile: body.iccProfile ?? null,
        status: 'queued',
        createdViaM2m: false,
      })
      .returning()
      .get();

    if (!row) {
      return reply.code(500).send({ error: 'Falha ao criar job de imposição' });
    }

    return reply.code(201).send({
      ...row,
      rotation: rotationFromDb(row.rotationDeg),
    });
  });

  app.get('/api/automation/jobs', {
    schema: {
      tags: ['Automação'],
      summary: 'Listar jobs de imposição',
      description: 'Lista paginada de jobs de imposição com filtro por status e busca por nome/arquivo.',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', default: 1 },
          pageSize: { type: 'number', default: 20, maximum: 100 },
          status: { type: 'string', enum: JOB_STATUSES },
          q: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          additionalProperties: true,
          properties: {
            rows: { type: 'array', items: jobResponseSchema },
            total: { type: 'number' },
            page: { type: 'number' },
            pageSize: { type: 'number' },
          },
        },
        400: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const query = request.query as {
      page?: number;
      pageSize?: number;
      status?: JobStatus;
      q?: string;
    };

    let page = Number(query.page) || 1;
    if (page < 1) page = 1;

    let pageSize = Number(query.pageSize) || 20;
    if (pageSize < 1) return reply.code(400).send({ error: 'pageSize deve ser maior que zero' });
    if (pageSize > 100) pageSize = 100;

    const conditions = [];
    if (query.status && JOB_STATUSES.includes(query.status)) {
      conditions.push(eq(impositionJobs.status, query.status));
    }
    if (query.q && query.q.trim()) {
      const term = `%${query.q.trim()}%`;
      conditions.push(
        or(
          like(impositionJobs.jobName, term),
          like(impositionJobs.inputPdf, term),
          like(impositionJobs.presetName, term),
        ),
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select()
      .from(impositionJobs)
      .where(where)
      .orderBy(desc(impositionJobs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .all();

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(impositionJobs)
      .where(where);

    return {
      rows: rows.map((r) => ({ ...r, rotation: rotationFromDb(r.rotationDeg) })),
      total: Number(total),
      page,
      pageSize,
    };
  });

  app.get('/api/automation/jobs/:id', {
    schema: {
      tags: ['Automação'],
      summary: 'Detalhe de um job de imposição',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      response: {
        200: jobResponseSchema,
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await db.select().from(impositionJobs).where(eq(impositionJobs.id, id)).get();
    if (!row) {
      return reply.code(404).send({ error: 'Job de imposição não encontrado' });
    }
    return { ...row, rotation: rotationFromDb(row.rotationDeg) };
  });

  app.patch('/api/automation/jobs/:id/result', {
    schema: {
      tags: ['Automação'],
      summary: 'Reportar resultado do runner (PATCH)',
      description:
        'Endpoint usado pelo runner do Electron para avançar o job (queued→running→done|failed) e gravar o resultado do CLI (output, checksum, duração). Autenticável via secret M2M (x-api-secret) ou JWT.',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: JOB_STATUSES },
          outputPath: { type: 'string' },
          outputBytes: { type: 'number' },
          outputUnits: { type: 'number' },
          checksum: { type: 'string' },
          durationMs: { type: 'number' },
          error: { type: 'string' },
        },
      },
      response: {
        200: jobResponseSchema,
        400: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
        409: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    config: {
      rateLimit: false,
    },
    preHandler: [runnerAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = resultPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const body = parsed.data;

    const row = await db.select().from(impositionJobs).where(eq(impositionJobs.id, id)).get();
    if (!row) {
      return reply.code(404).send({ error: 'Job de imposição não encontrado' });
    }

    const current = (row.status ?? 'queued') as JobStatus;
    const next = body.status ?? current;

    if (!isAllowedTransition(current, next)) {
      return reply
        .code(409)
        .send({ error: `Transição inválida de status: ${current} → ${next}` });
    }

    const now = new Date();
    const terminal = next === 'done' || next === 'failed' || next === 'cancelled';

    const patch: Record<string, unknown> = { status: next };
    if (next === 'running' && !row.startedAt) patch.startedAt = now;
    if (terminal) patch.finishedAt = now;
    if (body.outputPath !== undefined) patch.outputPath = body.outputPath;
    if (body.outputBytes !== undefined) patch.outputBytes = body.outputBytes;
    if (body.outputUnits !== undefined) patch.outputUnits = body.outputUnits;
    if (body.checksum !== undefined) patch.checksum = body.checksum;
    if (body.durationMs !== undefined) patch.durationMs = body.durationMs;
    if (body.error !== undefined) patch.error = body.error;

    await db.update(impositionJobs).set(patch).where(eq(impositionJobs.id, id));
    const updated = await db.select().from(impositionJobs).where(eq(impositionJobs.id, id)).get();

    app.io.emit('automation:job-updated', { id, status: next });

    return { ...updated, rotation: rotationFromDb(updated?.rotationDeg ?? row.rotationDeg) };
  });
}