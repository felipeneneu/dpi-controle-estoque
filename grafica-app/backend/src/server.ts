import Fastify from 'fastify';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
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
import { startWhatsApp, stopWhatsApp } from './lib/whatsapp.js';
import { Seed } from './seed.js';

const port = Number(process.env.PORT || 3001);

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(jwt, { secret: process.env.JWT_SECRET || 'dev_secret_change_me' });

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

await app.register(swaggerUi, {
  routePrefix: '/documentation',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: true,
    persistAuthorization: true,
  },
});

app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
  if (error.validation) {
    return reply.code(400).send({ error: 'Invalid input', details: error.validation });
  }
  reply.send(error);
});

const io = new SocketIOServer(app.server, {
  cors: { origin: true },
});

app.decorate('io', io);

await app.register(authRoutes);
await app.register(stockRoutes);
await app.register(machineRoutes);
await app.register(supplierRoutes);
await app.register(userRoutes);
await app.register(chatRoutes);
await app.register(notificationRoutes);
await app.register(whatsappRoutes);

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

io.on('connection', (socket) => {
  socket.on('chat:join', (room: string) => {
    socket.join(room);
  });
  socket.on('chat:leave', (room: string) => {
    socket.leave(room);
  });
});

if (process.env.SEED === 'true') {
  await Seed();
}

try {
  await app.listen({ port, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

startWhatsApp();

process.on('SIGINT', () => {
  stopWhatsApp();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopWhatsApp();
  process.exit(0);
});
