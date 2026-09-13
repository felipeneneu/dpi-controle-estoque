# Roadmap do Produto — GraficaOS

> **Versão:** 1.0.0 · **Status:** VIVO (revisado a cada ciclo) · **Owner:** Felipe · **Última atualização:** 2026-09-12
> **Consolida:** PRD + regras BR-017/P6 + fases do DOMAIN_MODEL (M1..M5).
> **Regra:** nada entra neste arquivo sem estar vinculado a BR-*/ADR-*/INT-* (P6).

---

## 1. Horizonte de produto (visão)

GraficaOS deixa de ser "a impressora da gráfica X" e vira **produto deploy-per-empresa**:
mesmo arquivo `graphicaos-desktop` roda por empresa com **identidade configurável** (BR-021),
sem multi-tenancy forçado no código (ADR-009/D2).

## 2. Fases

| Fase | O que entrega | Regras/ADRs | Horizonte |
|------|---------------|-------------|-----------|
| **M1 — Estabilidade financeira** (atual) | Estoque correto de hoje: saldo agregado sem débito fantasma; reconciliação | ADR-006/007/008; BR-001..BR-016 | ✅ pronta (gap: ADR-007 tinta) |
| **M2 — Config per-empresa** (próxima) | Settings/env por empresa (BR-021): IPs, conversões, alertas, matchers | BR-021; HOTSPOT H13 | Q3 2026 |
| **M3 — Produto multiuso** | RBAC refinado, multi-destinatário WA, integrações P1 (ERP/WA-Business/RFID) | INT-101/102/103; ADR-012 | Q4 2026 |
| **M4 — Modelo bobina-ativo** (target, não-ligado) | Rolos individuais com localização/estado; estoque = agregação | ADR-009 | Futuro (não comprometido) |
| **M5 — EMC** (Stretch) | Custo por job impulsionado por dados de integração | INT-110 | Futuro | 

## 3. Backlog priorizado (não-código até F-ciclos)

| # | Item | Origem | Prio |
|---|------|--------|------|
| 1 | Idempotência tinta UV (source_ref) | ADR-007 | P0 |
| 2 | Débito atômico (transação) | ADR-008 | P0 |
| 3 | Config de empresa (settings catalog completo) | BR-021 | P0 |
| 4 | Briefing agendado WhatsApp | BR-017 | P1 |
| 5 | WhatsApp Business API | INT-101/ADR-012 | P1 |
| 6 | Integração ERP | INT-102 | P1 |
| 7 | RFID/bobina | INT-103 | P1 |
| 8 | Reconciliação v2 (banco-oficial) | POR/ADR futuro | P1 |

> Cada item entra em planejamento como **RFC** (`docs/governance/rfc/`) antes de virar BR/ADR novo.