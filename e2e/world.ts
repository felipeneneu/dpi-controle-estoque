import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { get as httpGet } from 'node:http';

const root = fileURLToPath(new URL('..', import.meta.url));
const backendDir = join(root, 'grafica-app', 'backend');
const outDir = join(root, 'grafica-app', 'out');

export const ADMIN_EMAIL = 'felipe@grafica.local';
export const ADMIN_PASSWORD = 'admin123';
export const OPERATOR_EMAIL = 'operador@grafica.local';
export const OPERATOR_PASSWORD = 'operador123';

export const BACKEND_PORT = 3101;
export const UI_PORT = 3188;

let backend: ChildProcess | null = null;
let ui: Server | null = null;
let tmpDbDir: string | null = null;

export async function startWorld() {
  if (!existsSync(join(backendDir, 'dist', 'server.js'))) {
    throw new Error('Backend não compilado. Rode `npm run build:backend` antes do E2E.');
  }
  if (!existsSync(join(outDir, 'index.html'))) {
    throw new Error('UI não compilada. Rode `npm run build:export` antes do E2E.');
  }

  tmpDbDir = mkdtempSync(join(tmpdir(), 'grafica-e2e-'));

  await new Promise<void>((resolve, reject) => {
    const childEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
      PORT: String(BACKEND_PORT),
      TURSO_DATABASE_URL: `file:${join(tmpDbDir, 'e2e.db').replace(/\\/g, '/')}`,
      JWT_SECRET: 'e2e_secret_0123456789abcdef_e2e_secret_0123456789abcdef',
      SEED: 'true',
      GRAFICA_DISABLE_WHATSAPP: '1',
      NODE_ENV: 'test',
      CORS_ORIGINS: `http://localhost:${UI_PORT}`,
    };
    backend = spawn('node', ['dist/server.js'], {
      cwd: backendDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: childEnv,
    });
    backend.stdout?.on('data', (d) => process.stdout.write(`[e2e:backend] ${d}`));
    backend.stderr?.on('data', (d) => process.stderr.write(`[e2e:backend:err] ${d}`));
    void waitForHealth(resolve, reject, Date.now() + 30_000);
  });

  await startStaticServer();
}

async function startStaticServer() {
  const mime: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
    '.jfif': 'image/jpeg',
  };
  ui = createServer(async (req, res) => {
    try {
      const fs = await import('node:fs/promises');
      const urlPath = new URL(req.url || '/', `http://localhost:${UI_PORT}`).pathname;
      const read = async (p: string, type: string | null) => {
        try {
          const st = await fs.stat(p);
          if (!st.isFile()) return false;
          const buf = await fs.readFile(p);
          res.writeHead(200, { 'Content-Type': type || 'application/octet-stream' });
          res.end(buf);
          return true;
        } catch {
          return false;
        }
      };

      // 1) exact flat file: e.g. /estoque -> estoque.html, / -> index.html
      let rel = urlPath === '/' ? '/index.html' : urlPath;
      if (await read(join(outDir, rel), mime[rel.slice(rel.lastIndexOf('.'))])) return;

      // 2) Next static export => append .html: /estoque -> estoque.html
      if (await read(join(outDir, rel + '.html'), 'text/html')) return;

      // 3) nested export folder: /produtos/new -> produtos/new.html or produtos/new/index.html
      if (await read(join(outDir, urlPath, 'index.html'), 'text/html')) return;
      if (await read(join(outDir, urlPath + '.html'), 'text/html')) return;

      // 4) SPA fallback to index.html (client-side routing / deep links)
      if (await read(join(outDir, 'index.html'), 'text/html')) return;

      res.writeHead(404);
      res.end('not found');
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise<void>((resolve) => ui!.listen(UI_PORT, '127.0.0.1', resolve));
}

function waitForHealth(
  resolve: () => void,
  reject: (e: Error) => void,
  deadline: number,
) {
  const check = () => {
    const r = httpGet(`http://127.0.0.1:${BACKEND_PORT}/health`, (res) => {
      if (res.statusCode === 200) return resolve();
      if (Date.now() > deadline) return reject(new Error('timeout esperando /health'));
      res.resume();
      setTimeout(check, 500);
    });
    r.on('error', () => {
      if (Date.now() > deadline) return reject(new Error('timeout esperando /health'));
      setTimeout(check, 500);
    });
  };
  check();
}

export async function stopWorld() {
  if (backend && !backend.killed) {
    backend.kill();
  }
  if (ui) {
    await new Promise<void>((r) => ui!.close(() => r()));
  }
  if (tmpDbDir) {
    try {
      rmSync(tmpDbDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
