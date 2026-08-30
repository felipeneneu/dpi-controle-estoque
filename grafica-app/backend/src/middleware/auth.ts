import type { FastifyRequest, FastifyReply } from 'fastify';

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    const payload = await request.jwtVerify<{
      sub: string;
      role: 'DEV_MASTER' | 'ADMIN' | 'OPERATOR';
    }>();
    request.userId = payload.sub;
    request.userRole = payload.role;
  } catch {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
}

export function authorize(roles: Array<'DEV_MASTER' | 'ADMIN' | 'OPERATOR'>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.userRole || !roles.includes(request.userRole)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
  };
}
