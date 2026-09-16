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

> ADR-010..012 são **pendentes**: decisões capturadas nos data-maps e catálogo ainda precisam ser formalizadas. Cada uma vira ADR quando sua RFC for concluída.