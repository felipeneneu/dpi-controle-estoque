import { describe, it, expect } from 'vitest';
import { isAllowedOrigin } from '../../src/cors.js';

describe('isAllowedOrigin (CORS)', () => {
  const allowlist: string[] = [];

  it('aceita origem vazia (não-navegador / requests sem Origin)', () => {
    expect(isAllowedOrigin(undefined, allowlist)).toBe(true);
    expect(isAllowedOrigin('', allowlist)).toBe(true);
  });

  it('aceita o protocolo app:// do Electron', () => {
    expect(isAllowedOrigin('app://.', allowlist)).toBe(true);
    expect(isAllowedOrigin('app://', allowlist)).toBe(true);
  });

  it('aceita localhost / 127.0.0.1 em qualquer porta', () => {
    expect(isAllowedOrigin('http://localhost:3001', allowlist)).toBe(true);
    expect(isAllowedOrigin('http://localhost:8080', allowlist)).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:3001', allowlist)).toBe(true);
  });

  it('aceita IPs privados RFC 1918', () => {
    expect(isAllowedOrigin('http://192.168.1.50:3001', allowlist)).toBe(true);
    expect(isAllowedOrigin('http://192.168.0.10:3001', allowlist)).toBe(true);
    expect(isAllowedOrigin('http://10.0.0.5:3001', allowlist)).toBe(true);
    expect(isAllowedOrigin('http://172.16.0.8:3001', allowlist)).toBe(true);
    expect(isAllowedOrigin('http://172.20.3.2:3001', allowlist)).toBe(true);
  });

  it('rejeita IPs públicos', () => {
    expect(isAllowedOrigin('http://8.8.8.8:3001', allowlist)).toBe(false);
    expect(isAllowedOrigin('http://200.100.1.1:3001', allowlist)).toBe(false);
    expect(isAllowedOrigin('http://172.32.0.1:3001', allowlist)).toBe(false);
    expect(isAllowedOrigin('http://11.0.0.1:3001', allowlist)).toBe(false);
  });

  it('rejeita origens inválidas e protocolos não-http', () => {
    expect(isAllowedOrigin('not a url', allowlist)).toBe(false);
    expect(isAllowedOrigin('ftp://192.168.1.10', allowlist)).toBe(false);
  });

  it('mantém compatibilidade com allowlist explícita (CORS_ORIGINS)', () => {
    expect(isAllowedOrigin('http://meu-dominio.com:4444', ['http://meu-dominio.com:4444'])).toBe(true);
    expect(isAllowedOrigin('http://192.168.5.5:4000', ['http://192.168.5.5:4000'])).toBe(true);
  });
});
