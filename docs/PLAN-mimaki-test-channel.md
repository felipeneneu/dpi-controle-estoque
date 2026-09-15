# PLAN: Canal de Rastreio Mimaki "mimaki teste" (CSV RasterLink) — ADR-016

> **Status:** Planejado (aguardando aprovação) · **Modo:** PLANEJAMENTO — nenhum código foi escrito
> **ADR Base:** `docs/governance/adr/ADR-016-mimaki-tracking-csv-teste.md` (a redigir, Status = Proposto)
> **Projeto:** GraficaOS (WEB — Next.js + Fastify backend)
> **Fluxo M2M atual (NÃO ALTERAR):** `grafica-app/backend/src/routes/mimaki.ts`, `lib/mimaki-queue.ts`, `middleware/m2m-auth.ts`, tabela `mimaki_jobs`

---

## 1. Contexto e motivação

O usuário quer uma **nova abordagem de rastreio** da Mimaki UCJV300-75 lendo os CSVs gerados pela RasterLink em `J:\DPI Inteligência Gráfica\Gráfica Rápida\Arquivos para Impressão\Mimaki UCJV 300-75\jobs_tracker_print\UCJV300 BE86B073\` (share SMB `\\APP-SVR1.propup.local\DPI\...`), além dos nomes das pastas de job ("copias / impressos", ex. `14set2026_31180_José Augusto`, `FINALIZADAS\2026\...`).

**Decisão travada (Socratic gate):** canal **adicional e isolado** em modo TESTE, paralelo ao M2M. A abordagem M2M atual **não morre** — ela continua em produção (INT-001). O canal novo se chama **"mimaki teste"** (`channel = 'mimaki-teste'`).

## 2. O que dá para extrair (findings da pasta J:)

### 2.1 Do nome do arquivo/KEY_FILENAME (parser best-effort)

| Padrão | Exemplo real | Extração |
|--------|--------------|----------|
| Código do pedido (5 dígitos iniciais) | `31180 - José Augusto - ...` | `order_code = 31180` |
| Cliente (2º segmento) | `Pro-Phisical`, `José Augusto`, `Galgani` | `client` |
| Material (segmento final, antes de tamanho/un/copias) | `Vinil Transparente`, `Vinil Adesivo Branco Brilho` | `material` |
| Tamanho `(\d+(?:[.,]\d+)?)x(\d+(?:[.,]\d+)?)\s*(mm\|cm\|m)?` | `350x50mm`, `60x60`, `80x400`, `240x60mm` | `width_mm` / `height_mm` (nullable; unidade assumida mm quando ausente) |
| Unidades `(\d+)\s*un` | `88un`, `40un` | `units` |
| Cópias `(\d+)\s*copia` | `3 copias` | `copies` (ver `KEY_ARRANGE_CNT` abaixo) |

### 2.2 Do CSV RasterLink (1 header + linhas de dados, sem `;`)

Colunas: `KEY_FILENAME, KEY_RESULT, KEY_INKUSE, KEY_RIP_S_TIME, KEY_RIP_E_TIME, KEY_PRINT_S_TIME, KEY_PRINT_E_TIME, KEY_ARRANGE_CNT, KEY_RESULT_DETAIL`.

| Campo | Exemplo real | Extração |
|-------|--------------|----------|
| `KEY_FILENAME` | `31180 - José Augusto - Vinil Adesivo Branco Brilho - 60x60 - 88un.pdf` | base do PDF → alimenta parser da seção 2.1 |
| `KEY_RESULT` | `OK` / `NG` | `result` — NG vira linha com erro visível |
| `KEY_RESULT_DETAIL` | `ERROR_PRINT` (quando NG) | `result_detail`; em NG `KEY_PRINT_E_TIME` vem VAZIO |
| `KEY_INKUSE` | `Cyan:1.277cc Magenta:1.062cc Yellow:0.928cc Black:0.984cc White:0.000cc White:0.000cc Clear:0.000cc Clear:0.000cc` | 8 canais → `ink_cyan_cc`, `ink_magenta_cc`, `ink_yellow_cc`, `ink_black_cc`, `ink_white1_cc`, `ink_white2_cc`, `ink_varnish1_cc`, `ink_varnish2_cc` (+ `ink_total_cc`) |
| `KEY_ARRANGE_CNT` | inteiro | `arrange_cnt` — guardar CRU (significado "cópias/arranjos" ainda a validar; não derivar metragem) |
| `KEY_RIP_S_TIME` / `KEY_RIP_E_TIME` | `20260915_145744` (`YYYYMMDD_HHMMSS`) | `rip_s_time` / `rip_e_time` |
| `KEY_PRINT_S_TIME` / `KEY_PRINT_E_TIME` | idem; E_TIME vazio em NG | `print_s_time` / `print_e_time` (nullable) |

**Multi-linha:** um único print gera vários rows (ex. variantes BRANCO + COR no mesmo CSV → 2 linhas). Cada row vira um registro.

## 3. Escopo do canal "mimaki teste"

### 3.1 Tabela nova `mimaki_test_jobs` (isolada de `mimaki_jobs`)

| Coluna | Tipo | Notas |
|--------|------|-------|
| `id` | text PK | `newId()` |
| `channel` | text default `'mimaki-teste'` | permite futuros canais de teste |
| `source_file` | text | nome do CSV de origem (`..._OK_print.csv`) |
| `key_filename` | text | base PDF (sem path) |
| `result` | text (`OK`\|`NG`) | visível na UI |
| `result_detail` | text nullable | `ERROR_PRINT` etc. |
| `arrange_cnt` | integer nullable | cru, sem derivação |
| `ink_cyan_cc` … `ink_varnish2_cc` | real default 0 | 8 canais |
| `ink_total_cc` | real default 0 | |
| `rip_s_time` / `rip_e_time` / `print_s_time` / `print_e_time` | text nullable | `YYYYMMDD_HHMMSS` normalizado |
| `parsed_order_code` / `parsed_client` / `parsed_material` | text nullable | extraídos do filename |
| `parsed_width_mm` / `parsed_height_mm` | real nullable | |
| `parsed_units` / `parsed_copies` | integer nullable | |
| `parse_errors` | text nullable | JSON de avisos do parser (ex.: "tamanho não reconhecido") — **exposto na UI** |
| `created_at` | timestamp default now | |

Índices: `uniqueIndex('mimaki_test_dedupe_idx').on(source_file, key_filename, print_s_time)` (dedupe); `index('mimaki_test_channel_idx').on(channel)`.

### 3.2 Watcher/poll do backend

- Novo módulo `grafica-app/backend/src/lib/mimaki-test-watcher.ts`: **poll** na pasta J: (intervalo default 30 s, configurável por env `MIMAKI_TEST_POLL_INTERVAL_MS`).
- Pasta origem via env `MIMAKI_TEST_SOURCE_DIR` (default `J:\DPI Inteligência Gráfica\Gráfica Rápida\Arquivos para Impressão\Mimaki UCJV 300-75\jobs_tracker_print\UCJV300 BE86B073\`).
- Filtra `*_print.csv`. Pasta J: indisponível → log + retry com backoff; **nunca derruba o servidor**; flag de saúde `source_available` entra na resposta da API/UI.
- **Dedupe:** chave `source_file + key_filename + print_s_time` (print_s_time pode ser vazio em NG → fallback `rip_s_time`); insert com `ON CONFLICT DO NOTHING`. Se a RasterLink reescrever o CSV no lugar, re-scan não duplica.

### 3.3 Parser CSV (row → registro)

- Novo `grafica-app/backend/src/lib/mimaki-test-parser.ts` com duas funções puras: `parsePrintCsv(text) → rows[]` e `extractFilenameMeta(keyFilename) → {orderCode, client, material, widthMm, heightMm, units, copies, parseErrors[]}`.
- `parsePrintCsv`: ignora header; tolera aspas/colunas extras; mapeia 8 canais do `KEY_INKUSE` via regex por canal; timestamp `YYYYMMDD_HHMMSS` normalizado; NG com `KEY_PRINT_E_TIME` vazio → `print_e_time = null` + `result_detail`.
- `extractFilenameMeta` é **best-effort**: arquivo que não casar regex entra mesmo assim com `parse_errors` preenchido (nunca reprova a ingestão).

### 3.4 Erros NG e visibilidade

- NG/`ERROR_PRINT` são capturados e **armazenados** (nunca descartados) e **exibidos em destaque** no painel (badge vermelho + tooltip com `result_detail` + tempos).
- `parse_errors` também aparece na UI (coluna "Avisos de parse") para o usuário saber "o que deu para extrair".

### 3.5 Endpoint e UI

- `grafica-app/backend/src/routes/mimaki-test.ts` (JWT/RBAC — canal de leitura, não é M2M):
  - `GET /api/mimaki-test/jobs` — lista (filtros `result`, `channel`, paginação simples).
  - `POST /api/mimaki-test/scan` — dispara leitura manual da pasta (útil para testar sem esperar o poll).
- Frontend: `grafica-app/src/components/mimaki-teste-panel.tsx` embutido na aba Máquinas/Mimaki (ao lado do M2M, sem substituí-lo) + query client `grafica-app/src/lib/queries/mimaki-test.ts`.

## 4. Task breakdown

| # | Tarefa | Arquivos | Agente | Prioridade | Depende | Verificação |
|---|--------|----------|--------|------------|---------|-------------|
| T1 | Redigir **ADR-016** (Status Proposto) + registrar no índice | `docs/governance/adr/ADR-016-mimaki-tracking-csv-teste.md` (criar), `docs/governance/ADR_INDEX.md` (linha nova) | documentation-writer | P0 | — | ADR segue `ADR_TEMPLATE.md`; índice tem linha ADR-016 "Proposto" |
| T2 | Migration + schema `mimaki_test_jobs` (+ tipos Drizzle) | `grafica-app/backend/src/db/schema.ts`, `grafica-app/backend/drizzle/0011_*.sql` (gerado) | database-architect | P0 | T1 | `drizzle-kit generate` + migração aplica limpa; tabela existe; não toca `mimaki_jobs` |
| T3 | Parser CSV + extração de filename (funções puras) | `grafica-app/backend/src/lib/mimaki-test-parser.ts` | backend-specialist | P1 | T2 | Unit test com os 3 CSVs de exemplo (seção 7) extrai valores esperados |
| T4 | Watcher/poll + dedupe + captura NG | `grafica-app/backend/src/lib/mimaki-test-watcher.ts`, bootstrap do servidor | backend-specialist | P1 | T3 | Watcher lê os 3 CSVs → insere linhas; re-scan não duplica; NG vira `result=NG` + `result_detail=ERROR_PRINT` |
| T5 | Endpoints `GET /api/mimaki-test/jobs` + `POST /api/mimaki-test/scan` | `grafica-app/backend/src/routes/mimaki-test.ts`, registro de rotas | backend-specialist | P1 | T4 | `curl` retorna linhas incluindo NG; scan manual força leitura |
| T6 | Painel UI "Mimaki Teste" (OK/NG, avisos parse, refresh) | `grafica-app/src/components/mimaki-teste-panel.tsx`, `grafica-app/src/lib/queries/mimaki-test.ts`, aba Máquinas/Mimaki | frontend-specialist | P2 | T5 | Painel renderiza badges OK/NG, `parse_errors` e botão "executar scan" |
| T7 | Docs: seção "canal mimaki teste" em `docs/integrations/MIMAKI.md` + arquivar este PLAN após conclusão | `docs/integrations/MIMAKI.md` (nova seção INT-001-nota) | documentation-writer | P3 | T6 | MIMAKI.md descreve canal paralelo, sem contradizer a seção M2M |
| T8 | **Fase X** — verificação final completa (seção 7) | — | todos | P3 | T1..T7 | Todo checklist da seção 7 verde; marcador "PHASE X COMPLETE" neste arquivo |

## 5. ADR-016 — detalhes da tarefa T1

- **Arquivo:** `docs/governance/adr/ADR-016-mimaki-tracking-csv-teste.md` (rascunho de muitos passos no plano; NÃO criar agora).
- **Status:** Proposto · **Data:** 2026-09-15 · **Owner:** Felipe
- **Domínio:** integrations · **Links:** referencia `BR-012` (consumo) e `INT-001`; cita `ADR-005` (dedução M2M) como fluxo que o teste NÃO replica.
- **Decisão (1 frase):** "Manter o rastreio M2M em produção e adicionar um canal paralelo de rastreio Mimaki via CSVs RasterLink ('mimaki teste') em modo TESTE, sem dedução de estoque e sem tocar no fluxo M2M."
- **Consequências:** positivas (visibilidade ampliada, erros NG capturados, zero risco ao M2M) / negativas (segunda fonte de dados pode divergir; parser best-effort) / migração (nenhuma).
- **Registro:** linha nova em `docs/governance/ADR_INDEX.md` → `| ADR-016 | Canal de rastreio Mimaki teste (CSV RasterLink) | Proposto | 2026-09-15 | integrations | — | paralelo ao M2M (INT-001); sem dedução |`.

## 6. O que NÃO vamos fazer

- ❌ **Não** alterar `mimaki_jobs`, `routes/mimaki.ts`, `mimaki-queue.ts` ou `middleware/m2m-auth.ts` (fluxo M2M INT-001 intacto).
- ❌ **Não** deduzir estoque (substrato ou 8 canais UV) para jobs do canal "mimaki teste".
- ❌ **Não** substituir/desativar a abordagem M2M atual — o novo canal é apenas TESTE e paralelo.
- ❌ **Não** gravar jobs do teste em `mimaki_jobs` nem gerar transações em `stock_transactions`.
- ❌ **Não** consumir `RIPLOG.HTML` nem `Informações de Impressão.txt` nesta fase (candidatos P2 — apenas citados como oportunidades futuras).
- ❌ **Não** escrever código antes da aprovação deste plano (fase atual = planejamento puro).

## 7. Fase X — checklist de verificação

- [ ] Migração `0011` aplica limpa (`drizzle-kit` / comando de migrate do backend).
- [ ] Watcher lê os 3 CSVs de exemplo e insere linhas:
  - `20260914_172452_31153 - Item 2 - Pro-Phisical - Vinil Transparente - 350x50mm - COR.pdf_001_NG_print.csv` → `order_code=31153`, `client=Pro-Phisical`, `material=Vinil Transparente`, `width_mm=350`, `height_mm=50`, **`result=NG`**, **`result_detail=ERROR_PRINT`**, `print_e_time=null`.
  - `20260915_101344_31153 - Item 2 - Pro-Phisical - Vinil Transparente - 350x50mm - COR.pdf_001_OK_print.csv` → `result=OK`; `KEY_INKUSE` exemplo → `ink_cyan_cc=1.277`, `ink_magenta_cc=1.062`, `ink_yellow_cc=0.928`, `ink_black_cc=0.984`, whites/clears `0.000`.
  - `20260915_150513_31180 - José Augusto - Vinil Adesivo Branco Brilho - 60x60 - 88un.pdf_001_OK_print.csv` → `order_code=31180`, `client=José Augusto`, `material=Vinil Adesivo Branco Brilho`, `width_mm=60`, `height_mm=60`, `units=88`.
- [ ] Multi-linha: CSV com variantes BRANCO+COR gera 1 registro por row.
- [ ] Re-scan (2ª execução) → 0 novas linhas (dedupe `source_file+key_filename+print_s_time`).
- [ ] `GET /api/mimaki-test/jobs` retorna JSON com linhas OK e NG + `parse_errors` quando houver.
- [ ] **M2M intacto:** `GET /api/integrations/mimaki/jobs` HTTP 200; nenhuma linha nova em `mimaki_jobs`/`stock_transactions` originada do canal teste.
- [ ] Painel "Mimaki Teste" na UI mostra badges OK/NG, `result_detail` e coluna de avisos de parse; botão scan manual funciona.
- [ ] `docs/governance/ADR_INDEX.md` contém ADR-016 Proposto; `docs/integrations/MIMAKI.md` documenta o canal paralelo.
- [ ] Marcador **✅ PHASE X COMPLETE** adicionado ao final deste arquivo.

## 8. Riscos e limitações

| Risco | Mitigação |
|-------|-----------|
| CSV reescrito/duplicado pela RasterLink | Dedupe por `source_file+key_filename+print_s_time` com `ON CONFLICT DO NOTHING`; opcional hash de conteúdo em P2 |
| Pasta J: indisponível / sem permissão (SMB `\\APP-SVR1.propup.local`) | Watcher tolerante a falha: log + backoff, flag de saúde na UI, jamais crasha o servidor; pasta via env |
| Encoding (José, ó, "Informações de Impressão") | Ler UTF-8 com fallback Windows-1252/latin1; normalizar texto no parser |
| Nome de arquivo fora do padrão | `parse_errors` preenchido e visível na UI; ingestão nunca é reprovada |
| Formato `KEY_INKUSE`/colunas mudando na RasterLink | Guardar valores crus quando o regex não casar; `parse_errors` registra; mapeamento 8 canais explícito (White×2, Clear×2 → varnish) |
| `KEY_ARRANGE_CNT` com significado incerto | Armazenado cru (`arrange_cnt`); sem derivação de cópias/metragem nesta fase |
| Divergência entre canal teste e M2M | Esperado (fonte de dados diferente); ADR-016 marca canal como TESTE; comparativo futuro (P2) |

## 9. Rollback / recuperação

- **Migração:** reverter = `drizzle-kit` apaga a tabela `mimaki_test_jobs` apenas — zero impacto em `mimaki_jobs`/estoque.
- **Watcher/parser:** remover registro do watcher no bootstrap → M2M segue funcionando inalterado.
- **UI:** remover componente da aba Máquinas → nenhuma mudança nos painéis M2M existentes.
- **Dados:** deletar linhas de `mimaki_test_jobs` não afeta transações reais (nunca houve débito neste canal).