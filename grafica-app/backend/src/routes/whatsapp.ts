import type { FastifyPluginAsync } from 'fastify';
import {
  getStatus,
  getDestinationPhone,
  sendWhatsApp,
  logoutWhatsApp,
} from '../lib/whatsapp.js';
import { setSetting } from '../lib/settings.js';
import { authenticate, authorize } from '../middleware/auth.js';

const WHATSAPP_PHONE_KEY = 'whatsapp.phone';
const WHATSAPP_ENABLED_KEY = 'whatsapp.enabled';

const whatsappStatusResponseSchema = {
  type: 'object',
  required: ['connected', 'state', 'enabled', 'phone'],
  properties: {
    connected: { type: 'boolean' },
    state: { type: 'string' },
    qr: { type: 'string', nullable: true, description: 'Data URL do QR Code de pareamento.' },
    enabled: { type: 'boolean' },
    phone: { type: 'string' },
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
      preHandler: [authenticate],
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
      const body = (request.body ?? {}) as { phone?: string; enabled?: boolean };
      if (body.phone !== undefined) {
        await setSetting(WHATSAPP_PHONE_KEY, body.phone);
      }
      if (body.enabled !== undefined) {
        await setSetting(WHATSAPP_ENABLED_KEY, body.enabled ? 'true' : 'false');
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
    '/api/whatsapp/test',
    {
      schema: {
        tags: ['WhatsApp'],
        summary: 'Enviar mensagem de teste',
        description: 'Envia uma mensagem de teste para o telefone configurado (requer ADMIN/DEV_MASTER).',
        response: {
          200: {
            type: 'object',
            required: ['ok', 'phone'],
            properties: {
              ok: { type: 'boolean' },
              queued: { type: 'boolean' },
              phone: { type: 'string' },
            },
          },
        },
      },
      preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])],
    },
    async () => {
      const phone = await getDestinationPhone();
      if (!phone) {
        return { ok: false, error: 'Destino não configurado' };
      }
      const ok = await sendWhatsApp(phone, `✅ Teste GraficaOS\nAlerta de estoque funcionando!`);
      return { ok, queued: !ok, phone };
    },
  );
};
