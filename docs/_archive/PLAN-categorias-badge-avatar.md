# PLAN — Categorias dinâmicas, badge de notificações e fix de avatar

## Goal
1. Permitir **criar, excluir e inativar** categorias de insumo (hoje é um enum fixo no banco).
2. **Ligar a badge** do sidebar-rail (hoje um `'3'` hardcoded no item "Estoque de Midias") a dados reais de notificação.
3. Corrigir o **carregamento intermitente do avatar** (às vezes mostra, às vezes não) com correções apenas na UI.

Decisões tomadas (Socratic Gate):
- Categorias → **migrar tudo para FK `categoryId`** (remover enum, `stockItems.category` passa a referenciar `categories.id`).
- Badge → **ligar a dados reais** (contagem de notificações não lidas + socket).
- Avatar → **correções na UI** (fallback/onError, cache-busting, corrigir tipo do login). Sem mudanças no backend de auth.

---

## Contexto técnico (estado atual)

**Categorias** — hoje são um ENUM duplicado em 4 lugares, sem tabela nem CRUD:
- `backend/src/db/schema.ts:29` — coluna `category` com enum `['PAPER_MEDIA','INK_SUPPLY','OTHER']`
- `backend/src/routes/stock.ts:11` — Zod `Categories` (mesmo enum)
- `src/lib/api.ts:112` — type `StockCategory`; `:194-198` — `CATEGORY_LABEL`
- Filtro "Categorias Ativas" do sub-sidebar é outra lista hardcoded (`sub-sidebar.tsx:30-34`) via substring de nome (`produtos/page.tsx:54-55`), **desconectada** do enum.

**Badge** — `sidebar-rail.tsx:12-18` define `badge`; só "Estoque de Midias" tem `badge:'3'` (hardcoded). Render em `:57-61`. Nunca ligado a dados.

**Avatar** — `sub-sidebar.tsx:77-84` usa `Avatar/`+`AvatarImage` de `@base-ui` (fallback automático); `config/page.tsx:32-47` usa `<img>` sem fallback. URL via `avatarUrl()` (`api.ts:18-23` = `backendUrl() + path`, sem cache-busting). `useUser` nulo no 1º render (`use-user.ts`); login response type omite `avatar` (`auth/page.tsx:48`).

---

## Tasks

### FASE A — Categorias dinâmicas (CRUD + migração FK)

- [ ] **A1. Schema**: adicionar tabela `categories` em `backend/src/db/schema.ts` (`id`, `key` unique, `label`, `active` boolean, `createdAt`). Trocar `stockItems.category` (enum) por `stockItems.categoryId` (FK → categories.id). Gerar migração e rodar.
  - Verificar: `npx drizzle-kit generate/migrate` (ou o fluxo do projeto) cria/altera a tabela com sucesso.
- [ ] **A2. Seed**: popular `categories` com as 3 atuais (`PAPER_MEDIA`→"Midia / Papel", `INK_SUPPLY`→"Tinta / Quimica", `OTHER`→"Outro"), todas `active=true`. Migrar dados existentes de `stockItems` para `categoryId` correspondente.
  - Verificar: itens antigos mantêm categoria após a migração (consulta no banco).
- [ ] **A3. Rotas backend**: criar `backend/src/routes/categories.ts` — `GET /api/categories` (filtra `?active=`), `POST` (criar, ADMIN/DEV_MASTER), `PATCH /:id` (renomear / inativar via `active`), `DELETE /:id` (hard-delete ou bloquear se houver itens). Registrar em `app.ts`.
  - Verificar: curl/requisições a cada endpoint com token ADMIN retornam 200 e persistem.
- [ ] **A4. Atualizar rotas de estoque**: em `backend/src/routes/stock.ts`, trocar validação Zod (linha 11) e campos de `category`→`categoryId` em POST/PUT; `GET /api/stock-items` filtra por `categoryId`.
  - Verificar: criar/editar/listar item envia e recebe `categoryId`.
- [ ] **A5. Frontend — lib/tipos**: em `src/lib/api.ts`, substituir `StockCategory`/`CATEGORY_LABEL` por tipo/helper baseado na lista dinâmica `Category { id, key, label, active }` + `api<Category[]>('/api/categories')`.
  - Verificar: `npm run lint` sem erro de tipo.
- [ ] **A6. Frontend — forms**: trocar selects hardcoded de categoria em `produtos/new/page.tsx:85-94` e `edit-stock-item-dialog.tsx:88-96` por selects populados de `GET /api/categories?active=true` (com estado de loading).
  - Verificar: ao abrir o form, as categorias ativas aparecem; selecionar salva `categoryId` correto.
- [ ] **A7. Frontend — filtro do menu**: substituir a lista hardcoded `cats` (`sub-sidebar.tsx:30-34`) pela lista dinâmica de categorias ativas; ajustar filtro em `produtos/page.tsx:54-55` para usar `categoryId` (não substring de nome). **Atenção:** hoje existem filtros "Bobinas de Vinil"/"Papeis Fotograficos" que não mapeiam 1:1 com o enum — decidir mapear ou criar categorias filhas; manter filtro "Todos os Insumos".
  - Verificar: clicar numa categoria no menu lateral filtra a listagem corretamente via `categoryId`.

### FASE B — Badge de notificação (dados reais)

- [ ] **B1. Contagem de não lidas**: usar `GET /api/notifications` (já autenticado) e contar `read === false`, OU adicionar endpoint `GET /api/notifications/unread-count` no backend. (Recomendado: endpoint dedicado + reuso do socket `notification:new` já emitido em `stock.ts:336`.)
  - Verificar: retorna a contagem correta e é filtrado por usuário autenticado.
- [ ] **B2. Hook/estado**: criar hook p.ex. `src/hooks/use-notification-count.ts` que busca a contagem e incrementa/decrementa ao escutar `notification:new` e ao marcar como lida; tratar 401 (não logado → badge 0/oculto).
  - Verificar: contagem atualiza sem reload ao receber nova notificação.
- [ ] **B3. Ligar no sidebar**: em `sidebar-rail.tsx`, remover badge hardcoded e computar dinamicamente a contagem (p.ex. bad de xícaras ligado ao item /estoque com o valor do hook). Adicionar comentário explicando a utilidade da badge.
  - Verificar: badge mostra a contagem real e some quando não há não-lidas ou usuário desconectado.

### FASE C — Fix de avatar (UI)

- [ ] **C1. Componente Avatar robusto**: criar/ajustar uso de `<AvatarImage>` com tratamento de erro (`onError`) para cair no fallback; garantir que em `config/page.tsx` (AvatarThumb) use `<Avatar>`/`<AvatarImage>`+`<AvatarFallback>` em vez de `<img>` sem fallback.
  - Verificar: com backend fora/mídia inexistente, exibe iniciais (não imagem quebrada).
- [ ] **C2. Cache-busting**: adicionar parâmetro de versão/query na URL do avatar (`avatarUrl()` ex., `?v=<hash>` de `user.avatarUpdatedAt` ou do próprio path) para evitar cache antigo/erro 404 duplicado.
  - Verificar: ao trocar o avatar, a remoção de cache faz a imagem atualizar.
- [ ] **C3. Corrigir tipo do login**: incluir `avatar?: string | null` no tipo de `user` em `auth/page.tsx:45-48` (e qualquer outro lugar que monte o user), garantindo que `setUser` guarde `avatar` de forma tipada.
  - Verificar: `npm run lint` sem erro e avatar aparece após login.
- [ ] **C4. `useUser` nulo no 1º render**: garantir fallback/fallback de iniciais correto enquanto `user` está `null` (não tentar carregar imagem sem avatar). (Já tratado pelo `{user?.avatar && ...}`, apenas confirmar.)
  - Verificar: na montagem não há tentativa de imagem quebrada; fallback de iniciais aparece.

---

## Deps / Ordem
1. **A1→A2** (schema+migração) antes de qualquer rota/frontend (Fase A é o caminho crítico).
2. A3/A4 antes de A5/A6/A7 (backend primeiro).
3. Fase B e Fase C são **independentes** entre si e podem rodar em paralelo à Fase A (B depende só das rotas/notificações já existentes; C é só UI).

## Restrições do projeto (memória)
- Não mexer em RBAC, em outros módulos (maquinas/tintas/relatorios) ou na integração física de impressora.
- Manter fallback manual de IP / descoberta LAN existentes.
- Seguir convenções: componentes em `src/components/ui`, hooks em `src/hooks`, rotas Fastify em `backend/src/routes`, schema Drizzle em `backend/src/db/schema.ts`.

---

## FASE D: Verificação final
- [ ] `npm run lint` (grafica-app) → 0 erros.
- [ ] `npm run build:export` (raiz) → todas as páginas geram.
- [ ] `npm run build:backend` + typecheck do backend → sem erros.
- [ ] Fluxo manual: criar categoria → aparece no form e no filtro do menu; inativar/excluir → some das seleções ativas; itens existentes mantêm categoria.
- [ ] Badge reflete contagem real de não-lidas e some ao zerar/deslogar.
- [ ] Avatar sempre exibe imagem OU fallback (nunca quebrado/intermitente).
