# Checklist de Execução — `seams-cli`

| Task | Descrição | Status | Evidência |
|---|---|---|---|
| Etapa 0 | Branch `feat/seams-cli`, Ledger SDD e Baseline | Concluída | Branch `feat/seams-cli` criada; Ledger em `.sdd/seams-cli/progress.md`; Baseline: core 127/127, render 51/51, pdf 58/58 (100% verde). |
| Task 0 | ADR-055, Reserva BR-056 em BUSINESS_RULES.md e ErrorCodes no core | Concluída | ADR-055 criada; ADR_INDEX.md atualizado (R-009); BR-056 reservada; 10 ErrorCodes adicionados em Imposition.Core; build e 127 testes verdes. |
| Task 1 | Parser CLI e Options (`SeamsCliOptions`, `SeamsCliParser`) | Concluída | SeamsCliOptions e SeamsCliParser com System.CommandLine, validações R-013, restrições geométricas e mismatch; 12/12 testes aprovados. |
| Task 2 | `SeamsWorkflowExecutor` (Orquestração e Roteamento) | Concluída | SeamsWorkflowResult e SeamsWorkflowExecutor implementados com roteamento JPG/PDF, extração de dimensões, cancelamento gracioso e R-019; 5/5 testes aprovados. |
| Task 3 | `JsonResultEmitter` (Serialização e Emissão) | Concluída | JsonResultEmitter implementado com formato compacto de linha única, schemaVersion 1.0, warnings[], camelCase e suporte a erro/falha parcial; 3/3 testes aprovados. |
| Task 4 | Ponto de entrada (`Program.cs`) e Testes Smoke E2E | Concluída | Program.cs com mapeamento de exit codes 0..4 e 130, RuntimeFixtures CMYK e 7 testes Smoke E2E aprovados; 27/27 testes verdes em SeamsCLI.Tests. |
| Task 5 | Governança, Fechamento de ADR-055 e Ledger SDD | Concluída | Status da ADR-055 atualizado para Aprovada; BR-056 registrada em RULE_CHANGELOG.md; ledger progress.md consolidado. |
