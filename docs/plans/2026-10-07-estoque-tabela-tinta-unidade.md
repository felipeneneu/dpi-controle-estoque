# Estoque em Tabela + Lote Ativo + Tinta por Unidade Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Substituir a grade de cards de estoque por uma tabela inteligente interativa (TanStack Table) com lote ativo em destaque, transformar o estoque de tinta em contagem de unidades inteiras (desacoplando a dedução por ml dos RIPs HP/Mimaki para uma tabela de relatório analítico de consumo), implementar Quick Switch para tinta e remover a página legada de automação.

**Architecture:** O monorepo adota uma abordagem modular em camadas: (1) limpeza da rota e IPCs legados de automação; (2) entidades `tinta_lotes` e `ink_consumption_log` no SQLite via Drizzle com saldo derivado por contagem de unidades `NEW`; (3) desacoplamento de débito nos agentes HP e Mimaki mantendo o log analítico de ml; (4) endpoint de troca atômica de cartuchos/garrafas (`POST /api/machines/:id/active-tinta`); e (5) componente unificado `StockDataTable` com `@tanstack/react-table`, filtros combinados, busca em memória, ordenação com foco em itens críticos, atualização via Socket.IO e drill-down em 3 seções.

**Tech Stack:** Next.js 16 (React 19), Fastify, SQLite (Drizzle ORM), `@tanstack/react-table`, `@tanstack/react-query`, Socket.IO, Tailwind CSS, Electron, TypeScript.

---

### Task 0: Governança — ADR-057 e Atualização Canônica de Regras (BR-011, BR-012, P9, R-009)

**Files:**
- Create: `docs/governance/adr/ADR-057-estoque-tabela-e-tinta-unidade.md`
- Modify: `docs/governance/ADR_INDEX.md` (append seguro, regra R-009)
- Modify: `docs/business/BUSINESS_RULES.md`
- Modify: `docs/business/RULE_CHANGELOG.md`

**Step 1: Escrever a ADR-057**
Documentar a decisão formal de:
- Visualização de estoque em tabela com lote ativo visível sem modal.
- Estoque de tinta gerenciado por unidades inteiras (`NEW`), onde entrar em `IN_USE` sai imediatamente do disponível.
- Desacoplamento da dedução de ml por job para telemetria de consumo (`ink_consumption_log`).
- Quick Switch de tinta sem travar produção.

**Step 2: Atualizar `ADR_INDEX.md` com append seguro (Regra R-009)**
Adicionar a linha da ADR-057 ao final da tabela sem reescrever o arquivo inteiro.

**Step 3: Atualizar `BUSINESS_RULES.md` e `RULE_CHANGELOG.md`**
Registrar a emenda a BR-011 e BR-012 formalizando a regra de contagem por unidade para tintas e telemetria analítica de consumo.

**Step 4: Commit**
```bash
git add docs/governance/adr/ADR-057-estoque-tabela-e-tinta-unidade.md docs/governance/ADR_INDEX.md docs/business/BUSINESS_RULES.md docs/business/RULE_CHANGELOG.md
git commit -m "docs(governance): ADR-057 estoque em tabela, tinta por unidade e emenda a BR-011/BR-012"
```

---

### Task 1: Limpeza da Página e IPCs de Automação (Next.js + Electron)

**Files:**
- Delete: `grafica-app/src/app/(dashboard)/automation/page.tsx`
- Delete: `grafica-app/src/lib/queries/automation.ts`
- Modify: `grafica-app/src/components/navigation/sidebar-rail.tsx`
- Modify: `electron/preload.js`
- Modify: `electron/main.js` (ou `electron/ipc/` se houver handlers de automation)

**Step 1: Remover arquivos de automação do frontend**
Excluir a página `/automation/page.tsx` e o arquivo de queries `automation.ts`.

**Step 2: Atualizar `sidebar-rail.tsx`**
Remover o item `{ label: 'Imposição 70×100', icon: RiCollageLine, href: '/automation', badge: null }` do array `navItems`.

**Step 3: Remover canais IPC de automação em `electron`**
Remover a exposição de `window.grafica.automation` em `electron/preload.js` e quaisquer handlers `ipcMain.handle('automation:impose', ...)` e `'automation:pick-art'`.

**Step 4: Verificar compilação**
Executar verificação de build no frontend para assegurar que nenhum import ficou órfão.

**Step 5: Commit**
```bash
git add grafica-app/src/components/navigation/sidebar-rail.tsx electron/preload.js electron/main.js
git rm grafica-app/src/app/(dashboard)/automation/page.tsx grafica-app/src/lib/queries/automation.ts
git commit -m "chore(automation): remove pagina legada de automacao e bindings electron"
```

---

### Task 2: Schema de Banco de Dados — `tinta_lotes` e `ink_consumption_log`

**Files:**
- Modify: `grafica-app/backend/src/db/schema.ts`
- Create / Run: Migration SQLite Drizzle

**Step 1: Definir tabelas no schema Drizzle**
Em `grafica-app/backend/src/db/schema.ts`:
- Criar tabela `tintaLotes` (`tinta_lotes`):
  - `id`: `text('id').primaryKey()`
  - `stockItemId`: `text('stock_item_id').notNull().references(() => stockItems.id, { onDelete: 'cascade' })`
  - `serial`: `text('serial')`
  - `state`: `text('state', { enum: ['NEW', 'IN_USE', 'FINISHED'] }).notNull().default('NEW')`
  - `location`: `text('location').notNull().default('deposito')`
  - `machineId`: `text('machine_id').references(() => machines.id, { onDelete: 'set null' })`
  - `channel`: `text('channel')`
  - `openedAt`: `integer('opened_at', { mode: 'timestamp' })`
  - `finishedAt`: `integer('finished_at', { mode: 'timestamp' })`
  - `createdAt`: `integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())`
  - Unique index parcial: `(machineId, channel)` onde `state = 'IN_USE'`.
- Criar tabela `inkConsumptionLog` (`ink_consumption_log`):
  - `id`: `text('id').primaryKey()`
  - `jobId`: `text('job_id')`
  - `machineId`: `text('machine_id').notNull().references(() => machines.id, { onDelete: 'cascade' })`
  - `channel`: `text('channel').notNull()`
  - `mlConsumed`: `real('ml_consumed').notNull()`
  - `createdAt`: `integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())`

**Step 2: Escrever teste de schema e integridade**
Testar inserção de `tinta_lotes` e `ink_consumption_log` garantindo constraints e índices.

**Step 3: Commit**
```bash
git add grafica-app/backend/src/db/schema.ts
git commit -m "feat(db): schema para tinta_lotes e ink_consumption_log"
```

---

### Task 3: Backend de Lotes de Tinta e Saldo Derivado por Unidades `NEW`

**Files:**
- Modify: `grafica-app/backend/src/lib/ink-balance.ts`
- Modify: `grafica-app/backend/src/routes/stock.ts`
- Create / Modify: `grafica-app/backend/src/routes/tinta-lotes.ts` (ou acoplado em `stock.ts`)
- Test: `grafica-app/backend/src/lib/__tests__/ink-balance.test.ts`

**Step 1: Escrever teste falhando para cálculo de saldo de tinta por unidade**
O teste deve garantir:
- SKU com 3 lotes `NEW` e 1 `IN_USE` retorna `disponivel = 3`.
- Se o mínimo for 2, status é `AVAILABLE`. Se tiver 1 `NEW`, status é `LOW_STOCK`. Se 0 `NEW`, `OUT_OF_STOCK`.
- Volume em ml restante **não** interfere no saldo de estoque.

**Step 2: Implementar rotas de CRUD/listagem de lotes de tinta**
- `GET /api/stock-items/:id/tinta-lotes` (retorna lotes agrupados ou filtrados por estado).
- `POST /api/stock-items/:id/tinta-lotes` (cadastro de novos frascos/cartuchos em estado `NEW`).
- `POST /api/tinta-lotes/:id/discharge` (baixa manual se danificado/expirado).

**Step 3: Atualizar `GET /api/stock-items`**
Para itens de categoria `INK_SUPPLY`, retornar `currentQuantity` como a contagem de lotes em `NEW`, e anexar dados do lote ativo (`activeLote`) se houver um em `IN_USE`.

**Step 4: Executar testes e validar aprovação**
Garantir que todos os testes passem.

**Step 5: Commit**
```bash
git add grafica-app/backend/src/lib/ink-balance.ts grafica-app/backend/src/routes/stock.ts grafica-app/backend/src/routes/tinta-lotes.ts grafica-app/backend/src/lib/__tests__/ink-balance.test.ts
git commit -m "feat(stock): calculo de saldo de tinta por contagem de unidades NEW"
```

---

### Task 4: Desacoplamento dos Agentes HP Latex e Mimaki (BR-011 e BR-012)

**Files:**
- Modify: `grafica-app/backend/src/agents/hp-latex/stock-deductor.ts`
- Modify: `grafica-app/backend/src/routes/mimaki.ts`
- Test: `grafica-app/backend/src/agents/hp-latex/__tests__/stock-deductor.test.ts` (ou similar)
- Test: `grafica-app/backend/src/routes/__tests__/mimaki.test.ts`

**Step 1: Escrever teste falhando**
Verificar que ao processar um job HP ou Mimaki:
- A dedução de mídia continua funcionando exatamente como antes.
- Não há atualização em `stock_items.currentQuantity` para as tintas.
- Não há `stockTransactions` geradas para tintas.
- Registros são gravados na tabela `ink_consumption_log` com os ml consumidos calculados.

**Step 2: Refatorar `hp-latex/stock-deductor.ts`**
Remover o loop que debita `stockItems` e substitui-lo pela gravação direta em `ink_consumption_log`.

**Step 3: Refatorar `mimaki.ts`**
Remover o decremento de `garrafas.mlRemaining` e débito em `stockItems`, gravando os valores em `ink_consumption_log`.

**Step 4: Executar testes de regressão de dedução**
Garantir que os testes de mídia continuam 100% verdes e o novo log é persistido.

**Step 5: Commit**
```bash
git add grafica-app/backend/src/agents/hp-latex/stock-deductor.ts grafica-app/backend/src/routes/mimaki.ts
git commit -m "feat(agents): desacopla debito de tinta em HP e Mimaki para ink_consumption_log"
```

---

### Task 5: Quick Switch de Tinta na Máquina (`POST /api/machines/:id/active-tinta`)

**Files:**
- Modify: `grafica-app/backend/src/routes/machines.ts`
- Test: `grafica-app/backend/src/routes/__tests__/machines-tinta.test.ts`

**Step 1: Escrever teste falhando**
- Carregar lote novo: lote anterior daquele canal vai para `FINISHED` (`location = 'discarded'`).
- Novo lote vai para `IN_USE` (`location = 'machine:<id>'`).
- Evento `stock:updated` é emitido.

**Step 2: Implementar endpoint `POST /api/machines/:id/active-tinta`**
- Validação rápida via Zod (`channel`, `newLoteId`).
- Operação atômica em transação SQLite.

**Step 3: Testar e verificar aprovação**
Executar os testes de integração do endpoint.

**Step 4: Commit**
```bash
git add grafica-app/backend/src/routes/machines.ts
git commit -m "feat(machines): endpoint Quick Switch de lote de tinta por canal"
```

---

### Task 6: Endpoint e Relatório de Consumo Desacoplado

**Files:**
- Modify: `grafica-app/backend/src/routes/reports.ts`
- Modify: `grafica-app/src/lib/queries/reports.ts`
- Modify: `grafica-app/src/app/(dashboard)/relatorios/page.tsx`

**Step 1: Atualizar backend do relatório**
Em `/api/reports/consumption`, agregar a soma de `ml_consumed` de `ink_consumption_log` por máquina, canal e mês.

**Step 2: Atualizar frontend `/relatorios`**
Exibir card/tabela simplificada com totais consumidos por cor/canal no mês, com distinção clara de que é histórico operacional e não contagem de prateleira.

**Step 3: Commit**
```bash
git add grafica-app/backend/src/routes/reports.ts grafica-app/src/lib/queries/reports.ts grafica-app/src/app/(dashboard)/relatorios/page.tsx
git commit -m "feat(reports): relatorio de consumo de tinta baseado em ink_consumption_log"
```

---

### Task 7: Componente `StockDataTable` com TanStack Table

**Files:**
- Create: `grafica-app/src/components/stock/stock-data-table.tsx`
- Create: `grafica-app/src/components/stock/stock-table-columns.tsx`
- Create: `grafica-app/src/components/stock/stock-table-toolbar.tsx`
- Create: `grafica-app/src/components/stock/stock-table-pagination.tsx`

**Step 1: Definir definições de colunas com `@tanstack/react-table`**
- Checkbox de seleção.
- Produto (nome, código, largura).
- Lote Ativo (badge com ID curto + máquina ou "— nenhum carregado —").
- Em Espera (contagem de lotes `NEW`).
- Total.
- Status (badge ordenável com prioridade `OUT_OF_STOCK` > `LOW_STOCK` > `AVAILABLE`).
- Ações.

**Step 2: Implementar Toolbar inteligente**
- Busca em memória client-side por nome, código ou serial de lote.
- Filtro multifacetado: Categoria, Status, Máquina.
- Ação em lote: Botão de exportar seleção para CSV.
- Botão geral de exportar visualização completa para CSV.

**Step 3: Implementar agrupamento colapsável por categoria**
Seções com cabeçalho expansível/recolhível para Mídias, Tintas e Outros Insumos.

**Step 4: Commit**
```bash
git add grafica-app/src/components/stock/
git commit -m "feat(ui): componente StockDataTable com TanStack Table e filtros combinados"
```

---

### Task 8: Modal de Drill-Down Reorganizado em Seções

**Files:**
- Create / Modify: `grafica-app/src/components/stock/stock-item-lots-dialog.tsx`

**Step 1: Estruturar as 3 seções visuais**
- **Seção "Em Uso" (Topo, destaque):** Card de destaque com o lote ativo, máquina, canal, data de carregamento e botão para trocar/finalizar.
- **Seção "Em Espera" (Centro):** Lista normal de lotes na prateleira com identificador curto, data de cadastro e botão "Carregar na Máquina".
- **Seção "Baixados / Finalizados" (Rodapé, recolhido):** Accordion/collapsible com histórico de lotes já finalizados ou descartados.

**Step 2: Integrar com a API de `tinta_lotes` e `bobinas`**
Modal polimórfico inteligente que renderiza bobinas se `PAPER_MEDIA` ou lotes de tinta se `INK_SUPPLY`.

**Step 3: Commit**
```bash
git add grafica-app/src/components/stock/stock-item-lots-dialog.tsx
git commit -m "feat(ui): modal de drill-down com secoes Em Uso, Em Espera e Baixados"
```

---

### Task 9: Integração de `/estoque` e `/tintas` com Socket.IO

**Files:**
- Modify: `grafica-app/src/app/(dashboard)/estoque/page.tsx`
- Modify: `grafica-app/src/app/(dashboard)/tintas/page.tsx`
- Modify: `grafica-app/src/lib/queries/stock.ts`

**Step 1: Atualizar página `/estoque`**
Substituir a grade de cards pelo componente `StockDataTable` completo com agrupamento de categorias.

**Step 2: Atualizar página `/tintas`**
Substituir a grade de cards pelo `StockDataTable` pré-filtrado para a categoria `INK_SUPPLY`.

**Step 3: Ligar Socket.IO em tempo real**
Escutar `stock:updated` e invalidar a query `stockKeys.all` para atualizar a tabela na hora sem reload.

**Step 4: Commit**
```bash
git add grafica-app/src/app/(dashboard)/estoque/page.tsx grafica-app/src/app/(dashboard)/tintas/page.tsx grafica-app/src/lib/queries/stock.ts
git commit -m "feat(ui): integra pagina de estoque e tintas a tabela inteligente com Socket.IO"
```

---

### Task 10: Verificação Integrada Final e Validação de Build

**Files:**
- Todos os modificados

**Step 1: Rodar suíte de testes do backend**
Verificar aprovação de todos os testes unitários e de integração.

**Step 2: Rodar build do frontend Next.js**
`npm run build` no diretório `grafica-app` para certificar zero erros de tipagem TypeScript e empacotamento estático perfeito.

**Step 3: Checklist final de critérios de aceite**
- [ ] Tabela com lote ativo visível sem abrir modal.
- [ ] Modal de drill-down com 3 seções (Em uso / Em espera / Baixados).
- [ ] Estoque de tinta conta unidades inteiras `NEW`.
- [ ] Agentes HP e Mimaki não debitam ml/cc de estoque.
- [ ] Consumo gravado em `ink_consumption_log`.
- [ ] Quick Switch de tinta funcional e rápido.
- [ ] Alerta de estoque baixo de tinta por contagem de unidades.
- [ ] Dedução de mídia inalterada.
- [ ] TanStack Table com filtros combinados, busca, seleção, exportação CSV e Socket.IO.
- [ ] Governança P9/P11 atualizada (ADR-057 e RULE_CHANGELOG.md).

**Step 4: Commit final e PR preparation**
```bash
git status
```
Pronto para abertura de Pull Request para review antes do merge.
