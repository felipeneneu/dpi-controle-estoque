# Integração Mimaki (M2M) — GraficaOS

> **Status:** ATIVA (INT-001) · **Gap conhecido:** idempotência de tintas UV ausente → ADR-007/BR-008.
> **Consolida o histórico:** `docs/14_MIMAKI_INTEGRATION.md`, `docs/PLAN-mimaki-integration.md`, `docs/PLAN-mimaki-jobs-fix.md`, `PLAN-MIMAKI-FIX.md` (raiz) — todos arquivados.
> **Código:** `grafica-app/backend/src/routes/mimaki.ts`, `lib/mimaki-queue.ts`, `middleware/m2m-auth.ts`.

---

## 1. Visão geral

O **Mimaki Tracker Electron** envia logs de impressão ao GraficaOS via REST M2M. A impressionadora é uma **Mimaki UCJV300-75** (doc antigo citava UJF-6042; validar com a máquina real — adapter por máquina em BR-021). O backend valida (Zod), enfileira (`mimaki-queue`), calcula consumo e débito.

```
Mimaki Tracker ──POST /api/integrations/mimaki/jobs──► Fastify
  x-api-secret | Bearer                    ├─ valida schema (zod)
                                            ├─ dedupe por folder_timestamp (UNIQUE)
                                            ├─ calcula length_meters
                                            ├─ matcher por raw_material_name → BOUND (débito) | PENDING_BIND
                                            └─ cores UV: matcher nome contém 'uv'+cor → OUT por canal
```

## 2. Autenticação M2M (ADR-003)

- Header `X-API-Secret: <secret>` **ou** `Authorization: Bearer <secret>`; variantes toleradas: `x-api-key`, `api-secret`, `apikey`.
- Secret de env `MIMAKI_INTEGRATION_SECRET` ou tabela `settings`.
- Endpoints M2M: `m2mAuth`; endpoints de vinculação/ajuste: JWT padrão (RBAC).

## 3. Endpoints principais

| Endpoint | Auth | Função |
|----------|------|--------|
| `POST /api/integrations/mimaki/jobs` | M2M | recebe job, processa em fila |
| `GET /api/integrations/mimaki/jobs` | JWT | lista jobs (filtros `status`, `machine_id`) |
| `POST /api/integrations/mimaki/jobs/:id/bind-material` | JWT | vincula `stock_item_id` a job `PENDING_BIND` |
| `PATCH /api/integrations/mimaki/jobs/:id` | JWT | ajusta metragem → transação compensatória IN/OUT |
| `POST /api/integrations/mimaki/sync-stock` | JWT | reprocessa jobs pendentes (+auto-bind por nome normalizado) |

## 4. Cálculo de consumo (BR-012)

```
length_meters = (height_mm × total_prints) / 1000      // mimaki.ts:212-216, toPrecision 3 casas
total_prints  = total_print ?? (pages × copies)        // copies = copy_number ?? copies ?? copy ?? 1
```

- **Substrato:** busca item por nome normalizado (lowercase, strip `[\s\-_,./()ºª]`, substring bidirecional). Débito OUT com clamp `max(0,…)` (`mimaki.ts:77`). Idempotência hoje via `reason LIKE %jobName%` (frágil → ADR-007).
- **Tintas UV:** 8 canais (C/M/Y/K/White1/White2/Varnish1/Varnish2); White1+White2 e Varnish1+Varnish2 compartilham o **mesmo** item de estoque; item achado por nome contendo `uv` + cor (`mimaki.ts:114-121,134-138`). **Sem idempotência** — `bind-material`/`sync-stock` repetidos debitam 2×.

## 5. Estado do material

| Status | Significado |
|--------|-------------|
| `BOUND` | material identificado + estoque deduzido |
| `PENDING_BIND` | não identificado — alerta `mimaki:unmatched_material` (socket, sala `estoque`) e vinculação manual |

## 6. Dados e fila

- Tabela `mimaki_jobs` (schema Drizzle): `folder_timestamp` **UNIQUE** (dedupe), `material_status`, `stock_item_id`, `stock_deducted`, `length_meters`, `ink_*_cc`, `width_mm/height_mm`, `raw_material_name`.
- Fila: objeto `Writable` (objectMode, HWM 1000) para serializar processamento sem travar o webhook.

## 7. Lacunas e direção (ADR-007)

1. **Tinta UV sem idempotência** → `source_ref` por canal (`jobId#uv-cyan`) + UNIQUE `(item,source,source_ref)`.
2. **`reason LIKE` no substrato** → substituir por `source_ref`.
3. **Ator `system` sem usuário real** → `mimaki-agent-system` via `ensureSystemUser` (estudo caso 12).
4. **Sem largura no tracker** → subir width-aware (INT-108, P2).

## 8. Troubleshooting

| Sintoma | Causa | Solução |
|---------|-------|---------|
| `401` | secret errado/ausente | confira `MIMAKI_INTEGRATION_SECRET` e header |
| `400` | schema inválido | campos obrigatórios (`machine_id`, `folder_timestamp`, `job_name`, `width_mm`, `height_mm`) |
| job `PENDING_BIND` | `raw_material_name` não casa | vincular manual; revisar convenção de nomes |
| saldo zerado nos UV no re-sync | idempotência ausente | aplicar ADR-007 |