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

export const whatsappRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/whatsapp/status',
    { preHandler: [authenticate] },
    async () => {
      return getStatus();
    },
  );

  app.post(
    '/api/whatsapp/config',
    { preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])] },
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
    { preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])] },
    async () => {
      await logoutWhatsApp();
      return { ok: true };
    },
  );

  app.post(
    '/api/whatsapp/test',
    { preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])] },
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
