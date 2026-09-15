# Integração Mimaki (M2M) — GraficaOS

> **Status:** ATIVA (INT-001) · **Gap conhecido:** idempotência de tintas UV ausente → ADR-007/BR-008.
> **Canal piloto:** leitura de CSVs RasterLink via `mimaki-teste` (ADR-016) — seção 9.
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

---

## 9. Canal paralelo de teste — `mimaki-teste` (ADR-016)

> **Status:** piloto (atrás de `MIMAKI_TEST_WATCHER_ENABLED`, padrão ligado). Não deduz estoque e não compete com o fluxo M2M.

Avalia a **leitura direta dos CSVs RasterLink** gravados pela máquina, sem depender do Mimaki Tracker Electron. A pasta de origem é o compartilhamento `J:` do servidor:

```
J:\DPI Inteligência Gráfica\Gráfica Rápida\Arquivos para Impressão\Mimaki UCJV 300-75\jobs_tracker_print\UCJV300 BE86B073
```

### 9.1 How it works

```
Watcher (poll 30s) ─► lê *_print.csv ─► parsePrintCsv() ─► INSERT mimaki_test_jobs
  J: indisponível → tolera, health.sourceAvailable=false    │  dedupe UNIQUE (source_file, key_filename, print_s_time)
                                                             └─ print_s_time vazio (NG) → fallback rip_s_time
```

- **CSV header:** `KEY_FILENAME,KEY_RESULT,KEY_INKUSE,KEY_RIP_S_TIME,KEY_RIP_E_TIME,KEY_PRINT_S_TIME,KEY_PRINT_E_TIME,KEY_ARRANGE_CNT,KEY_RESULT_DETAIL`
- **Erros reais:** `KEY_RESULT=NG` + `KEY_RESULT_DETAIL=ERROR_PRINT` (print_e vazio) → gravados e destacados na UI.
- **Tamanho/dimensão não estão no CSV** → extraídos do filename (best-effort): `pedido-cliente-material-350x50mm-40un-3 copias`. O que não reconhece vai para `parse_errors` (visível na UI). Sem unidade explícita → assumido `mm` (avisado).

### 9.2 Tabela `mimaki_test_jobs`

Isolada do `mimaki_jobs`: `channel='mimaki-teste'`, canais de tinta `ink_*_cc` (8) + `ink_total_cc`, `result/result_detail`, timestamps `*_time` (formato `YYYYMMDD_HHMMSS`), campos `parsed_*` e `parse_errors` (JSON array). `created_at` timestamp ms.

### 9.3 Endpoints (JWT)

| Endpoint | Auth | Função |
|----------|------|--------|
| `GET /api/mimaki-test/jobs` | JWT | lista registros (filtros `result`, `limit/offset`) |
| `GET /api/mimaki-test/health` | JWT | status da pasta J: (`sourceAvailable`, `lastScanAt/Error`, `lastInserted`) |
| `POST /api/mimaki-test/scan` | JWT | scan manual imediato |

UI: **Máquinas → canal da Mimaki → aba "Mimaki Teste"**.

### 9.4 Configuração (env)

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `MIMAKI_TEST_WATCHER_ENABLED` | `true` | liga/desliga o watcher de polling |
| `MIMAKI_TEST_SOURCE_DIR` | caminho `J:` | pasta dos CSVs (permite override/test) |
| `MIMAKI_TEST_POLL_INTERVAL_MS` | `30000` | intervalo de leitura |

### 9.5 Critérios de saída da prova

`docs/PLAN-mimaki-test-channel.md` (checklist) e ADR-016: confirmar que fato (2-3 semanas) reproduz os jobs OK/NG com dimensões/tintas corretas antes de promover o canal a oficial e descomissionar o M2M.