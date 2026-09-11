import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq, gte, lt, like, or, desc, asc, count, getTableColumns, sql } from 'drizzle-orm';
import { printJobs, machines, stockItems, users } from '../db/schema.js';
import { db } from '../db/index.js';
import { authenticate } from '../middleware/auth.js';
import { deductStockForJob } from '../agents/hp-latex/stock-deductor.js';
import { toPrecision } from '../lib/math.js';
import { verifyPassword } from '../lib/password.js';

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y!, m! - 1, 1));
  const end = new Date(Date.UTC(y!, m!, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function jobRoutes(app: FastifyInstance) {
  app.get('/api/jobs', {
    schema: {
      tags: ['Jobs'],
      summary: 'Listar jobs de impressão',
      description:
        'Lista os jobs de impressão auto-detectados (print_jobs) com paginação, busca e filtro por máquina/período.',
      querystring: {
        type: 'object',
        properties: {
          machineId: { type: 'string', description: 'Filtrar por máquina.' },
          month: { type: 'string', description: 'Mês no formato YYYY-MM. Padrão: mês atual.' },
          monthScope: {
            type: 'string',
            enum: ['month', 'all'],
            default: 'month',
            description: "'month' filtra pelo mês; 'all' ignora o filtro de período.",
          },
          q: { type: 'string', description: 'Busca por nome do job ou tipo de mídia.' },
          includeHidden: {
            type: 'string',
            description: "'true' para exibir jobs ocultos (requer ADMIN ou DEV_MASTER).",
          },
          sortBy: {
            type: 'string',
            enum: ['date', 'name'],
            default: 'date',
            description: 'Ordenação: pela data ou pelo nome do job.',
          },
          sortDir: {
            type: 'string',
            enum: ['asc', 'desc'],
            default: 'desc',
            description: 'Direção da ordenação.',
          },
          page: { type: 'number', default: 1, description: 'Página (1-indexada).' },
          pageSize: { type: 'number', default: 20, maximum: 100, description: 'Linhas por página.' },
        },
      },
      response: {
        200: {
          type: 'object',
          additionalProperties: true,
        },
        400: {
          type: 'object',
          properties: { error: { type: 'string' } },
        },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const query = request.query as {
      machineId?: string;
      month?: string;
      monthScope?: string;
      q?: string;
      includeHidden?: string;
      sortBy?: string;
      sortDir?: string;
      page?: number;
      pageSize?: number;
    };

    const now = new Date();
    const month = query.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthScope = query.monthScope === 'all' ? 'all' : 'month';

    let page = Number(query.page);
    if (!Number.isInteger(page) || page < 1) page = 1;

    let pageSize = Number(query.pageSize);
    if (!Number.isInteger(pageSize) || pageSize < 1) {
      return reply.code(400).send({ error: 'pageSize deve ser um inteiro maior que zero' });
    }
    if (pageSize > 100) pageSize = 100;

    const conditions = [];

    const allowHidden =
      (query.includeHidden === 'true' || query.includeHidden === '1') &&
      (request.userRole === 'ADMIN' || request.userRole === 'DEV_MASTER');

    if (!allowHidden) {
      conditions.push(
        or(
          eq(printJobs.hidden, false),
          sql`${printJobs.hidden} IS NULL`,
          sql`${printJobs.hidden} = 0`,
        ),
      );
    }

    if (query.machineId) {
      conditions.push(eq(printJobs.machineId, query.machineId));
    }
    if (monthScope === 'month') {
      const { start, end } = monthRange(month);
      conditions.push(gte(printJobs.printEndDate, start));
      conditions.push(lt(printJobs.printEndDate, end));
    }
    if (query.q && query.q.trim()) {
      const term = `%${query.q.trim()}%`;
      conditions.push(
        or(
          like(printJobs.jobName, term),
          like(printJobs.mediaType, term),
        ),
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const sortCol = query.sortBy === 'name' ? printJobs.jobName : printJobs.printEndDate;
    const sortFn = query.sortDir === 'asc' ? asc : desc;

    const rows = await db
      .select({
        ...getTableColumns(printJobs),
        machineName: machines.name,
      })
      .from(printJobs)
      .leftJoin(machines, eq(printJobs.machineId, machines.id))
      .where(where)
      .orderBy(sortFn(sortCol))
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .all();

    const [{ total }] = await db
      .select({ total: count() })
      .from(printJobs)
      .where(where)
      .all();

    return {
      rows,
      total,
      page,
      pageSize,
    };
  });

  app.patch('/api/jobs/:id', {
    schema: {
      tags: ['Jobs'],
      summary: 'Atualizar job',
      description: 'Atualiza campos de um job de impressão (ex: mediaType).',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          mediaType: { type: 'string' },
          osNumber: { type: 'string' },
        },
      },
      response: {
        200: { type: 'object', additionalProperties: true },
        400: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { mediaType?: string; osNumber?: string };

    const existing = await db.select().from(printJobs).where(eq(printJobs.id, id)).get();
    if (!existing) {
      return reply.code(400).send({ error: 'Job não encontrado' });
    }

    const patch: Record<string, unknown> = {};
    if (body.osNumber !== undefined) patch.osNumber = body.osNumber;
    if (body.mediaType !== undefined) {
      patch.mediaType = body.mediaType;
      if (existing.mediaAreaM2 && existing.mediaAreaM2 > 0) {
        const items = await db.select().from(stockItems).where(eq(stockItems.category, 'PAPER_MEDIA')).all();
        const rawTarget = body.mediaType.toLowerCase().replace(/[\s\-_,./()ºª]+/g, '');
        const found = items.find((i) => {
          const mLower = i.name.toLowerCase().replace(/[\s\-_,./()ºª]+/g, '');
          return mLower.includes(rawTarget) || rawTarget.includes(mLower);
        });
        const width = (found && found.width && found.width > 0) ? found.width : 1.52;
        patch.rollWidthUsed = width;
        patch.linearMetersDebited = toPrecision(existing.mediaAreaM2 / width, 3);
      }
    }

    if (Object.keys(patch).length === 0) {
      return reply.code(400).send({ error: 'Nenhum campo para atualizar' });
    }

    await db.update(printJobs).set(patch).where(eq(printJobs.id, id));
    const updated = await db.select().from(printJobs).where(eq(printJobs.id, id)).get();
    return reply.code(200).send(updated);
  });

  app.post('/api/machines/:machineId/sync-stock', {
    schema: {
      tags: ['Jobs'],
      summary: 'Sincronizar estoque dos jobs pendentes da máquina',
      description: 'Varre jobs pendentes de dedução (stock_deducted = false) da máquina e executa o débito de material e tintas.',
      params: {
        type: 'object',
        required: ['machineId'],
        properties: { machineId: { type: 'string' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            processedCount: { type: 'number' },
            message: { type: 'string' },
          },
        },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { machineId } = request.params as { machineId: string };

    const pendingJobs = await db
      .select()
      .from(printJobs)
      .where(
        and(
          eq(printJobs.machineId, machineId),
          or(
            eq(printJobs.stockDeducted, false),
            sql`${printJobs.stockDeducted} IS NULL`,
            sql`${printJobs.stockDeducted} = 0`,
          ),
        ),
      )
      .all();

    let processedCount = 0;
    for (const job of pendingJobs) {
      const jobToDeduct = {
        jobId: job.jobId,
        jobName: job.jobName,
        mediaType: job.mediaType ?? '',
        mediaAreaM2: job.mediaAreaM2 ?? 0,
        inkCyanMl: job.inkCyanMl ?? 0,
        inkLightCyanMl: job.inkLightCyanMl ?? 0,
        inkMagentaMl: job.inkMagentaMl ?? 0,
        inkLightMagentaMl: job.inkLightMagentaMl ?? 0,
        inkYellowMl: job.inkYellowMl ?? 0,
        inkBlackMl: job.inkBlackMl ?? 0,
        inkOptimizerMl: job.inkOptimizerMl ?? 0,
        inkTotalMl: job.inkTotalMl ?? 0,
        pages: job.pages ?? 1,
        resolutionDpi: job.resolutionDpi ?? 0,
        passCount: job.passCount ?? 0,
        printDirection: job.printDirection ?? '',
        printMode: job.printMode ?? '',
        optimizerEnabled: job.optimizerEnabled ?? false,
        inkProfile: job.inkProfile ?? '',
        status: job.status ?? 'completed',
        printEndDate: job.printEndDate ?? new Date().toISOString(),
        rawData: {},
      };

      await deductStockForJob(jobToDeduct, app.io);
      processedCount++;
    }

    return reply.code(200).send({
      success: true,
      processedCount,
      message: `${processedCount} job(s) sincronizado(s) e debitado(s) com sucesso.`,
    });
  });

  app.post('/api/jobs/:id/hide', {
    schema: {
      tags: ['Jobs'],
      summary: 'Ocultar ou restaurar job da listagem',
      description:
        'Oculta um job da listagem mantendo o estoque debitado. Requer confirmação de senha de ADMIN ou DEV_MASTER.',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['password'],
        properties: {
          hidden: { type: 'boolean', default: true },
          password: { type: 'string' },
          adminEmail: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            id: { type: 'string' },
            hidden: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        400: { type: 'object', properties: { error: { type: 'string' } } },
        401: { type: 'object', properties: { error: { type: 'string' } } },
        403: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { hidden = true, password, adminEmail } = request.body as {
      hidden?: boolean;
      password?: string;
      adminEmail?: string;
    };

    if (!password || typeof password !== 'string' || !password.trim()) {
      return reply.code(400).send({ error: 'Senha de confirmação de administrador é obrigatória.' });
    }

    let authorizedAdmin = null;
    if (adminEmail && adminEmail.trim()) {
      const u = await db.select().from(users).where(eq(users.email, adminEmail.trim().toLowerCase())).get();
      if (u && (u.role === 'ADMIN' || u.role === 'DEV_MASTER')) {
        authorizedAdmin = u;
      } else {
        return reply.code(403).send({ error: 'E-mail informado não possui privilégios de Administrador.' });
      }
    } else if (request.userId) {
      const currentUser = await db.select().from(users).where(eq(users.id, request.userId)).get();
      if (currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'DEV_MASTER')) {
        authorizedAdmin = currentUser;
      } else {
        // If current operator or user is not admin, check if password matches any active ADMIN or DEV_MASTER
        const admins = await db.select().from(users).where(or(eq(users.role, 'ADMIN'), eq(users.role, 'DEV_MASTER'))).all();
        const match = admins.find((a) => verifyPassword(password, a.passwordHash));
        if (match) {
          authorizedAdmin = match;
        } else {
          return reply.code(401).send({ error: 'Senha de administrador incorreta.' });
        }
      }
    }

    if (!authorizedAdmin || !verifyPassword(password, authorizedAdmin.passwordHash)) {
      return reply.code(401).send({ error: 'Senha de administrador incorreta.' });
    }

    const existing = await db.select().from(printJobs).where(eq(printJobs.id, id)).get();
    if (!existing) {
      return reply.code(404).send({ error: 'Job de impressão não encontrado.' });
    }

    await db.update(printJobs).set({ hidden: Boolean(hidden) }).where(eq(printJobs.id, id));

    return reply.code(200).send({
      success: true,
      id,
      hidden: Boolean(hidden),
      message: hidden
        ? 'Job ocultado com sucesso. O débito de estoque foi mantido.'
        : 'Job restaurado com sucesso.',
    });
  });
}
