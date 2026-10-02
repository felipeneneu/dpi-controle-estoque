# PLAN: Cartucho de Tinta como Ativo por Canal de Máquina (HP em ml + Konica em %)

## Contexto

A pergunta veio do operador, nos termos dele: a máquina tem **uma tinta por canal** (slot) e a tinta **troca de tempos em tempos**. Hoje o sistema trata tinta HP como um número agregado e não como um objeto físico. O que ele quer:

1. **Registrar qual cartucho está na máquina**, por canal. A identidade é o `name`/SKU interno (`hp_tinta-cyan`, `konica_toner-cyan`); para **tinta HP** o operador também digita o `stock_items.code` (part number `CZ683A`). Para **toner Konica não existe código** — é monitorado, não cadastrado.
2. **Toda troca dá baixa integral do que sobrou**, e só na troca: `state = USED`, `location = discarded`, e **uma única** linha `OUT` no ledger pelo `levelCurrent` restante. *"Saiu da máquina é lixo"* — sem devolução ao estoque, sem troca sem baixa.
3. **O nível do cartucho carregado vem da telemetria da máquina**, para bater com a realidade. HP Latex 330: 7 canais (`C`, `LC`, `M`, `LM`, `Y`, `K`, `OP`) com 775 ml de capacidade. Konica AccurioPrint: 4 canais CMYK em `%`.
4. **Consumo manual pelo código da tinta HP** em `/tintas`: quando acabar, o operador troca e cadastra no estoque "peguei a tinta do código tal".
5. **Aviso de compra** quando o cartucho carregado chega a 15% **e não há nenhum cartucho do mesmo item em depósito**. Havendo estoque em depósito, o sistema **não faz nada**. Mesma regra para HP e Konica.
6. **Histórico de consumo por job** (quando caiu, quanto caiu, qual job) como dado de auditoria.

Estado atual (verificado):

- `stock_items.currentQuantity` é a coluna agregada que hoje ganha o débito por job (`agents/hp-latex/stock-deductor.ts:130-176`, BR-011). Não existe no schema nenhum ativo "cartucho".
- O caminho `garrafas` (ML, Mimaki) já é o padrão de ativo: `stockItemId`, `serial`, `mlInitial/mlRemaining`, `state`, `location` (`schema.ts:63-79`) + rotas em `stock.ts:566-745` + `POST /api/machines/:id/active-garrafa` (`machines.ts:385-455`). **Nenhuma dessas rotas escreve no ledger.**
- `GET /api/stock-items` hoje tem **saldo derivado** que colide: `INK_SUPPLY` soma `garrafas.mlRemaining` se houver garrafas, senão cai na coluna agregada (`stock.ts:128-133`). Com cartuchos entra uma terceira origem de saldo.
- `stock_items.code` existe (`schema.ts:35`), mas é nullable e **sem índice unique**; `scripts/seed-hp-inks.ts:41-51` insere direto na tabela, sem `code` e sem criar ativo nenhum (só um `currentQuantity = 775*2` sintético).
- `machine_telemetry` tem colunas planas por canal (`inkCyanMl`..`inkOptimizerMl` + `inkCapacityMl`; `tonerCyanPct`..`tonerBlackPct`) e é append-only (`schema.ts:169-209`).
- A capacidade HP está **hard-coded** em `agents/hp-latex/telemetry.ts:119,124` (`capacityMl: 775`).
- Konica **não expõe toner por job**: `TONER_EXPOSED = false` (`agents/konica/stock-deductor.ts:52`) e o nível é estimado por contador de páginas. Isso limita o histórico por job em toner — ver Riscos.
- Detecção de drift já existente: `machineResponseSchema` (`machines.ts:23-39`) devolve só `itemIds`, mas o front já consome `activeBobina` (`maquinas/page.tsx:596`, `components/mimaki-info-panel.tsx:81`). E `Garrafa.state` no front (`lib/api.ts:158`) tipa 3 estados, o schema permite 5.
- Cobertura de teste de integração HP/Konica é **zero** (`docs/engineering/TESTING_STRATEGY.md:65-68`).
- Zero impacto em C#/imposição (grep em `packages/**/*.cs` só devolve falso-positivo). Feature é TypeScript + DB.

## Decisão — ADR-052 + Emenda 4 ao ADR-009

### 1. Novo ADR-052 (obrigatório: é mudança de contrato)

Criar `docs/governance/adr/ADR-052-cartucho-como-ativo.md` (próximo número livre; ADR-050 é o maior indexado em `docs/governance/ADR_INDEX.md:46`) cobrindo:

- **Colisão de numeração já ocupada**: existe `docs/governance/adr/ADR-051-seam-guide-contract.md` (linha-guia de emenda, módulo Seams, **não indexado** no `ADR_INDEX.md`, datado 2026-10-02) que já reserva **ADR-051 e BR-053**. Por isso este feature é **ADR-052** e a regra nova é **BR-052** (livre — ADR-049 usa BR-050, ADR-050 usa BR-051, o ADR-051 órfão usa BR-053). **Confirmar com o dono do branch `feat/seams-rolls`** antes da Task 0: se o ADR-051 de seams for descartado ou renumerado, reavaliar.

- **Modelo genérico de consumível carregado por canal**: tabela `cartuchos`, com unidade declarada por linha (`ml` para HP, `pct` para Konica). Um cartucho é um ativo individual rastreável, no mesmo espírito de BR-002 (`bobinas`) e da Emenda 3 do ADR-009 (`garrafas`).
- **Fonte de verdade do nível**: o cartucho `IN_USE` do canal. O débito agregado por job (BR-011, `stock-deductor.ts`) é **desativado** para HP e Konica enquanto houver cartucho carregado. Não podem existir dois saldos concorrentes.
- **Troca = baixa integral, sempre**: cartucho substituído vai para `USED` + `discarded` + uma única linha `OUT` pelo restante. **Decisão do operador: "saiu da máquina é lixo"** — sem caminho de devolução ao estoque, sem troca sem baixa. Reintroduzir qualquer uma das duas é mudança de contrato -> novo ADR.
- **Supersede a Emenda 1 do ADR-009** (`:84-89`, "cartuchos não são ativos físicos, saldo agregado guiado por telemetria") **apenas para HP e Konica**. `garrafas` (Mimaki) e a Emenda 3 ficam **intactas**; `mimaki.ts:174-283` não é tocado.
- **Saldo derivado** para item com cartucho: `SUM(levelCurrent)` de cartuchos em `NEW` ou `IN_USE` (mesma fórmula de `stock.ts:126` para bobinas). `stock_items.currentQuantity` fica como **fallback** para item sem nenhum cartucho.
- **Sem linha `OUT` no carregamento.** O cartucho nasce `NEW` (já conta no saldo) e vira `IN_USE` (continua contando). Consequência: o saldo não muda ao carregar e, por construção, **não existe dupla baixa possível** — o único `OUT` de um cartucho é o descarte na troca (ou a retirada manual do depósito). Ver "Detalhes > Semântica do ledger".
- **BR-005 fica PARCIAL para tinta com cartucho**: o ledger registra entrada (`IN`), descarte (`OUT`) e ajuste (`ADJUSTMENT`); o consumo fino vive em `cartucho_consumo` e no próprio ativo. A transação de troca valida `SUM(cartucho_consumo.delta) + leftover` contra `levelInitial` e **emite aviso** (não bloqueia) se a conta não fechar.
- **Extensão do vocabulário de etiqueta**: `CTN:<id>` ao lado de `BOB:` e `TNK:` (ADR-014).
- Rulings esperados: **2** (semântica do ledger; identidade/código). Se passar de 5, o planejamento falhou.

### 2. Emenda 4 ao ADR-009

Adicionar ao final de `docs/governance/adr/ADR-009- bobina como ativo.md` a seção `## Emenda 4: Cartucho como ativo por canal (HP/Konica)`, declarando a supersessão **parcial** da Emenda 1 para tintas de máquina com canal, e o porquê (telemetria passa a reconciliar um ativo, não um agregado).

### 3. BR-011 emendada + regra nova

- **BR-011 (edição exata)**: hoje "**HP Latex 330**: mídia `m = m^2 / largura`; tinta em `ml` por SKU via `INK_COLOR_MAP`" (`BUSINESS_RULES.md:33`). Manter a cláusula de mídia. Substituir a cláusula de tinta por: "**tinta**: o cartucho carregado do canal é a fonte de verdade do nível; o agente **não** escreve em `stock_items.currentQuantity` quando existe cartucho `IN_USE` no canal — o nível é reconciliado pela telemetria e a baixa acontece na troca." Status: IMPLEMENTED -> **IMPLEMENTED (reformulado)**, referência ADR-052.
- **BR-013 (Konica)**: inalterada — "toner não é debitado por job" continua verdadeiro. O que muda é que agora há **ativo** e **aviso de reposição**, não débito por job. Deixar explícito no ADR-052 que BR-013 não conflita.
- **Nova regra BR-052** — `inventory/deduction`: "Cartucho carregado é ativo rastreável por canal; saldo derivado `SUM(levelCurrent)`; telemetria reconcilia o ativo; a troca dá baixa integral do restante com uma única linha `OUT`; consumo fino em `cartucho_consumo`."
- **Nova regra BR-054** — `inventory/replenishment`: "Aviso de compra de consumível de canal dispara quando o cartucho carregado chega a 15% da capacidade **e** não existe nenhum cartucho do mesmo item em depósito. Havendo estoque em depósito, não há aviso. Limiar por percentual do cartucho, não por `minQuantity` do item. Vale para HP e Konica."
  - Por que BR-054 e não BR-053: o **BR-053 já está reservado** pelo ADR-051 de seams (`ADR-051-seam-guide-contract.md`, não indexado, datado 2026-10-02).
  - Cuidado de numeração: `BUSINESS_RULES.md` para em **BR-024** (o cabeçalho diz `BR-001..BR-021`), mas ADR-049/ADR-050 já referenciam **BR-050** e **BR-051**, que não existem no arquivo. **Mencionar o gap, não corrigir.**
  - Atualizar o cabeçalho `(BR-001..BR-021)` para a faixa real e acrescentar entrada em `docs/business/RULE_CHANGELOG.md`.
- **BR-013 (Konica)**: inalterada — "toner não é debitado por job" continua verdadeiro. O que muda é que agora há **ativo** e **aviso de reposição**, não débito por job. Deixar explícito no ADR-052 que BR-013 não conflita.
- `docs/business/GLOSSARY.md:10,46`: a hoje "telemetria não debita estoque" precisa de nuance — telemetria **não debita o agregado**, mas **reconcilia o nível do ativo** e registra consumo. Corrigir o texto.

### 4. `ADR_INDEX.md` — append-only (R-009)

`docs/governance/ADR_INDEX.md` tem histórico de mojibake. **Não** reescrever o arquivo inteiro (read-modify-write). Inserir **apenas a linha nova** do ADR-052 e nada mais; se precisar de restore, `git checkout -- docs/governance/ADR_INDEX.md` e reinserir sem tocar nos bytes existentes. **Mesma regra para `BUSINESS_RULES.md`, `RULE_CHANGELOG.md` e `GLOSSARY.md`** — todos tem mojibake no histórico: edição por inserção pontual / seção nova ao final, nunca reescrita integral.

### 5. Ledger SDD

Criar `.sdd/cartucho-tinta-maquina/progress.md` a partir de `.agents/skills/subagent-driven-development/ledger-template.md` (statuses válidos: `pendente | em_andamento | revisão | concluída | bloqueada`). `.sdd/` é gitignored: o ledger é local, não versionado.

## Arquivos Envolvidos

| Arquivo | Ação |
|---------|------|
| `docs/governance/adr/ADR-052-cartucho-como-ativo.md` | Criar |
| `docs/governance/adr/ADR-009- bobina como ativo.md` | Modificar — Emenda 4 (append ao final) |
| `docs/governance/ADR_INDEX.md` | Modificar — 1 linha, append-only (R-009) |
| `docs/business/BUSINESS_RULES.md` | Modificar — BR-011 emendada + BR-052 + BR-054 + cabeçalho |
| `docs/business/RULE_CHANGELOG.md` | Modificar — entrada da feature (append) |
| `docs/business/GLOSSARY.md` | Modificar — nuance telemetria/ativo |
| `docs/architecture/LAYERS.md` | Modificar — gap table (`:70`, `:95`) |
| `.sdd/cartucho-tinta-maquina/progress.md` | Criar (gitignored) |
| `grafica-app/backend/src/db/schema.ts` | Modificar — `cartuchos`, `cartuchoConsumo`, `source`/`source_ref` em `stockTransactions`, unique index em `stockItems.code` |
| `grafica-app/backend/drizzle/0012_cartuchos.sql` + `drizzle/meta/_journal.json` | Criar/Modificar — migration + journal (padrão de repair manual: `0005`, `0008`, `0009`) |
| `grafica-app/backend/src/lib/ink-units.ts` | Criar — formatação/parse de nível por unidade (`ml`/`pct`) |
| `grafica-app/backend/src/routes/stock.ts` | Modificar — `:123-140` saldo derivado, `:313-338` cascata, `source`/`source_ref` em `:778-848` |
| `grafica-app/backend/src/routes/machines.ts` | Modificar — `:23-39` popular `activeBobina`/`activeGarrafa`/`activeCartuchos`, `POST /api/machines/:id/active-cartucho`, `POST .../cartuchos/:id/consumo`, `GET .../cartuchos/consumo` |
| `grafica-app/backend/src/agents/hp-latex/telemetry.ts` | Modificar — `:33-41` capacidades por SKU, `:108-128` ler capacidade da página (fallback 775) |
| `grafica-app/backend/src/agents/hp-latex/constants.ts` | Criar — `INK_COLORS` com partNumber/canal/capacidade + `DEFAULT_INK_CAPACITY_ML` |
| `grafica-app/backend/src/agents/hp-latex/telemetry-store.ts` | Modificar — `:59-81` sync dos cartuchos carregados + guarda de divergência |
| `grafica-app/backend/src/agents/hp-latex/ink-cartridge-sync.ts` | Criar — mapa `C/LC/M/LM/Y/K/OP` -> canal -> cartucho |
| `grafica-app/backend/src/agents/hp-latex/stock-deductor.ts` | Modificar — `:36-44`, `:130-176` para o modelo de cartucho |
| `grafica-app/backend/src/agents/konica/device-info.ts` | Modificar — `:209-216` `tonerByColor` exposto para o sync |
| `grafica-app/backend/src/agents/konica/telemetry-store.ts` | Modificar — sync `%` C/M/Y/K |
| `grafica-app/backend/src/agents/konica/ink-cartridge-sync.ts` | Criar — sync em `%` |
| `grafica-app/backend/src/agents/konica/stock-deductor.ts` | Modificar — `:36-41`, `:52`, `:210-213` para cartucho, com `estimated` no histórico |
| `grafica-app/backend/src/agents/brain/index.ts` | Modificar — **remover** `checkLowToner` (`:108-141`), **reescrever** `checkLowStock` (`:41-60`) com `saldoDerivado()`, criar `checkReposicaoCartuchos` (seção 17) e trocar na lista do `tick` (`:149-154`) |
| `grafica-app/backend/src/lib/ink-balance.ts` | Criar — `saldoDerivado(itemId)` compartilhado pela rota, pelo brain e pelo gate de estoque (retorna `number \| null`) |
| `grafica-app/backend/scripts/seed-hp-inks.ts` | Modificar — `code` real + criar cartuchos (hoje insere agregado, `:41-51`) |
| `grafica-app/backend/scripts/seed-ink-cartridges.ts` | Criar — HP 7 + Konica 4, cartuchos em estoque |
| `grafica-app/backend/tests/helpers/app.ts` | Modificar — `resetDb()` (`:16-27`) inclui `cartuchos` e `cartucho_consumo` |
| `grafica-app/backend/tests/agents/hp-latex/stock-deductor.characterization.test.ts` | Criar — **antes** do refactor |
| `grafica-app/backend/tests/agents/konica/stock-deductor.characterization.test.ts` | Criar — **antes** do refactor |
| `grafica-app/backend/tests/agents/hp-latex/ink-cartridge-sync.test.ts` | Criar — sync por canal, divergência, capacidade |
| `grafica-app/backend/tests/agents/konica/ink-cartridge-sync.test.ts` | Criar — sync em % |
| `grafica-app/backend/tests/routes/cartuchos.test.ts` | Criar — carga, troca (1 `OUT`), idempotência, canal duplicado |
| `grafica-app/backend/tests/routes/stock-ink-balance.test.ts` | Criar — saldo derivado e não-regressão das garrafas |
| `grafica-app/backend/tests/agents/brain-reposicao.test.ts` | Criar — limiar 15%, **gate de estoque**, cooldown, chave por cartucho, `checkLowStock` com agregado obsoleto |
| `grafica-app/src/lib/api.ts` | Modificar — tipos `Cartucho`, `CartuchoConsumo`, `Machine.activeBobina/activeGarrafa/activeCartuchos`, alargar `Garrafa.state` (`:158`) |
| `grafica-app/src/lib/queries/query-keys.ts` | Modificar — `stockKeys.cartuchos/cartuchoHistory`, `machineKeys.cartuchos` |
| `grafica-app/src/lib/queries/stock.ts` | Modificar — `useCartuchos`, `useChangeCartucho`, `useCartuchoConsumoManual`, `useCartuchoConsumoHistory` |
| `grafica-app/src/lib/queries/machines.ts` | Modificar — `useMachineCartuchos`, `useActiveCartuchos` (poll 30s) |
| `grafica-app/src/components/cartuchos-panel.tsx` | Criar — clonar `mimaki-info-panel.tsx:95-113` |
| `grafica-app/src/components/change-cartucho-dialog.tsx` | Criar — clonar `change-garrafa-dialog.tsx` |
| `grafica-app/src/components/cartucho-consumo-dialog.tsx` | Criar — entrada manual por código (só itens com `code`) |
| `grafica-app/src/components/cartucho-consumo-history.tsx` | Criar — tabela de histórico |
| `grafica-app/src/app/(dashboard)/maquinas/page.tsx` | Modificar — tab `tintas` em `:556-590`, router `:48-61`, F2 `:498-507` |
| `grafica-app/src/app/(dashboard)/tintas/page.tsx` | Modificar — acao de consumo manual + saldo por cartucho |
| `grafica-app/src/components/label-imposition-dialog.tsx` | Modificar — branch `CTN:` em `:129-151` |
| `e2e/specs/tintas-cartuchos.spec.ts` | Criar |

## Task Breakdown

| # | Task | Agente | Depends on |
|---|------|--------|-------------|
| 0 | Ledger `.sdd/` + ADR-052 + Emenda 4 ADR-009 + BR-011/BR-052 + ADR_INDEX append | documentation-writer | — |
| 1 | Testes de caracterização do `stock-deductor` HP + Konica (comportamento **atual**) | test-engineer | 0 |
| 2 | Schema: `cartuchos`, `cartucho_consumo`, `source`/`source_ref`, unique em `stock_items.code` | database-architect | 0 |
| 3 | Migration `0012` + journal + `resetDb()` no harness de teste | database-architect | 2 |
| 4 | `lib/ink-units.ts` (formatação/parse por unidade) | backend-specialist | 2 |
| 5 | Rotas de cartucho em `machines.ts` (carga, troca, consumo manual, histórico) | backend-specialist | 3, 4 |
| 6 | Saldo derivado em `stock.ts:123-140` + cascata de delete `:313-338` | backend-specialist | 3 |
| 7 | Sync HP: capacidade da página + guarda de divergência | backend-specialist | 5 |
| 8 | Sync Konica em `%` C/M/Y/K + limitação de histórico | backend-specialist | 5 |
| 9 | Refactor `hp-latex/stock-deductor.ts` (sai do agregado, cartucho por canal) | backend-specialist | 1, 6, 7 |
| 10 | Refactor `konica/stock-deductor.ts` (estimado, sem agregado) | backend-specialist | 1, 6, 8 |
| 11 | Seed: `code` real HP (CZ###A), cartuchos HP + Konica (toner **sem** `code`) | database-architect | 3 |
| 12 | `agents/brain`: substitui `checkLowStock`/`checkLowToner` por `checkReposicaoCartuchos` | backend-specialist | 6, 8 |
| 13 | Testes de rota: `cartuchos.test.ts` + `stock-ink-balance.test.ts` + `brain-reposicao.test.ts` | test-engineer | 5, 6, 9, 10, 12 |
| 14 | `lib/api.ts` (tipos) + correção de drift `activeBobina`/`Garrafa.state` | frontend-specialist | 5 |
| 15 | Query keys + hooks (`stock.ts`, `machines.ts`) | frontend-specialist | 14 |
| 16 | `cartuchos-panel.tsx` + `change-cartucho-dialog.tsx` | frontend-specialist | 15 |
| 17 | `cartucho-consumo-dialog.tsx` + `cartucho-consumo-history.tsx` | frontend-specialist | 15 |
| 18 | Wire em `maquinas/page.tsx` (tab `tintas`, router, F2) | frontend-specialist | 16, 17 |
| 19 | `/tintas`: consumo manual por código (só HP) + saldo por cartucho | frontend-specialist | 16, 17 |
| 20 | `label-imposition-dialog.tsx`: branch `CTN:` | frontend-specialist | 15 |
| 21 | E2E `tintas-cartuchos.spec.ts` + lint + `tsc` + suite verde | test-engineer | 18, 19, 20 |
| 22 | Fechamento de docs (LAYERS/GLOSSARY/RULE_CHANGELOG) + revisão de contrato do ADR-052 | documentation-writer | 21 |

Fases: **0** governança bloqueia tudo -> **2,3** persistência -> **4,5,6** backend -> **7,8** telemetria -> **9,10** deductor (depende da caracterização, Task 1) -> **12** alertas -> **14-20** front -> **21,22** verificação e docs.

## Detalhes de Implementação

### 1. Tabela `cartuchos` (genérica HP ml + Konica %)

```ts
export const cartuchos = sqliteTable('cartuchos', {
  id: text('id').primaryKey(),
  stockItemId: text('stock_item_id').notNull().references(() => stockItems.id, { onDelete: 'cascade' }),
  serial: text('serial'),                              // rótulo físico: CTN-0001
  machineId: text('machine_id').references(() => machines.id, { onDelete: 'set null' }),
  channel: text('channel').notNull(),                  // HP: C|LC|M|LM|Y|K|OP | Konica: C|M|Y|K
  unit: text('unit', { enum: ['ml', 'pct'] }).notNull(),
  levelInitial: real('level_initial').notNull(),
  levelCurrent: real('level_current').notNull(),       // sempre na unidade de `unit`
  levelCapacity: real('level_capacity'),               // 775 (HP) | 100 (Konica)
  state: text('state', { enum: ['NEW', 'IN_USE', 'USED', 'BLOCKED', 'SCRAPPED'] }).notNull().default('NEW'),
  location: text('location').notNull().default('depósito'),  // depósito | machine:<id> | discarded
  telemetrySku: text('telemetry_sku'),                 // SKU que a máquina reportou (detecta divergência)
  telemetrySource: text('telemetry_source'),           // 'hp-ews' | 'konica-copier' | null
  lastTelemetryAt: integer('last_telemetry_at', { mode: 'timestamp' }),
  installedAt: integer('installed_at', { mode: 'timestamp' }),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (t) => [
  index('cartuchos_stock_item_idx').on(t.stockItemId),
  index('cartuchos_state_idx').on(t.state),
  index('cartuchos_machine_channel_idx').on(t.machineId, t.channel),
]);
```

**Uniformidade sem bagunça de unidade.** `unit` é declarada **por cartucho** e nunca muda. Não existe coluna `mlRemaining` em `cartuchos`: ela seria específica de HP e quebraria a genericidade. O espelho conceitual é HP -> ml (775 = 100%), Konica -> pct (100 = 100%). Conversão ml<->% exige densidade e **não será feita**: um item em `%` é `%` para sempre. `real`/`double` em tudo (BR-004 continua valendo para unidade de papel; aqui não há conversão). Formatação para UI em `lib/ink-units.ts`:

```
formatLevel(value, unit)      // 775 -> "775 ml" | 62.5 -> "62 %"
parseLevel(input, unit)       // "500ml" -> 500 | "62%" -> 62 ; Number ou null
levelPct(current, capacity)   // fração 0..1 para a barra de progresso
```

Consumível **não carregado** continua no `stock_items` agregado (folhas, solventes, química) — `cartuchos` cobre apenas canal de máquina.

### 2. Tabela `cartucho_consumo` (histórico fino)

```ts
export const cartuchoConsumo = sqliteTable('cartucho_consumo', {
  id: text('id').primaryKey(),
  cartuchoId: text('cartucho_id').notNull().references(() => cartuchos.id, { onDelete: 'cascade' }),
  machineId: text('machine_id'),
  channel: text('channel').notNull(),
  delta: real('delta').notNull(),                     // positivo = consumo
  levelBefore: real('level_before').notNull(),
  levelAfter: real('level_after').notNull(),
  unit: text('unit', { enum: ['ml', 'pct'] }).notNull(),
  source: text('source', { enum: ['telemetry', 'job', 'manual', 'sync'] }).notNull(),
  jobId: text('job_id'),
  jobName: text('job_name'),
  attribution: text('attribution', { enum: ['exact', 'estimated'] }).default('exact'),
  telemetrySnapshotId: text('telemetry_snapshot_id'),
  stockTransactionId: text('stock_transaction_id'),
  userId: text('user_id'),
  userName: text('user_name'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (t) => [
  index('cartucho_consumo_cartucho_created_idx').on(t.cartuchoId, t.createdAt),
  index('cartucho_consumo_machine_channel_idx').on(t.machineId, t.channel),
]);
```

Por que tabela nova e não o ledger: `stock_transactions.quantity` é **movimentação de estoque**, não queda de nível — um poll de 60 s não pode virar linha de ledger a cada minuto. E `machine_telemetry` não sabe qual job rodou. Alternativas rejeitadas: (a) derivar do ledger perde "quando caiu" e a autoria da telemetria; (b) derivar de `machine_telemetry` não permite junção com job.

### 3. Regra de unicidade: no máximo 1 `IN_USE` por `(machineId, channel)`

```
CREATE UNIQUE INDEX cartuchos_in_use_channel_uq
  ON cartuchos(machine_id, channel) WHERE state = 'IN_USE';
```

- Turso/libSQL é SQLite, então **índice parcial é suportado**. Mas `drizzle-kit generate` pode não emitir o `WHERE state = 'IN_USE'` (índice condicional). O padrão do repo já é escrever migration a mão (`0005_repair_machine_telemetry.sql`, `0008_add_stock_audit_fields.sql`, `0009_add_mimaki_jobs.sql`) — então **SQL a mão é o caminho normal**, não um contorno.
- **Defense in depth na rota** (o índice sozinho não protege contra corrida entre processos): dentro de `db.transaction`, `UPDATE cartuchos SET state='USED' ... WHERE machine_id=? AND channel=? AND state='IN_USE'` e depois `UPDATE ... SET state='IN_USE', location='machine:<id>', machine_id=? WHERE id=?`. O primeiro `UPDATE` tira o antigo do conjunto coberto pelo índice parcial, então o segundo nunca colide.
- **Fallback** (se algum ambiente recusar o índice parcial no push): trigger `BEFORE UPDATE ... WHEN NEW.state='IN_USE'` com `RAISE(ABORT)` quando já existir outro `IN_USE` no mesmo `(machine_id, channel)`. Terceira opção — aceitar duplicidade com alerta — **não recomendada**.

### 4. Semântica do ledger (a decisão que garante "nenhuma dupla baixa")

Vida de um cartucho, no máximo 3 eventos de ledger:

| Evento | Ledger | Saldo derivado | Estado |
|---|---|---|---|
| Cadastro/recebimento em estoque | `IN` de `levelInitial` | +`levelInitial` | `NEW`, `depósito` |
| **Carregamento** na máquina | **nenhum** | **inalterado** (`NEW` -> `IN_USE`, ambos contam) | `IN_USE`, `machine:<id>` |
| Consumo (telemetria/job) | **nenhum** (fica em `cartucho_consumo` + no ativo) | cai junto com `levelCurrent` | `IN_USE` |
| **Troca / descarte** | **um** `OUT` do `levelCurrent` restante | cai junto com a saída do estado | `USED`, `discarded` |
| Ajuste manual de nível | `ADJUSTMENT` (ADMIN+) | — | — |

**Por que não há `OUT` no carregamento.** Se o `OUT` do restante fosse somado a um `OUT` da capacidade no carregamento, o mesmo mililitro seria contado duas vezes. Alternativa rejeitada: "descontar do agregado no carregamento e contar só `NEW` no saldo" — obriga a rota de carga a conhecer o valor exato carregado e inverte o pedido do operador (que quer a baixa **na troca**). O modelo derivado (BR-002, idêntico a `bobinas` em `stock.ts:126`) mantém a operação exatamente como ele descreveu: "toda vez que o operador trocar, ele já da baixa".

**Consequência assumida:** o ledger de tinta com cartucho não reconcilia 1:1 com o saldo (BR-005 vira PARCIAL para essa classe), porque o consumo fino não passa pelo ledger. Mitigação obrigatória: na transação de troca, comparar `SUM(cartucho_consumo.delta) + levelCurrent` com `levelInitial` e **avisar** (notificação, sem bloquear) se a conta não fechar. Não esconder a divergência.

### 5. Colisão do saldo derivado (`stock.ts:123-140`)

Hoje:

```ts
} else if (r.category === 'INK_SUPPLY') {
  const itemGarrafas = allGarrafas.filter(g => g.stockItemId === r.id && (g.state === 'NEW' || g.state === 'IN_USE'));
  if (itemGarrafas.length > 0) finalQuantity = itemGarrafas.reduce((acc, g) => acc + (g.mlRemaining || 0), 0);
  // senão: fica r.currentQuantity
}
```

Novo (ordem de precedência explícita e **por `stockItemId`**, nunca por categoria):

```
1. tem cartuchos (NEW|IN_USE) -> soma levelCurrent   [HP/Konica]
2. tem garrafas  (NEW|IN_USE) -> soma mlRemaining    [Mimaki, intocado]
3. senão                         -> currentQuantity   [legado / itens sem ativo]
```

Justificativa da ordem: a precedência por `stockItemId` evita que um item de tinta HP que por engano tenha uma garrafa (criada pela rota `POST /api/stock-items` `:217-238`) passe a ser medido em garrafas. Um item não pode ter as duas famílias em produção; o seed garante isso. Como as três famílias já são carregadas em lote no mesmo handler (`allBobinas`/`allGarrafas`), o custo é o mesmo. `DELETE /api/stock-items/:id` (`:313-338`) ganha `cartuchos` e `cartucho_consumo` na lista de cascata.

**Extração obrigatória para reuso.** O cálculo "soma do saldo derivado de um `stockItemId`" não pode existir em dois lugares. Extrair para `lib/ink-balance.ts`:

```
saldoDerivado(itemId, { cartuchos, garrafas }) -> number | null
  1. cartuchos NEW|IN_USE do item  -> soma levelCurrent  (retorna number)
  2. garrafas  NEW|IN_USE do item  -> soma mlRemaining   (retorna number)
  3. senão                          -> null  (caller decide: cai em currentQuantity)
```

Retornar `null` e não `0` é o que permite distinguir "item sem ativo" de "item zerado" — sem isso o gate de estoque da seção 17 trataria folha e solventes como toner esgotado. Consumidores: `stock.ts:123-140` (route), `checkReposicaoCartuchos` (seção 17), `checkLowStock` reescrito.

### 6. `POST /api/machines/:id/active-cartucho`

```
POST /api/machines/:id/active-cartucho
body: { channel: string, cartridgeId?: string, code?: string, serial?: string, levelToLoad?: number }
auth: OPERATOR+ (BR-018); ajuste de nível = ADMIN+
```

Fluxo, **tudo dentro de `db.transaction`**:

1. `assertChannel(machine.brand, channel)` — HP aceita `C,LC,M,LM,Y,K,OP`; Konica aceita `C,M,Y,K`. Fora da lista: 400 PT-BR `"Canal inválido para a marca HP: 'X'. Aceitos: C, LC, M, LM, Y, K, OP"`.
2. Resolver o cartucho por `cartridgeId` **ou** `code` (exato, case-insensitive, trim) **ou** `serial` — mesma precedência de `machines.ts:363-365`. Sem achado: 404 com a lista de cartuchos disponíveis do canal (o operador vê o que há em depósito).
3. Rejeitar `state = USED | SCRAPPED` (mesma guard de `machines.ts:371-373`).
4. **Fechar o cartucho antigo do canal** (`machine_id = id AND channel = channel AND state = 'IN_USE'`), se houver:
   - `UPDATE cartuchos SET state='USED', location='discarded', finished_at=now WHERE id=?`
   - `INSERT stock_transactions (type='OUT', quantity=levelCurrent, reason='Troca de cartucho no canal X da máquina Y', user_id, user_name, source='SWAP', source_ref='swap:<oldCartuchoId>:<newCartuchoId>')` — **uma linha só**, pelo restante (`levelCurrent`), como decidido. `userId/userName` vem do JWT.
   - `INSERT cartucho_consumo` para fechar a conciliação: `delta = levelInitial - levelCurrent`, `source='sync'`, `attribution='estimated'`, junto do aviso de conferência.
5. **Abrir o novo**: `UPDATE cartuchos SET state='IN_USE', location='machine:<id>', machine_id=?, installed_at=now WHERE id=?`.
   - **Sem `OUT` aqui** (seção 4). Se `levelToLoad` vier preenchido e for menor que `levelCurrent` (carga parcial), a diferença vira `INSERT cartucho_consumo (source='manual', attribution='exact')` — e **não** um `OUT`.
6. Releitura final dos dois cartuchos para a resposta.
7. `socket.emit('machine:cartuchos', { machineId })` na room `estoque` (padrão de `stock.ts:845`), invalidando `useMachineCartuchos` e `useStockItems`.

### 7. Dívida de idempotência/atomicidade do ledger (ADR-007 / ADR-008 ainda *Proposto*)

Duas colunas novas em `stock_transactions`:

```ts
source:    text('source'),     // 'IN'|'OUT'|'ADJUSTMENT'|'JOB'|'SWAP'|'TELEMETRY'|'MANUAL'
sourceRef: text('source_ref'), // 'swap:<oldId>:<newId>' | '<jobId>#<channel>' | 'manual:<uuid>'
```

+ `CREATE UNIQUE INDEX stock_transactions_source_ref_uq ON stock_transactions(item_id, source, source_ref) WHERE source_ref IS NOT NULL;`

- Isso é **o subconjunto escopado do ADR-007**. Recomendação: **promover o ADR-007 para "Aprovado (escopo parcial: JOB/SWAP/MANUAL/TELEMETRY)"** em vez de aprovar o ADR inteiro — o `balance_before/after` do ADR-008 **continua Proposto** e fora de escopo.
- `WHERE source_ref IS NOT NULL` é obrigatório: escritas legadas (Mimaki, `add-roll`) ficam sem `source_ref` e não colidem.
- **Atomicidade**: as rotas novas (`active-cartucho`, consumo manual, sync de telemetria) usam `db.transaction`. `stock.ts:778-848` (`SELECT -> compute -> UPDATE -> INSERT`, sem transaction) fica como está — mexer nisso é escopo do ADR-008, não desta feature. Anotar como dívida conhecida.
- Não mexer no `reason LIKE '%jobName%'` do Mimaki (`mimaki.ts:64-73`) nem em mais nada do legado além do que o refactor exigir.

### 8. Sync HP (`agents/hp-latex/`)

**8.1 Capacidade** (`telemetry.ts:108-128`, hoje `capacityMl: 775` hard-coded em `:119,124`). Ordem de preferência, em `fetchSupplies`:

1. Valor de capacidade presente na própria página de supplies (mesma janela de `indexOf(sku)`; o regex `/(\d+(?:[.,]\d+)?)\s*ml/i` já existente serve para a leitura de restante, e uma segunda captura pega o "775 ml / 775 mL nominal");
2. `DEFAULT_INK_CAPACITY_ML = 775` como constante nomeada — hoje mágico em dois lugares. Movida para `agents/hp-latex/constants.ts` junto do `INK_COLORS` (`:33-41`), que passa a carregar `{ sku, partNumber, channel, color, capacityMl }` (`CZ683A`=C, `CZ686A`=LC, `CZ684A`=M, `CZ687A`=LM, `CZ685A`=Y, `CZ682A`=K, `CZ706A`=OP).
3. Se a página trouxer capacidade e ela diferir de `cartuchos.levelCapacity` em mais de 5%, **não sobrescrever**: alerta. `levelCapacity` vem do cadastro do cartucho (775), não da telemetria.

**8.2 `ink-cartridge-sync.ts` (novo)**

```
sincronizarCartuchosHp(machineId, inks: InkCartridge[], snapshotId)
  // inks vem de fetchSupplies; mapTelemetry (telemetry-store.ts:30-57) já achata por cor
  for cada canal em INK_COLORS:
    cartucho = cartuchos IN_USE (machineId, canal)
    incoming = inks.find(i => canalDoSku(i.sku) === canal)
    se !cartucho:  se incoming -> alerta "canal X sem cartucho definido"; continue
    se !incoming:  continue                       // canal ausente na página = não mexer
    se cartucho.telemetrySku && cartucho.telemetrySku !== incoming.sku:
        alerta de divergência; não sobrescrever; continue     // <- guarda de divergência
    antes = cartucho.levelCurrent
    depois = Math.min(incoming.remainingMl, cartucho.levelCapacity ?? incoming.capacityMl)
    se depois > antes:   // subiu (recarga de fábrica / reposição do otimizador)
        registrar como 'sync' (não como consumo); nunca gerar delta negativo silencioso
    se antes - depois > 0:
        UPDATE cartuchos SET level_current=depois, telemetry_sku, telemetry_source='hp-ews', last_telemetry_at=now
        INSERT cartucho_consumo (delta, levelBefore, levelAfter, source='telemetry',
                                 telemetrySnapshotId, attribution=atribuicaoDaJanela(...))
```

A guarda de divergência é o ponto principal: se a máquina reporta `CZ683A` no canal `C` e o cartucho carregado está com `telemetrySku = CZ682A` (operador trocou na mão), **sobrescrever o nível seria mentir sobre referência** — o cartucho carregado está com o código errado. Alerta + não-escrita + banner na UI.

**8.3 `telemetry-store.ts:59-81`** — `persistTelemetry` já insere a linha, relee a mais recente e emite `machine:telemetry`. Capturar o `id` do snapshot inserido e chamar `sincronizarCartuchosHp(...)` logo depois, no mesmo ciclo (não criar outro timer). `POLL_INTERVAL_MS = 60_000` (`index.ts:15`, `:105-109`) inalterado.

### 9. Sync Konica (`agents/konica/`)

- `tonerByColor(info)` (`device-info.ts:209-216`) já devolve `Record<'C'|'M'|'Y'|'K', number|undefined>` — é a entrada do sync.
- `levelCurrent = amountPct`, `unit = 'pct'`, `levelCapacity = 100`. **Não** converter para gramas: `DEFAULT_TONER_CAPACITY_GRAMS = 300` (`device-info.ts:4`) e a chave `konica_toner_capacity_grams` (`:5`) servem para **estimativa**, não para saldo. A densidade do toner OEM não é conhecida — misturar unidade seria invenção.
- `toner_capacity_grams` entra em `cartucho_consumo.delta` apenas quando a atribuição for `estimated`, guardado em coluna própria (ou recomputado do `settings` na leitura). Padrão: guardar sempre em `pct` e exibir gramas só como informação derivada na tela.
- **Limitação declarada, sem enfeite:** `TONER_EXPOSED = false` (`stock-deductor.ts:52`) — o OEM não expõe toner por job e o nível hoje é **estimado por contador de páginas** (`:210-213`, `DEFAULT_TONER_CAPACITY = 20000` páginas em `telemetry-store.ts:10`). Logo:
  - O **saldo** do toner vem da telemetria `%` (fonte da verdade).
  - O **histórico por job** em toner é `attribution='estimated'`: o delta do sync é atribuído ao job ativo na janela. A UI mostra "estimado" e **esconde** a coluna "por job" para toner CMYK. Alinhado a BR-013 ("toner não é debitado por job"), que **não muda**.
  - Consequência assumida: o auditor ve queda de toner e a janela de tempo, não o job exato. Aceito e documentado no ADR-052.

### 10. Refactor dos deductoras

**HP (`stock-deductor.ts:36-44`, `:130-176`).** Hoje: `OUT` no agregado de `stock_items.currentQuantity` por job, com `INK_COLOR_MAP` e idempotência por `reason LIKE '%jobName%'` (`:138-148`). Novo:

```
para cada canal com tinta no job (ml do job > 0):
  cartucho = IN_USE (machineId, canal)
  se !cartucho:
     comportamento legado (escreve no agregado) + 1 aviso por ciclo "canal X sem cartucho"
     -> evita que a feature quebre a operação antes do cadastro dos cartuchos
  se cartucho:
     decrementa cartucho.level_current (otimista, clamp em [0, level_capacity])
     INSERT stock_transactions (type='OUT', quantity=mlDoJob,
           reason='Consumo job <jobName> no canal X',
           user_id='hp-agent-system', user_name='HP Agent',
           source='JOB', source_ref='<jobId>#<canal>')
     INSERT cartucho_consumo (delta=mlDoJob, source='job', jobId, jobName, attribution='exact')
```

Idempotência: `reason LIKE '%jobName%'` é **substituído** por `source_ref = '<jobId>#<canal>'` com índice único parcial. O "já debitei?" passa a ser consulta ao ledger por `source_ref` — mesma forma de consulta, sem `LIKE`, e agora garantida pelo banco. O `LIKE` legado permanece **apenas** no fallback do agregado, para não mudar o comportamento de item sem cartucho. `socket.emit('stock:deducted')` (`:166-171`) mantido; acrescentar `machine:cartuchos`.

Conflito de ordem explícito: o job debita o cartucho de forma otimista e o próximo poll **corrige** para o valor real (a telemetria vence; um `cartucho_consumo` de ajuste com `source='telemetry'` e delta negativo fecha a diferença). Sem isso, o "bater com a realidade" não acontece.

**Konica (`stock-deductor.ts:36-41`, `:52`, `:210-213`).** `KONICA_TONER_COLOR_MAP` passa a resolver para o canal do cartucho em vez do item agregado. `TONER_EXPOSED` continua `false`; o caminho de páginas vira **atribuição estimada** do delta observado no sync, não um débito. Papel (BR-013) inalterado.

### 11. Atribuição de delta a job (e a perda assumida)

Poll a cada 60 s; job pode durar 30 s. Regras:

- Delta em `(lastSync, now]` com **exatamente um** job concluído da máquina -> `attribution='exact'`, `jobId`/`jobName` preenchidos.
- Delta com **vários** jobs -> `attribution='estimated'`, atribui ao **último job concluído** da janela, com `job_name` explícito (`"estimado (3 jobs na janela)"` na UI).
- Delta **sem** job na janela (impressão avulsa, teste, manutenção) -> `source='telemetry'`, `jobId = null`, `attribution='exact'`, jobName = "sem job".
- **Perda assumida e honesta:** se 3 jobs curtos rodarem dentro da mesma janela de 60 s, o histórico registra 1 linha estimada, não 3. Não há granularidade melhor sem dado do OEM. Aparece como limitação no ADR-052 e tooltip na UI, não escondido.

### 12. Consumo manual por código em `/tintas`

`components/cartucho-consumo-dialog.tsx`:

```
Props: { open: boolean; onOpenChange: (o: boolean) => void;
         machineId?: string; channel?: string; onSuccess?: () => void }
```

- Campo 1: **código da tinta** (`stock_items.code`). Busca **exata**, case-insensitive, com trim. O `MediaSelectDialog` (de `PLAN-maquina-f2-midia-select.md`) pode ser embutido como fallback de busca por nome.
- **Código não encontrado -> erro explícito**, nunca silencioso: `404` + toast `"Nenhuma tinta encontrada com o código 'CZ683A'. Confira o código ou use a busca por nome."`. Proibido cair no item "mais parecido" — errado é pior que ausente.
- Código encontrado -> mostra cartucho, nome/SKU, unidade, nível atual, e os cartuchos desse item (em depósito `NEW` / carregado `IN_USE`).
- Campo 2: **modo**, dois radios com copy explícita:
  - **Instalar no canal** (padrão) — escolhe o canal, `NEW -> IN_USE`, **saldo não muda** (copy: "A tinta continua sendo da empresa, agora na máquina. O saldo só cai quando o cartucho é descartado na troca.").
  - **Registrar saída do depósito** — `OUT` do `levelCurrent` integral + `state='USED'`, `location='discarded'`, `source='MANUAL'`, `source_ref='manual:<uuid>'`. Cover: perda, devolução, uso interno.
- Campo 3: quantidade (default `levelCurrent`), validada contra `levelCapacity`.
- Resolução por código no backend (`GET /api/stock-items?code=` ou rota dedicada) para a UI não filtrar a lista inteira.
- RBAC: instalar / registrar saída = `OPERATOR+` (equivale `IN`/`OUT`, BR-018); **ajustar nível manualmente = `ADMIN`/`DEV_MASTER`**, espelhando `stock.ts:813-815`. Botão de ajuste escondido/disabled para `OPERATOR`.

### 13. `unique` em `stock_items.code` + seed dos códigos

Caminho de migração (a coluna hoje é nullable e não-unique):

1. `UPDATE stock_items SET code = NULL WHERE code IS NOT NULL AND code IN (SELECT code FROM stock_items WHERE code IS NOT NULL GROUP BY lower(code) HAVING COUNT(*) > 1);` — desambigua duplicatas em vez de falhar a migration. Logar quantas linhas foram tocadas.
2. `CREATE UNIQUE INDEX stock_items_code_uq ON stock_items(lower(code)) WHERE code IS NOT NULL;` — insensível a caixa e preserva os `NULL` antigos (SQLite trata `NULL` como distinto em índice único, então **não é preciso limpar os NULL**).
3. No `schema.ts`: `uniqueIndex('stock_items_code_uq').on(sql`lower(${stockItems.code})`).where(sql`${stockItems.code} is not null`)`. Se o `drizzle-kit generate` não acertar, escrever a migration a mão (padrão do repo) e manter o schema coerente.

**HP (7) — código = part number real, já no código:** `CZ682A` (K), `CZ683A` (C), `CZ684A` (M), `CZ685A` (Y), `CZ686A` (LC), `CZ687A` (LM), `CZ706A` (OP). `name` continua sendo o SKU interno `hp_tinta-{color}`. O código é obrigatório aqui porque **o operador troca a tinta HP por ele** (seção 12) e porque é o que a guarda de divergência de SKU (seção 8.2) compara com o que a máquina reporta.

**Konica (4) — `konica_toner-{cyan,magenta,yellow,black}`: `code = NULL`, sem consumo manual.** Decisão do operador: toner **não se cadastra por código**, é **monitorado**. Não há part number OEM no repositório e **não se inventa** (seria fabricating de dado de terceiros). O item existe para carregar o saldo derivado e o cartucho por canal; a troca é feita pelo painel da máquina e o que o operador precisa é o **aviso de compra**, não o código (seção 17).

Índice `unique` em `lower(code)` com `WHERE code IS NOT NULL` (passo 2 acima) convive com `NULL` sem conflito — por isso os 4 itens Konica podem ficar sem código sem bloquear a migration.

`scripts/seed-hp-inks.ts:41-51` hoje insere direto em `stock_items` com `currentQuantity = 775*2` e **sem `code`** nem criação de ativo. Reescrever para: `upsert` do item (`code`, `unit='ml'`, `minQuantity=775`, `label` com o part number) + criação de **2 cartuchos** (`CTN-<sku>-01/02`, `levelCurrent = 775`, `levelCapacity = 775`, `state='NEW'`, `location='depósito'`) + 1 linha `IN` por cartucho. **Não** escrever mais `currentQuantity` (o saldo vem derivado). Item existente sem cartucho: manter `currentQuantity` (fallback) e imprimir aviso de que ele precisa de cartuchos — sem migrar dado de cliente em silencio. O novo `scripts/seed-ink-cartridges.ts` faz o mesmo para Konica (4 canais, `unit='pct'`, `levelCapacity=100`).

### 14. Correções de drift encontradas no caminho

- `machines.ts:23-39` — `machineResponseSchema` devolve só `itemIds`, mas `activeBobina` é consumido em `maquinas/page.tsx:596` e `mimaki-info-panel.tsx:81`. Popular de fato `activeBobina` (o ativo `IN_USE` do item em `machine:<id>`) e adicionar `activeGarrafa` e `activeCartuchos`. Sem isso, a nova UI cai no mesmo buraco.
- `lib/api.ts:158` — `Garrafa.state` tipa `NEW|IN_USE|USED`; o schema permite 5 (`schema.ts:71`). Alargar para os 5 e reaproveitar o mesmo tipo em `Cartucho.state`.

### 15. Componentes novos (clonados dos arquivos de referência)

**`components/cartuchos-panel.tsx`** (de `mimaki-info-panel.tsx:95-113`; filtro `state==='IN_USE' && location==='machine:<id>'` em `:33-35`):

```
Props: { machineId: string; brand: string }
```

- Um cartão por canal, na ordem de `INK_META` (`machine-telemetry-panel.tsx:12-20`): nome da cor, barra de nível (`levelPct`), texto `775 ml` / `62 %`, serial do cartucho, `code` do item, badge de estado, "última sync" relativo, e **distinção visual entre telemetria e estimativa** (`attribution`).
- Botões: "Trocar Cartucho", "Registrar consumo", "Ver histórico".
- Divergência de SKU: banner vermelho com o que a máquina reporta vs. o cartucho carregado.
- Precedência de dado invertida em relação a hoje: o nível do cartucho é a fonte; a telemetria crua aparece como "confirmado pela telemetria há Xs" (hoje `machine-telemetry-panel.tsx:22-36` da precedência ao `live`).

**`components/change-cartucho-dialog.tsx`** (de `change-garrafa-dialog.tsx`; labels PT-BR em `:62`, `:73-74`, `:80`; matching de serial em `:35`, `:42-43`; mutation em `:45-49`):

```
Props: { open: boolean; onOpenChange: (o: boolean) => void;
         machineId: string; channel: string; currentCartuchoId?: string;
         onSuccess?: () => void }
```

- Seletor de canal quando acionado pela máquina inteira.
- Busca do novo cartucho por **código** ou SKU, com lista de disponíveis em depósito.
- **Ação do cartucho antigo é única e não negociável**: "Descartar restante e dar baixa". O seletor `FINISHED`/`RETURN_TO_STOCK` (`:28`) **sai** e **não volta**. Decisão do operador: *"saiu da máquina é lixo"* — não existe "trocar sem baixa", não existe "devolver ao estoque", não existe segunda opção na UI. Copy: "O cartucho atual será descartado e os {X} restantes dão baixa."
- Confirmação mostra o valor exato do `OUT` antes de enviar.

**`components/cartucho-consumo-history.tsx`**

```
Props: { machineId: string; channel?: string; page?: number }
```

- Tabela: quando, canal, `nível antes -> depois`, delta + unidade, origem (`telemetria`/`job`/`manual`), job, precisão (`exato`/`estimado`), usuário.
- Filtros por canal, origem e intervalo; paginação por cursor em `created_at` (a tabela cresce com o uso: 7 canais a cada 60 s).

**`components/cartucho-consumo-dialog.tsx`** — seção 12.

### 16. Wire-up

- `maquinas/page.tsx:556-590` — tabs `status | jobs | consumo | materiais` -> inserir **`tintas`** entre `consumo` e `materiais` (consumo de tinta é dado de máquina, não de job).
- `maquinas/page.tsx:48-61` — `MachineTelemetryView` router: novo `CartuchosView` para `?tab=tintas`.
- `maquinas/page.tsx:498-507`, `:541-547` — o F2 já existe para mídia; **não** colidir: na aba `tintas`, F2 abre o `change-cartucho-dialog` do canal selecionado.
- `tintas/page.tsx` — botão "Registrar consumo de tinta" no header (`:67-68`), abrindo o dialog; a coluna de saldo exibe o derivado e ganha link "ver cartuchos".
- `label-imposition-dialog.tsx:110-145` — os itens de etiqueta hoje vêm só de `bobinas` (`:110-126`) e `garrafas` (`:129-145`), com payload `BOB:<digits>` (`:123`) e `TNK:<digits>` (`:142`). Adicionar branch de `cartuchos` com payload **`CTN:<digits>`** (106x35 mm, folha SRA3, mesma mesa). Custo baixo e fecha o circuito do cartucho físico.
- Nenhuma entrada nova de navegação: `/tintas` já existe (`sidebar-rail.tsx:28`, `sub-sidebar.tsx:62,77-78`).
- `electron/` não tem UI de tinta — nada a fazer.

### 17. Alerta de reposição (substitui `checkLowStock` e `checkLowToner`)

**Pedido do operador:** toner é **acompanhado, não cadastrado**. Não existe código `TN`, não existe consumo manual por código para toner. Quando o cartucho carregado chega a um certo uso, o sistema **avisa que precisa comprar** — mas **só avisa se não houver nenhum cartucho do mesmo item em depósito**. Havendo estoque, **não faz nada**: o operador já tem o que precisa.

**Limiar: percentual do cartucho carregado.** `THRESHOLD_PCT = 15` (o mesmo número já usado em `agents/brain/index.ts:131` — `if (t.pct != null && t.pct <= 15)`), com
`pct = levelCurrent / levelCapacity * 100`. Vale igualmente para HP (775 ml) e Konica (100%), porque `levelCapacity` é declarado por cartucho. Não usar `stock_items.minQuantity`: aqui a pergunta é "o cartucho na máquina está acabando", não "o saldo do item está acabando".

**Gate de estoque (a metade que importa).** Não avisar = existe pelo menos **um** cartucho do mesmo `stockItemId` em `state = 'NEW'` e `location = 'depósito'`. É o mesmo somatório do saldo derivado (seção 5), então a checagem é a mesma query — não inventar um segundo conceito de "tem em estoque".

```
checkReposicaoCartuchos(): Alert[]
  cartuchos = todos com state='IN_USE' e machine_id não nulo
  for c em cartuchos:
    pct = c.levelCapacity ? c.levelCurrent / c.levelCapacity * 100 : null
    se pct == null: continue                       // sem capacidade conhecida = sem limiar
    key = `reposicao-${c.id}`                      // por cartucho: 1 aviso por canal
    se pct > THRESHOLD_PCT:
      sentAlerts.delete(key)                       // curou: limpa o cooldown (padrão de checkMachineStatus:82)
      continue
    temEmDeposito = existe cartucho do mesmo stockItemId com state='NEW'
    se temEmDeposito:
      sentAlerts.delete(key)                       // não avisa, mas também não "marca" — se depois zerar, avisa na hora
      continue
    se shouldAlert(key):
      alerts.push({ key, message:
        `**[Repor Tinta]** ${itemName} — canal ${c.channel} em ${Math.round(pct)}% (${formatLevel(c.levelCurrent, c.unit)} de ${formatLevel(c.levelCapacity, c.unit)}) na ${machine.name}. Sem cartucho em depósito. Comprar.` })
      markAlerted(key)
```

- **Duas substituições, não uma adição** (decisão travada — evita dois avisos sobre o mesmo toner):
  1. `checkLowToner()` (`:108-141`) é **removida**. Ela dispara em `<= 15%` **incondicionalmente**, ou seja, avisa "considere reposição" mesmo com Toner FULL na prateleira. É exatamente o comportamento que o operador rejeitou. `machineTelemetry` deixa de ser lido por ela.
  2. `checkLowStock()` (`:41-60`) é **reescrita** para usar o **saldo derivado** (soma de `levelCurrent` em `NEW|IN_USE`, seção 5) em vez de `stockItems.currentQuantity`. Sem isso, para tinta o `currentQuantity` deixa de ser a verdade (seção 5) e o alerta global passa a mentir. Itens sem ativo (folha, solventes) continuam lendo `currentQuantity`.
- **Deduplicação:** chave por **cartucho** (`reposicao-<cartuchoId>`), não por item — duas máquinas com o mesmo toner avisam separado, porque esgotar em uma não significa esgotar na outra. Cooldown reaproveitado: `shouldAlert`/`markAlerted`, `ALERT_COOLDOWN_MS = 30_600_000` (`:29`). O `Map` é **em memória** (`:28`), então reinício do backend re-avisaria — herança do código atual, aceitável, e anotado no ADR-052.
- Entrega: `emitSystemMessage()` (`:13-26`) na room `geral`, mesmo caminho de hoje. Nada de WhatsApp/e-mail novo.
- **Não fazer**: comprar automático, sugestão de fornecedor, ponto de pedido calculado por consumo, RSS. O pedido é "avisa que precisa comprar", não "compra".

**Efeito colateral no `/tintas`:** o consumo manual por código (seção 12) é de **HP** (o operador troca a tinta HP pelo part number `CZ683A`). Para **toner Konica** o item fica com `code = NULL` e o dialog mostra copy explícita: `"Toner é monitorado pela telemetria. O sistema avisa quando precisar comprar e não houver estoque."` — sem campo de código, sem botão de registrar saída. Isso elimina a pendência de dado dos part numbers OEM (o ruling #2 da versão anterior deste plano).

## Riscos e Mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| **Colisão do saldo derivado** (`stock.ts:128-133`): três origens de saldo (cartuchos, garrafas, `currentQuantity`) | Saldo errado, consumo fantasma em tela | Precedência **por `stockItemId`** (seção 5) + teste dedicado `stock-ink-balance.test.ts` fixando as 3 ordens; um item nunca pode ter as duas famílias (seed garante) |
| **Turso/libSQL e índice parcial único** | Constraint não criada, dois `IN_USE` no canal | Verificar no push; fallback em trigger com `RAISE(ABORT)`; defesa em `db.transaction` com `UPDATE ... WHERE state='IN_USE'` + releitura. Migration escrita a mão (padrão do repo) |
| **`775` hard-coded** (`telemetry.ts:119,124`) | Capacidade errada se o modelo da máquina mudar | Ler da página quando disponível; constante nomeada como fallback; divergência >5% vira alerta, nunca sobrescrita silenciosa |
| **Fragilidade do scraping HTML** (`telemetry.ts:108-128`: `indexOf(sku)` + regex em janela de —500/250 chars) | Canal some do sync, `remainingMl` fica `undefined` | `incoming` ausente **não** mexe no cartucho; teste de caracterização do parser com HTML fixture; `INK_COLORS` vira fonte única de canal |
| **Intervalo de poll (60 s) vs. duração de job** | Vários jobs numa janela = 1 linha estimada; histórico "por job" incompleto | `attribution` `exact`/`estimated`, regra explícita (seção 11), copy "estimado" na UI, limitação registrada no ADR-052. Não inventar granularidade que o OEM não dá |
| **Konica não expõe toner por job** (`TONER_EXPOSED = false`) | Sem histórico por job em toner | Saldo pela telemetria `%`; histórico estimado e rotulado; BR-013 inalterada; limitação declarada na UI |
| **`stock_items.code` com NULL/duplicado** trava o índice unique | Migration falha em produção | Normalizar duplicatas para `NULL` primeiro; índice parcial `WHERE code IS NOT NULL` preserva os NULL; log de quantas linhas mudou |
| **Duas rotas de escrita na janela de rollout** (deductor legado + cartucho) | Dupla baixa | O fallback do deductor só dispara **quando não há cartucho `IN_USE` no canal**, com aviso por ciclo; desligar o fallback é tarefa explícita da Task 9, não leftovers |
| **Regressão em `garrafas`/Mimaki** (`mimaki.ts:174-283`) | Quebra do fluxo Mimaki, que está em produção | Não tocar em `mimaki.ts`, `garrafas` nem nas rotas de garrafa; teste de não-regressão no `stock-ink-balance.test.ts`; rollback por feature flag do fallback |
| **Cobertura de integração HP/Konica = zero** (`TESTING_STRATEGY.md:65-68`) | Refactor do deductor sem rede de segurança | **Task 1 (caracterização) bloqueia Tasks 9 e 10.** Sem o teste antes, não se mexe no deductor |
| **Esc scraping x HTML de Supplies diferente por firmware** | Um canal para de sincronizar sem erro visível | Ausência de `incoming` não é erro; painel mostra "última sync há N min" e alerta de canal sem leitura |
| **Saldo legado x derivado após o cutover** | Saldo "cai" no momento da virada | Registrar a diferença como `ADJUSTMENT` na migration de cutover (ADMIN+) e imprimir antes/depois no log do seed |
| **`INSERT` sem transaction em `stock.ts:778-848`** | Débito parcial em falha intermediária | Fora de escopo (ADR-008 Proposto); as rotas novas usam `db.transaction`; dívida registrada |
| **Aviso de compra duplicado** (brain novo + `checkLowToner` antigo) | Operador recebe 2 mensagens sobre o mesmo toner e para de ler | `checkLowToner` **removida**, não desabilitada por flag (seção 17); um único `checkReposicaoCartuchos` na lista do `tick` (`:149-154`) |
| **Spam de aviso** — cartucho abaixo do limiar por semanas sem reposição | Notificação a cada 30,6 min (`:29`) durante toda a janela | Cooldown reaproveitado + `sentAlerts.delete(key)` quando a condição **ou** o gate de estoque mudam; chave por cartucho. Aceitável: enquanto precisar comprar, o lembrete repetir é o comportamento pedido |
| **`checkLowStock` lendo `currentQuantity`** depois do cutover | Alerta global de "[Estoque Zerado]" falso para tinta | Reescrever com `saldoDerivado()` (seção 5); teste em `brain-reposicao.test.ts` com item de tinta que tem `currentQuantity` obsoleto e saldo derivado > 0 -> **nenhum** alerta |
| **Cooldown do brain em memória** (`:28` `Map`) | Reinício do backend re-avisa | Herança do código atual, aceita e registrada no ADR-052. Migrar para `settings` é escopo próprio |
| **Consumo manual por `code` só existe para HP** | Operador de toner procura um campo de código que não existe | UI esconde o dialog para item sem `code` e mostra copy de "monitorado pela telemetria" (seção 17); toner tem 1 caminho, não 2 |

## Critérios de Aceite

- [ ] ADR-052 criado, Emenda 4 no ADR-009, BR-011 emendada, BR-052 criada, `ADR_INDEX.md` com **uma** linha nova e bytes antigos intactos (R-009 conferido com `git diff`)
- [ ] `.sdd/cartucho-tinta-maquina/progress.md` existe, ledger preenchido, <= 2 rulings
- [ ] Migration aplica em base limpa (`db:push`) e em base com dados legados; `resetDb()` cobre `cartuchos` e `cartucho_consumo`
- [ ] Os 7 canais HP são carregados com 7 cartuchos de 775 ml, um por canal, e nenhum canal tem dois `IN_USE`
- [ ] Ao trocar o cartucho do canal `C`: o antigo fica `USED` + `discarded`, e existe **exatamente uma** linha `OUT` no ledger pelo `levelCurrent` restante, com `source='SWAP'` e `source_ref` preenchido
- [ ] Repetir o mesmo POST de troca não cria uma segunda linha `OUT` (idempotência por `source_ref`)
- [ ] Nenhum `OUT` é criado no evento de **carga** — verificado por teste que conta as linhas do ledger antes/depois do load
- [ ] O saldo do item de tinta HP em `/tintas` é igual a `SUM(levelCurrent)` dos cartuchos `NEW|IN_USE`, e o saldo não muda ao carregar
- [ ] A telemetria HP (ou fixture equivalente) baixa o `levelCurrent` do cartucho carregado e cria 1 linha em `cartucho_consumo` com `source='telemetry'`
- [ ] Divergência de SKU (telemetria `CZ683A` vs. cartucho `CZ682A`) gera alerta e **não** sobrescreve o nível
- [ ] Toner Konica: `C/M/Y/K` em `%`, capacidade 100, saldo = soma dos 4 cartuchos; a UI marca o histórico de toner como `estimado`
- [ ] Itens de toner Konica ficam com `code = NULL`, o seed roda sem erro e a migration do índice unique aceita os `NULL`
- [ ] Consumo manual em `/tintas` por `code` funciona **para tinta HP**; código inexistente devolve erro explícito em PT-BR e não escolhe outro item
- [ ] Em `/tintas`, item de toner **não** mostra o botão de consumo manual por código — mostra a copy "monitorado pela telemetria"
- [ ] "Instalar no canal" deixa o saldo inalterado e a copy explica por que; "Registrar saída do depósito" gera 1 `OUT` integral + `USED`/`discarded`
- [ ] Consumo manual exige `OPERATOR`; ajuste de nível exige `ADMIN`/`DEV_MASTER` (como `stock.ts:813-815`)
- [ ] **Alerta de reposição**: cartucho carregado em <= 15% **e** com zero cartuchos do mesmo item em `NEW` -> emite 1 aviso na room `geral` com nome do item, canal, %, máquina e "sem cartucho em depósito"
- [ ] **Gate de estoque**: o mesmo cartucho em <= 15% **com** pelo menos um `NEW` em depósito -> **nenhum** aviso emitido (o teste falha se emitir)
- [ ] `checkLowToner` não existe mais no código e nenhum teste depende dela
- [ ] `checkLowStock` usa `saldoDerivado()`: item de tinta com `currentQuantity` obsoleto em 0 e saldo derivado > 0 **não** gera "[Estoque Zerado]"
- [ ] Alerta para duas máquinas com o mesmo toner são 2 mensagens distintas (chave por cartucho)
- [ ] Cartucho que volta acima de 15% limpa o cooldown (`sentAlerts.delete`) e re-notifica se descer de novo com estoque zerado
- [ ] Histórico mostra quando, canal, antes -> depois, origem, job e precisão (`exato`/`estimado`)
- [ ] `cartuchos` e `garrafas` aparecem como itens de etiqueta com payload `CTN:` / `TNK:` na mesa de imposição
- [ ] Não-regressão: caminho `garrafas`/Mimaki inalterado (`mimaki.ts:174-283`), `POST /api/garrafas/:id/discharge` com o mesmo comportamento
- [ ] `activeBobina` vem preenchido da API (fecha o drift de `machines.ts:23-39`) e `Garrafa.state` tipa os 5 estados
- [ ] `npm run lint` e `npx tsc --noEmit` limpos; suite completa verde (caracterização + rota + sync + e2e)
- [ ] `git diff --stat` mostra **zero** arquivo em `packages/**/*.cs`, `sidecars/**` e `docs/engineering/IMPOSICAO-MOTOR.md`

## Notas

**Fora de escopo**

- Unificar Mimaki (`garrafas`) no modelo de `cartuchos` — `mimaki.ts:174-283` fica como está.
- Compra automática, integração com fornecedor, cotação, RSS. O pedido é **avisar que precisa comprar**, não comprar.
- Ponto de pedido calculado por consumo / reposição preditiva / consumo por área. O limiar é **fixo em 15%** do cartucho carregado, não calculado.
- Registrar toner por código (`TN###` OEM). Toner é monitorado, não cadastrado (decisão do operador).
- QR no cartucho além do `CTN:` na mesa de etiquetas (entra só se sair de graça; o serial `CTN-0001` já é digitável e a busca por código resolve).
- Converter toner `%` -> gramas como saldo.
- Migrar o cooldown de alertas do brain de `Map` em memória (`:28`) para `settings`.
- Deduplicar `computeStatus` (hoje em `stock.ts:79-83`, `mimaki.ts:18-22` e nos agentes — BR-009 segue `PARTIAL`).
- Corrigir a atomicidade de `stock.ts:778-848` (ADR-008, continua Proposto).

**Lacunas de documentação conhecidas (mencionar, não corrigir)**

- `BUSINESS_RULES.md` para em BR-024, mas ADR-049/ADR-050 referenciam BR-050/BR-051 inexistentes. Daqui em diante usar `BR-052`+.
- ADR-045/046/099 têm arquivo mas não estão no `ADR_INDEX.md` — read-only.
- `.sdd/` é gitignored: o ledger é local, não entra em commit.

**Drift encontrado no caminho (corrigido em passagem, Tarefa 13)**

- `activeBobina` declarado no tipo do front e consumido em `maquinas/page.tsx:596` e `mimaki-info-panel.tsx:81`, mas nunca populado pelo backend (`machines.ts:23-39`).
- `Garrafa.state` no front (`lib/api.ts:158`) com 3 estados contra 5 no schema (`schema.ts:71`).

**Decisões já fechadas pelo operador (não reabrir)**

1. **Semântica do ledger** (seção 4): sem `OUT` na carga, saldo derivado `NEW|IN_USE`, BR-005 parcial para tinta com cartucho. É o que torna a "baixa na troca" coerente com o pedido e impede dupla baixa. **Aceito.**
2. **Baixa só na troca, sempre integral** — *"saiu da máquina é lixo"*. Sem devolução ao estoque, sem troca sem baixa. **Aceito e travado** (reintroduzir = novo ADR).
3. **Toner é monitorado, não cadastrado por código** — HP e Konica compartilham a mesma regra de alerta (≤15% do cartucho carregado), e o aviso só sai **se não houver nenhum cartucho do mesmo item em depósito**. `checkLowToner` sai; `checkLowStock` passa a ler o saldo derivado. **Aceito.**

**Ruling que falta antes da Task 2**

- **Índice parcial no Turso**: se o `db:push` recusar `CREATE UNIQUE INDEX ... WHERE state='IN_USE'`, aplica-se o fallback em trigger (seção 3). Decisão de implementação, não bloqueia — resolver no momento da migration.

Aceitáveis: fragilidade do scraping, perda de atribuição em janelas curtas, cobertura zero de integração (mitigada pela Task 1), a não-reconciliação do ledger para tinta com cartucho (documentada, com aviso de conferência) e o cooldown de alertas em memória (herança do código atual).

**Zero impacto C# / imposição** — confirmado: `packages/**/*.cs` não referência tinta/estoque. `docs/engineering/IMPOSICAO-MOTOR.md` não é alterado.
