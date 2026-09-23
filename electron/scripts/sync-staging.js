// Sync-staging — prepara electron/staging/backend com o build mais novo do backend
// antes do electron-builder empacotar o instalador Server (hook npm prepackage:server).
const fs = require('node:fs');
const path = require('node:path');

const BACKEND_DIR = path.resolve(__dirname, '../../grafica-app/backend');
const FRONT_PUBLIC_DIR = path.resolve(__dirname, '../../grafica-app/public');
const STAGING_DIR = path.resolve(__dirname, '../staging/backend');

const ITEMS = [
  'dist',
  'drizzle',
  'node_modules',
  'package.json',
  'package-lock.json',
  '.env',
];

if (!fs.existsSync(path.join(BACKEND_DIR, 'dist', 'server.js'))) {
  console.error(
    `[sync-staging] ERRO: build do backend não encontrado (${path.join(BACKEND_DIR, 'dist', 'server.js')}). Rode 'npm run build:backend' antes.`
  );
  process.exit(1);
}

console.log(`[sync-staging] limpando ${STAGING_DIR}`);
if (fs.existsSync(STAGING_DIR)) {
  fs.rmSync(STAGING_DIR, { recursive: true, force: true });
}
fs.mkdirSync(STAGING_DIR, { recursive: true });

for (const item of ITEMS) {
  const src = path.join(BACKEND_DIR, item);
  const dst = path.join(STAGING_DIR, item);
  if (!fs.existsSync(src)) {
    console.warn(`[sync-staging] aviso: ${item} não existe em grafica-app/backend — ignorado`);
    continue;
  }
  fs.cpSync(src, dst, { recursive: true });
  console.log(`[sync-staging] copiado ${item}`);
}

// public/ com avatares e fotos de máquina — o backend empacotado serve de
// resources/graficaos/backend/public/users (ver grafica-app/backend/src/lib/paths.ts).
const stagingPublic = path.join(STAGING_DIR, 'public');
fs.mkdirSync(stagingPublic, { recursive: true });

const backendPublic = path.join(BACKEND_DIR, 'public');
if (fs.existsSync(backendPublic)) {
  fs.cpSync(backendPublic, stagingPublic, { recursive: true });
  console.log('[sync-staging] copiado public (backend)');
}

const frontPublic = path.join(FRONT_PUBLIC_DIR, 'users');
if (fs.existsSync(frontPublic)) {
  fs.cpSync(frontPublic, path.join(stagingPublic, 'users'), { recursive: true });
  console.log('[sync-staging] copiado public/users (avatares do front)');
}

console.log('[sync-staging] staging/backend atualizado.');