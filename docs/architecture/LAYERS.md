# Camadas do GraficaOS — Mapa Clean-Architecture e Ledger hard-coded → config

> **Versão:** 1.0.0 · **Última atualização:** 2026-09-12 · **Owner:** Felipe
> **Propósito:** mapa de modularização para vender o produto como **deploy por empresa** (BR-021/ADR-009): eliminar acoplamento, centralizar regras puras e expor pontos de configuração. **Nenhuma mudança de código neste ciclo.**

---

## 1. Camadas-alvo

```
┌───────────────────────────────────────────────────────────────┐
│ UI (Next.js 16)                                               │
│   grafica-app\src\app\(dashboard)\* · components\* · lib\api  │
│   feature flags por empresa via /api/settings                 │
├───────────────────────────────────────────────────────────────┤
│ API / Transport (Fino)                                        │
│   grafica-app\backend\src\routes\*.ts → chamam o core;        │
│   sem lógica de negócio; Swagger; JWT/middleware; Socket.IO    │
├───────────────────────────────────────────────────────────────┤
│ Application services (orquestração)                           │
│   debit-stock.service · alert.service · reconciliation.service │
│   hoje ≈ lib\* + agents\*\stock-deductor (a extrair)          │
├───────────────────────────────────────────────────────────────┤
│ CORE DOMAIN (puro, sem db/fastify/socket)  ← alvo              │
│   inventory (SKU + target Bobina) · conversão · matchers ·     │
│   computeStatus · política de saldo negativo · regras engine   │
├───────────────────────────────────────────────────────────────┤
│ ADAPTERS (integrações)                                         │
│   printer-agents: hp-latex\* · konica\* · mimaki\*             │
│   messaging: whatsapp.ts (Baileys) → wa-business/telegram/...  │
│   inbound futuros: barcode/rfid · ERP · NF-e                   │
├───────────────────────────────────────────────────────────────┤
│ Company Config (por deploy)                                    │
│   catálogo · unidades/fatores · matchers · cores · políticas   │
│   espelhado em: settings · whatsapp_recipients · machine_items │
├───────────────────────────────────────────────────────────────┤
│ Persistence (Drizzle) — schema.ts · migrações — 1 DB/empresa  │
└───────────────────────────────────────────────────────────────┘
```

**Regra estrutural-chave:** o **core não importa `db`, `fastify` nem `socket.io`**. Hoje `agents/hp-latex/stock-deductor.ts` e `routes/mimaki.ts` misturam regra pura com side-effect — o alvo é separar (ver §3).

## 2. Mapeamento dos arquivos atuais → camada-alvo

| Camada | Arquivos existentes | Notas |
|--------|---------------------|-------|
| Core (puro, manter) | `src/lib/math.ts` | `divideAreaToLength`, `toPrecision`, `subtractStock`, `sumPrecise`, `multiplyPrecise` — já puros, testados (`lib/__tests__/math.test.ts`) |
| Core (extrair) | `agents/hp-latex/stock-deductor.ts` — matchers `findMediaItem`, `parseMediaWidthM`, `normalizeMediaName`, `INK_COLOR_MAP`, clamp/conversão | split: puro→core; side-effect→service |
| Core (extrair) | `agents/konica/stock-deductor.ts` — `findPaperItem`, `CONVERSION_FACTOR_BY_UNIT`, `sizeScore` | idem |
| Core (extrair) | `routes/mimaki.ts:212-216` (formula length), `:114-121` (canais UV) | partículas de regra |
| Services | `lib/notification-resend.ts` (anti-spam), `lib/mimaki-queue.ts` (concorrência), `lib/chat-commands.ts` | manter como orquestração |
| API/Transport | `routes/*.ts` (stock, machines, jobs, chat, auth, users, suppliers, notifications, whatsapp, reports, mimaki); `middleware/auth.ts`, `middleware/m2m-auth.ts`; `cors.ts`, `app.ts`, `server.ts` | manter fino |
| Adapters (impressoras) | `agents/hp-latex/{downloader,parser,job-detector,telemetry,telemetry-store,index}.ts`; `agents/konica/{fetcher,parser,job-detector,telemetry-store,device-info,index}.ts` | transporte/discovery do device; sem regra |
| Adapters (messaging) | `lib/whatsapp.ts` (Baileys, fila, humanização) | interface atual; canais futuros trocam atrás do adapter |
| Persistence | `db/schema.ts`, `db/index.ts`, `drizzle/*` | 1 DB/empresa |
| Config | `lib/settings.ts`, `seed.ts` | destino: settings tipadas + pacote de config por empresa |
| UI | `grafica-app/src/app/(dashboard)/*`, `components/*` | feature-flagged por empresa |

## 3. Wallet de hotspots de acoplamento (BR-*/status + ação)

| # | Hotspot | Onde | BR | Ação de modularização |
|---|---------|------|----|-----------------------|
| H1 | `computeStatus` duplicado (~4 locais) | `routes/stock.ts:79`, `routes/mimaki.ts:18`, deductors | BR-009/PARTIAL | extrair p/ core; 1 helper |
| H2 | Matchers por convenção de nome (normalize, largura, gramatura) | HP/Konica deductors | BR-010/BR-020/PARTIAL | core + config de matchers |
| H3 | Conversões já puras | `lib/math.ts` | BR-004 | manter; fatores → config |
| H4 | Agents dobram de biblioteca | `routes/jobs.ts` importa `deductStockForJob` do agente HP | — | mover p/ serviço `debit-stock` |
| H5 | `db` e socket singletons | `db/index.ts`, `app.io` | — | injeção de dependência |
| H6 | System-bot IDs duplicados | `routes/users.ts`, UI, agentes | — | config (`system.users`) |
| H7 | Contratos UI↔API sincronizados à mão | `lib/api.ts` ↔ rotas | — | Swagger snapshot + gerador |
| H8 | Débito read-modify-write sem transação | `stock.ts:408`, `mimaki.ts:77,141` | BR-006/BR-007/BR-008 | serviço unificado atômico (ADR-006..008) |
| H9 | `settings` stringly-typed | tabela `settings` | BR-021 | settings tipadas (SETTINGS_CATALOG) |
| H10 | Polling/limits hard-coded | `agents/hp-latex/index.ts:14-17`, `agents/konica/index.ts:14-16`, `lib/whatsapp.ts` | BR-021 | config por empresa |
| H11 | Cores/canais hard-coded (HP `INK_COLOR_MAP`, Mimaki UV, Konica toner) | deductors; `mimaki.ts:114-121` | BR-021 | binding config máquina→SKU |
| H12 | Fatores de conversão hard-coded | `konica/stock-deductor.ts` | BR-004/BR-021 | tabela `conversionFactors` em config |
| H13 | Categorias/unidades hard-coded | `routes/stock.ts:12-13`, `schema.ts:30` | BR-003/BR-004/BR-021 | catálogo por empresa |

## 4. Ledger hard-coded → config (por empresa)

Formato: *atual → configurado* · dono (chave tipada proposta).

| Atual (`file:line`) | Config proposta | Domínio |
|---------------------|-----------------|---------|
| `machines.technology` livre + env IP fixo (`hp-latex/index.ts:14`, `konica/index.ts:14`) | `machines.adapter-type` (hp-latex \| konica \| mimaki) | catálogo |
| Poll HP 60s (`hp-latex/index.ts:15`) | `agents.hp.pollIntervalMs` | ops |
| Poll Konica 30s (`konica/index.ts:15`) | `agents.konica.pollIntervalMs` | ops |
| Cores HP `INK_COLOR_MAP` (`hp/stock-deductor.ts:34-40` + telemetry) | `machines.hp.inkColorMap` (SKU→canal) | binding |
| Cores Konica toner (`konica/stock-deductor.ts:36-…`) | `machines.konica.tonerColorMap` | binding |
| `CONVERSION_FACTOR_BY_UNIT` (`konica/stock-deductor.ts:43`) | `catalog.units.conversionFactors` | unidades |
| Canais UV Mimaki + merge White1/2 Varnish1/2 (`mimaki.ts:114-121,134-138`) | `machines.mimaki.uvChannels` | binding |
| Categorias (`stock.ts:12`) e unidades (`schema.ts:32`) | `catalog.categories`, `catalog.units` | catálogo |
| `computeStatus` regras (`stock.ts:79-83`) | core único + shadow test | regra |
| Clamp negativo (`math.ts:33-36`, todos os sites) | `stock.negativePolicy` (BR-007/ADR-006) | regra |
| Batching 3,5s / digitação 1,8–3,5s / intervalo 5–8s (`whatsapp.ts`) | `messaging.whatsapp.humanization` | mensageria |
| Alertas estado-transição (`notification-resend.ts:37`) | `alerts.transitionOnly` | alertas |
| Ledger idempotência por `reason LIKE` (BR-008) | `stock.idempotency` = `source_ref` (ADR-007) | auditoria |
| `charts/relatórios` INK_COLORS rótulos (`routes/reports.ts`) | `catalog.inkLabels` | catálogo |
| System-bot IDs (duplicados em 3+ locais) | `system.users.botIds` | configuração |
| Lar boya default `1.52m` (`routes/jobs.ts:204`) | `catalog.media.defaultWidthM` | catálogo |

> Obs.: "Lar boya" acima refere-se ao fallback de largura de bobina 1,52 m (`routes/jobs.ts:204`) usado no recompute de metragem linear.