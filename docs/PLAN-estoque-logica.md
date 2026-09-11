# PLAN — Lógica de Estoque do Sistema (análise + melhorias)

> Modo: EXPLICAÇÃO/PLANEJAMENTO (sem código)
> Objetivo: documentar como o estoque é salvo, como ocorre o débito automático e quais regras de negócio se aplicam; listar riscos e passos de ação.

---

## 1. Resumo do Sistema

- **Stack:** Next.js (frontend) + Fastify (backend) + Drizzle ORM sobre SQLite/libSQL/Turso (`grafica-app/backend/src/db/index.ts`).
- **Migrations:** `grafica-app/backend/drizzle/*.sql` (0000–0009).
- **Sem módulo de vendas/POS**: o débito é disparado por **jobs de impressão reais** (HP Latex, Konica, Mimaki) ou **baixa manual**.
- **Sem custo/preço**: estoque é controlado apenas por quantidade/unidade (não é valorizado).

---

## 2. Como o material/insumo é salvo

### Tabela `stock_items` — `grafica-app/backend/src/db/schema.ts:27-41`
| Campo | Tipo/Enum |
|---|---|
| `id` | text PK (UUID) |
| `name` | text (SKU por convenção, ex.: `hp_tinta-cyan`) |
| `category` | enum `PAPER_MEDIA \| INK_SUPPLY \| OTHER` |
| `sub_type` | text (Bobina, Cartucho, Cut-sheet…) |
| `unit` | text (`m`, `fls`, `ml`, `L` na API; `rms/pk/bl` no conversor Konica) |
| `width` | real (largura da bobina em m) |
| `code`, `label` | text (`label` = rolo físico) |
| `current_quantity` | real default 0 |
| `min_quantity` | real default 0 (estoque mínimo) |
| `status` | enum derivado `AVAILABLE \| LOW_STOCK \| OUT_OF_STOCK` |

### Fluxo de cadastro/atualização — `grafica-app/backend/src/routes/stock.ts`
- `POST /api/stock-items` (linha 122): cria item (exige ADMIN/DEV_MASTER). Saldo inicial NÃO gera transação de histórico.
- `PUT /api/stock-items/:id` (linha 186): atualiza e recalcula status; pode sobrescrever `current_quantity` SEM gerar transação.
- `POST /api/stock-items/:id/add-roll` (linha 289): duplica item/rolo (copia saldo, sem transação IN).
- `PATCH /api/stock-items/:id/machines` (linha 252): vínculo N:N `machine_items`.
- `DELETE /api/stock-items/:id` (linha 231): só DEV_MASTER; não trata violação de FK → erro 500 com histórico existente.

### Tabela de movimentações — `stock_transactions` — `schema.ts:58-72`
- `type` enum `IN \| OUT \| ADJUSTMENT`, `quantity` real, `reason` texto livre, `user_id`/`user_name` (usuário real ou `system`/`hp-agent-system`/`konica-agent-system`).
- `reason` não é estruturado — rastreabilidade até o job é feita por string (`reason LIKE '%jobName%'`).
- Não há `balance_after` (saldo pós-movimentação).

---

## 3. Débito automático — como funciona

**Não há triggers/stored procedures no banco.** Todo débito é na camada de aplicação, em read-modify-write **sem transação SQL** (proteção é por idempotência lógica).

| Mecanismo | Local | Evento |
|---|---|---|
| Polling HP Latex (60s) | `agents/hp-latex/index.ts:105` + `stock-deductor.ts:123-270` | Job novo no `accounting.xls` |
| Polling Konica (30s) | `agents/konica/index.ts:143` + `stock-deductor.ts:129-233` | Job novo no PrintManager |
| Webhook M2M Mimaki | `routes/mimaki.ts:352` (fila em `lib/mimaki-queue.ts`) | POST de job + `deductMimakiStockForJob` (`mimaki.ts:39-180`) |
| Sincronização manual | `routes/jobs.ts:219` e `routes/mimaki.ts:558` | Reexecuta débitos pendentes (flag `stock_deducted=false`) |
| Baixa manual | `routes/stock.ts:366` | Operador |

Resumo dos débitos:
1. **HP**: tinta por SKU exato (`INK_COLOR_MAP`), mídia por nome normalizado + largura; converte **m² → m linear** (`divideAreaToLength`, big.js). Audita `roll_width_used`/`linear_meters_debited` no `print_jobs`.
2. **Konica**: papel por folhas com fator de unidade (`fls:1, rms:500, pk:50, bl:2500`) e `Math.floor`; **toner não é debitado** (`TONER_EXPOSED=false`) — só contador de páginas.
3. **Mimaki**: substrato em **m linear** (`height_mm × prints / 1000`) + tintas UV por nome contendo `uv`+cor (débito em cc).

Padrão (ex.: `stock.ts:405-414`): `SELECT` do item → calcula `newQty` → `UPDATE stock_items` → `INSERT stock_transactions` (por fora). **Se o processo cair entre o UPDATE e o INSERT, o histórico fica difuso.**

---

## 4. Regras de negócio aplicadas

1. **Saldo negativo proibido por clamp silencioso** — `Math.max(0, ...)` em todos os fluxos. O débito maior que o saldo **não bloqueia**: zera o saldo, registra a transação OUT inteira e marca o job como debitado. **Não há `CHECK (current_quantity >= 0)` no schema.**
2. **Bloqueio de produção sem estoque: não existe** — os agentes não consultam saldo antes de produzir. Frontend só desabilita "Dar Baixa" com saldo 0 (UX, `estoque/page.tsx:174`).
3. **Toda alteração deveria logar transação** — exceções: `PUT currentQuantity` direto e `add-roll` (duplicam saldo sem transação).
4. **`ADJUSTMENT` define quantidade absoluta** (`newQty = quantity`) e exige ADMIN/DEV_MASTER; `IN`/`OUT` são relativos e liberados para OPERATOR.
5. **Status derivado** (`computeStatus`, duplicado em 4 lugares): `<=0 → OUT_OF_STOCK`; `<= minQuantity → LOW_STOCK`; senão `AVAILABLE`.
6. **Alertas com anti-spam** — `dispatchStockAlert` (`lib/notification-resend.ts:23-91`): só reenvia WhatsApp se não houver alerta pendente do mesmo item+status; batching/debounce 3,5s.
7. **Precisão decimal** com big.js (`lib/math.ts`) nas conversões m²→m e subtrações.
8. **Dedupe de jobs por UNIQUE** (`print_jobs.job_id`, `mimaki_jobs.folder_timestamp`) + idempotência parcial por `reason LIKE %jobName%`.

---

## 5. Riscos identificados (priorizados)

1. **Sem transação SQL no débito** — corrida read-modify-write pode duplicar/perder débito em concorrência.
2. **Clamp silencioso** — débito no vermelho não falha e corrompe a reconciliação saldo × Σ transações.
3. **Tintas Mimaki sem idempotência** — `bind-material`/`sync-stock` repetidos debitam tintas de novo.
4. **Recuperação Konica imperfeita** — job inserido antes do débito + `sync-stock` usa o deductor HP (não debita papel Konica) → débito pendente para sempre.
5. **Drift schema × migrations** — `user_id` NOT NULL+FK (0000) → nullable sem FK (0008); dois arquivos `0008*`; FK Mimaki `no action` vs `set null`.
6. **Trilha de auditoria contornável** — `PUT currentQuantity` e `add-roll` sem transação; `DELETE` de item com histórico → 500.
7. **Matchers por nome são heurísticos** — item fora da convenção silencia o agente e não debita.

---

## 6. Tarefas propostas (quando implementar)

| # | Tarefa | Área | Prioridade |
|---|---|---|---|
| 1 | Envolver cada débito em `db.transaction()` e usar `UPDATE ... WHERE current_quantity >= ?` checando `rowsAffected` (fails-fast em vez de clamp) | Backend (todos os 4 fluxos) | Alta |
| 2 | Adicionar `CHECK (current_quantity >= 0)` via migration | DB | Alta |
| 3 | Idempotência por chave dedicada (`source_ref` unique em `stock_transactions`) em vez de `LIKE` no `reason` | DB + Backend | Alta |
| 4 | Corrigir idempotência das tintas Mimaki | Backend | Alta |
| 5 | Unificar migrations 0008* e alinhar FK `mimaki_jobs.stock_item_id` | DB | Média |
| 6 | Fazer `PUT currentQuantity` e `add-roll` gerarem transações de registro | Backend | Média |
| 7 | Corrigir `sync-stock` para usar o deductor da máquina correta (Konica) | Backend | Média |
| 8 | Tratar FK no `DELETE /api/stock-items/:id` (400/409 em vez de 500) | Backend | Baixa |
| 9 | Adicionar `balance_after` e `unit_price` nas transações (se valorização for desejada) | DB + Backend | Baixa |
| 10 | Otimistic locking com `version`/`updated_at` para concorrência no Turso (sem `SELECT FOR UPDATE`) | Backend + DB | Baixa |

---

## 7. Estratégia de implementação sugerida

1. **Fase 1 — Correções críticas (Riscos 1–4):** transação + fails-fast, idempotência das tintas Mimaki, fix `sync-stock` Konica.
2. **Fase 2 — Schema (Riscos 5–6):** migração com CHECK + `source_ref` + unificação 0008 + transações de auditoria no PUT/add-roll.
3. **Fase 3 — Robustez (Riscos 7, itens 9–10):** melhorar matchers, `balance_after`, otimistic locking, orquestração de alertas.

---

## 8. Checklist de verificação

- [ ] Débito atômico (transação) aprovado em todos os 4 fluxos.
- [ ] Débito acima do saldo NÃO zera silenciosamente (gerar erro ou alerta).
- [ ] Tintas Mimaki não duplicam em re-execuções.
- [ ] `sync-stock` Konica recupera débitos pendentes corretamente.
- [ ] Migrations unificadas e consistentes (0008/0009).
- [ ] `PUT`/`add-roll` registram movimentações.
- [ ] `DELETE` de item com histórico retorna erro tratado.
- [ ] Relatório de consumo físico permanece íntegro (m², ml, cc, folhas, m).