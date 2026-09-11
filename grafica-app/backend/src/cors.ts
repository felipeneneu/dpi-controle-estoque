function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  return false;
}

function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

/**
 * Decide se uma origem deve ser aceita pelo CORS.
 * Aceita:
 *  - app:// (Electron custom protocol)
 *  - localhost / 127.0.0.1 em qualquer porta
 *  - qualquer host em faixas privadas RFC 1918 (192.168/16, 10/8, 172.16/12)
 *  - o que já estiver na allowlist explícita (CORS_ORIGINS)
 */
export function isAllowedOrigin(origin: string | undefined, allowlist: string[]): boolean {
  if (!origin) return true;
  if (allowlist.includes(origin)) return true;

  if (origin.startsWith('app://')) return true;

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const protocol = url.protocol;
  if (protocol !== 'http:' && protocol !== 'https:') return false;
  if (isLocalHost(url.hostname)) return true;
  return isPrivateIP(url.hostname);
}
