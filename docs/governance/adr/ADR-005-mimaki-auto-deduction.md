# ADR-005 — Dedução Automática de Mídia Mimaki

- **Status:** Aprovado (com ressalva — ver BR-008/ADR-007)
- **Data:** (anterior à reorganização de 2026-09-12)
- **Owner:** Felipe
- **Domínio:** deduction / integrations
- **Links:** cita **BR-012**; contrato completo em `docs/integrations/MIMAKI.md`
- **Fonte original:** `docs/07_TECHNICAL_DECISIONS_ADR_RFC.md` (arquivado)

## Contexto
Jobs Mimaki precisam deduzir automaticamente a mídia consumida do estoque.

## Decisão
Ao receber job via M2M, o backend calcula `length_meters = (height_mm × pages × quantity_units) / 1000` (na implementação atual: `height_mm × total_prints / 1000`) e busca material por nome na tabela `stock_items`. Se encontrado, deduz automaticamente (transação OUT). Se não encontrado, marca como `PENDING_BIND` e notifica via Socket.IO.

## Consequências
- Automação da redução manual de estoque; vinculação manual para materiais não identificados; transações registradas com reason "Mimaki auto-deduction" ou "Mimaki manual bind".
- **Ressalva:** a idempotência por `reason LIKE` é frágil — Alvo: `source_ref` (ADR-007, BR-008).