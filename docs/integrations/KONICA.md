# Integração Konica C3070 / AccurioPrint — GraficaOS

> **Status:** ATIVA (INT-003) · **Consolida:** `docs/KONICA_PRINTMANAGER_DATA_MAP.md` (vira probe em `data-maps/`), `docs/PLAN-konica-printmanager.md`, `docs/PLAN-konica-toner-delete-accurio.md`, `docs/PLAN-chat-ai-accurio.md` — arquivados.

## 1. Visão geral

Agente interno (`agents/konica/`) faz polling no **PrintManager / AccurioPrint**:
- **`register.fcgi`** → sessão; container de jobs finalizados `268435444` (`KONICA_FINISHED_CONTAINER`).
- **device-info** → toner %, bandejas, waste toner.

Frequência: **30s** (`KONICA_POLL_INTERVAL_MS`), circuit breaker (5 falhas → pausa 600s), backoff `[15,30,60,120,300]s`.

## 2. Fluxo de débito de papel (BR-013)

```
1. poll → parser → detecta jobs novos (UNIQUE job_id)
2. se job.paperName e sheets > 0:
   item = findPaperItem(rows, paperName, gram)   // tokens normalizados (sem acento/separador)
                                                 // prioriza gramatura citada e tamanho (A4>A3>33x48)
   sheetsUsed = floor(sheets)
   factor     = CONVERSION_FACTOR_BY_UNIT[item.unit] ?? 1   // fls:1, rms:500, pk:50, bl:2500
   debitQty   = factor > 1 ? floor(sheetsUsed / factor) : sheetsUsed
   newQty     = max(0, current - debitQty)
   → OUT + INSERT stock_transactions
3. senão → console.warn (não debita)  // dependente da convenção de nome
```

## 3. Toner — telemetria, NÃO débito (BR-013)

O PrintManager **não expõe consumo por job**. Toner é controlado por **nível %** (telemetria) + estimativa por contador de páginas:

- `konica_toner_capacity_pages` (default 20000) e `konica_toner_pages_printed` em `telemetry-store.ts`.
- `konica_toner_capacity_grams` (default 300) em `device-info.ts`.
- ⚠️ **Drift:** duas interpretações (páginas vs gramas) com chaves distintas — decisão pendente (ADR-011/013 futuro).

As **tintas/toner não são debitadas** — apenas alerta quando nível baixo (não é alerta de estoque com `current_quantity`).

## 4. Re-sync

`sync-stock` de máquinas Konica deve usar o **deductor de papel da Konica**, não o da HP (estudo caso 3). 

## 5. Lacunas e direção

1. Matcher por tokens/nome é frágil → vínculo explícito + config (BR-010/BR-021).
2. Datas epoch com guarda de ~11h de futuro (parse). 
3. `findPaperItem` não encontra → **warn** (débito não silencioso — BR-014).
4. Trocar scraping fcgi pela API oficial Konica/bizhub cloud (INT-107, P2).

> Probe bruto dos campos observados: `docs/integrations/data-maps/KONICA_printmanager_probe.md`.