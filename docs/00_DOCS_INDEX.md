# 00 — Índice de Documentação e Matriz de Migração

> **Propósito:** único mapa de navegação da árvore `docs/`, inventário de TODOS os arquivos (novos e migrantes) e a matriz antigo→novo.
> **Regra de identidade:** IDs `BR-*`/`ADR-*` são a identidade canônica; a numeração de arquivos não tem valor semântico.

---

## 1. Inventário atual (árvore alvo — estado após F0..F6)

```
docs/
|-- README.md                          # ponto de entrada (criado F0)
|-- 00_DOCS_INDEX.md                   # este arquivo (criado F0)
|-- business/
|   |-- BUSINESS_RULES.md              # BR-001..BR-021  (F1)
|   |-- GLOSSARY.md                    # glossário de domínio (F1)
|   |-- DOMAIN_MODEL.md                # ERD as-is vs target (F1)
|   `-- RULE_CHANGELOG.md              # histórico de mudanças de BR (F1)
|-- product/
|   |-- PRD.md                         # visão de produto (F5)
|   |-- FRD.md                         # requisitos funcionais (F5)
|   |-- USER_STORIES.md                # histórias + aceite (F5)
|   `-- ROADMAP.md                     # roadmap (F5)
|-- architecture/
|   |-- HLD.md                         # alto nível + topologia LAN (F5)
|   |-- LLD.md                         # baixo nível / schema (F5)
|   |-- LAYERS.md                      # mapa de camadas + ledger (F3)
|   |-- SETTINGS_CATALOG.md            # catálogo tipado de settings (F3)
|   `-- API.md                         # contrato OpenAPI (F6)
|-- integrations/
|   |-- CATALOG.md                     # INT-001..011 + RICE-lite (F4)
|   |-- MIMAKI.md                      # contrato M2M (F4)
|   |-- HP_LATEX.md                    # EWS/accounting (F4)
|   |-- KONICA.md                      # PrintManager (F4)
|   |-- WHATSAPP.md                    # canal Baileys (F4)
|   `-- data-maps/
|       |-- HP_EWS_accounting_probe.md # probe bruto (F4)
|       `-- KONICA_printmanager_probe.md # probe bruto (F4)
|-- governance/
|   |-- README.md                      # fluxo de decisão + RFC (F2)
|   |-- DOC_POLICIES.md                # políticas de veracidade (F2)
|   |-- ADR_INDEX.md                   # índice de ADRs (F2)
|   |-- ADR_TEMPLATE.md                # template de ADR (F2)
|   |-- adr/
|   |   |-- ADR-001-turso-embedded-replicas.md        (extraído de 07)
|   |   |-- ADR-002-rbac-matrix.md                    (extraído de 07)
|   |   |-- ADR-003-m2m-auth-mimaki.md                (extraído de 07)
|   |   |-- ADR-004-bot-dm-privacy.md                 (extraído de 07)
|   |   |-- ADR-005-mimaki-auto-deduction.md          (extraído de 07)
|   |   |-- ADR-006-negative-stock-policy.md          (novo)
|   |   |-- ADR-007-stock-idempotency-sourceref.md    (novo)
|   |   |-- ADR-008-atomic-debit-transaction.md       (novo)
|   |   |-- ADR-009-bobina-asset-model.md             (novo — visão de produto)
|   |   `-- ADR-010..014-*.md                         (novos — máquinas)
|   `-- rfc/                           # propostas (vazio por ora)
|-- ops/
|   |-- INFRASTRUCTURE.md              # env, rede, Turso, CI (F5)
|   |-- RUNBOOK.md                     # operacional (F5)
|   |-- RELEASE_NOTES.md               # histórico de versões (F5)
|   `-- INCIDENTS.md                   # post-mortems (placeholder)
|-- user-guides/
|   |-- GUIA_DE_USO.md                 # manual do operador (F5)
|   `-- RBAC.md                        # matriz de permissões (F5)
|-- engineering/
|   |-- ENGINEERING_GUIDELINES.md      # padrões + DoD de PR (F5)
|   |-- TESTING_STRATEGY.md            # estratégia + convenção BR-* (F6)
|   `-- DOC_CONSISTENCY.md             # mecânica docs:check (F6)
`-- _archive/                          # artefatos retirados — nunca deletar (F5)
```

## 2. Matriz antigo → novo

> Status: `CONCLUÍDO` · `EM_ANDAMENTO` · `PENDENTE` · `N/A` (sem destino — arquivado)

| # | Arquivo atual (`docs/`) | Destino | Ação | Status |
|---|--------------------------|---------|------|--------|
| 1 | `01_PRD_PRODUCT_REQUIREMENTS.md` | `product/PRD.md` | migrar + revisar visão | CONCLUÍDO |
| 2 | `02_TRD_TECHNICAL_REQUIREMENTS.md` | `architecture/HLD.md`, `architecture/SETTINGS_CATALOG.md` | digerir (split) | CONCLUÍDO |
| 3 | `03_FRD_FUNCTIONAL_REQUIREMENTS.md` | `product/FRD.md` | migrar + add RF bobina | CONCLUÍDO |
| 4 | `04_USER_STORIES.md` | `product/USER_STORIES.md` | migrar | CONCLUÍDO |
| 5 | `05_SYSTEM_DESIGN_HLD.md` | `architecture/HLD.md` | migrar/consolidar | CONCLUÍDO |
| 6 | `06_LOW_LEVEL_DESIGN_LLD.md` | `architecture/LLD.md` | migrar | CONCLUÍDO |
| 7 | `07_TECHNICAL_DECISIONS_ADR_RFC.md` | `governance/adr/ADR-001..005.md` + `governance/README.md` | extrair ADRs | CONCLUÍDO |
| 8 | `08_ENGINEERING_GUIDELINES.md` | `engineering/ENGINEERING_GUIDELINES.md` | migrar + DoD/PR | CONCLUÍDO |
| 9 | `09_OPS_AND_INFRASTRUCTURE.md` | `ops/INFRASTRUCTURE.md` + `ops/RUNBOOK.md` | split | CONCLUÍDO |
| 10 | `10_RBAC_SPECIFICATION.md` | `user-guides/RBAC.md` | migrar | CONCLUÍDO |
| 11 | `11_TESTING_TWO_PCS_LAN.md` | `ops/RUNBOOK.md` | migrar | CONCLUÍDO |
| 12 | `12_GUIA_DE_USO.md` | `user-guides/GUIA_DE_USO.md` | migrar | CONCLUÍDO |
| 13 | `13_LAN_CONEXAO_SERVER_CLIENT.md` | `ops/INFRASTRUCTURE.md` | migrar | CONCLUÍDO |
| 14 | `14_MIMAKI_INTEGRATION.md` | `integrations/MIMAKI.md` | consolidar (F4) | CONCLUÍDO |
| 15 | `15_RELEASE_NOTES.md` | `ops/RELEASE_NOTES.md` | migrar | CONCLUÍDO |
| 16 | `15_WHATSAPP_ALERTAS_ARQUITETURA.md` | `integrations/WHATSAPP.md` | reescrever (desatualizado) | CONCLUÍDO |
| 17 | `ESTOQUE-LOGICA-ALGORITMO.md` | `business/*` + `governance/adr/ADR-006..008` | digerir (F1) | CONCLUÍDO |
| 18 | `KONICA_PRINTMANAGER_DATA_MAP.md` | `integrations/data-maps/KONICA_printmanager_probe.md` | mover como probe | CONCLUÍDO |
| 19 | `HP_LATEX_330_DATA_MAP.md` | `integrations/data-maps/HP_EWS_accounting_probe.md` | mover como probe | CONCLUÍDO |
| 20 | `PLAN-enterprise-governance.md` | `_archive/` | arquivar ao fim (Phase X) | CONCLUÍDO |
| 21 | Todos os demais `PLAN-*.md` (42) | `_archive/` | arquivar (após harvest) | CONCLUÍDO |
| 22 | `amanha.md`, `plano-amanha.md` | `_archive/` | arquivar | CONCLUÍDO |
| 23 | `DIAG-hp-accounting.md` | `_archive/` | arquivar | CONCLUÍDO |
| 24 | `PROMPT_OPENCODE_AGENTE_HP_LATEX.md` | `_archive/` | arquivar | CONCLUÍDO |
| 25 | `HP_LATEX_330_DATA_MAP.md` (duplicado) | `_archive/` | — | CONCLUÍDO |
| 26 | `PLAN-MIMAKI-FIX.md` (raiz) | `_archive/` | arquivar | CONCLUÍDO |
| 27 | `hp-agent-integration.md` (raiz) | `_archive/` | arquivar | CONCLUÍDO |

## 3. Regras de nomenclatura (futuro)

- **BR-XXX**: regras de negócio — criadas/alteradas SÓ via `business/RULE_CHANGELOG.md` + ADR (ver `governance/README.md`).
- **ADR-XXX**: decisões arquiteturais — um arquivo por decisão em `governance/adr/`, um registro em `ADR_INDEX.md`.
- **INT-XXX**: integrações — catalogadas em `integrations/CATALOG.md`.
- **RFC-XXX**: propostas em `governance/rfc/`; adotadas viram ADR.
- **PLAN-\***: espaço de trabalho. **Não são classe de documentação** — só entram na árvore se forem convertidos em BR/ADR/RFC; caso contrário, `_archive/`.
- **Não usar prefixo numérico** (ex.: `01_`, `15_`) em arquivos novos — a identidade vive nos IDs BR/ADR/INT.

## 4. Status da execução (última atualização: 2026-09-12)

- F0 Bootstrap: ✅ · F1 Regras: ✅ · F2 Governança: ✅ · F3 Camadas: ✅ · F4 Integrações: ✅ · F5 Migração/Arquivo: ✅ · F6 Veracidade: ✅ · Phase X: ✅ (marcador no PLAN, arquivado em `_archive/`)