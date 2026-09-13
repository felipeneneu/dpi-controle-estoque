# ADR-007 — Idempotência de Débito via `source_ref` (fim do `LIKE` em `reason`)

- **Status:** Proposto
- **Data:** 2026-09-12
- **Owner:** Felipe
- **Domínio:** deduction / ledger
- **Links:** cita **BR-008**, **BR-012**; afeta arquivos: `grafica-app/backend/src/db/schema.ts` (`stock_transactions`), `grafica-app/backend/src/routes/mimaki.ts`, agentes HP/Konica
- **Base conceitual:** `docs/ESTOQUE-LOGICA-ALGORITMO.md §6` (agora em `_archive/`)

## Contexto

A idempotência de débito hoje usa `reason LIKE '%jobName%'` (mimaki.ts / agentes). Isso é frágil: nomes de job contendo `%`/`_` quebram o `LIKE`; o mesmo nome em itens diferentes confunde; e **as tintas UV Mimaki não têm idempotência nenhuma** — um `bind-material` repetido débito as tintas 2×. Jobs já são deduplicados por `UNIQUE job_id`/`folder_timestamp`, mas o débito de estoque precisa de barreira própria.

## Decisão

Adicionar em `stock_transactions` os campos:

- `source` (quem disparou): `HP_AGENT | KONICA_AGENT | MIMAKI_AGENT | MANUAL | SYSTEM`
- `source_ref` (causa estruturada): ex.: `job_id` do job — usado como chave.

Com **índice único** `UNIQUE (item_id, source, source_ref)`. Repetição não débito de novo (idempotente), retornando `duplicated: true`. Remover progressivamente a verificação via `LIKE`. No caso Mimaki, cada canal de tinta usa `source_ref` distinto (ex.: `jobId#uv-cyan`).

## Consequências

- **Positivas:** idempotência à prova de caracteres especiais; cobre re-sync, bind repetido e concorrência; barreira extra além do UNIQUE de jobs.
- **Negativas:** requer migração do schema e atualização dos 3 agentes + rota manual; transações antigas de oportunidade (sem `source_ref`) seguem auditáveis mas sem dedupe estruturado.
- **Migração:** coluna adicionada como opcional primeiro; novos fluxos sempre preenchem.

## Verificação

Testes BR-008/BR-012: débito duplicado não altera saldo; `bind-material` repetido não debita tintas 2×; `sync-stock` reprocessa apenas quando o `source_ref` não existe.