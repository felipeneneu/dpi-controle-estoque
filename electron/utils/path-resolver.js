const { app } = require('electron');
const path = require('path');
const fs = require('fs');

function getAutoImposerPath() {
  const isPackaged = typeof app !== 'undefined' && app ? app.isPackaged : false;

  // 1. Em produção empacotada (extraResources)
  if (isPackaged && process.resourcesPath) {
    const prodPath = path.join(process.resourcesPath, 'bin', 'AutoImposerCLI.exe');
    if (fs.existsSync(prodPath)) return prodPath;
  }

  // 2. Em desenvolvimento
  const candidates = [
    path.resolve(process.cwd(), 'sidecars/bin/cli/AutoImposerCLI.exe'),
    path.resolve(process.cwd(), 'sidecars/AutoImposerCLI/bin/Release/net8.0/win-x64/publish/AutoImposerCLI.exe'),
    path.resolve(process.cwd(), 'sidecars/AutoImposerCLI/bin/Debug/net8.0/win-x64/AutoImposerCLI.exe'),
    path.resolve(__dirname, '../sidecars/bin/cli/AutoImposerCLI.exe'),
    path.resolve(__dirname, '../../sidecars/bin/cli/AutoImposerCLI.exe'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return candidates[0];
}

function getIllustratorImposerPath() {
  const isPackaged = typeof app !== 'undefined' && app ? app.isPackaged : false;

  // 1. Em produção empacotada (extraResources)
  if (isPackaged && process.resourcesPath) {
    const prodPath = path.join(process.resourcesPath, 'bin', 'IllustratorImposerCLI.exe');
    if (fs.existsSync(prodPath)) return prodPath;
  }

  // 2. Em desenvolvimento
  const candidates = [
    path.resolve(process.cwd(), 'sidecars/bin/cli/IllustratorImposerCLI.exe'),
    path.resolve(process.cwd(), 'sidecars/IllustratorImposerCLI/bin/Release/net8.0-windows/win-x64/publish/IllustratorImposerCLI.exe'),
    path.resolve(process.cwd(), 'sidecars/IllustratorImposerCLI/bin/Release/net8.0-windows/win-x64/IllustratorImposerCLI.exe'),
    path.resolve(__dirname, '../sidecars/bin/cli/IllustratorImposerCLI.exe'),
    path.resolve(__dirname, '../../sidecars/bin/cli/IllustratorImposerCLI.exe'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return candidates[0];
}

module.exports = { getAutoImposerPath, getIllustratorImposerPath };