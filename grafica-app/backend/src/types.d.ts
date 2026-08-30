import type { Server as SocketIOServer } from 'socket.io';

declare module 'fastify' {
  interface FastifyInstance {
    io: SocketIOServer;
  }
  interface FastifyRequest {
    userId: string;
    userRole: 'DEV_MASTER' | 'ADMIN' | 'OPERATOR';
  }
}
