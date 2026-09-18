# Índice de ADRs — GraficaOS

> **Regra:** um arquivo por decisão em `governance/adr/`. Admitir ADR = adicionar linha aqui + criar o arquivo. Adicionar ADR = mudar status da linha existente.

| ID | Título | Status | Data | Domínio | BR-* | Substitui / Observação |
|----|--------|--------|------|---------|------|-------------------------|
| ADR-001 | Turso (LibSQL) com embedded replicas | Aprovado | — | ops | — | antigo 07 |
| ADR-002 | Matriz RBAC para proteção de dados | Aprovado | — | rbac | BR-018 | antigo 07 |
| ADR-003 | Autenticação M2M para integração Mimaki | Aprovado | — | integrations | BR-018 | antigo 07 |
| ADR-004 | Respostas do bot como DM (privacidade) | Aprovado | — | chat | BR-020 | antigo 07 |
| ADR-005 | Dedução automática de mídia Mimaki | Aprovado (ressalva idempotência) | — | deduction | BR-012 | antigo 07; ver ADR-007 |
| ADR-006 | Política de saldo negativo | Proposto | 2026-09-12 | deduction | BR-007 | novo |
| ADR-007 | Idempotência via `source_ref` | Proposto | 2026-09-12 | deduction/ledger | BR-008, BR-012 | novo |
| ADR-008 | Débito atômico (transação SQL + saldo antes/depois) | Proposto | 2026-09-12 | ledger | BR-006, BR-007 | novo |
| ADR-009 | Modelo bobina-ativo + configuração por empresa | Proposto (visão travada) | 2026-09-12 | inventory/company-config | BR-002, BR-018, BR-019, BR-021 | novo — TARGET |
| ADR-010 | Decisões do data-map Konica (D2..D7) | Proposto | — | integrations | BR-013 | pendente — semente em `integrations/data-maps/KONICA_printmanager_probe.md` |
| ADR-011 | Decisões do data-map HP Latex | Proposto | — | integrations | BR-011 | pendente — semente em `integrations/data-maps/HP_EWS_accounting_probe.md` |
| ADR-012 | WhatsApp Business API vs Baileys | Proposto | — | integrations | BR-016 | pendente — ver INT-005/INT-107 no catálogo |
| ADR-013 | Identificação de bobina ativa em máquina + jobs órfãos (M3) | Proposto | 2026-09-13 | inventory/machines | BR-002 | novo — opera M3 sobre ADR-009 |
| ADR-014 | Padronização de Etiquetas Físicas (90x35mm), Imposição Konica e Quick-Switch | Aprovado | 2026-09-14 | inventory/machines | BR-002, BR-010, BR-021 | novo — complementa ADR-009 e ADR-013 |
| ADR-015 | Arquitetura Sidecar e Ferramentas Nativas (ImpositorKonica WPF) | Aprovado | 2026-09-15 | desktop/imposition | BR-010, BR-021 | novo — complementa ADR-014 |
| ADR-016 | Canal de rastreio Mimaki teste (CSV RasterLink) | Proposto | 2026-09-15 | integrations | BR-012 | novo — paralelo ao M2M (INT-001); sem dedução |
| ADR-017 | Motor Headless de Imposição Automática (Step & Repeat CLI) | Aprovado (Fase de Validação em Fábrica) | 2026-09-16 | imposition | BR-010, BR-021 | novo — desacopia motor de cálculo do ImpositorKonica |
| ADR-018 | Motor Gráfico de Saída Externo — CorelDRAW (COM/VGCore) vs Adobe Illustrator (COM/ExtendScript) | Proposto (avaliação) | 2026-09-16 | desktop/imposition | BR-010, BR-021 | novo — adoção condicionada a critérios |
| ADR-019 | Dynamic Insumo Forms and Data Modeling Adjustments | Aprovado | 2026-09-16 | inventory | — | novo — arquivo ausente no índice (registrado retroativamente) |
| ADR-020 | Distribuição Modular de Sidecars, Gating por RBAC e Licenciamento por Edições | Proposto | 2026-09-16 | desktop/imposition, ops, company-config | BR-018, BR-021 | novo — complementa ADR-002, ADR-015, ADR-017, ADR-018; base em `docs/PLAN-sidecars-enterprise.md` |
| ADR-021 | GridSearchEngine como Fonte Única de Verdade da Imposição | Proposto | 2026-09-17 | imposition | BR-010, BR-021 | novo — formaliza `IMPOSICAO-MOTOR.md` §6; complementa ADR-015, 017, 018, 020 |
| ADR-022 | Duplex Head-to-Head / Head-to-Foot como Camada Wrapper do Core | Proposto | 2026-09-17 | imposition | BR-010, BR-021 | novo — `DuplexRequest` envolve `ImpositionInput`; core permanece alheio (Regra 5) |
| ADR-023 | Contagem Verificada — Instrumentação + Read-back Condicional | Proposto | 2026-09-17 | imposition / quality | BR-010, BR-021 | novo — aplica `packages/imposition-core/AGENTS.md` Regra 4; depende de ADR-021 |
| ADR-024 | Migração dos projetos C# para .NET 10 | Proposto | 2026-09-17 | build / devops | — | novo — aplica `AGENTS.md` Regra 6; pré-requisito do PR #3-0/#3a |
| ADR-025 | Preview Nativo C# (substitui roll-math.ts) | Proposto | 2026-09-18 | desktop/imposition | BR-010, BR-021 | complementa ADR-015, 017, 021; altera ADR-021 Decisão 5 |
| ADR-026 | Política fill_row garante sobra (ajuste na função de custo) | Proposto | 2026-09-18 | imposition | BR-024, BR-010, BR-021 | novo — altera IMPOSICAO-MOTOR.md §6.3; depende de ADR-021 |
| ADR-040 | Marcas de imposição (crop/registro/colorbar/slugline + overlay corte) | Proposto | 2026-09-18 | imposition | BR-010, BR-021 | novo — reservado; base em `docs/PLAN-marcas-imposicao.md` |
| ADR-041 | Imposição multi-rodada (MultiSheetPlanner / multi-page) | Proposto | 2026-09-18 | imposition | BR-010, BR-021 | novo — reservado; base em `docs/PLAN-imposicao-multipagina.md` |

> ADR-010..012 são **pendentes**: decisões capturadas nos data-maps e catálogo ainda precisam ser formalizadas. Cada uma vira ADR quando sua RFC for concluída.
