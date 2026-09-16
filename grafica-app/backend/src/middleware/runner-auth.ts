import type { FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from './auth.js';
import { m2mAuth } from './m2m-auth.js';

/**
 * Autenticação para o runner de imposição (sidecar local / Electron).
 * Aceita o secret M2M (header x-api-secret) OU um JWT de usuário autenticado.
 * - Runner headless → x-api-secret (ADR-017, GOV-004)
 * - Fluxo interativo no Electron → JWT do operador logado
 */
export async function runnerAuth(request: FastifyRequest, reply: FastifyReply) {
  const hasSecretHeader = !!(
    request.headers['x-api-secret'] ||
    request.headers['x-api-key'] ||
    request.headers['api-secret'] ||
    request.headers['apikey']
  );
  if (hasSecretHeader) {
    return m2mAuth(request, reply);
  }
  return authenticate(request, reply);
}