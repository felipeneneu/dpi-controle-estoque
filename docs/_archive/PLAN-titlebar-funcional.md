# TitleBar Funcional + Remoção de Fullscreen

## 1. Objetivo

Tornar a TitleBar custom do app Electron **totalmente funcional** e **remover o modo fullscreen** da janela (abrir **maximizada**, mantendo frameless `frame: false` + barra custom com drag region e controles min/max/close).

Escopo funcional da TitleBar (decisões do usuário, já confirmadas):
1. Menus real com dropdown (Arquivo, Editar, Exibir, Janela, Ajuda) — conjunto mínimo sensato de itens acionáveis.
2. Controles de janela (min/max/close) já implementados via IPC (`window.grafica?.minimize()/maximize()/quit()`) — validar em modo janela.
3. Botão Home → navega para `/` (dashboard).
4. Botão Bell → abre painel de notificações reutilizando o componente `NotificationPanel`.
5. Ícone de busca → navega para a página de produtos com foco no campo de busca (`/produtos?foco=1`).

## 2. Contexto Verificado (lido do repo)

- `electron/main.js`:
  - `BrowserWindow` atual: `width: 1280, height: 800, fullscreen: true, frame: false, autoHideMenuBar: true, sandbox: true, contextIsolation: true, nodeIntegration: false`.
  - IPC existentes: `grafica:info`, `grafica:net`, `grafica:quit`, `grafica:minimize`, `grafica:maximize`, `grafica:discover`.
  - `grafica:maximize` já alterna `isMaximized()`/`maximize()`/`unmaximize()`.
- `electron/preload.js`: `contextBridge.exposeInMainWorld('grafica', { info, net, quit, minimize, maximize, close, discover })`. **Não existe `window.electronAPI`** — convenção é `window.grafica`.
- `grafica-app/src/types/grafica.d.ts`: interface `Window.grafica` (tipa `minimize`, `maximize`, `close`, `quit`, `info`, `net`, `discover`).
- `grafica-app/src/components/title-bar.tsx`: header `flex h-11` branco (light), logo `/logo-64x64.png`, menus como **botões inertes** (`menuItems` array, sem onClick), Home/Bell/Search sem ação, Bell com dot vermelho, controles de janela com `window.grafica?.`.
- `grafica-app/src/app/(dashboard)/layout.tsx`: `TitleBar` no topo + row `flex h-[calc(100vh-44px)]` com `SidebarRail` (72px) + `Suspense(SubSidebar)` (240px) + `<main className="flex-1 ...">`; monta também `NotificationPanel` (no header do conteúdo), `NotificationPanel` interno, `ConnectionStatusBadge`, `NotificationsProvider`, `EscapeActionsMenu`.
- `grafica-app/src/components/notification-panel.tsx`: painel hand-rolled com `useState(open)`, botão "Notificações" + Badge de pendentes, dropdown `absolute right-0`. Não aceita trigger externo hoje.
- `grafica-app/src/components/navigation/sidebar-rail.tsx` / `sub-sidebar.tsx`: **não há estado de visibilidade** — SidebarRail/SubSidebar são sempre renderizados. Não existe context/hook de sidebar. SubSidebar usa `useSearchParams` (exige `Suspense`).
- UI disponível: `@/components/ui/dropdown-menu.tsx` (base-ui `MenuPrimitive`) com `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuCheckboxItem`, `DropdownMenuSeparator`, `DropdownMenuSub*`. **Já resolve a11y** (aria-expanded, aria-haspopup, keyboard, Escape, click-outside/DismissableLayer) — NÃO reinventar.
- `@/components/ui/dialog.tsx` (base-ui) existe para o diálogo "Sobre".
- Stack: Next 16.3.3 (App Router, `output: "export"`), React 19.2.8, Tailwind v4, `lucide-react` instalado, `zustand` **já é dependência** do `grafica-app` (`"zustand": "^5.0.15"`), `@base-ui/react` ^1.7.0.
- Rotas: `/` (dashboard), `/produtos` (tem input de busca "Buscar insumo…"), `/auth`, `/estoque`, `/tintas`, `/maquinas`, `/chat`, `/config`, `/relatorios`, `/fornecedores`.
- E2E: `e2e/specs/auth.spec.ts` (2 testes) + `estoque.spec.ts` (1 teste) — login ajuda em `window`; não dependem da sidebar visível. Config `playwright.config.ts` **não define viewport** (default 1280x720, suficiente p/ `md`).
- Scripts: `npm run lint` (frontend + backend), `npm run build:export`, `npm run e2e` (= `e2e:build` + playwright), `npm run app:preview`.
- Planos anteriores: `docs/PLAN-titlebar-dashboard.md` (T1-T5 concluídos) — este plano é a continuação (menus/ícones acionáveis + janela maximizada).

## 3. Decisões (registradas — não re-perguntar)

| # | Decisão |
|---|---------|
| D1 | Janela abre **maximizada** (`maximize: true`), `fullscreen: true` **removido**; mantém `frame: false` + TitleBar custom. |
| D2 | Menus reais com `DropdownMenu` (base-ui) — a11y, Escape e click-outside de graça. Conjunto mínimo definido abaixo. |
| D3 | Menus restritos ao Electron (`Fechar o app`, zoom, tela cheia, fechar janela) ficam ocultos no browser via `typeof window.grafica?.x === 'function'` (mesmo padrão do `EscapeActionsMenu`). Todos os calls usam optional-chaining. |
| D4 | "Exibir → Alternar barra lateral" usa **zustand store** nova (`sidebarVisible`, default `true`) — zero risco p/ e2e existente (comportamento default = atual). |
| D5 | Bell reutiliza `NotificationPanel` via prop nova `trigger?: React.ReactNode` (default mantém botão "Notificações" atual no layout). |
| D6 | Busca = navegação para `/produtos?foco=1` + página produtos foca o input quando o param existe (não cria dialog de busca). |
| D7 | Zoom via IPC novo `grafica:zoom` (`webContents.setZoomLevel`) — no browser é no-op (oculto). |
| D8 | "Sobre" = dialog shadcn/base-ui com nome/versão (versão via `grafica:info` estendido; fallback estático `0.1.0` no browser). |
| D9 | Nenhuma mudança no backend (`grafica-app/backend`) — vitest não se aplica. |
| D10 | Layout 44px + `calc(100vh-44px)` permanece intacto (maximizada tem a mesma área útil; sem fullscreen não muda cálculo). |

### Conjunto de itens por menu (D2)

- **Arquivo**: "Sair da conta" (logout → `/auth`, reusa `clearUser/clearSession`) · separador · "Fechar o app" (`window.grafica?.quit()`; Electron-only).
- **Editar**: "Recortar", "Copiar", "Colar" (placeholders **desabilitados**).
- **Exibir**: "Alternar barra lateral" (checkbox ↔ `sidebarVisible`) · separador · "Aumentar zoom" / "Diminuir zoom" / "Redefinir zoom" (`grafica?.zoom({delta})` / `{level:0}`; Electron-only).
- **Janela**: "Minimizar" · "Maximizar / Restaurar" · "Tela cheia" (checkbox ↔ `isFullScreen`, Electron-only) · separador · "Fechar".
- **Ajuda**: "Sobre o GráficaOS" (dialog com versão/autor/modo).

## 4. Atribuições de Agentes

| Task | Agente | Arquivos |
|------|--------|----------|
| T1 | `backend-specialist` | `electron/main.js` |
| T2 | `backend-specialist` | `electron/preload.js` |
| T3 | `frontend-specialist` | `grafica-app/src/types/grafica.d.ts` |
| T4 | `frontend-specialist` | `sidebar-store.ts`, `sidebar-container.tsx`, `(dashboard)/layout.tsx` |
| T5 | `frontend-specialist` | `notification-panel.tsx` |
| T6 | `frontend-specialist` | `title-bar.tsx` (menus + AboutDialog) |
| T7 | `frontend-specialist` | `title-bar.tsx` (Home/Search/Bell/estado janela) |
| T8 | `frontend-specialist` | `produtos/page.tsx` |
| T9 | `test-engineer` | `e2e/specs/titlebar.spec.ts`, `e2e/playwright.config.ts` |
| T10 | Local (verificação) | — |

Sequência/dependências: `T1 → T2 → T3 → T6` · `T6 → T7` · `T8 → T7` · `T5 → T7` · `T4 → T6` · `T7 → T9` · `T9 + T1..T8 → T10`.

## 5. Estrutura de Arquivos

```
docs/PLAN-titlebar-funcional.md          (este plano)
electron/main.js                          [T1] alterado
electron/preload.js                       [T2] alterado
grafica-app/src/types/grafica.d.ts        [T3] alterado
grafica-app/src/components/navigation/sidebar-store.ts      [T4] novo
grafica-app/src/components/navigation/sidebar-container.tsx [T4] novo
grafica-app/src/app/(dashboard)/layout.tsx                  [T4] alterado
grafica-app/src/components/notification-panel.tsx           [T5] alterado
grafica-app/src/components/title-bar.tsx                    [T6+T7] alterado (menus + ações)
grafica-app/src/components/about-dialog.tsx                 [T6] novo (dialog "Sobre")
grafica-app/src/app/(dashboard)/produtos/page.tsx           [T8] alterado (foco busca)
e2e/specs/titlebar.spec.ts                [T9] novo
e2e/playwright.config.ts                  [T9] alterado (viewport 1920x1080)
```

Nenhum outro arquivo deve mudar. Rollback: reverter por task (arquivos disjuntos por task).

## 6. Task Breakdown

### T1 — Electron main: remover fullscreen, abrir maximizada + novos IPC/window-state
**Agente:** `backend-specialist` · **Dependências:** — · **Input:** `electron/main.js`

- Remover `fullscreen: true` do `BrowserWindow`; adicionar `maximize: true` (janela abre maximizada). Manter `frame: false`, demais opções.
- Adicionar handlers IPC:
  - `grafica:isFullScreen` → `win.isFullScreen()`.
  - `grafica:setFullScreen` → `win.setFullScreen(Boolean(flag))`.
  - `grafica:isMaximized` → `win.isMaximized()`.
  - `grafica:zoom` → `({ delta, level })` → `wc.setZoomLevel(level)` ou `wc.getZoomLevel() + delta`.
- Estender `grafica:info` com `version: app.getVersion()`, `electron: process.versions.electron`, `platform: process.platform`.
- Adicionar `sendWindowState()` e listeners `enter-full-screen`, `leave-full-screen`, `maximize`, `unmaximize` → `win.webContents.send('grafica:window-state', { isFullScreen, isMaximized })`.

**OUTPUT:** `main.js` sem fullscreen, maximizada, IPC novos, eventos de estado.
**VERIFY:** `node -c electron/main.js` (sintaxe OK); `npm run app:preview` abre janela maximizada (sem fullscreen); sem regressão em `grafica:quit/minimize/maximize`.

### T2 — Preload: expor novas APIs
**Agente:** `backend-specialist` · **Dependências:** T1 · **Input:** `electron/preload.js`

- Adicionar ao objeto exposto: `isFullScreen()`, `setFullScreen(flag)`, `isMaximized()`, `zoom(payload)`, e `onWindowState(cb)` (subscribe em `grafica:window-state` retornando unsubscribe com `removeListener`). `close` continua reutilizando `grafica:quit`.

**OUTPUT:** `window.grafica` com API completa.
**VERIFY:** console do Electron mostra as chaves novas; `node -c electron/preload.js` OK.

### T3 — Tipos `Window.grafica` em parity
**Agente:** `frontend-specialist` · **Dependências:** T2 · **Input:** `grafica-app/src/types/grafica.d.ts`

- Adicionar `isFullScreen: () => Promise<boolean>`, `setFullScreen: (flag: boolean) => Promise<void>`, `isMaximized: () => Promise<boolean>`, `zoom: (payload: { delta?: number; level?: number }) => Promise<void>`, `onWindowState: (cb: (s: { isFullScreen: boolean; isMaximized: boolean }) => void) => () => void`, e estender o retorno de `info` com `version/electron/platform`.

**OUTPUT:** tipos em parity com preload.
**VERIFY:** `npx tsc --noEmit` (em `grafica-app`) 0 erros.

### T4 — Estado de visibilidade da barra lateral (Exibir → alternar)
**Agente:** `frontend-specialist` · **Dependências:** — · **Input:** layout atual + sidebars

- Criar `sidebar-store.ts` (zustand): `{ sidebarVisible: boolean (default true), toggleSidebar(), setSidebarVisible(v) }`.
- Criar `sidebar-container.tsx` ("use client") que consome a store e renderiza `<SidebarRail />` + `<Suspense fallback={null}><SubSidebar /></Suspense>` **somente** quando `sidebarVisible` (preserva o Suspense exigido pelo `useSearchParams` do SubSidebar).
- Em `layout.tsx`: substituir `SidebarRail`/`SubSidebar` por `<SidebarContainer />` (manter row `flex h-[calc(100vh-44px)]` e `<main className="flex-1 ...">`).

**OUTPUT:** sidebar ocultável via store, default visível (comportamento igual ao atual).
**VERIFY:** lint 0; `npm run build:export` OK; e2e existente verde (default = visível); alternar esconde/mostra a coluna esquerda sem quebrar `main`.

### T5 — NotificationPanel aceitar trigger externo
**Agente:** `frontend-specialist` · **Dependências:** — · **Input:** `notification-panel.tsx`

- Adicionar prop opcional `trigger?: React.ReactNode`. Quando presente, renderizar o trigger no lugar do botão "Notificações" (cloneElement com `onClick` toggle + `aria-expanded`/`aria-haspopup`). Sem `trigger`, o comportamento atual permanece idêntico (layout.tsx intacto).

**OUTPUT:** Bell do TitleBar pode abrir o mesmo painel.
**VERIFY:** `npm run dev` — Bell abre painel com notificações; botão "Notificações" no conteúdo segue funcionando.

### T6 — TitleBar: dropdown menus reais + dialog "Sobre"
**Agente:** `frontend-specialist` · **Dependências:** T3, T4 · **Input:** `title-bar.tsx`, UI dropdown/dialog

- Reescrever os 5 menus como `DropdownMenu` + `DropdownMenuTrigger` (base-ui; a11y/Escape/click-outside automáticos). Trigger mantém `style={noDragStyle}` e `hidden md:flex` no nav.
- Itens conforme seção 3 (D2). Electron-only verificado com `useSyncExternalStore` (padrão `EscapeActionsMenu`): `() => typeof window.grafica?.quit === 'function'` (server snapshot false).
- Ações: logout (Arquivo), quit (Arquivo/Janela), minimize/maximize (Janela), fullscreen checkbox (Janela, `isFullScreen` inicial + `onWindowState` p/ atualizar checkbox), zoom (Exibir), toggle sidebar (Exibir, lê `useSidebarStore`).
- Criar `about-dialog.tsx`: dialog com nome, versão (via `window.grafica?.info()`; fallback "v0.1.0 — navegador"), modo/packaged quando disponível, autor e botão fechar.

**OUTPUT:** menus abrem/itens acionam; "Sobre" abre dialog.
**VERIFY:** lint 0; em `npm run dev`: menus abrem, Esc fecha, click-outside fecha, itens Electron-only ausentes no browser; em Electron: todos os itens presentes e acionáveis.

### T7 — TitleBar: Home, Search, Bell e estado dos controles de janela
**Agente:** `frontend-specialist` · **Dependências:** T5, T6, T8 · **Input:** `title-bar.tsx`

- Home → `router.push('/')` (`useRouter`).
- Search → `router.push('/produtos?foco=1')`.
- Bell → `<NotificationPanel trigger={<button … Bell + red dot, noDragStyle>} />`.
- Maximize: ícone alterna `Square` ↔ `Copy` (restore) conforme `window.grafica?.onWindowState(...)`; estado inicial via `isMaximized()`.
- Manter `WebkitAppRegion: drag` no header e `no-drag` em todo interativo (incl. triggers/dropdown).

**OUTPUT:** Home/Bell/Search funcionais; min/max/close validados em modo janela.
**VERIFY:** em Electron: Home→`/`, Bell→painel abre, Search→`/produtos?foco=1` com input focado, ícone de maximize alterna; em browser: Home/Bell/Search funcionam (IPC ausente = no-op).

### T8 — Produtos: foco no campo de busca via `?foco=1`
**Agente:** `frontend-specialist` · **Dependências:** — · **Input:** `produtos/page.tsx`

- Em `ProdutosContent` (client): `useRef` no `Input` de busca + `useEffect` que foca o input quando `searchParams.get('foco') === '1'` (após mount). Sem outras mudanças.

**OUTPUT:** chegada com `?foco=1` foca o campo.
**VERIFY:** `npm run dev` → `/produtos?foco=1` foca "Buscar insumo…"; e2e produtos segue verde.

### T9 — E2E da TitleBar + viewport 1920x1080
**Agente:** `test-engineer` · **Dependências:** T7 · **Input:** padrão `e2e/specs/*`, `playwright.config.ts`

- `playwright.config.ts`: adicionar `viewport: { width: 1920, height: 1080 }` no bloco `use`.
- Novo `e2e/specs/titlebar.spec.ts` (login helper igual `estoque.spec.ts`):
  1. Menus visíveis: Arquivo/Editar/Exibir/Janela/Ajuda.
  2. Exibir → "Alternar barra lateral" esconde a coluna esquerda; repetir restaura.
  3. Ajuda → "Sobre o GráficaOS" abre dialog (título visível) e fecha.
  4. Home → URL `/`; Search → URL contém `/produtos` (browser: itens Electron-only não são assertados).

**OUTPUT:** suite 4/4 verde (3 existentes + 1 novo).
**VERIFY:** `npm run e2e` passa; relatório Playwright sem falhas.

### T10 — Verificação final (Phase X)
**Agente:** verificação local · **Dependências:** T1..T9

- Checklist completo abaixo (lint, build, e2e, teste manual Electron).

## 7. Phase X — Verificação Final

- [ ] `npm --prefix grafica-app run lint` → 0 erros
- [ ] `npm run build:export` → OK (static export sem warnings novos)
- [ ] Backend intocado → vitest N/A (rodar `npm --prefix grafica-app/backend run lint` se T1..T9 tocar backend — não deve)
- [ ] `npm run e2e` → 4/4 (viewport 1920x1080)
- [ ] Teste manual Electron (`npm run app:preview`):
  - Janela abre **maximizada** (nunca fullscreen); frameless; drag move a janela
  - min / max(restaura) / close funcionam; ícone do maximize alterna
  - Menus: Arquivo (Sair da conta → `/auth`; Fechar o app → encerra), Editar (items desabilitados), Exibir (toggle sidebar, zoom in/out/reset), Janela (min/max/tela cheia/fechar), Ajuda (Sobre com versão)
  - Home → `/`; Bell → painel de notificações abre; Search → produtos com input focado
  - Esc fecha menus/dialogs; click-outside fecha dropdowns
  - Layout: TitleBar 44px + row `calc(100vh-44px)` sem overflow (mesma área útil da janela maximizada)
- [ ] Teste browser (`npm run dev`): nenhum crash de `window.grafica` ausente; menus funcionam (Electron-only ocultos); sidebar toggle; search/hom/bell funcionais
- [ ] Sem hex roxo/violeta novo; sem template padrão; decisões do usuário respeitadas (sem re-perguntar)

## 8. Done When

- [ ] Janela Electron maximizada (não fullscreen) com TitleBar funcional: menus com dropdown acionáveis, Home, Bell (NotificationPanel), Search, controles min/max/close
- [ ] Sidebar ocultável via Exibir → Alternar barra lateral (default visível; e2e verde)
- [ ] Tipos `Window.grafica` em parity; browser continua seguro (optional-chaining)
- [ ] Lint 0 erros, build de export OK, e2e 4/4

## 9. Notas / Riscos

- **Drag region:** `WebkitAppRegion` é ignorada no browser (seguro). Todo trigger de menu/ícone precisa `no-drag` — risco de regressão maior aqui; revisar cada button.
- **Dropdown visual:** `dropdown-menu.tsx` tem classe `dark` embutida no content (padrão do app) — TitleBar é light; manter o padrão existente do componente (sem customização nova).
- **Fullscreen checkbox:** usa `will-change` de estado via `onWindowState`; se o evento não chegar (browser), o item fica oculto — sem efeito colateral.
- **e2e novo** não pode depender de Electron-only; asserts só no comportamento web.
- **`Suspense` do SubSidebar** deve permanecer dentro do novo `SidebarContainer` (exigência do `useSearchParams` no static export).