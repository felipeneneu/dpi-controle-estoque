const fs = require('node:fs');
const os = require('node:os');
const { app, BrowserWindow, protocol, net, ipcMain } = require('electron');
const { pathToFileURL } = require('url');
const path = require('node:path');
const { spawn, exec } = require('node:child_process');
const { discover } = require('./discovery.js');

function isPackaged() {
  return app.isPackaged;
}

function buildMode() {
  if (isPackaged()) {
    try {
      const raw = fs.readFileSync(path.join(process.resourcesPath, 'graficaos', 'mode.json'), 'utf8');
      return JSON.parse(raw).mode === 'server' ? 'server' : 'client';
    } catch {
      return 'client';
    }
  }
  const explicit = process.argv.includes('--serve') || process.env.GRAFICA_SERVE === '1' ? 'server' : 'client';
  return process.env.GRAFICA_MODE || explicit;
}

function outDir() {
  return isPackaged()
    ? path.join(process.resourcesPath, 'graficaos', 'ui')
    : path.join(__dirname, '..', 'grafica-app', 'out');
}

function backendDir() {
  return isPackaged()
    ? path.join(process.resourcesPath, 'graficaos', 'backend')
    : path.join(__dirname, '..', 'grafica-app', 'backend');
}

let backendProcess = null;

function backendPort() {
  return Number(process.env.GRAFICA_BACKEND_PORT || process.env.PORT || 3001);
}

// Tenta liberar a porta do backend no firewall do Windows (best-effort).
// Falha silenciosamente (apenas log) quando não há permissão de administrador.
function openFirewallBestEffort() {
  if (process.platform !== 'win32') return;
  const port = backendPort();
  const ruleName = 'GraficaOS Backend (3001)';
  const command = `netsh advfirewall firewall delete rule name="${ruleName}"`;
  exec(command, () => {
    exec(
      `netsh advfirewall firewall add rule name="${ruleName}" dir=in action=allow protocol=TCP localport=${port}`,
      (err) => {
        if (err) {
          console.error('[graficaos] não foi possível liberar a porta no firewall (é preciso executar como admin).');
          return;
        }
        console.log(`[graficaos] regra de firewall criada para a porta ${port}.`);
      }
    );
  });
}

function lanAddresses() {
  const addrs = [];
  const table = os.networkInterfaces();
  for (const name of Object.keys(table)) {
    for (const addr of table[name] || []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        addrs.push({ name, address: addr.address });
      }
    }
  }
  return addrs;
}

async function isBackendUp() {
  try {
    const res = await net.fetch('http://localhost:3001/health');
    return res.ok;
  } catch {
    return false;
  }
}

function startBackend() {
  if (buildMode() !== 'server') return;
  const dir = backendDir();
  const entry = path.join(dir, 'dist', 'server.js');
  if (!fs.existsSync(entry)) {
    console.error('[graficaos] backend dist não encontrado em', entry, '- rode npm run build:backend');
    return;
  }
  const envFile = path.join(dir, '.env');
  if (!fs.existsSync(envFile)) {
    console.log('[graficaos] .env ausente — gerando configuração local (sem credenciais cloud)');
    const secret = require('node:crypto').randomBytes(32).toString('hex');
    fs.writeFileSync(
      envFile,
      [
        'PORT=3001',
        'TURSO_DATABASE_URL=file:./local-replica.db',
        `JWT_SECRET=${secret}`,
        'SEED=false',
        '',
      ].join('\n'),
      'utf8',
    );
  }
  const args = ['--env-file=.env', entry];
  console.log('[graficaos] spawnando backend:', process.env.GRAFICA_NODE || 'node', args.join(' '), '@', dir);

  // Pipe child output (no flashing console window) and mirror it to a log file + Electron stdout.
  const logPath = path.join(app.getPath('userData'), 'backend.log');
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  const tee = (stream, tag) =>
    stream.on('data', (d) => {
      logStream.write(`[${tag}] ${d}`);
      process.stdout.write(`[${tag}] ${d}`);
    });

  backendProcess = spawn(process.env.GRAFICA_NODE || 'node', args, {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GRAFICA_ELECTRON: '1',
      // Backend runtime state (WhatsApp session) must live in a writable per-user dir,
      // NOT next to the app in C:\Program Files (EPERM on mkdir).
      GRAFICA_WA_AUTH_DIR: path.join(app.getPath('userData'), 'wa_auth'),
    },
  });
  if (backendProcess.stdout) tee(backendProcess.stdout, 'backend:out');
  if (backendProcess.stderr) tee(backendProcess.stderr, 'backend:err');

  backendProcess.on('error', (err) => {
    console.error('[graficaos] falha ao spawnar backend:', err.message);
    logStream.end();
  });
  backendProcess.on('exit', (code, signal) => {
    console.error(`[graficaos] backend encerrou inesperadamente (code=${code}, signal=${signal})`);
    logStream.end();
  });
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: http: https:",
  "font-src 'self' data:",
  "connect-src 'self' http: https: ws: wss:",
  "media-src 'self' http: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const DEV_UI_URL = process.env.ELECTRON_START_URL || process.env.GRAFICA_DEV_UI_URL || 'http://localhost:3000';

function isStaticMode() {
  return isPackaged() || process.argv.includes('--static') || process.env.GRAFICA_STATIC_PREVIEW === '1';
}

async function resolveAppUrl() {
  if (isStaticMode()) {
    return 'app://./index.html';
  }

  console.log(`[graficaos] verificando servidor dev da UI em ${DEV_UI_URL}...`);
  const start = Date.now();
  // Aguarda até 15 segundos para o Next.js subir caso tenha iniciado concorrentemente
  while (Date.now() - start < 15000) {
    try {
      const res = await net.fetch(DEV_UI_URL);
      if (res.ok || res.status < 500) {
        console.log(`[graficaos] servidor dev detectado em ${DEV_UI_URL} — Live Reload ativo.`);
        return DEV_UI_URL;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log('[graficaos] servidor dev não detectado a tempo, caindo para arquivos estáticos exportados.');
  return 'app://./index.html';
}

function windowIcon() {
  const icon = path.join(__dirname, 'build', 'icon.png');
  return fs.existsSync(icon) ? icon : undefined;
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: windowIcon(),
    backgroundColor: '#fafaf9',
    frame: false,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => {
    win.webContents.executeJavaScript(`
      localStorage.removeItem('grafica_token');
      localStorage.removeItem('grafica_user');
    `);
    win.maximize();
    win.show();
  });
  win.webContents.on('did-fail-load', (_e, code, desc, validatedURL) => {
    console.error('[graficaos] did-fail-load', code, desc, validatedURL);
    if (!isStaticMode() && validatedURL.startsWith(DEV_UI_URL)) {
      setTimeout(() => {
        if (!win.isDestroyed()) {
          console.log('[graficaos] tentando recarregar servidor dev...');
          win.loadURL(DEV_UI_URL);
        }
      }, 1000);
    }
  });
  win.webContents.on('console-message', (_e, _level, message) => {
    console.log('[renderer]', message);
  });
  const sendWindowState = () => {
    if (!win.isDestroyed()) {
      win.webContents.send('grafica:window-state', {
        isFullScreen: win.isFullScreen(),
        isMaximized: win.isMaximized(),
      });
    }
  };
  win.on('enter-full-screen', sendWindowState);
  win.on('leave-full-screen', sendWindowState);
  win.on('maximize', sendWindowState);
  win.on('unmaximize', sendWindowState);
  if (!isPackaged()) {
    win.webContents.on('did-finish-load', () => {
      if (process.env.GRAFICA_DUMP === '1') {
        const dumpDir = process.env.GRAFICA_DUMP_DIR || require('node:path').join(require('node:os').tmpdir(), 'opencode');
        require('node:fs').mkdirSync(dumpDir, { recursive: true });
        win.webContents.executeJavaScript(
          `JSON.stringify({ title: document.title, styles: document.styleSheets.length, scripts: document.scripts.length, bodyLen: document.body && document.body.innerText.length, html: document.documentElement.outerHTML.slice(0, 300) })`
        ).then(async (json) => {
          require('node:fs').writeFileSync(require('node:path').join(dumpDir, 'grafica-dump.json'), json);
          const img = await win.webContents.capturePage();
          require('node:fs').writeFileSync(require('node:path').join(dumpDir, 'grafica-dump.png'), img.toPNG());
          console.log('[graficaos] dump salvo em', dumpDir);
          app.quit();
        });
      } else {
        win.webContents.openDevTools();
      }
    });
  }
  const targetUrl = await resolveAppUrl();
  win.loadURL(targetUrl);
}

app.whenReady().then(async () => {
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    const host = url.hostname;
    let rel = decodeURIComponent(url.pathname);
    if (host && host !== '.') rel = '/' + host + rel;
    if (rel === '/' || rel === '') rel = '/index.html';
    while (rel.length > 1 && rel.endsWith('/')) rel = rel.slice(0, -1);
    if (rel.includes('..')) {
      return new Response('Forbidden', { status: 403 });
    }
    const root = path.resolve(outDir());
    const resolveInside = (candidate) => {
      const abs = path.resolve(root, '.' + candidate);
      if (abs !== root && !abs.startsWith(root + path.sep)) return null;
      return abs;
    };
    let target = resolveInside(rel);
    if (!target) {
      return new Response('Forbidden', { status: 403 });
    }
    if (path.extname(rel) === '') {
      const exists = fs.existsSync(target);
      if (!exists || fs.statSync(target).isDirectory()) {
        const html = resolveInside(rel + '.html');
        target = html && fs.existsSync(html) ? html : null;
      }
      if (!target) {
        // Fallback para SPA (Single Page Application): rotas dinâmicas como /machine/[id]/[jobId]
        const indexHtml = resolveInside('/index.html');
        target = indexHtml && fs.existsSync(indexHtml) ? indexHtml : null;
      }
      if (!target) {
        return new Response('Not found', { status: 404 });
      }
    }
    return net
      .fetch(pathToFileURL(target).toString())
      .then((res) => {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          const headers = new Headers(res.headers);
          headers.set('Content-Security-Policy', CSP);
          return new Response(res.body, { status: res.status, headers });
        }
        return res;
      })
      .catch(() => new Response('Not found', { status: 404 }));
  });

  if (buildMode() === 'server') {
    const up = await isBackendUp();
    if (up) {
      console.log('[graficaos] backend já está de pé em :3001 — spawn ignorado');
    } else {
      startBackend();
    }
    openFirewallBestEffort();
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (backendProcess && !backendProcess.killed) {
    console.log('[graficaos] encerrando backend');
    backendProcess.kill('SIGTERM');
  }
});

ipcMain.handle('grafica:info', () => ({
  packaged: isPackaged(),
  mode: buildMode(),
  backendDir: backendDir(),
  outDir: outDir(),
  version: app.getVersion(),
  electron: process.versions.electron,
  platform: process.platform,
}));

ipcMain.handle('grafica:net', () => ({
  hostname: os.hostname(),
  ips: lanAddresses(),
}));

ipcMain.handle('grafica:quit', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) win.close();
});

ipcMain.handle('grafica:minimize', () => {
  BrowserWindow.getAllWindows()[0]?.minimize();
});

ipcMain.handle('grafica:maximize', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
});

ipcMain.handle('grafica:discover', () => {
  return discover();
});

ipcMain.handle('grafica:isFullScreen', () => {
  return BrowserWindow.getAllWindows()[0]?.isFullScreen() ?? false;
});

ipcMain.handle('grafica:setFullScreen', (_event, flag) => {
  BrowserWindow.getAllWindows()[0]?.setFullScreen(Boolean(flag));
});

ipcMain.handle('grafica:isMaximized', () => {
  return BrowserWindow.getAllWindows()[0]?.isMaximized() ?? false;
});

ipcMain.handle('grafica:zoom', (_event, payload) => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  const { delta, level } = payload || {};
  if (typeof level === 'number') {
    win.webContents.setZoomLevel(level);
  } else if (typeof delta === 'number') {
    win.webContents.setZoomLevel(win.webContents.getZoomLevel() + delta);
  }
});