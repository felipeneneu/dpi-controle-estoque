# ADR-006 — Política de Saldo Negativo

- **Status:** Proposto
- **Data:** 2026-09-12
- **Owner:** Felipe
- **Domínio:** deduction / ledger
- **Links:** cita **BR-007**; afeta arquivos: `grafica-app/backend/src/routes/stock.ts`, `grafica-app/backend/src/routes/mimaki.ts`, `grafica-app/backend/src/agents/hp-latex/stock-deductor.ts`, `grafica-app/backend/src/agents/konica/stock-deductor.ts`, `grafica-app/backend/src/lib/math.ts`
- **Base conceitual:** `docs/ESTOQUE-LOGICA-ALGORITMO.md §5` (agora em `_archive/`)

## Contexto

Hoje todo débito de estoque (manual, HP, Konica, Mimaki) faz `newQty = Math.max(0, current − qty)` — **clamp silencioso** (BR-007/status atual). Isso registra a saída de um estoque que **não existia**, quebrando a reconciliação `saldo = Σ IN − Σ OUT` e criando "débito fantasma". Três opções foram avaliadas:

- **A — Fails-fast:** `UPDATE … WHERE current >= qty`; se `rowsAffected = 0` → erro 409, sem transação. Auditoria rígida, mas em produção um agente pode "quebrar" um job sem saldo.
- **B — Clamp silencioso (atual):** nunca bloqueia produção, mas corrompe o histórico.
- **C — Clamp + alerta (recomendado):** aplica o clamp, registra o OUT pedido e **dispara alerta** "débito sem saldo suficiente". Não bloqueia produção e torna o problema visível.

## Decisão

Adotar o comportamento **C — clamp + alerta** como padrão, implementado como uma **setting configurável** `stock.negative-policy` ∈ `fails-fast | clamp | clamp+alert` (default `clamp+alert`), aplicada em **todos** os fluxos (manual, HP, Konica, Mimaki) via o serviço unificado de débito (ver ADR-008). A opção B deixa de ser aceitável sem aviso.

## Consequências

- **Positivas:** produção continua; débito no vermelho vira problema visível; base para reconciliação.
- **Negativas:** exige centralizar todos os débitos em um só serviço (ADR-008) — custo de refactor.
- **Migração:** novos débitos já seguem o serviço; fluxos legados migram junto com ADR-008.

## Verificação

Testes que amarram BR-007: débito com saldo insuficiente em cada política; presença de alerta em `clamp+alert`; ausência de registro em `fails-fast`.