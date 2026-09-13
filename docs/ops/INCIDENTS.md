# Registro de Incidentes — GraficaOS

> **Versão:** 1.0.0 · **Status:** VIVO · **Owner:** Felipe · **Última atualização:** 2026-09-12
> **Regra:** incidente real grave pós-produção gera **RCA** (seção 2). Incidentes documentados
> antes da criação deste arquivo estão em `docs/_archive/` (ex.: `DIAG-hp-accounting.md`, `PLAN-*`).

---

## 1. DIAGs arquivados (contexto histórico)

| Diagnóstico | Resumo | Arquivo |
|-------------|--------|---------|
| DIAG-hp-accounting | jobs HP não faturavam/baixavam estoque por parser de `accounting.xls` | `docs/_archive/DIAG-hp-accounting.md` |
| PLAN-konica-toner-delete-accurio | duplicacoes de toner ao deletar/acurar jobs | `docs/_archive/PLAN-konica-toner-delete-accurio.md` |
| adr-007 (negativo fantasma) | débito fantasma nas tintas (razão paralela `reason LIKE`) | `docs/governance/adr/ADR-007-stock-idempotency-sourceref.md` |

## 2. RCA template (preencher em incidente novo)

```
# RCA #<n> — <título>
- Data: YYYY-MM-DD · Severidade: P1/P2/P3 · Afeta: <empresa>
- Sintoma: ...
- Causa raiz (5 whys): ...
- Impacto no estoque: (saldo afetado? reconciliação rodada?)
- Correção: (BR/ADR percentual, commit ref)
- Prevenção: (teste BR-*, monitor, docs:check)
```