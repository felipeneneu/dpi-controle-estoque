# PLAN: GráficaOS — Drizzle + Backend + Electron + Missing Screens

## Goal
Wire the real architecture (docs HLD): **Next.js = UI estática** (`output: 'export'`), **Electron** empacota o app Windows, **backend Fastify separado (:3001)** com Drizzle/Turso, e construir todas as telas que faltam com o tema branco/roxo/pink.

> **Arquitetura (docs/05 HLD) — NÃO é um servidor Next:**
> - **Next.js** gera só estáticos (`output: 'export'`) — é a UA (UI).
> - **Electron** empacota .exe; roda em 3 PCs Windows.
> - **1 PC (servidor LAN)** roda o **backend Node/Fastify + Socket.io** 100% do tempo, porta 3001.
> - PCs 2 e 3 conectam nesse backend pela **LAN** (localhost/IP).
> - **Turso (LibSQL)** = mestre cloud; cada máquina tem **réplica local `.db`** (offline-first).
> - Drizzle + cliente libsql vivem **no workspace do backend**, não no Next.

> **Escopo:** Phases P0→P6. Execute e verifique cada phase antes de avançar. Não implementar tudo de uma vez.

> **Chat + Notificações (a base já foi preparada):** componentes de chat shadcn (`message`, `bubble`, `marker`, `message-scroller`), toasts (`sonner`) e `socket.io-client` JÁ INSTALADOS na UI. O backend Socket.io e as telas de chat/notificação entram nas phases P3/P6.

## Estado atual (confirmado por auditoria)
- **Sem DB**: drizzle-orm, drizzle-kit, libsql, prisma ausentes. Schema só em docs.
- **Sem backend**: Fastify/Socket.io/Electron = zero código.
- **Sem Electron**: nenhum wrapper.
- **Front**: Home = boilerplate; login, produtos, new = estático/mock; `auth/home` duplicado.
- **Nav quebrada**: `sub-sidebar.tsx:16` → `/produtos/novo` (real: `new`); `sidebar-rail.tsx` → `/estoque`, `/tintas`, `/chat` (inexistentes).
- **Design**: `--color-brand-orange`, `--color-bg-main`, `--radius-card` indefinidos; acentos **laranja** conflitam com roxo/pink (`#522582`/`#d9428f`).

---

## P0 — Workspace & Dependências
- [ ] Estruturar monorepo: `grafica-app/` (UI) + `backend/` (Fastify+Drizzle) + `electron/` (shell). Root `package.json` com scripts `build:export`, `package:electron`, `dev:backend`. → Verify: `npm run dev:backend` + `npm run dev` na UI funcionam.
- [ ] No `backend/`: instalar `drizzle-orm`, `@libsql/client` (runtime); `drizzle-kit`, `zod`, `@types/*` (dev). → Verify: deps no package.json + node_modules.
- [ ] No `grafica-app/`: setar `output: 'export'` no `next.config.ts`. → Verify: `next build` gera pasta `out/` estática.

## P1 — Schema + Cliente DB (backend)
- [ ] `backend/src/db/schema.ts` com as 4 tabelas do LLD (`users`, `machines`, `stock_items`, `stock_transactions`) + tabela `suppliers` (ver notas) + **`messages` e `notifications`** (chat realtime). → Verify: colunas/enums iguais ao doc (+ novas tabelas).
- [ ] `backend/src/db/index.ts` (cliente `@libsql/client` com réplica local + URL Turso cloud), `backend/drizzle.config.ts`, scripts `db:push`/`db:generate`. → Verify: `npx drizzle-kit push` cria `local-replica.db`.
- [ ] Config replicação: definir `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `JWT_SECRET`, `PORT=3001` em `.env` (+ `.env.example`). → Verify: backend lê env.

## P2 — Design Tokens (branco/roxo/pink)
- [ ] Normalizar paleta em `grafica-app/src/app/globals.css`: `--primary` roxo, accent rosa/magenta, neutro branco/zinc. → Verify: `--primary` roxo, rosa definido.
- [ ] Adicionar tokens faltantes `--color-bg-main` (branco), `--radius-card` (24–32px). → Verify: sem warning de CSS var indefinida.
- [ ] Substituir acentos **laranja** (dropzone, login, botões, `orange-*`) por roxo/rosa. → Verify: `rg -i orange` em `grafica-app/src` = nada.

## P3 — Backend Fastify (:3001)
- [ ] Scaffold `backend/src/server.ts`: fastify, @fastify/cors, @fastify/jwt, socket.io, node-cron, p-queue, baileys, Drizzle. → Verify: boot na 3001 + health.
- [ ] CRUD `/api/machines`, `/api/stock-items`, `/api/stock-transactions`, `/api/users`, `/api/auth/login` (zod). → Verify: curl 200/400.
- [ ] RBAC middleware (`authorize(['DEV_MASTER','ADMIN'])`) per docs/10. → Verify: OPERATOR bloqueado em delete/adjust.
- [ ] Socket.io: rooms por setor, emit de atualização de estoque + presença + **notificações**. → Verify: 2 clients veem mudança realtime.
- [ ] **Persistir chat**: adicionar tabelas `messages` + `notifications` no schema (P1), com rotas `GET/POST /api/messages` e `POST /api/notifications`. → Verify: mensagens persistem e notificações aparecem.
- [ ] Socket.io **chat events**: `chat:message` (broadcast para o room do setor), `notification:new` (push em tempo real), ack de entrega/leitura. → Verify: mensagem de um PC aparece no outro; notificação dispara toast.

## P4 — Electron (Windows shell)
- [ ] Estrutura `electron/`: main/preload/package, carrega `out/` estático, spawn do backend na máquina servidor. → Verify: `.exe` abre a UI.
- [ ] Gerenciar backend: PC1 spawna Fastify; PCs 2/3 apontam p/ IP da LAN (config). → Verify: 3 instâncias conectam no mesmo backend.
- [ ] `npm run package:electron` (electron-builder) renderiza `dist/*.exe`. → Verify: instalador gerado.

## P5 — Telas Core (DB via backend)
- [ ] **Dashboard** `/` — substituir boilerplate por visão geral (totais, low-stock) via fetch ao backend. → Verify: números reais.
- [ ] **Estoque de Mídias** `/estoque` — grid de items, filtro, modal "Dar Baixa" (OUT). → Verify: baixa decrementa + registra transação.
- [ ] **Tintas & Química** `/tintas` — INK_SUPPLY (ml/L), fluxo RESTOCK (IN). → Verify: reposição incrementa.
- [ ] **Produtos** `/produtos` + `/produtos/new` — ligar mock ao `GET/POST /api/stock-items`; corrigir link → `/new`. → Verify: formulário persiste; grid lê do backend.
- [ ] **Login** `/auth` — ligar a `POST /api/auth/login` (JWT); remover `auth/home`. → Verify: token valida, rotas protegidas.

## P6 — Telas Avançadas + Verificação (LAST)
- [ ] **OS/Baixas** `/os`, **Fornecedores** `/fornecedores`, **Relatórios** `/relatorios`, **Configurações** `/config` (usuários+audit). → Verify: cada rota resolve e opera via backend.
- [ ] **Chat Interno** `/chat` — usar `Message`/`MessageGroup`/`Bubble`/`MessageScroller` (já instalados), rooms por setor via `socket.io-client`, persistir em `/api/messages`, indicador de digitação. → Verify: conversa realtime + historico salvo.
- [ ] **Notificações** — `Toaster` (sonner) global + sino no sidebar que consome `notification:new`; toasts p/ baixa/estoque baixo/reposição. → Verify: toast aparece em tempo real e notificação lista no sino.
- [ ] Corrigir todas as nav quebradas e remover duplicatas. → Verify: toda rota do sidebar retorna 200.
- [ ] `npm run lint` + `tsc --noEmit` na UI e backend. → Verify: 0 erros.
- [ ] `next build` (export) + `package:electron`. → Verify: `out/` + `.exe` gerados.
- [ ] E2E: login → criar insumo → dar baixa → ver em estoque + transações (+ realtime em 2 clientes). → Verify: fluxo completo.

---

## Done When
- [ ] Schema Drizzle bate com LLD; réplica local + sync Turso funcionando.
- [ ] Backend :3001 com JWT + RBAC + Socket.io realtime.
- [ ] Electron gera `.exe`; PCs 2/3 conectam via LAN; PC1 roda backend constante.
- [ ] Todas as telas construídas e ligadas ao backend, tema branco/roxo/pink.
- [ ] Links/navegação corretos; lint + build limpos.

## Notas
- Verbete de segurança do Next 16 (`node_modules/next/dist/docs/`) antes de código no framework (AGENTS.md).
- **Backend é serviço separado**, NÃO rotas de API do Next — manter em `backend/`.
- Docs schema não tem `suppliers` nem tabela N:N insumo↔máquina (gap FR/HLD × LLD): adicionar `suppliers` (P6) e `stock_item_machines` quando necessário.
- Agentes sugeridos: `database-architect`/`backend-specialist` (P1,P3); `frontend-specialist`+`react-patterns` (P2,P5,P6); `devops-engineer` (P4, distribución Electron).
