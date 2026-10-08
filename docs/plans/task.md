# Checklist de Execução — `estoque-tabela-tinta-unidade`

| Task | Descrição | Status | Evidência |
|---|---|---|---|
| Task 0 | Governança — ADR-057, ADR_INDEX (R-009) e emenda a BR-011/BR-012 | Concluída | ADR-057 criada; ADR_INDEX atualizado sem corrupção (R-009); BR-011 e BR-012 emendadas em BUSINESS_RULES.md; regra BR-057 registrada no changelog v1.7.0. Commit `044e999`. |
| Task 1 | Limpeza da Automação — Remoção de /automation, queries e IPCs | Concluída | Rota `/automation/page.tsx`, queries e modais de imposição excluídos; item removido da barra lateral; IPC automation removido de `preload.js`; `npx tsc --noEmit` 100% verde no frontend. Commit `ee9930e`. |
| Task 2 | Schema de Banco de Dados — `tinta_lotes` e `ink_consumption_log` | Concluída | Tabelas `tinta_lotes` e `ink_consumption_log` no schema Drizzle; migration `0014_zippy_rictor.sql` gerada; 4/4 testes de schema passando em `tinta-lotes-schema.test.ts`. Commit `3e5a0f9`. |
| Task 3 | Backend de Lotes de Tinta e Saldo por Unidades NEW | Concluída | Rotas GET/POST de tinta-lotes e discharge implementadas; stock.ts calcula availableLots, totalLots, activeLot e saldo de tinta por unidades NEW; 3/3 testes passando em `tinta-lotes.test.ts`. Commit. |
| Task 4 | Desacoplamento dos Agentes HP Latex e Mimaki | Concluída | Débito de ml/cc em stockItems/garrafas removido de HP Latex e Mimaki; consumo registrado exclusivamente em ink_consumption_log; dedução de bobinas/mídias 100% preservada; 23 suítes de teste passando. |
| Task 5 | Quick Switch de Tinta na Máquina (`POST /api/machines/:id/active-tinta`) | Concluída | Endpoint implementado com Quick Switch por canal, finalização do lote anterior em FINISHED, emissão de evento Socket.IO stock:updated e 6/6 testes passando em `machines-tinta.test.ts`. Commit. |
| Task 6 | Endpoint e Relatório de Consumo Desacoplado | Concluída | Endpoint /api/reports/consumption agrega inkConsumptionLog por canal e total; frontend atualizado em queries/reports e relatorios/page.tsx; testes passando em `reports.test.ts` e `npx tsc --noEmit` 100% verde. Commit. |
| Task 7 | Componente `StockDataTable` com TanStack Table | Concluída | `StockDataTable` criado usando TanStack Table com busca instantânea, ordenação de status com prioridade aos zerados/baixos, lote ativo em destaque, seleção em lote, agrupamento colapsável por categoria e exportação CSV com UTF-8 BOM. `npx tsc` verde. |
| Task 8 | Modal de Drill-Down Reorganizado em Seções | Concluída | `StockItemDrilldownDialog` implementado com 3 seções obrigatórias: 1. Em Uso (destaque no topo), 2. Em Espera (prateleira/NEW) e 3. Baixados/Finalizados (recolhido), além de modal integrado para Quick Switch de tinta. |
| Task 9 | Integração de `/estoque` e `/tintas` com Socket.IO | Concluída | Páginas `/estoque` e `/tintas` migradas para `StockDataTable`; hook `useStockSocket` implementado com join na sala 'estoque' e invalidação de cache em tempo real no evento `stock:updated`. |
| Task 10 | Verificação Integrada Final e Validação de Build | Concluída | Build de produção Next.js `npm run build` gerando 15 rotas estáticas com sucesso; 25 suítes de teste de backend passando (189 testes 100% verdes). |
| Task 11 | Trava de Débito Automático por SKU nas Impressoras | Concluída | HP Latex e Konica verificam `machineItems`: se o material não estiver vinculado à máquina, débito automático é suspenso, job fica em `PENDING_BIND` e `stockDeducted = false`; correção de bug da Konica onde itens não encontrados eram marcados como debitados. |
| Task 12 | Ação em Massa Inteligente na Tabela de Jobs (`POST /api/jobs/bulk-deduct`) | Concluída | Seleção múltipla com checkboxes em `MachineJobsTable`; barra de ação em lote inteligente em `JobsTab`; modal `BulkDeductDialog` com separação de domínio (Bobina/Metros vs Folhas/Papel) e pré-seleção inteligente; endpoint `/api/jobs/bulk-deduct` consolidando metragem/folhas em lote com 1 clique; 193 testes passando (26 suítes) e build Next.js 100% verde. |

---

# Checklist de Execução — `seams-export-jpg-hotfix`

| Task | Descrição | Status | Evidência |
|---|---|---|---|
| Task 0 | Regra R-021 em AGENTS.md, ADR-056, BR-054 e dependências NuGet | Concluída | Commit `1cb4a08`; Regra 18 (R-021) em `AGENTS.md`; ADR-056 criada e indexada em `ADR_INDEX.md` sem mojibake (R-009); `BR-054` atualizada; NuGet `BitMiracle.LibJpeg.NET` e `Magick.NET-Q8-AnyCPU` adicionados. |
| Task 1 | Implementação de `JpegCmykEncoder` com BitMiracle e remoção de stubs nativos | Concluída | `JpegCmykEncoder.cs` implementado com CMYK puro, APP14 Adobe (`ColorTransform=0`), sem APP0 JFIF, e chunking de perfil ICC FOGRA39 em APP2; removidos `LibJpegTurboNative` e `NativeLoader`; 52 testes aprovados em `Imposition.Render.Tests`. |
| Task 2 | Smoke E2E e validação cruzada (R-021) com arquivo real de fábrica | Concluída | `SeamsCLI` executado com sucesso sobre `Teste 02.jpg` (80,4 MB) gerando 2 painéis (17,4 MB e 8,0 MB); verificação de marcadores (SOI, APP14 ColorTransform=0, ausência de APP0) e decodificação CMYK com 4 canais aprovada via `Magick.NET`. |
| Task 3 | Preservação de DPI nativo, contagem de emendas, opções de rolo e fidelidade 1:1 de pixels | Concluída | Leitura de DPI nativo sem decodificação de pixels via `ReadImageInfo`; injeção de marcadores de resolução APP1 (Exif) e APP13 (Photoshop 0x03ED) sem emitir APP0 em CMYK; cálculo e relato de emendas `SeamCount`; CLI atualizado com opção `--dpi`; script `MontarEmendas.bat` atualizado com seleção clara de bobinas; 269 testes aprovados (Core: 127, Render: 54, Pdf: 58, SeamsCLI: 30); validação cruzada do arquivo de fábrica `Teste 02.jpg` (29528x10630 @ 353 DPI) gerando 2 painéis perfeitos de 353 DPI em CMYK puro. |

