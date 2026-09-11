const dgram = require('node:dgram');
const os = require('node:os');

const DISCOVER_PORT = Number(process.env.GRAFICA_DISCOVER_PORT || 41234);
const DISCOVER_MAGIC = 'GRAFICAOS_DISCOVER';
const TIMEOUT_MS = 3000;

/**
 * Envia um broadcast UDP "GRAFICAOS_DISCOVER" na porta 41234 e aguarda a
 * resposta do servidor por até 3s. Retorna { name, ip, port } do primeiro
 * servidor que responder, ou null se nenhum for encontrado.
 */
function discover(timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const timer = setTimeout(() => {
      socket.close();
      resolve(null);
    }, timeoutMs);

    socket.on('error', () => {
      clearTimeout(timer);
      socket.close();
      resolve(null);
    });

    socket.on('message', (msg, rinfo) => {
      try {
        const data = JSON.parse(msg.toString('utf8'));
        if (data && typeof data === 'object' && data.port && rinfo.address) {
          clearTimeout(timer);
          socket.close();
          resolve({
            name: data.name || rinfo.address,
            ip: data.ip || rinfo.address,
            port: Number(data.port) || 3001,
          });
          return;
        }
      } catch {
        /* ignora respostas que não são JSON esperado */
      }
    });

    socket.bind(() => {
      socket.setBroadcast(true);
      const payload = Buffer.from(DISCOVER_MAGIC, 'utf8');
      socket.send(payload, DISCOVER_PORT, '255.255.255.255', (err) => {
        if (err) {
          clearTimeout(timer);
          socket.close();
          resolve(null);
        }
      });
    });
  });
}

module.exports = { discover, DISCOVER_PORT, DISCOVER_MAGIC };
