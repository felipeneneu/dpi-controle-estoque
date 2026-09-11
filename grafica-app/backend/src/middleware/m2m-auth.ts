import type { FastifyRequest, FastifyReply } from 'fastify';
import { client } from '../db/index.js';

export async function m2mAuth(request: FastifyRequest, reply: FastifyReply) {
  const headerSecret = (
    request.headers['x-api-secret'] ||
    request.headers['x-api-key'] ||
    request.headers['api-secret'] ||
    request.headers['apikey']
  ) as string | undefined;

  const authHeader = request.headers.authorization;

  let providedSecret: string | undefined;

  if (headerSecret) {
    providedSecret = headerSecret;
  } else if (authHeader?.startsWith('Bearer ')) {
    providedSecret = authHeader.slice(7);
  } else if (authHeader) {
    providedSecret = authHeader;
  }

  if (!providedSecret) {
    console.warn('[Mimaki M2M] 401: Nenhum secret fornecido nos headers. Headers recebidos:', Object.keys(request.headers));
    return reply.code(401).send({ error: 'Missing API secret' });
  }

  let expectedSecret = process.env.MIMAKI_INTEGRATION_SECRET;

  if (!expectedSecret) {
    const row = await client.execute({
      sql: `SELECT value FROM settings WHERE key = ?`,
      args: ['MIMAKI_INTEGRATION_SECRET'],
    });
    expectedSecret = row.rows[0]?.value as string | undefined;
  }

  const cleanProvided = providedSecret.trim().replace(/^["']|["']$/g, '');
  const cleanExpected = expectedSecret ? expectedSecret.trim().replace(/^["']|["']$/g, '') : '';

  if (!cleanExpected || cleanProvided !== cleanExpected) {
    console.warn(`[Mimaki M2M] 401: Secret divergente. Recebido: "${cleanProvided.slice(0, 6)}...", Esperado: "${cleanExpected.slice(0, 6)}..."`);
    return reply.code(401).send({ error: 'Invalid API secret' });
  }
}
