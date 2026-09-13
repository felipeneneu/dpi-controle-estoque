# ADR-001 — Adoção do Turso (LibSQL) com Embedded Replicas

- **Status:** Aprovado
- **Data:** (anterior à reorganização de 2026-09-12)
- **Owner:** Felipe
- **Domínio:** ops / persistence
- **Fonte original:** `docs/07_TECHNICAL_DECISIONS_ADR_RFC.md` (arquivado)

## Contexto
A gráfica necessita de alta disponibilidade local. Se o link de internet falhar, a produção não pode parar.

## Decisão
Substituir o MySQL tradicional pelo Turso (LibSQL). Utilizar sincronização de réplica local `.db` nas máquinas para garantir leituras e escritas offline.

## Consequências
- Zero custos de servidor de banco na empresa; tolerância total a falhas de rede.
- Vínculo com BR-021 (deploy por empresa) e INT-007 (Turso LibSQL sync).