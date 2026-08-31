# PLAN: Electron (shell) + Turso real + Fix Avatar

## Goal
Fechar o ciclo "testar como seria no serviço": (1) subir o git do jeito que está; (2) ligar o backend ao **Turso real** (credenciais no `backend/.env`); (3) implementar o **shell Electron** (P4 do `PLAN-electron-shell.md`, T1–T6) para testar em produção na LAN; (4) corrigir o **bug da foto de avatar** que não aparece em `users`. Nada de segredo no git (`.env*` é gitignored).

## Tasks

- [x] **T1. Git: commit + push do estado atual** — `git add -A`, conferir staged SEM `.env*`, `local-replica.db*`, `wa_auth`, `out/`, `dist/`; commit claro (ex.: `feat: swagger + hydration fixes + docs (electron/turso)`) e `git push origin main`. → Verify: `git status` limpo, `git push` OK e `git show --stat HEAD` contém só docs e source (sem segredo/DB).
- [x] **T2. Turso: credenciais reais + drizzle config** — preencher `grafica-app/backend/.env` com `TURSO_DATABASE_URL=libsql://…` e `TURSO_AUTH_TOKEN=...` (arquivo gitignored) e ajustar `drizzle.config.ts` para carregar `.env` e passar `authToken` no `dbCredentials`. → Verify: `npm run db:push` aponta p/ URL cloud e cria as tabelas no Turso (sem 401/403). *(config pronta: dialect `turso` + dotenv + authToken; faltam as credenciais do usuário no `.env`)*
- [x] **T3. Turso: push + seed no cloud** — rodar `db:push`, `db:seed` e subir o backend com o Turso URL ativo; validar login + listagem via API. → Verify: login do usuário seed funciona e `/api/users`/`/api/stock-items` retornam dados vindos do Turso. *(push OK; cloud OK: 2 users [Felipe c/ avatar], 5 stock_items, 3 machines; aguarda restart do dev:backend p/ validação via API)*
- [x] **T4. Turso: fallback offline** — validar que SEM as vars (ou com `file:`) o backend volta ao `local-replica.db` (fluxo atual do `db/index.ts`: `TURSO_DATABASE_URL || 'file:./local-replica.db'`), e documentar ordem cloud→local. → Verify: backend com env local sobe e seed local funciona normalmente. *(seed local OK; corrigido `SEED=true` p/ Windows via cross-env)*
- [x] **T5. Electron: backendUrl runtime** — em `grafica-app/src/lib/api.ts`, resolver URL do backend na ordem `localStorage[grafica_backend_url]` → `NEXT_PUBLIC_API_URL` → `http://localhost:3001`, usada em `api()` e no socket do chat. → Verify: trocar a chave no localStorage reconecta em outra URL sem rebuild.
- [x] **T6. Electron: campo config** — em `/config`, input "URL do backend" (salva no localStorage via T5) exibindo URL em uso + botão "Testar conexão" (`GET /health`). → Verify: em PC2, definir `http://<IP-PC1>:3001` e health responde OK.
- [x] **T7. Electron: scaffold `electron/`** — criar `electron/` (package.json, `src/main.ts` carregando `grafica-app/out/index.html` com `contextIsolation: true`, `src/preload.ts`, `electron-builder.yml` NSIS → `dist/*.exe`) + spawn opcional do backend no PC1 (`node grafica-app/backend/dist/server.js`, encerra no SIGINT). → Verify: `npx electron .` abre a UI; PC1 sobe backend na 3001 sozinho. *(main.js/preload.js; scheme `app://` p/ caminhos absolutos; `--serve` spawna backend)*
- [x] **T8. Electron: scripts + build** — corrigir `package:electron` no root (hoje aponta p/ `electron/` inexistente) para rodar `build:export` + `build:backend` + electron-builder. → Verify: `npm run package:electron` gera `dist/*.exe` Windows. *(`dist/GraficaOS Setup 0.1.0.exe`; `signAndEditExecutable: false` p/ Windows sem privilégio de symlink)*
- [x] **T9. Avatar: backend serve as fotos** — registrar estático no Fastify (ex.: `@fastify/static`, prefixo `/users` apontando para `grafica-app/public/users/`, mesmo dir do `PUBLIC_USERS_DIR` em `backend/src/routes/users.ts`). → Verify: `GET http://localhost:3001/users/felipeneneu.jfif` → 200 `image/jpeg` (hoje só o frontend serve isso). *(200 OK, 16726 bytes via `lib/paths.ts`)*
- [x] **T10. Avatar: resolução via backendUrl** — criar `avatarUrl(path)` em `src/lib/api.ts` (aceita URL absoluta; resolve relativo contra `backendUrl()`) e aplicar em `SubSidebar` (AvatarImage), `AvatarThumb` (config) e preview do photo picker. → Verify: foto renderiza em dev local e via LAN/Electron (src aponta p/ IP do backend, não `/users` absoluto).
- [x] **T11. Avatar: seed com foto + persistência** — atualizar `seed.ts` p/ criar o admin com `avatar: '/users/felipeneneu.jfif'`; rodar `db:seed` no Turso; validar que PATCH persiste (já salva localStorage via `setUser`) e o `useUser` reflete. → Verify: `user.avatar` preenchido no login e foto aparece na sidebar e na tabela de `users`. *(local OK: seed atualiza admin; parte Turso depende do T3)*
- [ ] **T12. Verificação final** — `npm run lint` + `tsc --noEmit` (UI e backend), `build:export`, `package:electron`, Swagger `/documentation` OK, e roteiro 2 PCs do `docs/11_TESTING_TWO_PCS_LAN.md` (ipconfig, firewall 3001, .exe em PC2). → Verify: tudo verde; `.exe` abre; 2 PCs conversam (chat realtime) e foto do avatar aparece nos 2 cenários (dev e LAN/Electron). *(parcial: lint UI + typecheck + build + swagger 3.0.3/22 paths + .exe OK; lint do backend é pré-existente sem config própria; teste 2 PCs aguarda usuário)*

## Done When
- [ ] Git commitado e pushado sem nenhum segredo/artefato de DB.
- [ ] Backend rodando contra o Turso real (drizzle push + seed OK) com fallback `local-replica.db` intacto.
- [ ] Electron gera `.exe`; URL do backend configurável em runtime; PC1 spawna backend, PC2/3 apontam pela LAN.
- [ ] Avatar do usuário aparece em dev local, na LAN e no Electron (foto servida pelo backend).
- [ ] lint + tsc + build + Swagger + roteiro 2 PCs verificados.

## Notas
- **Caminhos reais (monorepo):** UI em `grafica-app/src`, backend em `grafica-app/backend` (não `backend/`). `db/index.ts` JÁ lê `TURSO_DATABASE_URL || 'file:./local-replica.db'` — mudança mínima; o gap real é o `drizzle.config.ts` (não carrega `.env` nem passa `authToken`).
- **Git:** `.gitignore` cobre `.env*`, `local-replica.db*`, `wa_auth`, `out/`, `dist/`, `node_modules` — `git add -A` não vai capturar o segredo do Turso; conferir no `git status` antes do commit (T1).
- **Causa raiz do avatar:** os 2 usuários seed têm `avatar: null` e as fotos são servidas pelo FRONTEND (`public/users/` → `/users/...`), quebrando em PC2/Electron `file://`; a correção move o serving para o backend e resolve contra `backendUrl()`.
- **Electron:** seguir `docs/PLAN-electron-shell.md` T1–T6; `package:electron` deve incluir `build:backend` (o spawn usa `grafica-app/backend/dist/server.js`).
- **UI em Next 16:** antes de mexer em código da UI, ler guias em `node_modules/next/dist/docs/` (regra do `grafica-app/AGENTS.md`).
- **Agentes sugeridos:** `devops-engineer` (T1, T7–T8 electron/builder, T12), `database-architect` (T2–T4 Turso), `backend-specialist` (T3, T9 fotos/static), `frontend-specialist` (T5–T6, T10–T11 avatar/UI).
