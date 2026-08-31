const fs = require('node:fs');
const os = require('node:os');
const { app, BrowserWindow, protocol, net, ipcMain } = require('electron');
const { pathToFileURL } = require('url');
const path = require('node:path');
const { spawn } = require('node:child_process');

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
  backendProcess = spawn(process.env.GRAFICA_NODE || 'node', args, {
    cwd: dir,
    stdio: 'inherit',
    env: {
      ...process.env,
      GRAFICA_ELECTRON: '1',
    },
  });
  backendProcess.on('error', (err) => console.error('[graficaos] falha ao spawnar backend:', err.message));
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: true,
    backgroundColor: '#1e1b4b',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.webContents.on('did-fail-load', (_e, code, desc, validatedURL) => {
    console.error('[graficaos] did-fail-load', code, desc, validatedURL);
  });
  win.webContents.on('console-message', (_e, _level, message) => {
    console.log('[renderer]', message);
  });
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
  win.loadURL('app://./index.html');
}

app.whenReady().then(async () => {
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    const host = url.hostname;
    let rel = decodeURIComponent(url.pathname);
    if (host && host !== '.') rel = '/' + host + rel;
    if (rel === '/' || rel === '') rel = '/index.html';
    if (rel.includes('..')) {
      return new Response('Forbidden', { status: 403 });
    }
    const root = path.resolve(outDir());
    const filePath = path.resolve(root, '.' + rel);
    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
      return new Response('Forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(filePath).toString()).catch(() => new Response('Not found', { status: 404 }));
  });

  if (buildMode() === 'server') {
    const up = await isBackendUp();
    if (up) {
      console.log('[graficaos] backend já está de pé em :3001 — spawn ignorado');
    } else {
      startBackend();
    }
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
}));

ipcMain.handle('grafica:net', () => ({
  hostname: os.hostname(),
  ips: lanAddresses(),
}));

ipcMain.handle('grafica:quit', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) win.close();
});