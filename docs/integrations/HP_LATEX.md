# Integração HP Latex 330 — GraficaOS

> **Status:** ATIVA (INT-002) · **Consolida:** `docs/HP_LATEX_330_DATA_MAP.md` (vira probe em `data-maps/`), `docs/PLAN-hp-substrate-deduction.md`, `docs/PLAN-hp-info-discovery.md`, `docs/PLAN-hp-tintas-tabs-ux.md`, `docs/DIAG-hp-accounting.md`, `hp-agent-integration.md` (raiz) — arquivados.

## 1. Visão geral

Agente interno (`agents/hp-latex/`) faz polling no **HP Latex 330** via EWS:
- **`accounting.xls?cost=y`** — relatório de consumo por job (mídia m² + tinta ml por cor).
- **Status/supplies XML** — telemetria (níveis de tinta, temperatura de secagem/cura).

Frequência: **60s** (`HP_POLL_INTERVAL_MS`), backoff `[30,60,120,300,600]s`; `HP_AGENT_ENABLED` desliga.

## 2. Fluxo de débito (BR-011)

```
1. poll → parser (decimais pt-BR) → detecta jobs novos (UNIQUE job_id)
2. por canal de tinta: INK_COLOR_MAP [sku → campo] → find EXATO por name
   → idempotência reason LIKE %jobName% → OUT (ml), clamp max(0,…)
3. mídia: se mediaType e mediaAreaM2>0:
   widthM = parseMediaWidthM(jobName) ?? parseMediaWidthM(mediaType) ?? item.width
   debitQty = widthM ? areaM2 / widthM : areaM2        (divideAreaToLength, 3 casas)
   item = findMediaItem(rows, mediaType, widthHint)    (normalizar + priorizar largura)
   → OUT (m), clamp
4. marca stock_deducted=true; socket stock:deducted; alerta se LOW/OUT
```

- Conversões puras em `lib/math.ts` (Big.js). **Sem transação SQL** no read-modify-write (ADR-008).
- Tinta SKUs HP: `CZ683A`(C), `CZ685A`(Y), `CZ682A`(K), `CZ684A`(M), `CZ686A`(LC), `CZ687A`(LM), `CZ706A`(OP) — mapeamento de cores `telemetry.ts:34-40`. Itens de estoque seguem convenção `hp_tinta-<cor>`.

## 3. Telemetria

Campos em `machine_telemetry` (schema Drizzle): `ink*Ml`, `inkCapacityMl`, `mediaName/mediaWidthMm`, `dryingTempC/curingTempC`, `maintenanceCartridgePct`, `online`, `statusSeverity/Message`. Não gera débito — só exibição + alerta.

## 4. Re-sync

`POST /api/machines/:machineId/sync-stock` (routes/jobs.ts) reexecuta `deductStockForJob` para jobs `stock_deducted=false`. **Atenção (estudo):** `sync-stock` usa o deductor importado do agente HP para a máquina certa — comportamento correto quando usado com máquinas HP; para Konica o fluxo é outro (ver KONICA.md).

## 5. Lacunas e direção

1. Idempotência por `reason LIKE` → `source_ref` (ADR-007).
2. Largura ausente debita m² direto com `console.warn` — pedir largura em `PAPER_MEDIA` ou vínculo padrão da máquina (BR-021).
3. EWS scraping é frágil → API oficial HP (INT-106, P2).
4. Frequência/limites como config (BR-021).

> Probe bruto dos campos observados: `docs/integrations/data-maps/HP_EWS_accounting_probe.md`.