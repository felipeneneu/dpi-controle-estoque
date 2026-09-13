# Lógica de Estoque — Como está hoje e o algoritmo que vamos criar

> **Propósito:** documento de estudo para entender o funcionamento atual do estoque do GraficaOS, as fragilidades e o desenho do novo algoritmo de débito.
> **Escopo:** nenhuma mudança de código — apenas explicação + sugestões.
> **Fontes:** `grafica-app/backend/src/db/schema.ts`, `grafica-app/backend/src/routes/stock.ts`, `apps/agents` (HP/Konica), `routes/mimaki.ts`, `lib/math.ts`.

---

## SUMÁRIO

1. [Visão geral](#1-visão-geral)
2. [Como o estoque é salvo hoje](#2-como-o-estoque-é-salvo-hoje)
3. [O débito automático hoje](#3-o-débito-automático-hoje)
4. [Algoritmo unificado proposto](#4-algoritmo-unificado-proposto)
5. [Decisão: política de saldo negativo](#5-decisão-política-de-saldo-negativo)
6. [Idempotência e dedupe](#6-idempotência-e-dedupe)
7. [Casos de borda](#7-casos-de-borda)
8. [Plano de implementação em fases](#8-plano-de-implementação-em-fases)
9. [Checklist de validação](#9-checklist-de-validação)

---

## 1. Visão geral

 - **Stack:** Next.js (frontend) + Fastify (backend) + **Drizzle ORM** sobre **SQLite/libSQL/Turso**.
- **Sem venda/POS:** o estoque é consumido por **jobs de impressão** (máquinas reais) ou **baixa manual**.
- **Sem custo/preço:** estoque é controlado **só por quantidade/unidade** (não é valorizado).
- **Débito automático = 3 agentes + baixa manual**; todos gravam em `stock_transactions` e atualizam `stock_items.current_quantity`.

### Fluxo geral (entrada → saída)

```
ENTRADA
  Admin cadastra item (POST /api/stock-items)
  ou "Adicionar rolo" (POST /api/stock-items/:id/add-roll)
  ou reposição (POST /api/stock-transactions { type: 'IN' })

CONSUMO
  (a) HP Latex  — polling 60s em accounting.xls  → tinta + mídia
  (b) Konica    — polling 30s no PrintManager    → papel (toner não debitado)
  (c) Mimaki    — webhook M2M + fila             → substrato + tintas UV
  (d) Manual    — operador faz "Dar Baixa" (OUT)

SAÍDA
  UPDATE stock_items.current_quantity + INSERT stock_transactions (OUT)
  pode gerar alerta LOW_STOCK/OUT_OF_STOCK (notificação + WhatsApp, anti-spam)
```

---

## 2. Como o estoque é salvo hoje

### 2.1 Tabela `stock_items` — `db/schema.ts:27-41`

| Campo | Tipo | Observação |
|---|---|---|
| `id` | text PK | UUID |
| `name` | text | convenção de SKU p/ tinta: `hp_tinta-cyan`, `konica_toner-black` |
| `category` | text enum | `PAPER_MEDIA \| INK_SUPPLY \| OTHER` (só tipagem TS) |
| `sub_type` | text | Bobina, Cartucho, Cut-sheet… (livre) |
| `unit` | text | API: `m \| fls \| ml \| L`; deductor Konica também reconhece `rms \| pk \| bl` |
| `width` | real | largura da bobina em m (usada na conversão m² → m) |
| `code`, `label` | text | `label` identifica o rolo físico |
| `current_quantity` | real | default 0 |
| `min_quantity` | real | default 0 — gatilho do estoque mínimo |
| `status` | text enum | derivado: `AVAILABLE \| LOW_STOCK \| OUT_OF_STOCK` |

**Sem `CHECK` no banco**: nada impede `current_quantity < 0` no SQL. A proteção é 100% na aplicação (e silenciosa). Não há coluna de custo/preço nem de versão (otimistic locking).

### 2.2 Tabela `stock_transactions` — `db/schema.ts:58-72` (a trilha de auditoria)

| Campo | Tipo | Observação |
|---|---|---|
| `id` | text PK | UUID |
| `item_id` | text FK → stock_items | ON DELETE **no action** (bloqueia delete de item com histórico) |
| `type` | text enum | `IN \| OUT \| ADJUSTMENT` |
| `quantity` | real | **sempre positiva** (validação zod), relativa ao tipo |
| `reason` | text | **livre** — usada também como chave de idempotência (`LIKE %jobName%`) |
| `user_id` / `user_name` | text | usuário real ou sistemas: `hp-agent-system`, `konica-agent-system`, `system` |
| `created_at` | timestamp | sem `updated_at` |

**Não tem** `balance_after` (saldo pós-movimentação) nem `source_ref` (causa estruturada).

### 2.3 Tabela `machine_items` — `db/schema.ts:43-56`

Vínculo N:N máquina ↔ material (informativo: exibe "usado em máquina X"). FK com `ON DELETE CASCADE`.

### 2.4 Como o saldo é alterado na rota manual — `routes/stock.ts`

**`POST /api/stock-transactions`** (`stock.ts:366-436`) — o "coração" da baixa manual:

```
1. Valida zod: itemId, type, quantity > 0
2. REGRA RBAC: ADJUSTMENT só ADMIN/DEV_MASTER; IN/OUT liberado p/ OPERATOR
3. Lê o item (SELECT)
4. Calcula:
     IN          → newQty = current + quantity
     OUT         → newQty = Math.max(0, current - quantity)   ← clamp silencioso
     ADJUSTMENT  → newQty = quantity (valor absoluto)
5. UPDATE stock_items SET current_quantity, status
6. INSERT stock_transactions (OUT/IN/ADJUSTMENT, reason, autor)
7. Se status LOW_STOCK/OUT_OF_STOCK → alerta (notif + WhatsApp)
8. Emite socket 'stock:updated'
```

**Brechas de auditoria atuais:**
- `PUT /api/stock-items/:id` (`stock.ts:186-229`) aceita sobrescrever `currentQuantity` **sem gerar transação**.
- `POST /api/stock-items` (criação) grava `current_quantity` inicial **sem transação**.
- `POST /api/stock-items/:id/add-roll` (`stock.ts:289-333`) duplica o saldo do rolo para o novo **sem transação IN**.
- `DELETE /api/stock-items/:id` (`stock.ts:231-250`) não trata a restrição de FK → **erro 500** se o item tem histórico.

---

## 3. O débito automático hoje

> **Não existem triggers/stored procedures.** Todo débito é na camada de aplicação, em sequência de `await`s **sem transação SQL** (o SQLite serializa cada UPDATE isolado, mas não o intervalo SELECT→UPDATE→INSERT).

**Padrão comum a todos os fluxos (read-modify-write):**

```
1. detecta job novo (dedupe por UNIQUE job_id / folder_timestamp)
2. encontra o item de estoque associado (matcher por NOME)
3. verifica idempotência/movimento já feito (opcional, por reason LIKE)
4. calcula débito (unidade/conversão específica da máquina)
5. UPDATE stock_items SET current_quantity = max(0, current - débito)
6. INSERT stock_transactions (OUT)
7. marca print_jobs/mimaki_jobs.stock_deducted = true
8. emite socket + alerta se necessário
```

### 3.1 HP Latex 330 — `agents/hp-latex/stock-deductor.ts:123-270`

**Evento:** polling de 60s (`agents/hp-latex/index.ts`) lê o `accounting.xls` da impressora.

**Tintas** (linhas 129-175):
```
para cada [sku, campo] em INK_COLOR_MAP  (ex.: 'hp_tinta-cyan' → inkCyanMl):
  se job[campo] > 0:
    item = FIND stock_items WHERE name = sku (nome EXATO)
    se já existe transação com reason LIKE '%jobName%' E itemId → pula (idempotência)
    newQty = max(0, item.current - ml)
    UPDATE stock_items; INSERT stock_transactions(OUT, reason 'HP Agent: job X')
```

**Mídia** (linhas 177-242):
```
se job.mediaType e mediaAreaM2 > 0:
  rows = PAPER_MEDIA
  widthHint = parseMediaWidthM(job.jobName) ?? parseMediaWidthM(job.mediaType)
  item = findMediaItem(rows, job.mediaType, widthHint)
        → casamento por nome normalizado; prioriza largura; nome mais específico
  se item:
    idempotência por reason LIKE
    widthM = widthHint ?? item.width
    debitQty = widthM ? divideAreaToLength(mediaAreaM2, widthM) : mediaAreaM2
    # divideAreaToLength = big.js(area / width), arredondado 3 casas
    newQty = subtractStock(...)   # big.js, clamp a 0
    UPDATE + INSERT OUT
    se !widthM → warn "debitando m² direto" (sem conversão)
```

### 3.2 Konica C3070 / AccurioPrint — `agents/konica/stock-deductor.ts:129-233`

**Evento:** polling de 30s no PrintManager.

**Papel** (linhas 135-178):
```
se job.paperName e sheets > 0:
  rows = PAPER_MEDIA
  item = findPaperItem(rows, paperName, gram)
        → tokens normalizados (ignora acento/separador), todos precisam casar;
          prioriza gramatura citada e tamanho (A4>A3>33x48)
  se item:
    sheetsUsed = floor(sheets)
    factor = CONVERSION_FACTOR_BY_UNIT[item.unit] ?? 1   # fls:1, rms:500, pk:50, bl:2500
    debitQty = factor > 1 ? floor(sheetsUsed / factor) : sheetsUsed
    newQty = max(0, current - debitQty)
    UPDATE + INSERT OUT
  senão → warn (não debita nada)   # dependente da convenção de nome!
```

**Toner** (linhas 180-211): `TONER_EXPOSED = false` — o PrintManager não expõe consumo por job. **Não é debitado**; apenas incrementa contador de páginas para estimativa futura. O controle de toner é por telemetria de % (nível) + alerta.

### 3.3 Mimaki UCJV300-75 — `routes/mimaki.ts:39-180`

**Evento:** webhook M2M (`POST /api/integrations/mimaki/jobs`, protegido por secret) → fila Writable (`lib/mimaki-queue.ts`) → processa job. Cálculo do consumo: `lengthMeters = (height_mm × totalPrints) / 1000` (o tracker não envia largura).

**Substrato** (linhas 55-110): usa `stockItemId` (auto-vinculado por nome do rawMaterialName, ou bind manual). Idempotência por `reason LIKE %jobName%`.

**Tintas UV** (linhas 112-172): 8 canais (CMYK + White1/2 + Varnish1/2), procura item `INK_SUPPLY` cujo nome contém `"uv"` + cor. **SEM idempotência** — re-execução de `bind-material`/`sync-stock` debita as tintas de novo.

### 3.4 Sincronização/reconciliação manual

- `POST /api/machines/:machineId/sync-stock` (`routes/jobs.ts`) — reexecuta `deductStockForJob` (do **agente HP**) para jobs com `stock_deducted=false`.
- `POST /api/integrations/mimaki/sync-stock` (`routes/mimaki.ts`) — reprocessa jobs Mimaki pendentes.
- `PATCH /api/integrations/mimaki/jobs/:id` — ajuste de metragem gera transação compensatória IN/OUT.

### 3.5 Resumo comparativo

| | HP | Konica | Mimaki | Manual |
|---|---|---|---|---|
| Ator | `hp-agent-system` | `konica-agent-system` | `system` | usuário logado |
| Unidade | ml (tinta) / m (mídia) | fls, rms, pk, bl (papel) | m (substrato) / cc (tinta) | unitário do item |
| Matcher | nome exato (tinta) / nome+largura (mídia) | tokens (papel) | nome contém `uv`+cor (tinta) | por `itemId` |
| Idempotência | reason LIKE (tinta e mídia) | UNIQUE job_id (no print_jobs) | só substrato | — |
| Transação SQL | **não** | **não** | **não** | **não** |
| Saldo negativo | clamp `max(0,…)` | clamp `max(0,…)` | clamp `max(0,…)` | clamp `max(0,…)` |

---

## 4. Algoritmo unificado proposto

**Objetivo:** um único serviço de débito, atômico, auditável, idempotente e com política de saldo configurável — usado pelos 3 agentes e pela rota manual.

### 4.1 O modelo de movimentação

| Campo | Tipo | Por quê |
|---|---|---|
| `id` | PK | UUID |
| `item_id` | FK → stock_items | — |
| `type` | `IN \| OUT \| ADJUSTMENT` | — |
| `quantity` | real > 0 | positiva sempre |
| `reason` | text | descrição livre p/ humanos |
| `source` | text | quem disparou: `HP_AGENT \| KONICA_AGENT \| MIMAKI_AGENT \| MANUAL \| SYSTEM` |
| `source_ref` | text **UNIQUE (item_id, source, source_ref)** | **causa estruturada** = job_id (idempotência à prova de `%`/`_`) |
| `balance_before` | real | saldo antes da movimentação (auditoria) |
| `balance_after` | real | saldo depois da movimentação (reconciliação) |
| `user_id` / `user_name` | text | ator real ou de sistema |
| `created_at` | timestamp | — |

Invariante de reconciliação: `Σ IN - Σ OUT` do item ⇒ `current_quantity` do item (considerando ajuste absoluto).

### 4.2 Pseudo-código do serviço `debitStock`

```ts
async function debitStock(itemId, quantity, opts):
  # opts: { source, sourceRef, reason, actorId, actorName, allowNegative }

  # 1. Idempotência por causa estruturada (source_ref)
  if opts.sourceRef:
    já = SELECT 1 FROM stock_transactions
          WHERE item_id = itemId AND source = opts.source AND source_ref = opts.sourceRef
    if já: return { duplicated: true, newQty }   # não debita de novo

  # 2. Débito atômico + fails-fast (opcional; ver Seção 5)
  if allowNegative == false:
    result = UPDATE stock_items
             SET current_quantity = current_quantity - :quantity,
                 status = computeStatus(current_quantity, min_quantity)
             WHERE id = :itemId AND current_quantity >= :quantity
    if rowsAffected == 0:
      # saldo insuficiente OU item não existe → trata conforme política (erro/alerta)
      return { insufficient: true }

  # 3. Leitura do novo estado
  item = SELECT * FROM stock_items WHERE id = itemId
  balanceAfter = item.current_quantity

  # 4. Grava movimentação (com saldo antes/depois)
  INSERT stock_transactions (
    item_id, type='OUT', quantity, reason, source, source_ref,
    balance_before = balanceAfter + quantity, balance_after = balanceAfter,
    user_id, user_name
  )

  # 5. Efeitos colaterais (fora da transação crítica, best-effort)
  if status in (LOW_STOCK, OUT_OF_STOCK): dispatchStockAlert(...)
  socket.emit('stock:updated', ...)

  return { newQty: balanceAfter, status, duplicated: false }
```

**Where a transação entra (step 2+4):** em Drizzle/libsql, `db.transaction(tx => { ... })` agrupa UPDATE + INSERT — ou, idealmente, um `UPDATE ... WHERE current_quantity >= qty` verifica atomicamente saldo suficiente e o INSERT da movimentação ocorre na mesma transação. Isso elimina a corrida SELECT→UPDATE e o "histórico difuso" (UPDATE ok, INSERT falhou).

### 4.3 Matchers → vinculação explícita

Hoje o débito depende de adivinhar o item pelo nome (frágil). Proposta em 2 camadas, por ordem de prioridade:

1. **Vínculo explícito (verdade única):** `machine_items` passa a ser de fato o catálogo "o que a máquina X consome". Job da máquina X → só consulta itens vinculados.
   - HP tinta: SKU exato continua OK (tabela `INK_COLOR_MAP`).
   - Mimaki substrato: já tem `stockItemId` (forte) — manter; seeds de tinta: cadastrar itens com nome contendo `uv` + cor na convenção.
2. **Fallback por matcher** (apenas quando não há vínculo): manter `normalizeMediaName` / `findPaperItem` mas **sempre logar** `console.warn` + alerta quando não achar item, para o débito nunca silenciar.

### 4.4 Conversões de unidade

Unificar em `lib/math.ts` (já usa big.js) e centralizar os fatores:

```
fls = 1 folha
rms = 500 folhas
pk  = 50 folhas
bl  = 2500 folhas

m (linear) = m² ÷ largura (HP)  ou  height_mm × prints ÷ 1000 (Mimaki)
ml / cc (tinta) = direto do job
```

Regra do arredondamento: **m/cc → 3–4 casas** (big.js half-up); **folhas → floor** (nunca debitamos meia folha).

---

## 5. Decisão: política de saldo negativo

É a principal decisão de regra de negócio do novo algoritmo. Três opções:

### Opção A — Fails-fast (bloqueia)
```
UPDATE ... WHERE current_quantity >= quantidade
if rowsAffected == 0 → ERRO (débito não é registrado)
```
- ✅ Impede débito fantasma; saldo nunca diverge do histórico.
- ✅ O operador é obrigado a repor ou fazer um ADJUSTMENT consciente.
- ⚠️ Em produção automatizada (agent), um job pode "quebrar" o fluxo se não acharmos saldo; precisamos decidir: abortar o débito e marcar o job para alerta? Ou gravar só o alerta?
- Indicação: estoque rígido, auditoria contábil.

### Opção B — Clamp silencioso (comportamento atual)
```
newQty = max(0, current - qty)  → UPDATE + INSERT OUT completo, sem erro
```
- ✅ Nunca bloqueia a produção.
- ❌ Registra saída de estoque que NÃO EXISTIA → `saldo ≠ Σ transações` (reconciliação quebrada, débito fantasma).
- Indicação: apenas se não houver exigência de precisão do histórico.

### Opção C — Clamp + alerta (recomendada como padrão)
```
newQty = max(0, current - qty)
INSERT OUT com quantity REAL (débito pedido)
INSERT OUT ajuste "fantasma" separado OU marcar balance_after=0
dispara ALERTA "débito sem saldo suficiente"
```
- ✅ Não bloqueia produção (agentes seguem trabalhando).
- ✅ Mantém o histórico fiel (registra o que foi pedido e o que foi coberto).
- ✅ Visibilidade: o débito no vermelho vira um problema visível, não silencioso.
- Indicação: gráfica em operação contínua que quer auditoria + produtividade.

> **No GraficaOS hoje:** é a **Opção B**. A recomendação para o trabalho de estudo é **C** (ou A se a auditoria for rígida). A escolha deve ser **uma setting** (`stock.negative-policy`) com default C, sem reescrever agente.

### Como fica no pseudocódigo

```
switch (policy):
  'fails-fast':  UPDATE condicional + se rowsAffected=0 → throw/erro 409, sem transação
  'clamp'     :  newQty = max(0, current - qty)  (registra OUT total, sem aviso)
  'clamp+alert': newQty = max(0, current - qty);
                 se current < qty → gerar notificação "débito sem saldo suficiente"
```

---

## 6. Idempotência e dedupe

### Hoje (frágil)
- Dedupe de jobs: UNIQUE `print_jobs.job_id` (HP/Konica) e UNIQUE `mimaki_jobs.folder_timestamp` (Mimaki) — bom.
- Idempotência de débito: `reason LIKE '%jobName%'` — **quebrável** por `%`/`_` no nome do job e por nome duplicado em itens diferentes; e **ausente** nas tintas Mimaki.

### Proposto (robusto)
1. **`source_ref` UNIQUE em `stock_transactions`** (item_id + source + source_ref). O agente passa `source_ref = print_job.job_id` (que já é UNIQUE no `print_jobs`). Repetição → `duplicated: true`, sem re-debito.
2. **A ordem de gravação passa a ser:** débito → transação com `stock_deducted=true`, tudo possivelmente na mesma transação SQL. Se cair no meio, `sync-stock` reprocessa porque a transação de estoque (source_ref) ainda não existe — **auto-recuperável**.
3. Manter UNIQUE de jobs como está (primeira barreira), `source_ref` como segunda.

### Aviso do LIKE
Substituir todos `like(reason, ...)` por consulta por `source_ref` igualdade. Se não houver migração imediata, contornar escapando `%`/`_` — mas é paliativo.

---

## 7. Casos de borda

| # | Caso | Hoje | Proposto |
|---|---|---|---|
| 1 | Débito maior que o saldo | zera silenciosamente e registra OUT total (saldo ≠ história) | política fails-fast OU clamp+alerta |
| 2 | Dois agentes/abas debitando o mesmo item ao mesmo tempo | corrida SELECT→UPDATE pode perder atualização (débito duplicado/ perdido) | UPDATE atômico condicional + transação; otimistic locking p/ edição |
| 3 | Re-sync `sync-stock` | HP re-debita se reason não casa; Konica usa deductor HP (errado: não debita papel) | `source_ref`; sync-stock escolhe o deductor da máquina certa |
| 4 | `bind-material` repetido (Mimaki) | **tintas débitam 2x** | `source_ref` por canal de tinta cobre o caso |
| 5 | Job sem item correspondente (nome fora da convenção) | warn só na Konica; HP/Mimaki silenciam | sempre warn/alerta; prover tela "resolver vínculo" |
| 6 | Alterar `media_type` de job já debitado | recalcula campos de auditoria (ok) mas não estorna | recalcular e gravar transação compensatória |
| 7 | Criar item / `add-roll` com saldo inicial | sem transação (histórico incompleto) | gerar transação IN de abertura |
| 8 | `PUT currentQuantity` direto | sobrescreve saldo sem histórico | transformar em ADJUSTMENT registrado |
| 9 | `DELETE` de item com histórico | erro 500 (FK no action) | bloquear com 409 ou oferecer "ocultar/arquivar" |
| 10 | Toner Konica | não é debitado (telemetria % apenas) | manter como está, documentar |
| 11 | Item sem `width` na HP | debita m² direto (com warn) | tratar largura como obrigatório em PAPER_MEDIA na criação, OU usar o vínculo padrão da máquina |
| 12 | Fallback de ator `'system'` (Mimaki) | `userId` pode não existir em `users` (só funciona pq FK de user_id foi removida) | usar sistema de atores de agente (`mimaki-agent-system`) via `ensureSystemUser`, igual HP/Konica |

---

## 8. Plano de implementação em fases

### Fase 1 — Críticas (correção de risco)
1. Criar serviço unificado de débito com **transação SQL** (UPDATE condicional + INSERT na mesma transação).
2. Aplicar **política de saldo negativo** (default: clamp+alerta; opção fails-fast em setting).
3. Adicionar **`source_ref`** em `stock_transactions` e usá-lo na idempotência dos 3 agentes (substituindo `LIKE`).
4. Corrigir **idempotência das tintas Mimaki**.
5. **CHECK `current_quantity >= 0`** no banco (defesa em profundidade, mesmo com clamp).

### Fase 2 — Schema e auditoria
6. Unificar as duas migrations `0008*`; alinhar FK `mimaki_jobs.stock_item_id` (no action vs set null).
7. `PUT currentQuantity` → vira ADJUSTMENT com transação; `add-roll`/criação geram transação IN de abertura.
8. Corrigir `sync-stock` para usar o deductor da máquina correta (Konica).
9. `DELETE /api/stock-items/:id` → 409 quando houver histórico (ou soft-delete/arquivamento).

### Fase 3 — Robustez e evolução
10. `balance_before`/`balance_after` nas transações + reconciliação periódica (job que compara saldo × Σ transações).
11. Otimistic locking (`version`/`updated_at`) para edições concorrentes de itens.
12. Centralizar `computeStatus` (hoje duplicado em 4 lugares) num único helper.
13. Unificar matchers e melhorar tela de resolução de vínculos (job ↔ item).

---

## 9. Checklist de validação

- [ ] Débito atômico (transação) nas rotas manual, HP, Konica e Mimaki.
- [ ] Política de saldo negativo configurável e aplicada em todos os fluxos.
- [ ] `source_ref` único impede débito duplicado (re-sync, bind repetido, concorrência).
- [ ] `sync-stock` usa o agente correto por máquina.
- [ ] Migrations unificadas; CHECK de saldo aplicado.
- [ ] Criação/atualização de item registra movimentação.
- [ ] DELETE de item com histórico retorna erro tratado (409).
- [ ] `saldo item = Σ IN − Σ OUT` reconciliado (se política diferente de clamp).
- [ ] Alertas de estoque continuam anti-spam (transição de estado).
- [ ] Relatórios de consumo (m², ml, cc, folhas, m) intactos.