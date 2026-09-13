# ADR-008 — Débito Atômico: Transação SQL + `balance_before/after`

- **Status:** Proposto
- **Data:** 2026-09-12
- **Owner:** Felipe
- **Domínio:** ledger
- **Links:** cita **BR-006**, **BR-007**; afeta arquivos: `grafica-app/backend/src/db/schema.ts`, `grafica-app/backend/src/lib/math.ts`, todos os pontos de débito (`stock.ts`, `mimaki.ts`, deductors HP/Konica)
- **Base conceitual:** `docs/ESTOQUE-LOGICA-ALGORITMO.md §4` (agora em `_archive/`)

## Contexto

Nenhum débito usa transação SQL: todos seguem `SELECT → computa → UPDATE → INSERT` em `await`s individuais (SQLite serializa cada UPDATE, mas não o intervalo completo). Risco: dois agentes/abas debitando o mesmo item ao mesmo tempo perdem atualização; e o padrão "UPDATE ok, INSERT falhou" deixa histórico difuso. Não há `balance_before`/`balance_after`, impossibilitando reconciliação por leitura.

## Decisão

Criar um **serviço unificado de débito** (`debitStock`) usado por rota manual, HP, Konica e Mimaki, que:

1. Em **transação SQL** (`db.transaction`), faz `UPDATE stock_items SET current_quantity = current_quantity − qty, status = computeStatus(...) WHERE id = ?` — opcionalmente com a condição `AND current_quantity >= qty` quando a política for `fails-fast` (ADR-006).
2. Grava `stock_transactions` na mesma transação, agora com `balance_before` e `balance_after`.
3. Dispara efeitos colaterais fora da transação crítica (best-effort): alerta (ADR-006), evento Socket.IO `stock:updated`.

## Consequências

- **Positivas:** elimina corrida read-modify-write; histórico íntegro; base para a reconciliação `saldo = Σ IN − Σ OUT`; ajuda a corrigir o `reason LIKE` (ADR-007).
- **Negativas:** refactor de 4+ pontos de débito; atenção ao comportamento de `db.transaction` no LibSQL (embedded/lógico); testes de concorrência necessários.
- **Migração:** serviço novo primeiro; fluxos migram um a um; nenhuma alteração de comportamento antes da migração completa.

## Verificação

Testes BR-006: débito concorrente não perde atualização; transação parcial (falha no INSERT) não deixa saldo alterado; `balance_before/after` batem com a invariante de reconciliação.