# TitleBar Global no Dashboard (estilo desktop, com IPC real do Electron)

## Goal
Adicionar um `TitleBar` estilo desktop (Adobe-like, dark) no topo global do layout do dashboard, com área de arrastar e controles de janela (minimizar/maximizar/fechar) funcionando de verdade via IPC no Electron (janela frameless). Menus e ícones de ação ficam apenas visuais (placeholders).

## Contexto verificado
- `grafica-app` usa Next 16.3.3 (static export via `output: "export"` + `images.unoptimized: true` → `next/image` ok).
- Ícones: o app usa `@remixicon/react`; **`lucide-react` não está instalado** (pedido explícito do usuário → instalar).
- Electron `/electron/main.js`: janela nativa (sem `frame: false`), `fullscreen: true`; `ipcMain.handle` existentes: `grafica:info|net|quit|discover`.
- `/electron/preload.js` expõe `window.grafica = { info, net, quit, discover }` — **não há minimize/maximize** nem `window.electronAPI`.
- Tipagem em `grafica-app/src/types/grafica.d.ts` (interface `Window.grafica`).
- `avatar-placeholder.jpg` não existe em `public/` → usar avatar real do usuário logado (`getUser()` + `avatarUrl`) com fallback de inicial.
- Layout atual em `(dashboard)/layout.tsx`: flex-row (SidebarRail 72px + SubSidebar 240px + conteúdo). Sem barra horizontal.

## Tasks
- [ ] T1: Instalar `lucide-react` em `grafica-app` → Verify: `npm --prefix grafica-app install lucide-react` e dependência presente no `package.json`.
- [ ] T2: Criar `grafica-app/src/components/title-bar.tsx` (`TitleBar`) com o design fornecido:
  - Header `flex h-11 w-full` com `style={{ WebkitAppRegion: "drag" }}`.
  - Ícones lucide: `Home, Share, Bell, Search, LayoutGrid, PanelRight, Minus, Square, X`.
  - `style={{ WebkitAppRegion: "no-drag" }}` em **todo** botão/interativo.
  - Avatar real: `getUser()` + `avatarUrl(avatar)` via `next/image`, fallback para iniciais do nome.
  - Controles usam `window.grafica?.minimize() / maximize() / close()`.
  - Menus (Arquivo…Ajuda) e ícones de ação (Home/Share/Bell/Search/Layouts) **só visuais**, sem onClick.
  → Verify: lint 0 erros; `npm run build:export` OK.
- [ ] T3: Electron frameless + IPC:
  - `electron/main.js`: `frame: false` no `BrowserWindow`; novos `ipcMain.handle('grafica:minimize')` → `win.minimize()`, `'grafica:maximize'` → alternar `win.isMaximized()`/`win.maximize()/unmaximize()`; fechar permanece `grafica:quit` (close).
  - `electron/preload.js`: adicionar `minimize` e `maximize` ao object exposto; `close` reusa `quit`.
  - `grafica-app/src/types/grafica.d.ts`: adicionar `minimize: () => Promise<void>; maximize: () => Promise<void>;` (mantendo `quit`).
  → Verify: `npm run typecheck`/build frontend OK; `npm run app:preview` abre janela **sem** frame nativo, área de arrasto move a janela, min/max/close funcionam.
- [ ] T4: Montar `<TitleBar />` no topo de `grafica-app/src/app/(dashboard)/layout.tsx`:
  - Outer vira `flex-col` (TitleBar em cima; abaixo a row atual `SidebarRail + SubSidebar + conteúdo`).
  → Verify: todas as telas do dashboard exibem a barra no topo; e2e continua verde.
- [ ] T5: Verificação final: `npm run build:export`, `npm run lint` (frontend), `npm --prefix grafica-app/backend run lint`, `npm run e2e` (3/3), e teste manual no Electron (drag + min/max/close + avatar).

## Done When
- [ ] TitleBar visível no topo de todas as rotas do dashboard.
- [ ] Janela Electron frameless; arrastar move a janela; min/max/close via IPC funcionam.
- [ ] Lint 0 erros, build de export OK, e2e 3/3 verde.

## Notes
- **Icones**: usuário pediu `lucide-react`; repo usa `@remixicon` por convenção. Decisão do plano: manter `lucide-react` (dep nova, tree-shaken). Alternativa de padronização fica como follow-up.
- `NotificationPanel`/`ConnectionStatusBadge` permanecem no header do conteúdo (o Bell do TitleBar é placeholder — sem acoplar).
- Maximize com ícone estático `Square`; trocar por ícone "restore" quando maximizada é melhoria opcional (fora de escopo).
- Em browser/dev a `WebkitAppRegion` é ignorada (seguro); só o Electron aproveita o drag.
- `window.electronAPI` do snippet original **não existe** no app — o plano usa `window.grafica` (convenção real da codebase).

## Agent Assignments
- T1, T2, T4: `frontend-specialist`
- T3: `backend-specialist` (main process / preload / preload.js — Node/Electron)
- T5: verificação local (lint/build/e2e próprios) + teste manual Electron.