# ADR-002 — Matriz RBAC para Proteção de Dados

- **Status:** Aprovado
- **Data:** (anterior à reorganização de 2026-09-12)
- **Owner:** Felipe
- **Domínio:** rbac
- **Links:** cita **BR-018**
- **Fonte original:** `docs/07_TECHNICAL_DECISIONS_ADR_RFC.md` (arquivado); detalhes em `docs/user-guides/RBAC.md`

## Contexto
Operadores de balcão ou produção podem alterar ou deletar itens por engano.

## Decisão
Implementar controle de acesso baseado em funções (`DEV_MASTER`, `ADMIN`, `OPERATOR`) validado por JWT nos endpoints da API e ocultado na UI.

## Consequências
- Menor risco de alteração indevida; permissão mínima por perfil; `ADJUSTMENT` restrito a ADMIN/DEV_MASTER (BR-018).