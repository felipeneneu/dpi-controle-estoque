# ADR-004 — Respostas do Bot como DM (Privacidade)

- **Status:** Aprovado
- **Data:** (anterior à reorganização de 2026-09-12)
- **Owner:** Felipe
- **Domínio:** chat / privacy
- **Links:** cita **BR-020**
- **Fonte original:** `docs/07_TECHNICAL_DECISIONS_ADR_RFC.md` (arquivado)

## Contexto
Comandos do bot (`/help`, `/status`, `/estoque`, `/jobs`, `/alertas`) retornam informações que podem ser sensíveis (níveis de estoque, status de máquinas).

## Decisão
Respostas do bot são armazenadas em sala `dm:system:<userId>` e emitidas via Socket.IO apenas para o remetente (`user:<userId>`), não para a sala original.

## Consequências
- Privacidade: informações de estoque não são expostas publicamente.
- UX: usuário vê resposta em DM separada da conversa da sala.
- Auditoria: mensagens ficam registradas no banco com remetente `system`.