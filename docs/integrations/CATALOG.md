# Catálogo de Integrações — GraficaOS (INT-###)

> **Versão:** 1.0.0 · **Última atualização:** 2026-09-12 · **Owner:** Felipe
> **Status de escopo (D3):** este catálogo **mapeia e prioriza** — não compromete nenhuma implementação.
> **Decisão de prioridade:** **lente estoque-correto** (integração cuja ausência causa débito fantasma/livre drift ganha +1) e **lente config-empresa** (integração que valida BR-021 ganha +1).

---

## 1. Schema da tabela

`INT-id | Nome | Tipo (in/out/bi) | Gatilho | Contrato de dados | Estado | Risco | Esforço (S/M/L) | Valor (H/M/L) | RICE-lite | Prioridade`

- **RICE-lite** (escala 1–5): `Score = (Reach × Impact × Confidence) / Effort`. Reach = nº empresas/usuários; Impact = por usuário; Confidence = 0,5–1,0; Effort = 1(baixo)–5(alto). Se `Confidence < 0,3` → `parked`.
- **Estado:** `prod` (em produção) · `mock` (stub) · `meta` (só data-map/descoberta) · `planned` · `wishlist` · `parked`.

## 2. Integrações ativas

| ID | Nome | Tipo | Gatilho | Contrato | Estado | Risco | Esf | Val | RICE | Prio |
|----|------|------|---------|----------|--------|-------|-----|-----|------|------|
| INT-001 | Mimaki UCJV300-75 / Tracker | in | webhook M2M + fila | `docs/integrations/MIMAKI.md` | prod (gap: idempotência tintas) | crítico | L | H | 3.0 | **P0** |
| INT-002 | HP Latex 330 (EWS `accounting.xls`) | in | poll 60s | `docs/integrations/HP_LATEX.md` | prod | crítico | M | H | 3.5 | **P0** |
| INT-003 | Konica C3070 / PrintManager | in | poll 30s + deviceInfo | `docs/integrations/KONICA.md` | prod | crítico | M | H | 3.5 | **P0** |
| INT-004 | WhatsApp (Baileys) | out | eventos de estoque | `docs/integrations/WHATSAPP.md` | prod (risco Meta) | médio | M | H | 3.2 | **P0** |
| INT-005 | Chat interno (Socket.IO) | bi | realtime rooms | `architecture/LLD.md` | prod | baixo | M | M | 2.5 | P0 |
| INT-006 | Turso LibSQL sync | bi | réplicas embarcadas | `governance/adr/ADR-001-turso-embedded-replicas.md` + `ops/INFRASTRUCTURE.md` | prod | alto | M | H | 3.0 | P0 |

## 3. Candidatas (priorizadas)

| ID | Nome | Tipo | Gatilho | Estado | Esf | Val | RICE | Prio | Observação |
|----|------|------|---------|--------|-----|-----|------|------|-------------|
| INT-101 | WhatsApp Business API (oficial) | out | idem INT-004 | planned | L | H | 2.6 | **P1** | remove risco de ban Meta; custo por conversa |
| INT-102 | ERP — Bling / Omie / Tiny | bi | pedidos de compra → IN; master de produtos; push de estoque | meta→planned | L | H | 2.4 | **P1** | respeitar BR-005/BR-006; escolher 1º (Bling comum no BR) |
| INT-103 | RFID / barcode (bobina física) | in | scan de rolo | planned | M | H | 2.8 | **P1** | enabler de BR-002/ADR-009 (localização/estado) |
| INT-104 | E-mail (SMTP) | out | alertas/relatórios | planned | S | M | 3.4 | **P1** | canal barato, independente de WhatsApp |
| INT-105 | BI / export (CSV/Parquet + Metabase) | out | cron night + API | planned | S | M | 3.2 | **P1** | relatórios já existem (`routes/reports.ts`) |
| INT-106 | HP Latex API oficial (JetAdvantage/CyberSecurity) | in/telemetria | poll | meta→planned | M | M | 2.0 | **P2** | substitui scraping EWS frágil |
| INT-107 | Konica OpenAPI / bizhub cloud | in | poll | meta→planned | M | M | 2.0 | **P2** | substitui fcgi; toner por job quando OEM expuser |
| INT-108 | Mimaki PDS / PrintServer API | in | poll/webhook | meta→planned | M | M | 2.0 | **P2** | traria largura → dedução width-aware |
| INT-109 | NF-e / NFC-e | out | venda/saída | wishlist | M | M | 1.6 | **P2** | exige CNPJ/regime — briga com BR-021 (config empresa) |
| INT-110 | Contabilidade (GL) | out | mensal | wishlist | M | M | 1.2 | **P2** | requer custo/unidade (hoje não-objetivo) |
| INT-111 | Marketplace / e-commerce | bi | venda online | wishlist | L | L | 0.8 | **parked** | só p/ gráficas que revendem |

## 4. Análise RICE-lite (resumo das 3 priorizadas P1)

| | INT-101 WA-Business | INT-102 ERP | INT-103 RFID |
|---|---|---|---|
| Reach | 5 (todas as empresas) | 4 (com ERP) | 4 (operam bobina) |
| Impact | 4 (entrega/confiança) | 5 (fiscal/estoque) | 4 (rastreabilidade física) |
| Confidence | 0.7 | 0.6 | 0.8 |
| Effort | 5 | 5 | 3 |
| Score | (5·4·0.7)/5=2.8 → corrigido 2.6 | 2.4 | 4·4·0.8/3=4.3 → 2.8 (escala) |

> Nota: valores da tabela §3 são os oficiais (RICE normalizada para a escala 1–5). Este quadro é só a dedução.

## 5. Gap health (o que dói hoje)

| Gap | Integração afetada | Ação recomendada |
|-----|--------------------|------------------|
| Idempotência de tinta UV Mimaki ausente (double-debit) | INT-001 | ADR-007 (source_ref) — **primeiro** |
| Reconciliação sem transação atômica | INT-001/002/003 | ADR-006/008 — junto do acima |
| WhatsApp Baileys = risco de ban | INT-004 | migração optativa p/ INT-101 quando volume justificar |
| Matchers frágeis por nome | INT-002/003 | vínculo explícito + config (BR-010) |

> Detalhes completos por integração nos arquivos `docs/integrations/MIMAKI.md`, `HP_LATEX.md`, `KONICA.md`, `WHATSAPP.md`.