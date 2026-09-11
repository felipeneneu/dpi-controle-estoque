import dgram from 'node:dgram';
import os from 'node:os';

export const DISCOVER_PORT = Number(process.env.GRAFICA_DISCOVER_PORT || 41234);
export const DISCOVER_MAGIC = 'GRAFICAOS_DISCOVER';

function lanAddresses(): string[] {
  const addrs: string[] = [];
  const table = os.networkInterfaces();
  for (const name of Object.keys(table)) {
    for (const addr of table[name] || []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        addrs.push(addr.address);
      }
    }
  }
  return addrs;
}

/**
 * Abre um socket UDP que responde à string "GRAFICAOS_DISCOVER" com
 * { name, ip, port } para que clientes na mesma LAN achem o servidor sem
 * digitar o IP. Usa `dgram` nativo do Node (sem dependências externas).
 */
export function startDiscovery(backendPort: number): () => void {
  const socket = dgram.createSocket('udp4');

  socket.on('error', (err) => {
    console.error('[discovery] erro no socket UDP:', err.message);
    socket.close();
  });

  socket.on('message', (msg, rinfo) => {
    if (msg.toString('utf8').trim() !== DISCOVER_MAGIC) return;
    const ips = lanAddresses();
    if (ips.length === 0) return;
    const payload = Buffer.from(
      JSON.stringify({ name: os.hostname(), ip: ips[0], port: backendPort }),
      'utf8'
    );
    socket.send(payload, rinfo.port, rinfo.address, (err) => {
      if (err) console.error('[discovery] falha ao responder:', err.message);
    });
  });

  try {
    socket.bind(DISCOVER_PORT, '0.0.0.0', () => {
      console.log(`[discovery] escutando UDP na porta ${DISCOVER_PORT} (magic: ${DISCOVER_MAGIC})`);
    });
  } catch (err) {
    console.error('[discovery] falha ao abrir socket UDP:', (err as Error).message);
  }

  return () => {
    try {
      socket.close();
    } catch {
      /* ignore */
    }
  };
}
