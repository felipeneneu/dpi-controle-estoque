// afterPack (electron-builder): grava o ícone e metadados no .exe usando rcedit-x64.exe.
// Necessário porque signAndEditExecutable:false não aplica win.icon no executável
// (atalho/explorador herdam o ícone padrão do Electron).
const { execFileSync } = require('node:child_process');
const { existsSync, readdirSync } = require('node:fs');
const path = require('node:path');

const RCEDIT = path.resolve(__dirname, '..', 'build-tools', 'rcedit-x64.exe');
const ICON = path.resolve(__dirname, '..', 'build', 'icon.ico');

function findExe(appOutDir, productName) {
  const candidates = [
    path.join(appOutDir, `${productName}.exe`),
    path.join(appOutDir, productName),
  ];
  const found = candidates.find((c) => existsSync(c));
  if (found) return found;
  const exeInDir = readdirSync(appOutDir).find((f) => f.toLowerCase().endsWith('.exe'));
  if (exeInDir) return path.join(appOutDir, exeInDir);
  return null;
}

module.exports = async function bakeIcons(context) {
  const { appOutDir, packager } = context;
  const { version, productName } = packager.appInfo;

  const exe = findExe(appOutDir, productName);
  if (!exe) {
    throw new Error(`[bake-icons] .exe não encontrado em ${appOutDir}`);
  }
  if (!existsSync(RCEDIT)) {
    throw new Error(
      `[bake-icons] rcedit-x64.exe não encontrado em ${RCEDIT} — extraia do pacote winCodeSign para electron/build-tools/`
    );
  }

  const args = [
    exe,
    '--set-icon', ICON,
    '--set-version-string', 'ProductName', productName,
    '--set-version-string', 'CompanyName', 'Felipe Neneu Desenvolvedor',
    '--set-version-string', 'FileDescription', productName,
    '--set-version-string', 'LegalCopyright', 'Copyright (c) 2026 Felipe Neneu',
    '--set-file-version', version,
    '--set-product-version', version,
  ];

  execFileSync(RCEDIT, args, { stdio: 'inherit' });
  console.log(`[bake-icons] ícone e metadados gravados em ${exe}`);
};