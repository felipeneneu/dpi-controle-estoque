import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, desc, and, or } from 'drizzle-orm';
import { machines, machineItems, machineTelemetry } from '../db/schema.js';
import { db } from '../db/index.js';
import { newId } from '../lib/ids.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { checkPrinterOnline } from '../agents/hp-latex/downloader.js';
import { getHpTelemetry } from '../agents/hp-latex/telemetry.js';
import { checkUrlOnline } from '../agents/konica/fetcher.js';
import { getKonicaDeviceInfo, tonerByColor } from '../agents/konica/device-info.js';

const machineSchema = z.object({
  name: z.string().min(1),
  brand: z.string().min(1),
  model: z.string().min(1),
  technology: z.string().min(1),
  imageUrl: z.string().optional(),
  ip: z.string().optional(),
  status: z.enum(['ACTIVE', 'MAINTENANCE', 'INACTIVE']).optional(),
});

const machineResponseSchema = {
  type: 'object',
  required: ['id', 'name', 'brand', 'model', 'technology', 'status'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    brand: { type: 'string' },
    model: { type: 'string' },
    technology: { type: 'string' },
    imageUrl: { type: 'string', nullable: true },
    ip: { type: 'string', nullable: true },
    status: { type: 'string', enum: ['ACTIVE', 'MAINTENANCE', 'INACTIVE'] },
    itemIds: { type: 'array', items: { type: 'string' } },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

export async function machineRoutes(app: FastifyInstance) {
  app.get('/api/machines', {
    schema: {
      tags: ['Máquinas'],
      summary: 'Listar máquinas',
      description: 'Lista máquinas com os itens de estoque vinculados. Requer autenticação.',
      response: {
        200: { type: 'array', items: machineResponseSchema },
        401: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate],
  }, async () => {
    const rows = await db.select().from(machines).all();
    const links = await db.select().from(machineItems).all();
    const byMachine = new Map<string, string[]>();
    for (const l of links) {
      const arr = byMachine.get(l.machineId) ?? [];
      arr.push(l.stockItemId);
      byMachine.set(l.machineId, arr);
    }
    return rows.map((m) => ({ ...m, itemIds: byMachine.get(m.id) ?? [] }));
  });

  app.post('/api/machines', {
    schema: {
      tags: ['Máquinas'],
      summary: 'Criar máquina',
      description: 'Cadastra uma nova máquina (requer ADMIN/DEV_MASTER).',
      body: {
        type: 'object',
        required: ['name', 'brand', 'model', 'technology'],
        properties: {
          name: { type: 'string', minLength: 1 },
          brand: { type: 'string', minLength: 1 },
          model: { type: 'string', minLength: 1 },
          technology: { type: 'string', minLength: 1 },
          imageUrl: { type: 'string' },
          ip: { type: 'string' },
          status: { type: 'string', enum: ['ACTIVE', 'MAINTENANCE', 'INACTIVE'] },
        },
      },
      response: {
        201: machineResponseSchema,
        400: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])],
  }, async (request, reply) => {
    const parsed = machineSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
    const machine = { id: newId(), ...parsed.data, status: parsed.data.status ?? 'ACTIVE' };
    await db.insert(machines).values(machine);
    return reply.code(201).send(machine);
  });

  app.put('/api/machines/:id', {
    schema: {
      tags: ['Máquinas'],
      summary: 'Atualizar máquina',
      description: 'Atualiza uma máquina existente (requer ADMIN/DEV_MASTER).',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          brand: { type: 'string', minLength: 1 },
          model: { type: 'string', minLength: 1 },
          technology: { type: 'string', minLength: 1 },
          imageUrl: { type: 'string' },
          ip: { type: 'string' },
          status: { type: 'string', enum: ['ACTIVE', 'MAINTENANCE', 'INACTIVE'] },
        },
      },
      response: {
        200: machineResponseSchema,
        400: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = machineSchema.partial().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
    const existing = await db.select().from(machines).where(eq(machines.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'Not found' });
    const next = { ...existing, ...parsed.data };
    await db.update(machines).set(next).where(eq(machines.id, id));
    return next;
  });

  app.patch('/api/machines/:id/materials', {
    schema: {
      tags: ['Máquinas'],
      summary: 'Vincular materiais a uma máquina',
      description: 'Substitui a lista de itens de estoque consumidos por uma máquina (requer ADMIN/DEV_MASTER).',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          stockItemIds: { type: 'array', items: { type: 'string' } },
        },
      },
      response: {
        200: machineResponseSchema,
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { stockItemIds?: string[] };
    const stockItemIds = body.stockItemIds ?? [];
    const existing = await db.select().from(machines).where(eq(machines.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'Not found' });
    await db.delete(machineItems).where(eq(machineItems.machineId, id));
    if (stockItemIds.length > 0) {
      await db
        .insert(machineItems)
        .values(stockItemIds.map((stockItemId) => ({ id: newId(), machineId: id, stockItemId })));
    }
    return { ...existing, itemIds: stockItemIds };
  });

  app.delete('/api/machines/:id', {
    schema: {
      tags: ['Máquinas'],
      summary: 'Excluir máquina',
      description: 'Remove uma máquina (requer DEV_MASTER).',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      response: {
        204: { type: 'null' },
      },
    },
    preHandler: [authenticate, authorize(['DEV_MASTER'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db.delete(machines).where(eq(machines.id, id));
    return reply.code(204).send();
  });

  app.get('/api/machines/check-connection', {
    schema: {
      tags: ['Máquinas'],
      summary: 'Verificar conexão da máquina',
      description: 'Verifica se uma máquina com IP configurado está acessível na rede. Retorna status de conexão.',
      querystring: {
        type: 'object',
        required: ['ip'],
        properties: {
          ip: { type: 'string', description: 'IP da máquina para testar conexão' },
        },
      },
      response: {
        200: {
          type: 'object',
          required: ['connected'],
          properties: {
            connected: { type: 'boolean' },
            ip: { type: 'string' },
            responseTimeMs: { type: 'number' },
          },
        },
      },
    },
    preHandler: [authenticate],
  }, async (request) => {
    const { ip } = request.query as { ip: string };

    if (!ip) {
      return { connected: false, ip: '', responseTimeMs: 0 };
    }

    const start = Date.now();
    const hasPort = /:\d+$/.test(ip);
    const connected = hasPort
      ? await checkUrlOnline(ip, 3000)
      : await checkPrinterOnline(ip, 3000);
    const responseTimeMs = Date.now() - start;

    return { connected, ip, responseTimeMs };
  });

  app.get('/api/machines/:id/telemetry', {
    schema: {
      tags: ['Máquinas'],
      summary: 'Obter últimas informações da máquina',
      description: 'Retorna o último snapshot de telemetria registrado para a máquina (tinta, mídia, status). Se houver IP configurado, busca telemetria ao vivo do equipamento (HP EWS ou AccurioPrint conforme o tipo da máquina).',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      response: {
        200: { type: 'object', additionalProperties: true },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const machine = await db.select().from(machines).where(eq(machines.id, id)).get();
    if (!machine) return reply.code(404).send({ error: 'Not found' });

    const latest = await db
      .select()
      .from(machineTelemetry)
      .where(eq(machineTelemetry.machineId, id))
      .orderBy(desc(machineTelemetry.createdAt))
      .limit(1)
      .get();

    if (machine.ip) {
      try {
        const isKonica =
          /konica|accurio/i.test(machine.brand) || machine.technology === 'Laser';
        if (isKonica) {
          // IP pode ser só o endereço (192.168.234.68) ou com porta (:30083);
          // nesse caso o PrintManager fica no IP (o KONICA_URL default já aponta p/ a porta).
          const info = await getKonicaDeviceInfo(machine.ip.includes(':') ? machine.ip : undefined);
          const byColor = tonerByColor(info);
          return {
            ...(latest ?? { machineId: id }),
            live: {
              online: info.online,
              statusSeverity: info.statusSeverity,
              statusMessage: info.statusMessage,
              mediaName: info.trays[0]?.paperName,
              tonerCyanPct: byColor.C,
              tonerMagentaPct: byColor.M,
              tonerYellowPct: byColor.Y,
              tonerBlackPct: byColor.K,
              wasteTonerLevel: info.wasteTonerLevel,
              trays: info.trays,
            },
          };
        }
        const resolved = await getHpTelemetry(machine.ip);
        return { ...(latest ?? { machineId: id }), live: resolved };
      } catch {
        // fall through to stored snapshot
      }
    }

    if (latest) {
      return {
        ...latest,
        trays: latest.traysJson ? JSON.parse(latest.traysJson) : undefined,
      };
    }
    return { machineId: id, online: false };
  });

  app.post('/api/machines/:id/active-bobina', {
    schema: {
      tags: ['Máquinas'],
      summary: 'Trocar bobina ativa da máquina',
      description: 'Troca a bobina atual da máquina, lidando com a bobina anterior (acabou ou voltou para estoque) e definindo a nova.',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          newBobinaId: { type: 'string' },
          oldBobinaAction: { type: 'string', enum: ['FINISHED', 'RETURN_TO_STOCK'] },
        },
      },
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' } } },
        400: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN', 'OPERATOR'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { newBobinaId, oldBobinaAction } = request.body as { newBobinaId?: string; oldBobinaAction?: 'FINISHED' | 'RETURN_TO_STOCK' };
    
    // Lazy load para evitar problemas de dependência circular/imports missing no topo
    const { bobinas } = await import('../db/schema.js');

    const machine = await db.select().from(machines).where(eq(machines.id, id)).get();
    if (!machine) return reply.code(404).send({ error: 'Máquina não encontrada' });

    // 1. Lidar com a bobina atual
    const currentActive = await db.select().from(bobinas).where(
      and(
        eq(bobinas.state, 'IN_USE'),
        eq(bobinas.location, `machine:${id}`)
      )
    ).get();

    if (currentActive && oldBobinaAction) {
      const newState = oldBobinaAction === 'FINISHED' ? 'USED' : 'NEW'; // NEW = Disponível no estoque
      const newLoc = oldBobinaAction === 'FINISHED' ? 'discarded' : 'deposito';
      
      await db.update(bobinas).set({ 
        state: newState,
        location: newLoc,
        finishedAt: oldBobinaAction === 'FINISHED' ? new Date(Date.now()) : null
      }).where(eq(bobinas.id, currentActive.id));
    }

    // 2. Montar a nova bobina
    if (newBobinaId) {
      // Pode buscar por serial ou ID
      const newBobina = await db.select().from(bobinas).where(
        or(eq(bobinas.id, newBobinaId), eq(bobinas.serial, newBobinaId))
      ).get();

      if (!newBobina) {
         return reply.code(404).send({ error: 'Nova bobina não encontrada' });
      }

      if (newBobina.state === 'USED') {
         return reply.code(400).send({ error: 'Esta bobina já foi marcada como terminada/descartada.' });
      }

      await db.update(bobinas).set({
        state: 'IN_USE',
        location: `machine:${id}`,
        bobinaOpenedAt: newBobina.bobinaOpenedAt ?? new Date()
      }).where(eq(bobinas.id, newBobina.id));
    }

    return { success: true, message: 'Bobina trocada com sucesso' };
  });
}
