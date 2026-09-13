# Regras de Negócio Canônicas — GraficaOS (BR-001..BR-021)

> **Versão:** 1.0.0 · **Última atualização:** 2026-09-12 · **Owner:** Felipe / `DEV_MASTER` · **Aprovado por:** Felipe
> **Fonte da verdade:** as regras abaixo. O código pode estar atrasado em relação a elas (status `TARGET`/`PROPOSED`); quando divergem, **quem decide é esta tabela + uma ADR**.
> **Mudanças:** toda alteração de regra é registrada em `RULE_CHANGELOG.md` e vinculada a uma ADR (`governance/adr/`) — ver processo em `governance/README.md`.

---

## 0. Como ler e mudar este documento

- Leia `governance/README.md` (fluxo RFC → ADR → atualização de regra).
- Uma regra com status `IMPLEMENTED` **só** se mantém `IMPLEMENTED` se houver um teste que a prenda (convenção BR-* em `engineering/TESTING_STRATEGY.md`) OU verificação humana datada no changelog. Caso contrário, rebaixe para `PARTIAL`.
- Status: `IMPLEMENTED` = verdade no código · `PARTIAL` = parcialmente verdade · `TARGET` = intenção deliberada (destino de produto) · `PROPOSED` = aguardando ADR.

## 1. Glossário (resumo)

Termos completos em `GLOSSARY.md`. Essenciais: **SKU** (item `stock_items.name`), **Bobina** (rolo físico — hoje um item linear; no destino, ativo rastreável — BR-002), **Job/OS** (ordem de serviço de impressão), **Matcher** (heurística nome→item), **Vínculo** (ligação explícita máquina↔item via `machine_items`/`stockItemId`), **Dedução automática** (OUT dirigido por agente), **source_ref** (causa estruturada de uma movimentação — campo-alvo).

## 2. Registro canônico de regras

| ID | Domínio | Regra | Status | Fonte (evidência) | ADR | Interage com |
|----|---------|-------|--------|--------------------|-----|--------------|
| BR-001 | inventory | O estoque é gerenciado como **quantidade agregada por SKU** (uma linha `stock_items` = a soma daquele material) com unidades cientes (`m`, `fls`, `ml`, `L`). | IMPLEMENTED | `backend/src/db/schema.ts:27-41` | — | BR-002 |
| BR-002 | inventory/vision | Cada **bobina física é um ativo rastreável individual**: id por rolo, metros restantes, estado (em uso / em estoque / vazia / bloqueada / sucata) e localização. As somas por SKU passam a ser **derivadas** (Σ das bobinas). | PARTIAL | `schema.ts:98`; `backend/src/routes/stock.ts:133-149` | **ADR-009**, **ADR-013** | BR-001, BR-018, BR-019 |
| BR-003 | catalog | Categorias de material: `PAPER_MEDIA \| INK_SUPPLY \| OTHER`. | IMPLEMENTED | `backend/src/db/schema.ts:30` | — | BR-021 |
| BR-004 | catalog | Unidades `m \| fls \| ml \| L`; **conversões centralizadas** em `lib/math.ts` com **Big.js** (`DP=10`, half-up); arredondamento de `m/cc` em 3–4 casas e `folhas` via `floor`. | IMPLEMENTED | `backend/src/lib/math.ts:14,33,45,60,71` | — | BR-010..013 |
| BR-005 | ledger | Toda movimentação é um registro `stock_transactions` com `type IN \| OUT \| ADJUSTMENT`, `quantity` sempre positiva, ator (`user_id`/`user_name`) e motivo (`reason`). | IMPLEMENTED | `backend/src/db/schema.ts:58-72` | — | BR-006..008 |
| BR-006 | ledger | **Débito atômico**: a dedução usa `UPDATE … WHERE current >= qty` + INSERT da movimentação na **mesma transação SQL** (elimina corrida read-modify-write dos agentes). | TARGET (hoje sem transação) | `backend/src/routes/stock.ts:408-414`; estudo `ESTOQUE-LOGICA-ALGORITMO.md §4.2` | **ADR-008** | BR-007 |
| BR-007 | ledger | **Política de saldo negativo** configurável: `fails-fast` (bloqueia) \| `clamp` (atual) \| `clamp+alert` (padrão recomendado). Não deve haver débito fantasma silencioso. | TARGET (hoje `Math.max(0,…)` em 6+ locais) | `stock.ts:410`, `mimaki.ts:77,141,503` | **ADR-006** | BR-006 |
| BR-008 | deduction | **Idempotência por causa estruturada**: chave `UNIQUE (item_id, source, source_ref)`. Substituir idempotência via `reason LIKE '%jobName%'`. | TARGET (fragil hoje; ausente nas tintas Mimaki) | `backend/src/routes/mimaki.ts:64-73`; estudo §6 | **ADR-007** | BR-014 |
| BR-009 | inventory | **Status derivado** via `computeStatus(current, min)`: `≤0 → OUT_OF_STOCK`; `≤ min → LOW_STOCK`; senão `AVAILABLE`. Deve ser **um único helper compartilhado**. | PARTIAL (`computeStatus` duplicado: `stock.ts:79`, `mimaki.ts:18`, agentes) | `stock.ts:79-83`, `mimaki.ts:18-22` | — | BR-015 |
| BR-010 | binding | Vínculo explícito máquina↔item via `machine_items` (N:N, único `(machineId, stockItemId)`) e `mimaki_jobs.stock_item_id`. **Matchers por nome são fallback e nunca podem falhar em silêncio.** | PARTIAL (múltiplos matchers frágeis) | `schema.ts:43-56,260` | — | BR-014 |
| BR-011 | deduction | **HP Latex 330**: mídia `m = m² ÷ largura` (largura do item ou do nome; senão aviso); tinta em `ml` por SKU via `INK_COLOR_MAP`. | IMPLEMENTED | `backend/src/agents/hp-latex/stock-deductor.ts` | — | BR-004 |
| BR-012 | deduction | **Mimaki**: substrato `length_m = height_mm × total_prints ÷ 1000` (tracker não envia largura); tintas UV em `cc` por canal (nome contém `uv` + cor; White1/2 e Varnish1/2 compartilham item). | IMPLEMENTED (gap: idempotência tintas) | `backend/src/routes/mimaki.ts:212-216, 134-138` | **ADR-007** | BR-008 |
| BR-013 | deduction | **Konica**: papel `sheets → unidade` por fator (`fls=1, rms=500, pk=50, bl=2500`) com `floor`; **toner não é debitado por job** (telemetria de % + alerta). | IMPLEMENTED | `backend/src/agents/konica/stock-deductor.ts:140-144` | — | BR-004 |
| BR-014 | deduction | Ator do sistema por agente: `hp-agent-system`, `konica-agent-system`, `mimaki-agent-system`, `system` — validados na tabela `users` antes do débito. | PARTIAL (Mimaki usa `system`) | `studeo/estudo §7 caso 12`; `mimaki.ts:44-49` | — | BR-008 |
| BR-015 | alerts | **Alerta (notificação + WhatsApp) só na transição de estado** para `LOW_STOCK`/`OUT_OF_STOCK`; notificação pendente não reconhecida do mesmo item+alerta **suprime reenvio**. | IMPLEMENTED | `backend/src/lib/notification-resend.ts:23-91,37` | — | BR-009 |
| BR-016 | alerts | **WhatsApp humanizado**: batch de 3,5s, digitação 1,8–3,5s, intervalo 5–8s, dedupe de texto, destinatários multi (`whatsapp_recipients` principal/backup + grupo + fallback), prefixo `55` para BR. | IMPLEMENTED | `backend/src/lib/whatsapp.ts:284-378,204-233,86-93` | — | BR-015 |
| BR-017 | alerts | **Briefings agendados** (ex.: 07:35/17:30) via WhatsApp/Telegram. | PROPOSED (prometido no PRD, **não implementado**) | `docs/product/PRD.md` | — | BR-016 |
| BR-018 | rbac | Papéis `DEV_MASTER \| ADMIN \| OPERATOR` com autorização por rota (`authorize(roles)` + JWT 12h). `ADJUSTMENT` = ADMIN+/DEV_MASTER; exclusões/gestão de usuários = DEV_MASTER; IN/OUT = OPERATOR. M2M via `X-API-Secret`/Bearer (`MIMAKI_INTEGRATION_SECRET`). | IMPLEMENTED | `backend/src/middleware/auth.ts`, `m2m-auth.ts`; `stock.ts:401-403` | ADR-002/003 | — |
| BR-019 | machines/jobs | Ciclo de máquina `ACTIVE \| MAINTENANCE \| INACTIVE`; jobs idempotentes por `UNIQUE job_id` (HP/Konica) e `folder_timestamp` (Mimaki); ocultar job exige re-verificação de senha de ADMIN/DEV_MASTER **mantendo o débito de estoque**. | IMPLEMENTED | `schema.ts:15-25,173-266`; `backend/src/routes/jobs.ts:300-372` | — | BR-010 |
| BR-020 | chat | Respostas do bot (`help/status/estoque/jobs/alertas`) vão como **DM privada** (`dm:system:<id>` → `user:<id>`), nunca broadcast; cooldown por item (~30min) no alerta do chat. | IMPLEMENTED | `backend/src/lib/chat-commands.ts`; `agents/brain/index.ts` | ADR-004 | — |
| BR-021 | company-config | **Configuração por empresa**: catálogo, unidades, fatores de conversão, matchers, cores, políticas de alerta e flags moram em configuração/produto — nunca hard-coded. Novo deploy = pacote de config, não fork. | TARGET (hoje hard-coded nos 10 hotspots de `architecture/LAYERS.md`) | `architecture/LAYERS.md`, `architecture/SETTINGS_CATALOG.md` | **ADR-009** | Demais |

## 3. Invariantes globais

1. **Reconciliação (alvo):** saldo do item = Σ `IN` − Σ `OUT` do item (para política diferente de clamp). Status `PROPOSED` (BR-006) — ver estudo §4.1/§9.
2. **Nunca deletar herança de movimentação:** `stock_transactions.item_id` tem `ON DELETE` padrão (bloqueia delete de item com histórico). `DELETE` de item com histórico deve devolver erro tratado (409), não 500.
3. **Toda criação/edição de item registra movimentação** (alvo; hoje `PUT` sobrescreve e `add-roll` não gera transação — brechas documentadas na antiga `ESTOQUE-LOGICA-ALGORITMO.md §2.4`).

## 4. Não-objetivos (escopo travado)

- Sem venda/POS e sem precificação/custo (estoque só por quantidade/unidade).
- Sem toner por job na Konica (OEM não expõe).
- Sem briefing agendado implementado (BR-017) — decisão pendente.
- Sem WhatsApp Business API oficial ainda (ver INT-005/INT-107 em `integrations/CATALOG.md`).
- Sem multi-tenant SaaS: **single deploy por empresa** (BR-021 / ADR-009).

## 5. Fonte de evidência

- Schema: `D:\www\2026\felipe-neneu-portfolio\dpi-controle-estoque\grafica-app\backend\src\db\schema.ts`
- Débito manual: `…\backend\src\routes\stock.ts`
- Agentes: `…\backend\src\agents\hp-latex\stock-deductor.ts`, `…\agents\konica\stock-deductor.ts`
- Integrações: `…\routes\mimaki.ts`, `…\lib\mimaki-queue.ts`
- Alertas: `…\lib\notification-resend.ts`, `…\lib\whatsapp.ts`
- Testes existentes: `…\backend\src\lib\__tests__\math.test.ts` (BR-004), `e2e\specs\*`