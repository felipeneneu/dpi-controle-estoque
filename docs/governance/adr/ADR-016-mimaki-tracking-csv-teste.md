# ADR-016 — Canal de rastreio Mimaki "mimaki teste" (CSV RasterLink)

- **Status:** Proposto
- **Data:** 2026-09-15
- **Owner:** Felipe
- **Domínio:** integrations
- **Links:** referencia `BR-012` (cálculo de consumo) e `INT-001` (M2M atual); cita `ADR-005` (dedução de mídia M2M) como fluxo que o canal teste NÃO replica.
- **Base conceitual:** `docs/PLAN-mimaki-test-channel.md`; CSVs RasterLink em `J:\...\Mimaki UCJV 300-75\jobs_tracker_print\UCJV300 BE86B073\`.

## Contexto

O rastreio atual da Mimaki UCJV300-75 é via M2M (`INT-001`): o Mimaki Tracker Electron envia JSON estruturado (com `width_mm`, `height_mm`, canais de tinta) para `POST /api/integrations/mimaki/jobs`, e o backend debita mídia + 8 canais UV (ADR-005, ADR-007).

A RasterLink também gera CSVs locais por impressão em `jobs_tracker_print\UCJV300 BE86B073\` contendo tintas por canal, resultado (OK/NG), detalhe de erro (`ERROR_PRINT`), tempos de RIP/print e contagem de arranjos — **sem** dimensões. As dimensões/cópias só existem no nome dos arquivos/pastas.

Queremos uma **segunda fonte de rastreio** para validar a abordagem M2M sem risco: um canal paralelo em modo TESTE ("mimaki teste") que lê esses CSVs, guarda o que dá para extrair (código/cliente/material/tamanho/unidades do filename; tintas/resultado/erros do CSV) e exibe em painel — **sem deduzir estoque e sem tocar no fluxo M2M**.

Opções consideradas:
1. **Canal teste paralelo (escolhida)** — watcher no backend lê a pasta J:, grava em `mimaki_test_jobs`, sem débito. Zero risco ao M2M.
2. Substituir o M2M pelos CSVs — rejeitada: CSVs não têm dimensão confiável e o M2M já está estabilizado com dedução automática.
3. Impressão de figura no Tracker — rejeitada: exigiria mudar o app Electron antes de validar a fonte.

## Decisão

Manter o rastreio M2M em produção e adicionar um canal paralelo de rastreio Mimaki via CSVs RasterLink ("mimaki teste") em modo TESTE, sem dedução de estoque e sem tocar no fluxo M2M (`mimaki_jobs`, `routes/mimaki.ts`, `mimaki-queue.ts`, `m2m-auth.ts`).

## Consequências

- **Positivas:** visibilidade ampliada de jobs e tintas por fonte independente; erros `NG/ERROR_PRINT` capturados e visíveis na UI; zero risco de quebrar a dedução atual; base para comparativo futuro M2M vs CSV.
- **Negativas:** segunda fonte de dados pode divergir do M2M (esperado, fonte diferente); extração de tamanho/cópias é best-effort (regras de parse + `parse_errors` expostos); manutenção de um parser adicional.
- **Migração:** nenhuma — nova tabela `mimaki_test_jobs` isolada, sem mudança de schema produtivo.

## Verificação

- Jobs importados pelo canal teste NUNCA geram transações em `stock_transactions` nem linhas em `mimaki_jobs`.
- `NG` do CSV vira registro com `result=NG` + `result_detail=ERROR_PRINT` visível no painel.
- Dedupe impede duplicação em re-scan (`source_file + key_filename + print_s_time`).
- Endpoints M2M continuam respondendo e deduzindo normalmente.