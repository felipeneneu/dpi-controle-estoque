# Checklist de Execução — `estoque-tabela-tinta-unidade`

| Task | Descrição | Status | Evidência |
|---|---|---|---|
| Task 0 | Governança — ADR-057, ADR_INDEX (R-009) e emenda a BR-011/BR-012 | Concluída | ADR-057 criada; ADR_INDEX atualizado sem corrupção (R-009); BR-011 e BR-012 emendadas em BUSINESS_RULES.md; regra BR-057 registrada no changelog v1.7.0. Commit `044e999`. |
| Task 1 | Limpeza da Automação — Remoção de /automation, queries e IPCs | Concluída | Rota `/automation/page.tsx`, queries e modais de imposição excluídos; item removido da barra lateral; IPC automation removido de `preload.js`; `npx tsc --noEmit` 100% verde no frontend. Commit `ee9930e`. |
| Task 2 | Schema de Banco de Dados — `tinta_lotes` e `ink_consumption_log` | Concluída | Tabelas `tinta_lotes` e `ink_consumption_log` no schema Drizzle; migration `0014_zippy_rictor.sql` gerada; 4/4 testes de schema passando em `tinta-lotes-schema.test.ts`. Commit `3e5a0f9`. |
| Task 3 | Backend de Lotes de Tinta e Saldo por Unidades NEW | Concluída | Rotas GET/POST de tinta-lotes e discharge implementadas; stock.ts calcula availableLots, totalLots, activeLot e saldo de tinta por unidades NEW; 3/3 testes passando em `tinta-lotes.test.ts`. Commit. |
| Task 4 | Desacoplamento dos Agentes HP Latex e Mimaki | Concluída | Débito de ml/cc em stockItems/garrafas removido de HP Latex e Mimaki; consumo registrado exclusivamente em ink_consumption_log; dedução de bobinas/mídias 100% preservada; 23 suítes de teste passando. |
| Task 5 | Quick Switch de Tinta na Máquina (`POST /api/machines/:id/active-tinta`) | In_Progress | Em andamento |
| Task 6 | Endpoint e Relatório de Consumo Desacoplado | Pendente | — |
| Task 7 | Componente `StockDataTable` com TanStack Table | Pendente | — |
| Task 8 | Modal de Drill-Down Reorganizado em Seções | Pendente | — |
| Task 9 | Integração de `/estoque` e `/tintas` com Socket.IO | Pendente | — |
| Task 10 | Verificação Integrada Final e Validação de Build | Pendente | — |
