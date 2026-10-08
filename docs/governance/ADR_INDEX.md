# Ã�ndice de ADRs â€” GraficaOS

> **Regra:** um arquivo por decisÃ£o em `governance/adr/`. Admitir ADR = adicionar linha aqui + criar o arquivo. Adicionar ADR = mudar status da linha existente.

| ID | TÃ­tulo | Status | Data | DomÃ­nio | BR-* | Substitui / ObservaÃ§Ã£o |
|----|--------|--------|------|---------|------|-------------------------|
| ADR-001 | Turso (LibSQL) com embedded replicas | Aprovado | â€” | ops | â€” | antigo 07 |
| ADR-002 | Matriz RBAC para proteÃ§Ã£o de dados | Aprovado | â€” | rbac | BR-018 | antigo 07 |
| ADR-003 | AutenticaÃ§Ã£o M2M para integraÃ§Ã£o Mimaki | Aprovado | â€” | integrations | BR-018 | antigo 07 |
| ADR-004 | Respostas do bot como DM (privacidade) | Aprovado | â€” | chat | BR-020 | antigo 07 |
| ADR-005 | DeduÃ§Ã£o automÃ¡tica de mÃ­dia Mimaki | Aprovado (ressalva idempotÃªncia) | â€” | deduction | BR-012 | antigo 07; ver ADR-007 |
| ADR-006 | PolÃ­tica de saldo negativo | Proposto | 2026-09-12 | deduction | BR-007 | novo |
| ADR-007 | IdempotÃªncia via `source_ref` | Proposto | 2026-09-12 | deduction/ledger | BR-008, BR-012 | novo |
| ADR-008 | DÃ©bito atÃ´mico (transaÃ§Ã£o SQL + saldo antes/depois) | Proposto | 2026-09-12 | ledger | BR-006, BR-007 | novo |
| ADR-009 | Modelo bobina-ativo + configuraÃ§Ã£o por empresa | Proposto (visÃ£o travada) | 2026-09-12 | inventory/company-config | BR-002, BR-018, BR-019, BR-021 | novo â€” TARGET |
| ADR-010 | DecisÃµes do data-map Konica (D2..D7) | Proposto | â€” | integrations | BR-013 | pendente â€” semente em `integrations/data-maps/KONICA_printmanager_probe.md` |
| ADR-011 | DecisÃµes do data-map HP Latex | Proposto | â€” | integrations | BR-011 | pendente â€” semente em `integrations/data-maps/HP_EWS_accounting_probe.md` |
| ADR-012 | WhatsApp Business API vs Baileys | Proposto | â€” | integrations | BR-016 | pendente â€” ver INT-005/INT-107 no catÃ¡logo |
| ADR-013 | IdentificaÃ§Ã£o de bobina ativa em mÃ¡quina + jobs Ã³rfÃ£os (M3) | Proposto | 2026-09-13 | inventory/machines | BR-002 | novo â€” opera M3 sobre ADR-009 |
| ADR-014 | PadronizaÃ§Ã£o de Etiquetas FÃ­sicas (90x35mm), ImposiÃ§Ã£o Konica e Quick-Switch | Aprovado | 2026-09-14 | inventory/machines | BR-002, BR-010, BR-021 | novo â€” complementa ADR-009 e ADR-013 |
| ADR-015 | Arquitetura Sidecar e Ferramentas Nativas (ImpositorKonica WPF) | Aprovado | 2026-09-15 | desktop/imposition | BR-010, BR-021 | novo â€” complementa ADR-014 |
| ADR-016 | Canal de rastreio Mimaki teste (CSV RasterLink) | Proposto | 2026-09-15 | integrations | BR-012 | novo â€” paralelo ao M2M (INT-001); sem deduÃ§Ã£o |
| ADR-017 | Motor Headless de ImposiÃ§Ã£o AutomÃ¡tica (Step & Repeat CLI) | Aprovado (Fase de ValidaÃ§Ã£o em FÃ¡brica) | 2026-09-16 | imposition | BR-010, BR-021 | novo â€” desacopia motor de cÃ¡lculo do ImpositorKonica |
| ADR-018 | Motor GrÃ¡fico de SaÃ­da Externo â€” CorelDRAW (COM/VGCore) vs Adobe Illustrator (COM/ExtendScript) | Proposto (avaliaÃ§Ã£o) | 2026-09-16 | desktop/imposition | BR-010, BR-021 | novo â€” adoÃ§Ã£o condicionada a critÃ©rios |
| ADR-019 | Dynamic Insumo Forms and Data Modeling Adjustments | Aprovado | 2026-09-16 | inventory | â€” | novo â€” arquivo ausente no Ã­ndice (registrado retroativamente) |
| ADR-020 | DistribuiÃ§Ã£o Modular de Sidecars, Gating por RBAC e Licenciamento por EdiÃ§Ãµes | Proposto | 2026-09-16 | desktop/imposition, ops, company-config | BR-018, BR-021 | novo â€” complementa ADR-002, ADR-015, ADR-017, ADR-018; base em `docs/PLAN-sidecars-enterprise.md` |
| ADR-021 | GridSearchEngine como Fonte Ãšnica de Verdade da ImposiÃ§Ã£o | Proposto | 2026-09-17 | imposition | BR-010, BR-021 | novo â€” formaliza `IMPOSICAO-MOTOR.md` Â§6; complementa ADR-015, 017, 018, 020 |
| ADR-022 | Duplex Head-to-Head / Head-to-Foot como Camada Wrapper do Core | Proposto | 2026-09-17 | imposition | BR-010, BR-021 | novo â€” `DuplexRequest` envolve `ImpositionInput`; core permanece alheio (Regra 5) |
| ADR-023 | Contagem Verificada â€” InstrumentaÃ§Ã£o + Read-back Condicional | Proposto | 2026-09-17 | imposition / quality | BR-010, BR-021 | novo â€” aplica `packages/imposition-core/AGENTS.md` Regra 4; depende de ADR-021 |
| ADR-024 | MigraÃ§Ã£o dos projetos C# para .NET 10 | Proposto | 2026-09-17 | build / devops | â€” | novo â€” aplica `AGENTS.md` Regra 6; prÃ©-requisito do PR #3-0/#3a |
| ADR-025 | Preview Nativo C# (substitui roll-math.ts) | Proposto | 2026-09-18 | desktop/imposition | BR-010, BR-021 | complementa ADR-015, 017, 021; altera ADR-021 DecisÃ£o 5 |
| ADR-026 | PolÃ­tica fill_row garante sobra (ajuste na funÃ§Ã£o de custo) | Proposto | 2026-09-18 | imposition | BR-024, BR-010, BR-021 | novo â€” altera IMPOSICAO-MOTOR.md Â§6.3; depende de ADR-021 |
| ADR-040 | Marcas de imposiÃ§Ã£o (crop/registro/colorbar/slugline + overlay corte) | Proposto | 2026-09-18 | imposition | BR-010, BR-021 | novo â€” reservado; base em `docs/PLAN-marcas-imposicao.md` |
| ADR-041 | ImposiÃ§Ã£o multi-rodada (MultiSheetPlanner / multi-page) | Proposto | 2026-09-18 | imposition | BR-010, BR-021 | novo â€” reservado; base em `docs/PLAN-imposicao-multipagina.md` |

> ADR-010..012 sÃ£o **pendentes**: decisÃµes capturadas nos data-maps e catÃ¡logo ainda precisam ser formalizadas. Cada uma vira ADR quando sua RFC for concluÃ­da.
| ADR-042 | Evolução de Mesa de Etiquetas para Mesa de Imposição Profissional | Aprovado | 2026-09-20 | desktop/imposition | BR-010, BR-021 | complementa ADR-015, ADR-021 |
| ADR-043 | Imposition.Pdf.dll (QPDF + preservação OCG) | Proposto | 2026-09-20 | imposition/pdf | BR-010, BR-021 | complementa ADR-017, ADR-021, ADR-041 |
| ADR-044 | Marcas de Imposi��o (Crop + Mimaki Tipo 1) | Proposto | 2026-09-21 | imposition/prepress | BR-010, BR-021 | complementa ADR-043 |
| ADR-047 | Slugline de Imposição (Linha de Informação Técnica do Job) | Proposto | 2026-09-29 | imposition/prepress | BR-010, BR-021 | novo — complementa ADR-040; observa ADR-043, ADR-044 |

| ADR-048 | Modo Automático da Slugline (--slugline auto) | Proposto | 2026-09-30 | imposition/prepress | BR-010, BR-021 | complementa ADR-047 |

| ADR-049 | Contrato de Calculo e Compensacao Termica de Emendas (Modulo Seams) | Aprovado | 2026-09-30 | imposition/prepress | BR-050 | novo - complementa ADR-015, ADR-017, ADR-021, ADR-041 |

| ADR-050 | Contrato de Gestao de Rolos e Sugestao de Rolo Otimo (Modulo Seams) | Aprovado | 2026-09-30 | imposition/prepress/inventory | BR-051 | novo - complementa ADR-009, ADR-015, ADR-049 |

| ADR-051 | Contrato da Linha-Guia de Emenda (K 40% em PDF e Raster) | Aprovado | 2026-10-02 | imposition/prepress | BR-053 | novo - complementa ADR-047, ADR-049 |

| ADR-052 | Contrato do Cartucho de Tinta/Toner como Ativo por Canal (HP e Konica) | Aprovado | 2026-10-02 | inventory/deduction/alerts | BR-052, BR-054 | novo - complementa ADR-009 (Emenda 4), ADR-007, ADR-008 |

| [ADR-052](adr/ADR-052-seams-preview-contract.md) | Contrato de Preview ICC-Aware e Display Adaptation (Modulo Seams) | Aprovado | 2026-10-03 | imposition/prepress/render | BR-052 | complementa ADR-049, ADR-050, ADR-051; aplica R-020 |
| [ADR-053](adr/ADR-053-jpg-export-contract.md) | Contrato de Exportacao de Paineis JPG CMYK (Modulo Seams) | Aprovado | 2026-10-05 | imposition/prepress/export | BR-054 | complementa ADR-049, ADR-050, ADR-051, ADR-052; aplica R-020 |

| [ADR-054](adr/ADR-054-pdfx1a-export-contract.md) | Contrato de Exportacao de Paineis PDF/X-1a (Modulo Seams) | Aprovado | 2026-10-06 | imposition/prepress/export | BR-055 | complementa ADR-043, ADR-049, ADR-050, ADR-051; aplica R-020 |
| [ADR-055](adr/ADR-055-seams-cli-contract.md) | Contrato de Automacao Headless CLI de Emendas (Modulo Seams) | Proposta | 2026-10-06 | imposition/prepress/cli | BR-056 | complementa ADR-049, ADR-050, ADR-053, ADR-054; aplica R-013, R-019, R-020 |
| [ADR-056](adr/ADR-056-jpg-encoder-contract.md) | Contrato do Codificador JPEG CMYK (Modulo Seams / Hotfix) | Aprovado | 2026-10-07 | imposition/prepress/export | BR-054 | substitui decisoes de ADR-053; aplica R-020, R-021 |
| [ADR-057](adr/ADR-057-estoque-tabela-e-tinta-unidade.md) | Estoque em Tabela Inteligente, Lote de Tinta por Unidade e Desacoplamento de Consumo | Aprovado | 2026-10-07 | inventory/prepress-ui/deduction | BR-057 | complementa ADR-009, ADR-013; reformula BR-011, BR-012 |

| [ADR-058](adr/ADR-058-cli-logging-contract.md) | Contrato de Logging e Diagnostico Headless (Modulo Seams / CLI) | Aprovado | 2026-10-08 | imposition/prepress/cli | BR-058 | complementa ADR-055, ADR-056; aplica R-009, R-013, R-019 |
| [ADR-059](adr/ADR-059-seam-guide-customization-contract.md) | Contrato de Customizacao da Linha-Guia de Emenda | Aprovado | 2026-10-08 | imposition/prepress/export | BR-059 | complementa ADR-051, ADR-053, ADR-054, ADR-055, ADR-056; aplica R-013, R-020 |
| [ADR-060](adr/ADR-060-pdf-object-graph-contract.md) | Contrato de Integridade Estrutural de Grafo de Objetos na Exportacao PDF/X-1a | Aprovado | 2026-10-08 | imposition/prepress/export | BR-055 | substitui decisoes de ADR-054; aplica R-009, R-013, R-020, R-021, R-022, R-023 |
