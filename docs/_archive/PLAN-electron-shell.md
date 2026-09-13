# PLAN: Electron Shell + URL backend configurável (teste 2 PCs)

## Goal
Implementar a **P4 (Electron) do `PLAN-drizzle-full-system.md`**: empacotar o GraficaOS como app Windows (`.exe` via electron-builder), mantendo a arquitetura do HLD (`docs/05`) — UI estática (`out/`), backend Fastify separado (`:3001`) — e **tornar a URL do backend configurável em runtime** para o teste em 2 PCs na LAN (`docs/11`).

> **Arquitetura (docs/05 HLD):**
> - **PC1 (servidor LAN)**: roda o **backend Fastify + Socket.io** na porta **3001** (bind `0.0.0.0`);
> - **PC2/PC3 (clientes)**: conectam na API do PC1 via **LAN** (IP + porta 3001);
> - **Next.js** gera só estática (`output: 'export'` já ativo em `next.config.ts`);
> - **Turso/LibSQL** = réplica local `local-replica.db` (offline-first).

## Estado atual (confirmado)
- ✅ `output: 'export'` no `next.config.ts`; `grafica-app/` é UI estática.
- ✅ Backend Fastify completo (`:3001`, CORS `origin: true`, JWT, Socket.io, WhatsApp).
- ❌ `BACKEND_URL` é fixa em build (`NEXT_PUBLIC_API_URL || http://localhost:3001`) → em PC2/3 apontaria para `localhost` do próprio PC.
- ❌ Pasta `electron/` inexistente; `package:electron` no root quebra (aponta p/ dir vazio).

## Tasks

- [ ] **T1. URL do backend configurável em runtime** — criar função em `grafica-app/src/lib/api.ts` que resolve a URL do backend na ordem: (1) valor em `localStorage` (chave `grafica_backend_url`), (2) `NEXT_PUBLIC_API_URL`, (3) `http://localhost:3001`. Usar em `backendUrl()` e na conexão Socket.io (`chat/page.tsx`). → Verify: mudar a chave no `localStorage` e recarregar conecta em outra URL sem rebuild.
- [ ] **T2. Campo de configuração da URL** — adicionar em `/config` um input "URL do backend" (salva em `localStorage` via T1) mostrando a URL em uso + botão "testar conexão" (`GET /health`). → Verify: em PC2 defino `http://<IP-PC1>:3001` e o app passa a funcionar.
- [ ] **T3. Estrutura `electron/`** — criar `electron/` com `package.json` (electron + electron-builder), `src/main.ts` (BrowserWindow carregando `grafica-app/out/index.html`, `contextIsolation: true`, preload), `src/preload.ts` (expor app/versões/backend-url), `electron-builder.yml` (target `nsis`, artifacto `dist/`). → Verify: `npx electron .` abre a UI empacotada.
- [ ] **T4. Spawn opcional do backend (só PC1)** — no main, flag/config para "rodar backend local" (padrão ON): spawna `node backend/dist/server.js` ao iniciar e encerra ao fechar (SIGINT). Em PC2/3 config desligada + URL do IP do PC1. → Verify: abrir o app no PC1 sobe backend automaticamente na 3001; no PC2 abre só a UI.
- [ ] **T5. Scripts root** — corrigir `package:electron` para `electron-builder` (build:export + package). → Verify: `npm run package:electron` gera `dist/*.exe`.
- [ ] **T6. Verificação final** — `npm run lint` + `tsc` (UI/backend), `build:export`, `package:electron`, e seguir o **roteiro de teste 2 PCs** do `docs/11_TESTING_TWO_PCS_LAN.md`. → Verify: `.exe` nasce; 2 PCs conversam (chat realtime + estoque sincronizado).

## Done When
- [ ] Electron empacota `.exe` Windows (NSIS) que abre a UI estática.
- [ ] PC1 roda backend embutido (spawn) na porta 3001; PC2/3 apontam via LAN.
- [ ] URL do backend configurável em runtime (sem rebuild).
- [ ] Teste 2 PCs documentado (`docs/11`) e validado: login, estoque, chat e notificações realtime entre as 2 máquinas.

## Notas
- O backend já escuta em `0.0.0.0` (`server.ts`) — basta liberar a porta 3001 no Firewall do Windows.
- CORS já é `origin: true` — conexão cross-origin (UI `localhost:3000`/arquivo → API `IP:3001`) funciona.
- Sem Turso cloud, a réplica local (`file:./local-replica.db`) já serve para o teste em casa.
- Agentes sugeridos: `devops-engineer` (T3–T5, electron-builder/NSIS) + `frontend-specialist` (T1–T2).