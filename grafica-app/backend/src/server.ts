import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
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

app.get('/health', async () => ({ status: 'ok' }));

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
