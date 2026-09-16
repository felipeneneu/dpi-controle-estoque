import Fastify from 'fastify';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { Server as SocketIOServer } from 'socket.io';
import { authRoutes } from './routes/auth.js';
import { stockRoutes } from './routes/stock.js';
import { machineRoutes } from './routes/machines.js';
import { supplierRoutes } from './routes/suppliers.js';
import { userRoutes } from './routes/users.js';
import { chatRoutes } from './routes/chat.js';
import { notificationRoutes } from './routes/notifications.js';
import { whatsappRoutes } from './routes/whatsapp.js';
import { reportRoutes } from './routes/reports.js';
import { jobRoutes } from './routes/jobs.js';
import { mimakiRoutes } from './routes/mimaki.js';
import { mimakiTestRoutes } from './routes/mimaki-test.js';
import { automationRoutes } from './routes/automation.js';
import { USERS_PUBLIC_DIR } from './lib/paths.js';
import { isAllowedOrigin } from './cors.js';

export const ALLOWED_ROOMS = ['geral', 'estoque', 'producao'];

function isAllowedRoom(room: string): boolean {
  if (ALLOWED_ROOMS.includes(room)) return true;
  if (room.startsWith('dm:') && /^dm:[^:]+:[^:]+$/.test(room)) return true;
  if (room.startsWith('user:') && /^user:[^:]+$/.test(room)) return true;
  return false;
}

export async function buildApp(opts: { logger?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? false });

  const corsOrigin =
    (process.env.CORS_ORIGINS &&
      process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)) ||
    [];

  await app.register(cors, {
    origin: (origin, cb) => {
      if (isAllowedOrigin(origin, corsOrigin)) return cb(null, true);
      return cb(new Error('CORS not allowed'), false);
    },
  });
  await app.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX ?? 100),
    timeWindow: '1 minute',
    // Health checks are polled frequently by clients (up to 1/s each) and
    // must not consume the rate-limit budget, otherwise login/API calls get
    // 429s in multi-client setups (incl. the E2E suite).
    allowList: (req) => req.url.startsWith('/health'),
  });

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev_secret_change_me') {
    throw new Error('JWT_SECRET must be set to a strong random value before starting the server.');
  }
  await app.register(jwt, { secret: process.env.JWT_SECRET });

  await app.register(fastifyStatic, {
    root: USERS_PUBLIC_DIR,
    prefix: '/users/',
    decorateReply: false,
    index: false,
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'GraficaOS API',
        description:
          'Documentação da API do GraficaOS — sistema de controle de estoque e maquinário para gráfica. ' +
          'Autentique-se em POST /api/auth/login e aplique o token JWT em "Authorize".',
        version: '0.1.0',
      },
      tags: [
        { name: 'Autenticação', description: 'Login e registro de usuários' },
        { name: 'Estoque', description: 'Itens de estoque e transações de entrada/saída' },
        { name: 'Máquinas', description: 'Cadastro de maquinário e vínculo com materiais' },
        { name: 'Fornecedores', description: 'Cadastro de fornecedores' },
        { name: 'Usuários', description: 'Gestão de usuários e perfis' },
        { name: 'Chat', description: 'Mensagens em tempo real (Socket.IO)' },
        { name: 'Notificações', description: 'Alertas de estoque' },
        { name: 'WhatsApp', description: 'Integração WhatsApp para alertas' },
        { name: 'Relatórios', description: 'Consumo e métricas por máquina' },
        { name: 'Jobs', description: 'Jobs de impressão auto-detectados' },
        { name: 'Mimaki Integration', description: 'Integração M2M com Mimaki Tracker' },
        { name: 'Mimaki Teste', description: 'Canal paralelo de rastreio Mimaki via CSV RasterLink' },
        { name: 'Automação', description: 'Jobs de imposição headless 70x100 (ADR-017)' },
        { name: 'Sistema', description: 'Health check e status do serviço' },
      ],
      security: [{ bearerAuth: [] }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Token JWT obtido em POST /api/auth/login. Prefixar com "Bearer ".',
          },
        },
      },
    },
  });

  if (process.env.NODE_ENV !== 'production') {
    await app.register(swaggerUi, {
      routePrefix: '/documentation',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
        persistAuthorization: true,
      },
    });
  }

  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body || (typeof body === 'string' && body.trim() === '')) {
      return done(null, undefined);
    }
    try {
      const json = JSON.parse(body as string);
      done(null, json);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (error.validation) {
      return reply.code(400).send({ error: 'Invalid input', details: error.validation });
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    app.log.error(error);
    reply.code(500).send({ error: error.message || 'Internal Server Error' });
  });

  const io = new SocketIOServer(app.server, { cors: { origin: corsOrigin } });
  app.decorate('io', io);

  await app.register(authRoutes);
  await app.register(stockRoutes);
  await app.register(machineRoutes);
  await app.register(supplierRoutes);
  await app.register(userRoutes);
  await app.register(chatRoutes);
  await app.register(notificationRoutes);
  await app.register(whatsappRoutes);
  await app.register(reportRoutes);
  await app.register(jobRoutes);
  await app.register(mimakiRoutes);
  await app.register(mimakiTestRoutes);
  await app.register(automationRoutes);

  app.get('/health', {
    schema: {
      tags: ['Sistema'],
      summary: 'Health check',
      response: {
        200: {
          type: 'object',
          properties: { status: { type: 'string', example: 'ok' } },
        },
      },
    },
  }, async () => ({ status: 'ok' }));

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error('Unauthorized'));
    }
    try {
      const payload = app.jwt.verify<{ sub: string; role: string }>(token);
      (socket as unknown as { data: { user: { id: string; role: string } } }).data = {
        user: { id: payload.sub, role: payload.role },
      };
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = (socket as unknown as { data: { user: { id: string } } }).data?.user?.id;
    if (userId) {
      socket.join(`user:${userId}`);
    }

    socket.on('chat:join', (room: string) => {
      if (isAllowedRoom(room)) {
        socket.join(room);
      }
    });
    socket.on('chat:leave', (room: string) => {
      if (isAllowedRoom(room)) {
        socket.leave(room);
      }
    });
  });

  return app;
}
