import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq, gte, lt, like, or, desc, asc, count, getTableColumns, sql, inArray } from 'drizzle-orm';
import { printJobs, machines, stockItems, users, bobinas, stockTransactions, mimakiJobs, mimakiTestJobs } from '../db/schema.js';
import { db } from '../db/index.js';
import { authenticate } from '../middleware/auth.js';
import { deductStockForJob } from '../agents/hp-latex/stock-deductor.js';
import { toPrecision } from '../lib/math.js';
import { verifyPassword } from '../lib/password.js';
import { newId } from '../lib/ids.js';

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
          printMode: { type: 'string' },
          sheets: { type: 'number' },
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
    const body = request.body as {
      mediaType?: string;
      osNumber?: string;
      printMode?: string;
      sheets?: number;
    };

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

    if (body.printMode !== undefined) {
      const mode = body.printMode.toUpperCase();
      const isDuplex = mode === 'DUPLEX' || mode === 'FRENTE_VERSO';
      patch.printMode = isDuplex ? 'DUPLEX' : 'SIMPLEX';

      if (body.sheets === undefined && existing.ripType === 'konica-printmanager') {
        const pages = existing.pages || 1;
        let copies = 1;
        try {
          const raw = JSON.parse(existing.rawDataJson || '{}');
          copies = Number(raw.copiesPrinted || 1);
        } catch {}
        if (!Number.isFinite(copies) || copies <= 0) copies = 1;

        patch.sheets = isDuplex
          ? Math.max(1, Math.ceil(pages / 2) * copies)
          : Math.max(1, pages * copies);
      }
    }

    if (body.sheets !== undefined) {
      if (Number.isFinite(body.sheets) && body.sheets > 0) {
        patch.sheets = body.sheets;
      }
    }

    if (Object.keys(patch).length === 0) {
      return reply.code(400).send({ error: 'Nenhum campo para atualizar' });
    }

    await db.update(printJobs).set(patch).where(eq(printJobs.id, id));
    const updated = await db.select().from(printJobs).where(eq(printJobs.id, id)).get();
    app.io?.to('estoque').emit('job:updated', updated);
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

      await deductStockForJob(jobToDeduct, job.machineId, app.io);
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

  const CONVERSION_FACTOR_BY_UNIT = {
    fls: 1,
    rms: 500,
    pk: 50,
    bl: 2500,
  } as const;

  app.post('/api/jobs/bulk-deduct', {
    schema: {
      tags: ['Jobs'],
      summary: 'Debitar múltiplos jobs em massa no mesmo material (bobina ou folha)',
      description: 'Permite selecionar jobs que rodaram no mesmo material e aplicar o débito consolidado de uma só vez.',
      body: {
        type: 'object',
        required: ['jobIds', 'stockItemId'],
        properties: {
          jobIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
          stockItemId: { type: 'string' },
          machineId: { type: 'string' },
          bobinaId: { type: 'string' },
          reason: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            processedCount: { type: 'number' },
            totalDebited: { type: 'number' },
            unit: { type: 'string' },
            message: { type: 'string' },
          },
        },
        400: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { jobIds, stockItemId, machineId, bobinaId, reason } = request.body as {
      jobIds: string[];
      stockItemId: string;
      machineId?: string;
      bobinaId?: string;
      reason?: string;
    };

    const item = await db.select().from(stockItems).where(eq(stockItems.id, stockItemId)).get();
    if (!item) {
      return reply.code(404).send({ error: 'Material selecionado não foi encontrado no estoque.' });
    }

    // Busca os jobs em printJobs ou em mimakiJobs
    const allJobs = await db
      .select()
      .from(printJobs)
      .where(or(inArray(printJobs.id, jobIds), inArray(printJobs.jobId, jobIds)))
      .all();

    let isMimaki = false;
    let pendingJobs: typeof printJobs.$inferSelect[] = [];
    let pendingMimakiJobs: typeof mimakiJobs.$inferSelect[] = [];

    if (allJobs.length > 0) {
      pendingJobs = allJobs.filter((j) => !j.stockDeducted);
    } else {
      const allMimaki = await db
        .select()
        .from(mimakiJobs)
        .where(inArray(mimakiJobs.id, jobIds))
        .all();
      if (allMimaki.length > 0) {
        isMimaki = true;
        pendingMimakiJobs = allMimaki.filter((j) => !j.stockDeducted || j.materialStatus === 'PENDING_BIND');
      }
    }

    if (!isMimaki && allJobs.length === 0) {
      return reply.code(404).send({ error: 'Nenhum dos jobs selecionados foi encontrado.' });
    }

    const totalPendingCount = isMimaki ? pendingMimakiJobs.length : pendingJobs.length;
    if (totalPendingCount === 0) {
      return reply.code(400).send({ error: 'Todos os jobs selecionados já tiveram o estoque debitado anteriormente.' });
    }

    const nowIso = new Date().toISOString();
    const user = request.user as { sub?: string; name?: string } | undefined;

    // Distingue entre material de FOLHAS (Konica / unidades fls, rms, pk) e BOBINA (m / metros lineares)
    const isSheetMaterial = item.unit === 'fls' || item.unit === 'rms' || item.unit === 'pk' || item.unit === 'bl';

    if (isSheetMaterial) {
      // SOMA DE FOLHAS
      let totalSheets = 0;
      if (isMimaki) {
        for (const job of pendingMimakiJobs) {
          const sheetsCount = (job.quantityUnits && job.quantityUnits > 0) ? job.quantityUnits : (job.pages ?? 1);
          totalSheets += sheetsCount;
        }
      } else {
        for (const job of pendingJobs) {
          const sheetsCount = (job.sheets && job.sheets > 0) ? job.sheets : (job.pages ?? 1);
          totalSheets += sheetsCount;
        }
      }

      const factor = CONVERSION_FACTOR_BY_UNIT[item.unit as keyof typeof CONVERSION_FACTOR_BY_UNIT] ?? 1;
      const debitQty = factor > 1 ? Math.floor(totalSheets / factor) : totalSheets;

      const newQty = Math.max(0, item.currentQuantity - debitQty);
      await db.update(stockItems).set({ currentQuantity: newQty }).where(eq(stockItems.id, item.id));

      await db.insert(stockTransactions).values({
        id: newId(),
        itemId: item.id,
        type: 'OUT',
        quantity: debitQty,
        reason: reason || `Baixa em massa: ${totalPendingCount} job(s) [${totalSheets} folhas] no papel ${item.name}`,
        userId: user?.sub ?? null,
        userName: user?.name ?? 'Operador',
      });

      // Atualiza os jobs como debitados
      if (isMimaki) {
        for (const job of pendingMimakiJobs) {
          await db
            .update(mimakiJobs)
            .set({
              stockDeducted: true,
              materialStatus: 'BOUND',
              stockItemId: item.id,
            })
            .where(eq(mimakiJobs.id, job.id));
        }
      } else {
        for (const job of pendingJobs) {
          await db
            .update(printJobs)
            .set({
              stockDeducted: true,
              deductedAt: nowIso,
              materialStatus: 'DEDUCTED',
              mediaType: item.name,
            })
            .where(eq(printJobs.id, job.id));
        }
      }

      app.io.to('estoque').emit('stock:updated', { itemId: item.id });
      app.io.to('estoque').emit('printer:job_completed', { message: 'Jobs debitados em massa' });
      if (isMimaki) {
        app.io.to('estoque').emit('mimaki:job:bound', { count: totalPendingCount });
      }

      return reply.code(200).send({
        success: true,
        processedCount: totalPendingCount,
        totalDebited: debitQty,
        unit: item.unit,
        message: `${totalPendingCount} job(s) debitado(s) com sucesso: ${debitQty} ${item.unit} (${totalSheets} folhas) de ${item.name}.`,
      });
    } else {
      // SOMA DE METROS LINEARES DE BOBINA
      const rollWidth = (item.width && item.width > 0) ? item.width : 1.52;
      let totalLinearM = 0;

      if (isMimaki) {
        for (const job of pendingMimakiJobs) {
          const linear = job.lengthMeters && job.lengthMeters > 0 ? job.lengthMeters : 1;
          totalLinearM += linear;
        }
      } else {
        for (const job of pendingJobs) {
          let linear = job.linearMetersDebited;
          if (!linear || linear <= 0) {
            linear = job.mediaAreaM2 && job.mediaAreaM2 > 0 ? toPrecision(job.mediaAreaM2 / rollWidth, 3) : 1;
          }
          totalLinearM += linear;
        }
      }
      totalLinearM = toPrecision(totalLinearM, 3);

      let targetBobina: typeof bobinas.$inferSelect | null = null;
      if (bobinaId) {
        targetBobina = await db.select().from(bobinas).where(eq(bobinas.id, bobinaId)).get() ?? null;
      } else {
        // Busca bobina IN_USE para a máquina informada ou primeira bobina em uso do item
        const mId = machineId || (isMimaki ? pendingMimakiJobs[0]?.machineId : pendingJobs[0]?.machineId);
        if (mId) {
          targetBobina = await db
            .select()
            .from(bobinas)
            .where(
              and(
                eq(bobinas.stockItemId, item.id),
                eq(bobinas.state, 'IN_USE'),
                eq(bobinas.location, `machine:${mId}`),
              ),
            )
            .get() ?? null;
        }
        if (!targetBobina) {
          targetBobina = await db
            .select()
            .from(bobinas)
            .where(and(eq(bobinas.stockItemId, item.id), eq(bobinas.state, 'IN_USE')))
            .get() ?? null;
        }
      }

      if (targetBobina) {
        const remaining = Math.max(0, toPrecision((targetBobina.metersRemaining ?? 0) - totalLinearM, 3));
        await db
          .update(bobinas)
          .set({
            metersRemaining: remaining,
            state: remaining <= 0 ? 'USED' : 'IN_USE',
          })
          .where(eq(bobinas.id, targetBobina.id));
      }

      const newQty = Math.max(0, toPrecision(item.currentQuantity - totalLinearM, 3));
      await db.update(stockItems).set({ currentQuantity: newQty }).where(eq(stockItems.id, item.id));

      const bobinaDesc = targetBobina ? ` [Bobina ${targetBobina.serial}]` : '';
      await db.insert(stockTransactions).values({
        id: newId(),
        itemId: item.id,
        type: 'OUT',
        quantity: totalLinearM,
        reason: reason || `Baixa em massa: ${totalPendingCount} job(s)${bobinaDesc} no material ${item.name}`,
        userId: user?.sub ?? null,
        userName: user?.name ?? 'Operador',
      });

      // Atualiza os jobs
      if (isMimaki) {
        for (const job of pendingMimakiJobs) {
          await db
            .update(mimakiJobs)
            .set({
              stockDeducted: true,
              materialStatus: 'BOUND',
              stockItemId: item.id,
            })
            .where(eq(mimakiJobs.id, job.id));

          const { mimakiTestJobs } = await import('../db/schema.js');
          await db
            .update(mimakiTestJobs)
            .set({
              stockDeducted: true,
              stockItemId: item.id,
              bobinaId: targetBobina ? targetBobina.id : null,
              parsedBobinaSerial: targetBobina ? targetBobina.serial : null,
            })
            .where(
              or(
                eq(mimakiTestJobs.keyFilename, job.jobName),
                job.orderCode ? eq(mimakiTestJobs.parsedOrderCode, job.orderCode) : sql`1 = 0`
              )
            );
        }
      } else {
        for (const job of pendingJobs) {
          const linear = job.linearMetersDebited ?? (job.mediaAreaM2 && job.mediaAreaM2 > 0 ? toPrecision(job.mediaAreaM2 / rollWidth, 3) : 1);
          await db
            .update(printJobs)
            .set({
              stockDeducted: true,
              deductedAt: nowIso,
              rollWidthUsed: rollWidth,
              linearMetersDebited: linear,
              materialStatus: 'DEDUCTED',
              mediaType: item.name,
            })
            .where(eq(printJobs.id, job.id));
        }
      }

      app.io.to('estoque').emit('stock:updated', { itemId: item.id });
      app.io.to('estoque').emit('printer:job_completed', { message: 'Jobs debitados em massa' });
      if (isMimaki) {
        app.io.to('estoque').emit('mimaki:job:bound', { count: totalPendingCount });
      }

      return reply.code(200).send({
        success: true,
        processedCount: totalPendingCount,
        totalDebited: totalLinearM,
        unit: 'm',
        message: `${totalPendingCount} job(s) debitado(s) com sucesso: ${totalLinearM}m de ${item.name}${bobinaDesc}.`,
      });
    }
  });

  app.delete('/api/jobs/:id', {
    schema: {
      tags: ['Jobs'],
      summary: 'Excluir job de impressão',
      description: 'Exclui um job de impressão da tabela e do banco de dados.',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            id: { type: 'string' },
            message: { type: 'string' },
          },
        },
        404: {
          type: 'object',
          properties: { error: { type: 'string' } },
        },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    // Tenta encontrar em printJobs
    const printJob = await db.select().from(printJobs).where(eq(printJobs.id, id)).get();
    if (printJob) {
      await db.delete(printJobs).where(eq(printJobs.id, id));
      app.io?.to('estoque').emit('job:deleted', { id, ripType: printJob.ripType });
      app.io?.to('estoque').emit('printer:job_completed', { message: `Job ${printJob.jobName} excluído` });
      return reply.code(200).send({
        success: true,
        id,
        message: 'Job de impressão excluído com sucesso.',
      });
    }

    // Tenta encontrar em mimakiJobs
    const mimakiJob = await db.select().from(mimakiJobs).where(eq(mimakiJobs.id, id)).get();
    if (mimakiJob) {
      await db.delete(mimakiJobs).where(eq(mimakiJobs.id, id));
      await db.delete(mimakiTestJobs).where(
        or(
          eq(mimakiTestJobs.keyFilename, mimakiJob.jobName),
          mimakiJob.orderCode ? eq(mimakiTestJobs.parsedOrderCode, mimakiJob.orderCode) : sql`1 = 0`
        )
      );
      app.io?.to('estoque').emit('job:deleted', { id, ripType: 'mimaki' });
      app.io?.to('estoque').emit('mimaki:job:bound', { count: 0 });
      return reply.code(200).send({
        success: true,
        id,
        message: 'Job Mimaki excluído com sucesso.',
      });
    }

    return reply.code(404).send({ error: 'Job não encontrado.' });
  });

  app.post('/api/jobs/bulk-delete', {
    schema: {
      tags: ['Jobs'],
      summary: 'Excluir múltiplos jobs de impressão em massa',
      description: 'Remove múltiplos jobs da tabela e do banco de dados em lote.',
      body: {
        type: 'object',
        required: ['jobIds'],
        properties: {
          jobIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            count: { type: 'number' },
            message: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: { error: { type: 'string' } },
        },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { jobIds } = request.body as { jobIds: string[] };

    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      return reply.code(400).send({ error: 'jobIds deve ser uma lista não vazia' });
    }

    const pJobs = await db.select().from(printJobs).where(inArray(printJobs.id, jobIds)).all();
    const mJobs = await db.select().from(mimakiJobs).where(inArray(mimakiJobs.id, jobIds)).all();

    if (pJobs.length > 0) {
      await db.delete(printJobs).where(inArray(printJobs.id, pJobs.map((j) => j.id)));
    }

    if (mJobs.length > 0) {
      await db.delete(mimakiJobs).where(inArray(mimakiJobs.id, mJobs.map((j) => j.id)));
      for (const mj of mJobs) {
        await db.delete(mimakiTestJobs).where(
          or(
            eq(mimakiTestJobs.keyFilename, mj.jobName),
            mj.orderCode ? eq(mimakiTestJobs.parsedOrderCode, mj.orderCode) : sql`1 = 0`
          )
        );
      }
    }

    const totalCount = pJobs.length + mJobs.length;

    app.io?.to('estoque').emit('job:deleted', { ids: jobIds, count: totalCount });
    app.io?.to('estoque').emit('printer:job_completed', { message: `${totalCount} jobs excluídos` });
    app.io?.to('estoque').emit('mimaki:job:bound', { count: 0 });

    return reply.code(200).send({
      success: true,
      count: totalCount,
      message: `${totalCount} job(s) excluído(s) com sucesso.`,
    });
  });
}

