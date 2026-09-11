import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import {
  getStatus,
  sendToRecipients,
  logoutWhatsApp,
  reconnectWhatsApp,
  fetchGroups,
} from '../lib/whatsapp.js';
import { setSetting } from '../lib/settings.js';
import { whatsappRecipients } from '../db/schema.js';
import { db } from '../db/index.js';
import { newId } from '../lib/ids.js';
import { authenticate, authorize } from '../middleware/auth.js';

const WHATSAPP_PHONE_KEY = 'whatsapp.phone';
const WHATSAPP_ENABLED_KEY = 'whatsapp.enabled';
const WHATSAPP_GROUP_ID_KEY = 'whatsapp.groupId';

const recipientSchema = z.object({
  phone: z.string().min(1),
  label: z.string().optional(),
  priority: z.enum(['principal', 'backup']).default('principal'),
  active: z.boolean().optional(),
});

const recipientUpdateSchema = z.object({
  phone: z.string().min(1).optional(),
  label: z.string().nullable().optional(),
  priority: z.enum(['principal', 'backup']).optional(),
  active: z.boolean().optional(),
});

const recipientResponseSchema = {
  type: 'object',
  required: ['id', 'phone', 'priority', 'active'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    phone: { type: 'string' },
    label: { type: 'string', nullable: true },
    priority: { type: 'string', enum: ['principal', 'backup'] },
    active: { type: 'boolean' },
  },
};

const whatsappStatusResponseSchema = {
  type: 'object',
  required: ['connected', 'state', 'enabled', 'phone'],
  properties: {
    connected: { type: 'boolean' },
    state: { type: 'string' },
    qr: { type: 'string', nullable: true, description: 'Data URL do QR Code de pareamento.' },
    enabled: { type: 'boolean' },
    phone: { type: 'string' },
    groupId: { type: 'string' },
  },
};

export const whatsappRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/whatsapp/status',
    {
      schema: {
        tags: ['WhatsApp'],
        summary: 'Status da integração',
        description: 'Retorna o estado da conexão, QR Code para pareamento e configuração.',
        response: {
          200: whatsappStatusResponseSchema,
        },
      },
      preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])],
    },
    async () => {
      return getStatus();
    },
  );

  app.post(
    '/api/whatsapp/config',
    {
      schema: {
        tags: ['WhatsApp'],
        summary: 'Configurar WhatsApp',
        description: 'Define telefone de destino e habilita/desabilita alertas (requer ADMIN/DEV_MASTER).',
        body: {
          type: 'object',
          properties: {
            phone: { type: 'string' },
            enabled: { type: 'boolean' },
            groupId: { type: 'string', nullable: true },
          },
        },
        response: {
          200: {
            type: 'object',
            required: ['ok', 'status'],
            properties: {
              ok: { type: 'boolean' },
              status: whatsappStatusResponseSchema,
            },
          },
        },
      },
      preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])],
    },
    async (request) => {
      const body = (request.body ?? {}) as {
        phone?: string;
        enabled?: boolean;
        groupId?: string | null;
      };
      if (body.phone !== undefined) {
        await setSetting(WHATSAPP_PHONE_KEY, body.phone);
      }
      if (body.enabled !== undefined) {
        await setSetting(WHATSAPP_ENABLED_KEY, body.enabled ? 'true' : 'false');
      }
      if (body.groupId !== undefined) {
        await setSetting(WHATSAPP_GROUP_ID_KEY, body.groupId ?? '');
      }
      return { ok: true, status: await getStatus() };
    },
  );

  app.post(
    '/api/whatsapp/logout',
    {
      schema: {
        tags: ['WhatsApp'],
        summary: 'Desconectar WhatsApp',
        description: 'Encerra a sessão do WhatsApp (requer ADMIN/DEV_MASTER).',
        response: {
          200: {
            type: 'object',
            required: ['ok'],
            properties: { ok: { type: 'boolean' } },
          },
        },
      },
      preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])],
    },
    async () => {
      await logoutWhatsApp();
      return { ok: true };
    },
  );

  app.post(
    '/api/whatsapp/reconnect',
    {
      schema: {
        tags: ['WhatsApp'],
        summary: 'Reiniciar pareamento',
        description: 'Apaga a sessão local e reinicia o pareamento para gerar um novo QR Code (requer ADMIN/DEV_MASTER).',
        response: {
          200: {
            type: 'object',
            required: ['ok'],
            properties: { ok: { type: 'boolean' } },
          },
        },
      },
      preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])],
    },
    async () => {
      reconnectWhatsApp();
      return { ok: true };
    },
  );

  app.post(
    '/api/whatsapp/test',
    {
      schema: {
        tags: ['WhatsApp'],
        summary: 'Enviar mensagem de teste',
        description: 'Envia uma mensagem de teste para os destinatários configurados (requer ADMIN/DEV_MASTER).',
        response: {
          200: {
            type: 'object',
            required: ['ok'],
            properties: {
              ok: { type: 'boolean' },
              results: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    kind: { type: 'string' },
                    target: { type: 'string' },
                    ok: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
      preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])],
    },
    async () => {
      const results = await sendToRecipients(
        `✅ Teste GraficaOS\nAlerta de estoque funcionando!`,
        1500,
      );
      return { ok: results.some((r) => r.ok), results };
    },
  );

  app.get(
    '/api/whatsapp/groups',
    {
      schema: {
        tags: ['WhatsApp'],
        summary: 'Listar grupos do WhatsApp',
        description: 'Lista os grupos que o WhatsApp conectado participa (requer ADMIN/DEV_MASTER).',
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'subject'],
              properties: {
                id: { type: 'string' },
                subject: { type: 'string' },
              },
            },
          },
        },
      },
      preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])],
    },
    async () => {
      return fetchGroups();
    },
  );

  app.get(
    '/api/whatsapp/recipients',
    {
      schema: {
        tags: ['WhatsApp'],
        summary: 'Listar destinatários',
        description: 'Lista os destinatários individuais de alerta (requer ADMIN/DEV_MASTER).',
        response: {
          200: { type: 'array', items: recipientResponseSchema },
        },
      },
      preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])],
    },
    async () => {
      return db.select().from(whatsappRecipients).orderBy(whatsappRecipients.createdAt).all();
    },
  );

  app.post(
    '/api/whatsapp/recipients',
    {
      schema: {
        tags: ['WhatsApp'],
        summary: 'Criar destinatário',
        description: 'Adiciona um destinatário individual de alerta (requer ADMIN/DEV_MASTER).',
        body: {
          type: 'object',
          required: ['phone'],
          properties: {
            phone: { type: 'string' },
            label: { type: 'string' },
            priority: { type: 'string', enum: ['principal', 'backup'] },
            active: { type: 'boolean' },
          },
        },
        response: {
          201: recipientResponseSchema,
          400: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
      preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])],
    },
    async (request, reply) => {
      const parsed = recipientSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
      const { phone, label, priority, active } = parsed.data;
      const row = {
        id: newId(),
        phone,
        label: label ?? null,
        priority,
        active: active ?? true,
      };
      await db.insert(whatsappRecipients).values(row);
      return reply.code(201).send(row);
    },
  );

  app.patch(
    '/api/whatsapp/recipients/:id',
    {
      schema: {
        tags: ['WhatsApp'],
        summary: 'Atualizar destinatário',
        description: 'Edita um destinatário individual de alerta (requer ADMIN/DEV_MASTER).',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            phone: { type: 'string' },
            label: { type: 'string', nullable: true },
            priority: { type: 'string', enum: ['principal', 'backup'] },
            active: { type: 'boolean' },
          },
        },
        response: {
          200: recipientResponseSchema,
          400: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
      preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = recipientUpdateSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
      const patch = parsed.data;
      const existing = await db
        .select()
        .from(whatsappRecipients)
        .where(eq(whatsappRecipients.id, id))
        .get();
      if (!existing) return reply.code(404).send({ error: 'Destinatário não encontrado' });
      const updated = { ...existing, ...patch };
      await db
        .update(whatsappRecipients)
        .set(patch)
        .where(eq(whatsappRecipients.id, id));
      return reply.send(updated);
    },
  );

  app.delete(
    '/api/whatsapp/recipients/:id',
    {
      schema: {
        tags: ['WhatsApp'],
        summary: 'Remover destinatário',
        description: 'Remove um destinatário individual de alerta (requer ADMIN/DEV_MASTER).',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        response: {
          204: { type: 'null' },
        },
      },
      preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await db.delete(whatsappRecipients).where(eq(whatsappRecipients.id, id));
      return reply.code(204).send();
    },
  );
};
