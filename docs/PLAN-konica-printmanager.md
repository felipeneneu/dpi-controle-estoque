# Plan: Agente Konica Minolta C3070 — PrintManager (Extração de Jobs + Débito de Estoque)

## Overview

A gráfica tem uma **Konica Minolta C3070** (digital / copiadora toner — **NÃO** large format) com painel web em `http://192.168.234.68:30083/printmanager.html`. O objetivo é replicar o agente HP (`agents/hp-latex/`) para a Konica: extrair jobs em tempo real (a response já é **live** — verificado pelo usuário) e debitar estoque **"igual à HP"**, adaptado para papel em folhas (não rolo/m²).

**Timeline:** hoje é 04/09/2026; a execução começa ~**08/09/2026 (terça)** — discovery pode ser iniciado antes apenas se a máquina estiver acessível.

**Prioridade:** Discovery (T1) é o **primeiro** bloco — sem mapear endpoints/auth nada mais pode ser projetado com segurança. O débito de papel (T5) é o core de valor.

## Phase -1 — Context Check (JÁ FEITO pelo agente principal)

| Check | Resultado |
|-------|-----------|
| Equipamento | Digital / toner (C3070, `technology: 'Laser'` na seed) — SEM largura de rolo |
| Débito de estoque | "Igual à HP" (confirmado) — adaptado p/ papel em folhas/impressões |
| Extração de dados | **Por descoberta de endpoints** (este plano começa com T1 discovery) |
| Auth | **A testar durante o discovery** — pode precisar login/cookie/token |
| Real-time | Response é live (verificado); mecanismo exato (polling JSON vs scraping) a confirmar no T1 |
| Stack existente | TypeScript ESM, drizzle-orm, Fastify, Turso, Socket.IO (mantida) |
| Máquina na DB | Seed já cria "Konika / C3070 / Laser" — mas **sem `ip`** (necessário cadastrar ou fallback) |

## Phase 0 — Decisions (D1..DN)

| # | Decisão | Escolha recomendada | Rationale |
|---|---------|---------------------|-----------|
| D1 | Tipo de equipamento | Digital / toner — SEM débito por largura de rolo | Confirmado; C3070 é cut-sheet; `mediaAreaM2` não se aplica |
| D2 | Unidade de débito de papel | Folhas — `unit: 'fls'` (com fator de conversão por item, ex.: resma = 500 fls) | Seed já usa `fls` para cut-sheet; jobs expõem impressões/folhas |
| D3 | Toner: deduzir automaticamente? | **Só se** o printmanager expuser consumo/clicks por cor; senão, papel primeiro e toner via ajuste manual | C3070 costuma expor % de toner, não gramas por job; decisão final após T1 |
| D4 | Matching de papel | Reusar padrão `normalizeMediaName` do HP (sem `parseMediaWidthM` — não há largura) | Papel é cut-sheet; match por nome normalizado |
| D5 | Dedupe (jobId) | `konica_` + hash(jobName + printEndDate [+ serial/counter se exposto]) | Não há jobId universal garantido; espelhar `job-detector.ts` da HP |
| D6 | Mecanismo de aquisição | Polling de endpoints JSON (intervalo curto, ex.: 30s) OU scraping HTML se não houver API | A definir no T1; response live → endpoint de dados deve existir |
| D7 | Auth | Env `KONICA_USER` / `KONICA_PASS` + cookie/session em memória; relogin em 401/redirect | A confirmar no T1 |
| D8 | Schema | Reutilizar `print_jobs` + `ripType='konica-printmanager'` + `rawDataJson`; adicionar colunas `pages` e `sheets` (sem nova tabela) | Evita duplicação; jobs Konica têm poucos campos extras |

> ⚠️ D2/D3/D6 são **finalizados após T1** — o Discovery decide o que é factível.

## Tech Stack

Manter stack existente: TypeScript ESM, drizzle-orm, Fastify, Turso (`@libsql/client`), Socket.IO. **Nenhuma dependência nova** — a menos que T1 revele necessidade de scraping HTML (aí avaliar `cheerio`; decisão documentada no Data Map).

## File Structure (mudanças)

```
grafica-app/backend/src/agents/konica/
├── index.ts          ← poll loop + backoff + emits (espelho do hp-latex/index.ts)
├── fetcher.ts        ← GET endpoints do printmanager (JSON/HTML) + auth/cookie
├── parser.ts         ← converte resposta → KonicaJob
├── job-detector.ts   ← dedupe por jobId único (prefixo konica_)
├── stock-deductor.ts ← débito papel (folhas) + toner (se houver) + alertas PWA/WhatsApp
└── types.ts          ← KonicaJob / FetchResult (pode ficar inline, como na HP)

grafica-app/backend/src/db/schema.ts            ← colunas pages/sheets em print_jobs
grafica-app/backend/drizzle/0006_*.sql          ← migração drizzle
grafica-app/backend/src/server.ts               ← startKonicaAgent() + stop no SIGINT/SIGTERM
grafica-app/backend/src/routes/machines.ts      ← generalizar checkPrinterOnline p/ URL com porta
grafica-app/backend/scripts/seed-konica-materials.ts ← itens de papel/toner + IP da máquina
docs/KONICA_PRINTMANAGER_DATA_MAP.md            ← SAÍDA do discovery (T1)

grafica-app/src/app/(dashboard)/maquinas/page.tsx       ← UI: conferir aba Jobs (T7)
grafica-app/src/components/machine-jobs-tab.tsx         ← UI: exibir pages/sheets (T7)
```

---

## Task Breakdown

### Tarefa 1 — Discovery: endpoints + auth do PrintManager ⚠️ PRIMEIRA
**Agent:** backend-specialist | **Priority:** P0 | **Depends:** —
**File:** `docs/KONICA_PRINTMANAGER_DATA_MAP.md` (saída; **nenhum código de produção**)

**INPUT:** URL base `http://192.168.234.68:30083`, página `printmanager.html`.
**OUTPUT:** Relatório (estilo do `PLAN-hp-info-discovery`):
1. Probes curl em caminhos comuns:
   ```
   curl -s -o NUL -w "HTTP %{http_code} %{content_type}\n" http://192.168.234.68:30083/printmanager.html
   curl -s -o NUL -w "HTTP %{http_code}\n" http://192.168.234.68:30083/api
   curl -s -o NUL -w "HTTP %{http_code}\n" http://192.168.234.68:30083/status/json
   curl -s -o NUL -w "HTTP %{http_code}\n" http://192.168.234.68:30083/cgi-bin/
   curl -s -o NUL -w "HTTP %{http_code}\n" http://192.168.234.68:30083/jobs
   curl -s -o NUL -w "HTTP %{http_code}\n" http://192.168.234.68:30083/tmp/
   ```
2. **Auth:** abrir no navegador; registrar redirect, form de login, cookie, token.
3. **Network tab:** capturar endpoints AJAX/WebSocket chamados pela página (o modo real-time vem de algum deles) + amostras de response.
4. **Campos descobertos:** job name, data, páginas/impressões, papel, sides/duplex, cor/BW, toner (se houver) — documentar com exemplo real.

**VERIFY:**
- `curl -s -o NUL -w "%{http_code}" http://192.168.234.68:30083/printmanager.html` → 200 (documentar se diferente)
- Relatório existe com seções: Endpoints Testados, Auth, Campos Descobertos (mín. 10 campos), Mecanismo Real-time, Decisão D2/D3/D6.

---

### Tarefa 2 — Schema: colunas p/ jobs Konica + migração
**Agent:** database-architect | **Priority:** P1 | **Depends:** T1
**File:** `grafica-app/backend/src/db/schema.ts`, `grafica-app/backend/drizzle/0006_*.sql`

**INPUT:** Data Map do T1 (D8 — o que o printmanager expõe de fato).
**OUTPUT:**
1. Adicionar em `printJobs`: `pages` (integer) — impressões/páginas totais; `sheets` (real) — folhas consumidas (`pages ÷ sides`, com `ceil` em duplex); ambos opcionais (default null).
2. `mediaType` continua sendo o nome do papel; `mediaAreaM2` fica NULL para jobs Konica.
3. `ripType` default `'konica-printmanager'` no insert (job-detector).
4. NÃO criar tabela nova — `rawDataJson` guarda o payload completo.

**VERIFY:**
- `npm run db:generate` gera migração 0006; `npm run db:push` aplica.
- `npm run typecheck` (backend) passa.

---

### Tarefa 3 — Fetcher + auth + parser
**Agent:** backend-specialist | **Priority:** P1 | **Depends:** T1
**File:** `grafica-app/backend/src/agents/konica/fetcher.ts`, `parser.ts`, `types.ts`

**INPUT:** Data Map do T1 (endpoints + formato + auth).
**OUTPUT:**
- `fetcher.ts`: `fetchJobs(baseUrl, auth)` — GET nos endpoints descobertos; gerencia login/cookie (relogin em 401/redirect); retorna union `{ok:true; raw} | {ok:false; reason:'auth'|'offline'|'error'}`; timeout/env `KONICA_TIMEOUT_MS` (default 10s). Base URL via env `KONICA_URL` (default `http://192.168.234.68:30083`).
- `parser.ts`: raw (JSON ou HTML) → `KonicaJob { jobName, paperName, pages, sheets, sides, colorMode, status, printEndDate, tonerByColor?, rawData }`. Parse pt-BR (vírgula→ponto) onde aplicável.
- `types.ts`: tipos `KonicaJob` / `FetchResult`.

**VERIFY:**
- `npx tsc --noEmit` (backend) passa.
- Probe manual com a impressora real: rodar um script temporário de teste que chama `fetchJobs` + `parser` e imprime ≥1 job com campos preenchidos (não commitar o script de teste).

---

### Tarefa 4 — Detector de novos jobs (dedupe)
**Agent:** backend-specialist | **Priority:** P1 | **Depends:** T3
**File:** `grafica-app/backend/src/agents/konica/job-detector.ts`

**INPUT:** `KonicaJob[]`, tabela `print_jobs`.
**OUTPUT:** `makeJobId()` → `konica_` + hash(jobName + printEndDate [+ serial/counter se exposto no T1]); `detectNewJobs()` filtra por jobId já existente (espelho do `hp-latex/job-detector.ts`); `insertJob()` grava com `ripType='konica-printmanager'`, `pages`, `sheets`, `rawDataJson`.

**VERIFY:**
- `npx tsc --noEmit` passa.
- Teste: processar o MESMO conjunto de jobs 2x → 0 novos na 2ª execução.

---

### Tarefa 5 — Stock-deductor: papel (folhas) + toner (se houver) ⚠️ CORE
**Agent:** backend-specialist | **Priority:** P0 | **Depends:** T2, T4
**File:** `grafica-app/backend/src/agents/konica/stock-deductor.ts`

**INPUT:** `NewJob` (Konica), decisões D2-D4, tabelas `stock_items` / `stock_transactions` / `notifications`.
**OUTPUT:**
1. **Papel (sempre):** buscar itens `PAPER_MEDIA` da máquina; match por `normalizeMediaName(job.paperName)` — copiar/extrair a função do HP para util comum (ou duplicar, como o HP faz). `debitQty = job.sheets` (ou `pages ÷ sides` com ceil); se `unit` do item for `rms` (resma) → converter pelo fator do item (ex.: `quantity/500`). Grava `stockTransactions` (type `OUT`, reason `Konica Agent: job <name>`) e atualiza `currentQuantity` + status.
2. **Toneladas/toner (condicional D3):** se o T1 revelar consumo por cor → mapa `KONICA_TONER_COLOR_MAP` para SKUs `INK_SUPPLY` (mesmo padrão do `INK_COLOR_MAP` do HP). Caso contrário → **não deduzir**, logar aviso (`toner não exposto — ajuste manual`).
3. **Alertas:** LOW_STOCK / OUT_OF_STOCK → `notifications` + Socket.IO (`estoque`) + WhatsApp (reusar `sendToRecipients` + `getSetting('whatsapp.enabled')`, idêntico ao HP).
4. Marcar `stockDeducted=true` + `deductedAt` no `print_jobs`; emitir `printer:job_completed`.

**VERIFY:**
- `npx tsc --noEmit` passa.
- SQL (live printer): rodar 1 job real → `stock_transactions.quantity` = folhas debitadas; `current_quantity` do item diminuiu; `print_jobs.stock_deducted = 1`.
- Jobs com `stockDeducted=true` NÃO são re-debitados (dedupe do T4).

---

### Tarefa 6 — Poll loop + integração (server.ts + routes/machines.ts)
**Agent:** backend-specialist | **Priority:** P1 | **Depends:** T5
**File:** `grafica-app/backend/src/agents/konica/index.ts`, `server.ts`, `routes/machines.ts`

**INPUT:** módulo konica completo (T3-T5).
**OUTPUT:**
- `index.ts`: `startKonicaAgent(io)` — poll loop com `KONICA_POLL_INTERVAL_MS` (default 30s, ajustar conforme T1); backoff `[15s, 30s, 60s, 120s, 300s]`; habilitação via `KONICA_AGENT_ENABLED !== 'false'`. Achar máquina por `machines.ip = KONICA_IP`; **fallback** se IP não cadastrado: `machines.brand LIKE 'Konica%'` (hoje a seed não seta ip).
- Online check: `http://<ip>:30083/` — a função da HP (`checkPrinterOnline`) usa porta 80; para a Konica usar a base URL do `KONICA_URL`.
- `server.ts`: `startKonicaAgent(app.io)` + stop no SIGINT/SIGTERM (mesmo padrão do HP).
- `routes/machines.ts`: generalizar `checkPrinterOnline` para aceitar URL/porta (ex.: parâmetro `baseUrl`) e usar no `/api/machines/check-connection` para IPs com porta.

**VERIFY:**
- `npx tsc --noEmit` e `npx eslint src/agents/konica/** src/server.ts src/routes/machines.ts` passam.
- Servidor sobe com `KONICA_AGENT_ENABLED=true`: log `[Konica Agent] Iniciando...`; agente HP continua rodando (regressão).
- Curl na base URL da Konica → 200.

---

### Tarefa 7 — Seed de materiais Konica + UI hooks
**Agent:** backend-specialist (seed) + test-engineer (UI) | **Priority:** P2 | **Depends:** T2
**File:** `grafica-app/backend/scripts/seed-konica-materials.ts`, `grafica-app/src/components/machine-jobs-tab.tsx`, `grafica-app/src/app/(dashboard)/maquinas/page.tsx`

**INPUT:** D2-D4 + nomes reais de papel/toner usados na gráfica (levantar com o operador).
**OUTPUT:**
- Script `seed-konica-materials.ts` (idempotente, espelho de `seed-hp-media.ts`): cria itens `PAPER_MEDIA` (ex.: Papel A4 75g, Couché 90g — unit `fls` ou `rms`), `INK_SUPPLY` (toners K/C/M/Y se aplicável), vincula à máquina Konica via `machine_items`, e **seta `machines.ip = '192.168.234.68'`** na Konica se vazio (resolve o fallback da T6).
- UI: conferir que os jobs da Konica aparecem na aba Máquinas → Jobs (a tabela já filtra por `machineId`); se `pages`/`sheets` forem relevantes, exibir essas colunas no `machine-jobs-tab.tsx` (renderização condicional por `ripType`).

**VERIFY:**
- `npm run seed:konica` roda 2x sem duplicar itens.
- `npm run build` (web) passa.
- UI: selecionar a máquina Konica → jobs listados com papéis/páginas visíveis.

---

### Tarefa 8 — Phase X: Verificação e regressão (SEMPRE ÚLTIMA)
**Agent:** test-engineer | **Priority:** P2 | **Depends:** T1-T7

**INPUT:** Todos os arquivos do backend + web alterados.
**OUTPUT:** Checklist completo abaixo executado de verdade.

**VERIFY:**
- [ ] `npm run typecheck` no `grafica-app/backend` — zero erros
- [ ] `npx eslint` no backend — zero erros novos (warnings existentes ok)
- [ ] `npm run build` no `grafica-app/backend` — sucesso
- [ ] `npm run build` na web (`grafica-app`) — sucesso (se UI alterada em T7)
- [ ] Curl `http://192.168.234.68:30083/printmanager.html` → 200 (impressora online)
- [ ] Agente com impressora real: job inserido com `pages`/`sheets` corretos e `ripType='konica-printmanager'`
- [ ] `stock_transactions.quantity` = folhas; `current_quantity` diminuiu
- [ ] Alertas de estoque (PWA + WhatsApp) disparam em LOW_STOCK/OUT_OF_STOCK
- [ ] **Regressão HP:** `agents/hp-latex` intacto — jobs HP continuam sendo inseridos/debitados
- [ ] Jobs antigos com `stockDeducted=true` NÃO re-debitados (HP e Konica)
- [ ] `docs/KONICA_PRINTMANAGER_DATA_MAP.md` arquivado (histórico do discovery)

---

## Phase X — Verification Checklist (resumo executável)

```bash
# Backend
cd grafica-app/backend && npm run typecheck
cd grafica-app/backend && npx eslint src/agents/konica/** src/server.ts src/routes/machines.ts
cd grafica-app/backend && npm run build

# Discovery (T1)
curl -s -o NUL -w "HTTP %{http_code}\n" http://192.168.234.68:30083/printmanager.html

# DB Checks
-- Débito de papel Konica (folhas, não m²)
SELECT pj.job_name, pj.pages, pj.sheets, st.quantity, st.reason
FROM stock_transactions st
JOIN print_jobs pj ON st.reason LIKE '%' || pj.job_name || '%'
WHERE st.reason LIKE 'Konica Agent%'
ORDER BY st.created_at DESC LIMIT 10;

SELECT name, current_quantity, unit
FROM stock_items
WHERE category = 'PAPER_MEDIA' AND name LIKE '%papel%' OR name LIKE '%couch%';
```

---

## Open Questions

| # | Pergunta | Impacto |
|---|----------|---------|
| P1 | PrintManager expõe API JSON ou só HTML/iframe? | Define fetcher (T3) — responde no T1 |
| P2 | O log de jobs tem nome do papel + contador de impressões, ou só páginas? | Define cálculo de `sheets` (D2) |
| P3 | Há consumo de toner por job (gramas/clicks por cor)? | Define se toner é debitado (D3) |
| P4 | Unidade dos itens de papel: `fls` ou resma `rms`? | Fator de conversão no stock-deductor |
| P5 | PrintManager informa sides (simplex/duplex) por job? | `sheets = pages ÷ sides` (ceil) ou default 1 |
| P6 | Queremos telemetria (níveis de toner) no painel como a HP tem? | Escopo futuro, fica fora deste plano |

---

## Summary

| Fase | O que | Arquivos | Prioridade |
|------|-------|----------|------------|
| **P0** | Discovery endpoints/auth + débito de papel/toner | `docs/KONICA_PRINTMANAGER_DATA_MAP.md`, `agents/konica/stock-deductor.ts` | ⚠️ CRÍTICA |
| **P1** | Schema, fetcher/parser, dedupe, poll loop + integração | `schema.ts`, `agents/konica/*`, `server.ts`, `routes/machines.ts` | ALTA |
| **P2** | Seed materiais, UI hooks, verificação/regressão | `seed-konica-materials.ts`, `machine-jobs-tab.tsx`, testes | MÉDIA |
