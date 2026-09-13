# PLAN — Governança Enterprise, Documentação Consolidada e Modularização (GraficaOS)

> **Arquivo:** `D:\www\2026\felipe-neneu-portfolio\dpi-controle-estoque\docs\PLAN-enterprise-governance.md`
> **Escopo da execução deste plano:** somente documentação + plano de modularização. **Nenhuma mudança de código.**
> **Data:** 2026-09-12 · **Status:** ✅ CONCLUÍDO (F0..F6 + Phase X executados; este arquivo é arquivado em `docs/_archive/` após esta linha) · **Idioma dos artefatos:** PT-BR (termos técnicos em inglês quando idiomáticos)

## 1. Contexto e Objetivo

### 1.1 Visão de produto (por que este esforço existe)

O GraficaOS hoje trata "bobina" como quantidade agregada por SKU (`stock_items.current_quantity`). A visão de produto é: **cada bobina física é um ativo rastreável individual** — com metros restantes próprios, estado (em uso / em estoque / vazia) e localização física. Sintomas que motivam:

- Duas bobinas de 50 m colapsam em uma linha "100 m disponíveis", perdendo a identidade física.
- Impossível saber "bobina A tem 8 m e está na máquina 2" vs "bobina B tem 50 m intacta no estoque".

Este plano não implementa o modelo de bobina-ativo: ele **governa** essa evolução (codificada como ADR-009/TARGET) e cria a documentação + infraestrutura de governança para que o propósito nunca se perca e o sistema possa ser customizado por empresa.

### 1.2 Decisões travadas (Socratic Gate — não reabrir)

| ID | Decisão |
|----|---------|
| D1 | **Modelo enterprise: SINGLE DEPLOY PER COMPANY.** Base de código productizada, configurada por cliente. NÃO multi-tenant SaaS. |
| D2 | **Escopo deste esforço: docs + modularização (plano).** Modelo bobina-ativo é previsão de produto codificada como ADR-009 (TARGET), não código agora. |
| D3 | **Catálogo de integrações: mapear + priorizar** (RICE-lite, ver Anexo B). Nenhum compromisso de implementação. |

### 1.3 Stack atual (fatos levantados na exploração — usar como verdade)

- **Frontend:** Next.js 16 — `D:\www\2026\felipe-neneu-portfolio\dpi-controle-estoque\grafica-app\src\`
- **Backend:** Fastify 5 — `D:\www\2026\felipe-neneu-portfolio\dpi-controle-estoque\grafica-app\backend\src\`
- **Dados:** Drizzle ORM + Turso/LibSQL. Tabelas: `stock_items`, `stock_transactions`, `machine_items`, `machines`, `users`, `print_jobs`, `mimaki_jobs`, `notifications`, `whatsapp_recipients`, `settings` (KV stringly-typed), `machine_telemetry`
- **Realtime:** Socket.IO
- **Agentes de ingestão:** HP Latex 330 (poll 60 s, EWS `accounting.xls`), Konica C3070 (poll 30 s, PrintManager), Mimaki (webhook M2M + fila)
- **Notificação:** WhatsApp via Baileys
- **RBAC:** DEV_MASTER / ADMIN / OPERATOR

Fatos de domínio críticos (referenciados nas fases):

- Débito de estoque: read-modify-write sem transação SQL; saldo negativo silenciosamente clampado `max(0, ...)` em 4+ locais.
- `computeStatus` duplicado em ~4 arquivos; motivo de transação (`reason`) é texto livre usado como idempotência frágil via `LIKE`; sem `balance_before/after`, sem `source_ref`.
- `add-roll` (`grafica-app\backend\src\routes\stock.ts:289`) é a primeira semente do modelo de ativo.
- Conversões de unidade já puras em `lib/math.ts` (Big.js).
- PRD promete briefings WhatsApp agendados **não implementados**; `15_WHATSAPP_ALERTAS_ARQUITETURA.md` desatualizado (hoje existe `whatsapp_recipients` multi-destinatário).
- 40+ arquivos `PLAN-*`/`DIAG-*` soltos em `docs\`.

## 2. Escopo e Não-Objetivos

**Dentro do escopo (agora):**

- Consolidar TODA a documentação em árvore versionada sob `docs\` (ver §4).
- Registrar regras de negócio canonizadas (BR-*) e decisões arquiteturais (ADR-*).
- Gerar `architecture\LAYERS.md` (mapa clean-architecture) + ledger hard-coded→config + `architecture\SETTINGS_CATALOG.md` — plano de modularização para customização por empresa (D1).
- Catálogo de integrações atuais + candidatas com priorização (D3).
- Mecânica de veracidade (`docs:check`, snapshot OpenAPI, convenção de testes amarrando BR-*).

**Fora do escopo (proibido neste esforço):**

- NÃO implementar o modelo bobina-ativo (é ADR-009/TARGET — plano de implementação futuro e separado).
- NÃO alterar código, schema, rotas, migrações Drizzle ou UI.
- NÃO criar multi-tenant SaaS (D1: single deploy per company).
- NÃO contratar/implementar novas integrações (D3: apenas mapear e priorizar).
- NÃO deletar arquivos (política: mover para `_archive\`, nunca excluir).

## 3. Critérios de Sucesso (mensuráveis)

1. 100% dos arquivos soltos `PLAN-*`/`DIAG-*`/`amanha*`/`PROMPT_OPENCODE_*` movidos para `docs\_archive\` (ou digeridos em artefato canônico) até o fim da Fase 5.
2. `business\BUSINESS_RULES.md` com BR-001..BR-021 (Anexo A) — cada linha com status; `IMPLEMENTED` somente se houver teste que a prenda (Fase 6).
3. ADRs 001–014 existentes ou criados (extrair 001–005, criar 006–009 e 010–014) — inclui ADR-009 com a visão bobina-ativo + config por empresa.
4. `architecture\LAYERS.md` com, no mínimo, todos os hotspots do Anexo E mapeados para camada + entrada no ledger hard-coded→config.
5. `integrations\CATALOG.md` com INT-001..INT-010 preenchidos e ranqueados por RICE-lite (Anexo B).
6. `00_DOCS_INDEX.md` com a matriz de migração antigo→novo 100% coberta (Anexo C) e nenhum link quebrado (validado por `docs:check`).
7. `docs:check` (script) roda sem erros; snapshot OpenAPI versionado; diff de snapshot no CI.
8. Nenhum arquivo deletado durante o esforço (guardrail: tudo vai para `_archive\`).

## 4. Mapa de Entregáveis (árvore alvo)

Raiz: `D:\www\2026\felipe-neneu-portfolio\dpi-controle-estoque\docs\`

```
docs\
|-- README.md                      # Ponto de entrada: propósito do produto, mapa da árvore, como navegar
|-- 00_DOCS_INDEX.md               # Matriz de migração antigo -> novo (Anexo C) + regras de nomenclatura
|-- business\
|   |-- BUSINESS_RULES.md          # Registro canônico de regras BR-001..BR-021 (Anexo A)
|   |-- GLOSSARY.md                # Glossário de domínio (bobina, rolo, folha, máquina, job...)
|   |-- DOMAIN_MODEL.md            # Modelo "as-is" (ERD atual) vs "target" (ERD bobina-ativo)
|   `-- RULE_CHANGELOG.md          # Histórico de mudanças de regras (data, BR afetada, ADR, motivo)
|-- product\
|   |-- PRD.md                     # Produto: visão, personas, objetivos, não-objetivos
|   |-- FRD.md                     # Requisitos funcionais rastreáveis
|   |-- USER_STORIES.md            # Histórias de usuário com critérios de aceite
|   `-- ROADMAP.md                 # Roadmap: o que existe, o que está previsto (ex.: ADR-009)
|-- architecture\
|   |-- HLD.md                     # Desenho de alto nível (componentes, fluxos, dados)
|   |-- LLD.md                     # Desenho de baixo nível (módulos, rotas, eventos)
|   |-- LAYERS.md                  # Mapa clean-architecture + ledger hard-coded -> config (Fase 3)
|   |-- SETTINGS_CATALOG.md        # Catálogo tipado de chaves `settings` (hoje stringly-typed)
|   `-- API.md                     # Contrato de API (OpenAPI versionado + convenções)
|-- integrations\
|   |-- CATALOG.md                 # INT-### (Anexo B) + priorização RICE-lite
|   |-- MIMAKI.md                  # Integração Mimaki (M2M webhook + fila, folderTimestamp)
|   |-- HP_LATEX.md                # Integração HP Latex 330 (EWS accounting.xls, dedução de substrato)
|   |-- KONICA.md                  # Integração Konica C3070 (PrintManager, toner/tinta)
|   |-- WHATSAPP.md                # Integração WhatsApp (Baileys, recipientes multi) — REWRITE
|   `-- data-maps\
|       |-- HP_EWS_accounting_probe.md      # Probe bruto EWS (campos observados)
|       `-- KONICA_printmanager_probe.md    # Probe bruto PrintManager (campos observados)
|-- governance\
|   |-- README.md                  # Fluxo de decisão + processo RFC (quando criar ADR)
|   |-- DOC_POLICIES.md            # Políticas: veracidade, footers source:file:line, nunca-deletar
|   |-- ADR_INDEX.md               # Índice de todos os ADRs (001–014)
|   |-- ADR_TEMPLATE.md            # Template de ADR (status, contexto, decisão, consequências)
|   `-- adr\
|       |-- ADR-001..005.md        # Decisões existentes (extraídas de 07_TECHNICAL_DECISIONS_ADR_RFC.md)
|       |-- ADR-006.md             # [NOVO] Política de saldo negativo (clamp documentado vs erro)
|       |-- ADR-007.md             # [NOVO] Idempotência via source_ref (fim do LIKE em reason)
|       |-- ADR-008.md             # [NOVO] Débito atômico (transação SQL + balance_before/after)
|       |-- ADR-009.md             # [NOVO] Modelo bobina-ativo + configuração por empresa (TARGET)
|       `-- ADR-010..014.md        # [NOVOS] Decisões de máquina/integração (ver Anexo A)
|-- ops\
|   |-- INFRASTRUCTURE.md          # Rede LAN, servidores, Turso, deploy por empresa
|   |-- RUNBOOK.md                 # Procedimentos operacionais (subir, diagnosticar, recuperar)
|   |-- RELEASE_NOTES.md           # Notas de versão (histórico vivo)
|   `-- INCIDENTS.md               # Registro de incidentes e post-mortems
|-- user-guides\
|   |-- GUIA_DE_USO.md             # Guia de uso do operador (PT-BR)
|   `-- RBAC.md                    # Papéis e permissões (DEV_MASTER/ADMIN/OPERATOR)
|-- engineering\
|   |-- ENGINEERING_GUIDELINES.md  # Padrões de engenharia do repositório
|   |-- TESTING_STRATEGY.md        # Estratégia de testes + convenção de nomes BR-*
|   `-- DOC_CONSISTENCY.md         # Regras de consistência entre docs e código
`-- _archive\                      # Arquivos migrados (nunca deletar; ver Anexo C)
```

**Regra estrutural chave:** a identidade da regra vive nos IDs `BR-*`/`ADR-*`, NÃO na numeração dos arquivos. Um arquivo pode conter várias regras; uma regra nunca deve ser duplicada entre docs (docs derivados referenciam por ID).

## 5. Fases e Tarefas

> Regra global de execução: cada tarefa termina com commit pequeno e atualização de `00_DOCS_INDEX.md`. Nenhuma tarefa pode alterar código. Tamanho relativo indicado no fim de cada fase.

### Fase 0 — Bootstrap: índice e esqueleto

**T0.1 — Inventário completo (auditoria do que existe)**
- O quê: tabela de inventário de TODOS os arquivos em `D:\www\2026\felipe-neneu-portfolio\dpi-controle-estoque\docs\` com metadados (nome, fonte provável, estado: canônico/desatualizado/descartável, destino na árvore).
- Inputs: `docs\*` (glob completo).
- Agente: explorer-agent.
- Verificação: 100% dos arquivos listados; nenhum órfão; estados coerentes com o Anexo C.

**T0.2 — Criar esqueleto de pastas**
- O quê: criar as pastas da árvore §4 (`business`, `product`, `architecture`, `integrations\data-maps`, `governance\adr`, `ops`, `user-guides`, `engineering`, `_archive`).
- Agente: documentation-writer.
- Verificação: árvore espelha §4; zero arquivos de conteúdo ainda (só esqueleto).

**T0.3 — Criar `00_DOCS_INDEX.md` (matriz de migração)**
- O quê: índice com a matriz antigo→novo (Anexo C), as regras de nomenclatura (IDs em BR-*/ADR-*, não em números de arquivo) e o status de migração por linha (PENDENTE/EM_ANDAMENTO/CONCLUÍDO).
- Inputs: T0.1, Anexo C.
- Agente: project-planner + documentation-writer.
- Verificação: matriz com todas as linhas do Anexo C preenchidas; campos de status funcionais.

**T0.4 — Criar `README.md` raiz**
- O quê: ponto de entrada da docs: propósito do produto (visão bobina), mapa da árvore, como navegar, onde registrar decisão nova.
- Agente: documentation-writer.
- Verificação: links funcionais para as seções da árvore.

**Tamanho:** S · **Dependência:** nenhuma · **DoD:** inventário completo + esqueleto + índice + README.

### Fase 1 — Regras de negócio e propósito (o coração)

**T1.1 — Digerir `ESTOQUE-LOGICA-ALGORITMO.md`**
- O quê: extrair TODA a lógica descrita em regras BR-* (Anexo A) e apontamentos de ADR. O que é regra de domínio vira BR; o que é decisão arquitetural vira ADR.
- Inputs: `D:\www\2026\felipe-neneu-portfolio\dpi-controle-estoque\docs\ESTOQUE-LOGICA-ALGORITMO.md`, `docs\PLAN-estoque-logica.md`, `docs\PLAN-stock-precision-bigjs.md`, `docs\PLAN-hp-substrate-deduction.md`, `grafica-app\backend\src\routes\stock.ts` (incl. `:289` add-roll).
- Agente: code-archaeologist + database-architect.
- Verificação: cada afirmação de lógica mapeada para BR-* ou ADR-*; nenhum conteúdo órfão.

**T1.2 — Criar `business\BUSINESS_RULES.md` (BR-001..BR-021)**
- O quê: registro canônico com colunas: ID, regra, fonte (`file:line`), status (IMPLEMENTED/PARTIAL/TARGET/PROPOSED), teste que pin (se IMPLEMENTED), ADR relacionado.
- Agente: documentation-writer + database-architect.
- Verificação: 21 linhas preenchidas conforme Anexo A; status honestos (TARGET para bobina-ativo; IMPLEMENTED somente onde há teste — caso contrário PARTIAL).

**T1.3 — Criar `business\GLOSSARY.md` e `business\DOMAIN_MODEL.md` (as-is vs target)**
- O quê: glossário de domínio; ERD atual (schema Drizzle) + ERD target (bobina como ativo, máquina, localização física).
- Inputs: schema Drizzle (localizar `grafica-app\backend\src\db\schema*`), T1.2.
- Agente: database-architect.
- Verificação: todas as entidades do schema citadas; delta as-is→target explícito (tabelas/colunas novas sugeridas).

**T1.4 — Criar ADRs 006–009 (políticas de estoque)**
- O quê: ADR-006 (saldo negativo: política explícita — clamp documentado ou erro em versão futura), ADR-007 (idempotência via `source_ref`, fim do LIKE em `reason`), ADR-008 (débito atômico com transação SQL + `balance_before/after`), ADR-009 (modelo bobina-ativo + configuração por empresa — TARGET, contém D1 e a visão da bobina). Usar ADR_TEMPLATE (criado na Fase 2; se não existir ainda, criar template mínimo aqui e refinar lá).
- Inputs: T1.1; `grafica-app\backend\src\routes\stock.ts`; `docs\07_TECHNICAL_DECISIONS_ADR_RFC.md` (fonte dos ADRs 001–005).
- Agente: database-architect + backend-specialist.
- Verificação: ADRs 006–009 escritos e indexados; ADR-009 contém a declaração de visão (§1.1) + D1.

**T1.5 — Harvest dos PLAN-* de estoque restantes + `RULE_CHANGELOG.md`**
- O quê: digerir `PLAN-hp-substrate-deduction.md`, `PLAN-hp-tintas-tabs-ux.md`, `PLAN-konica-toner-delete-accurio.md`, `PLAN-konica-printmanager.md` em BR/ADR ou mover para `_archive\`; iniciar `RULE_CHANGELOG.md` (toda mudança de BR registrada com data + motivo + ADR).
- Agente: code-archaeologist + documentation-writer.
- Verificação: nada relevante perdido; changelog com entradas das ADRs 006–009.

**Tamanho:** M · **Dependência:** Fase 0 · **DoD:** BR-001..021 publicado; ADRs 001–009 no índice; visão bobina gravada em ADR-009.

### Fase 2 — Processo de governança

**T2.1 — `governance\README.md` + `governance\DOC_POLICIES.md`**
- O quê: fluxo de decisão (quando abrir RFC, quando criar ADR, quem aprova), ciclo de vida de BR/ADR (PROPOSED → APPROVED → IMPLEMENTED → SUPERSEDED), políticas de veracidade: footer `source: file:line`, "IMPLEMENTED só com teste", nunca deletar arquivos (mover para `_archive`), idioma PT-BR.
- Agente: project-planner + documentation-writer.
- Verificação: workflow testável (passo a passo); políticas sem ambiguidade.

**T2.2 — `ADR_TEMPLATE.md` + `ADR_INDEX.md`**
- O quê: template padronizado (status, contexto, drivers, opções consideradas, decisão, consequências, refs) + índice de todos os ADRs (001–014 até o fim da Fase 4).
- Agente: documentation-writer.
- Verificação: template cobre decisões novas sem fricção; índice linkado e completo.

**T2.3 — DoD e checklist de PR de docs**
- O quê: Definition of Done para qualquer mudança de docs (footer de fonte presente, índice atualizado, `docs:check` verde quando existir) + checklist de PR (aplicável a PRs de docs e de código; se houver `grafica-app\.github\` templates, atualizar; senão documentar em `engineering\ENGINEERING_GUIDELINES.md`).
- Agente: project-planner + test-engineer.
- Verificação: checklist aplicável e claro.

**Tamanho:** M · **Dependência:** Fase 1 (vocabulário BR/ADR) · **DoD:** templates existem e são autoexplicativos.

### Fase 3 — Modularização / LAYERS

**T3.1 — Inventário de hotspots de acoplamento**
- O quê: levantar TODOS os pontos do Anexo E com localização `file:line` (computeStatus duplicado, matchers por convenção de nome, agents como bibliotecas, singletons db/socket, system-bot IDs duplicados, contratos UI↔API manuais, débito não-atômico, `settings` stringly-typed, intervals hard-coded).
- Inputs: `grafica-app\backend\src\` e `grafica-app\src\`.
- Agente: code-archaeologist.
- Verificação: cada hotspot do Anexo E com arquivo(s) + linha(s) reais; nenhum item vazio.

**T3.2 — `architecture\LAYERS.md`**
- O quê: mapa clean-architecture do GraficaOS: camadas (domain / application / infrastructure / interface), onde cada módulo atual se encaixa, e a borda de configuração por empresa (D1).
- Agente: backend-specialist + code-archaeologist.
- Verificação: todos os hotspots do Anexo E têm "camada-alvo" + "ação de modularização" (extrair/configurar/mover).

**T3.3 — Ledger hard-coded → config**
- O quê: tabela de constantes/lógicas hard-coded que viram configuração por empresa (ex.: polling HP 60 s / Konica 30 s, limites de alerta, textos WhatsApp, limiares de estoque baixo, IDs de system-bot). Formato: atual (`file:line`) → config proposta → dono (chave tipada de settings).
- Agente: backend-specialist.
- Verificação: ≥ 10 entradas reais (não inventadas) com `file:line`.

**T3.4 — `architecture\SETTINGS_CATALOG.md`**
- O quê: catálogo tipado das chaves de `settings` (hoje stringly-typed): chave, tipo, default, escopo (global/por empresa), usado em (`file:line`).
- Agente: database-architect + backend-specialist.
- Verificação: chaves reais do schema/Turso listadas; tipos propostos.

**Tamanho:** L · **Dependência:** Fase 1 · **DoD:** LAYERS + ledger + catálogo cobrem os hotspots reais (com fonte no código), prontos para virar tickets de refactor sem depender deste plano.

### Fase 4 — Catálogo de integrações

**T4.1 — `integrations\CATALOG.md` (INT-001..INT-010)**
- O quê: tabela única com o schema do Anexo B para integrações ATIVAS (HP, Konica, Mimaki, WhatsApp) e CANDIDATAS (WhatsApp Business API, ERP, NF-e, RFID, BI, e-mail), priorizadas por RICE-lite; nenhum compromisso de implementação (D3).
- Inputs: `docs\14_MIMAKI_INTEGRATION.md`, `docs\KONICA_PRINTMANAGER_DATA_MAP.md`, `docs\HP_LATEX_330_DATA_MAP.md`, `docs\15_WHATSAPP_ALERTAS_ARQUITETURA.md`, `docs\PLAN-mimaki-integration.md`, `docs\PLAN-mimaki-jobs-fix.md`, `docs\PLAN-hp-info-discovery.md`, `docs\DIAG-hp-accounting.md`; agentes em `grafica-app\backend\src\`.
- Agente: explorer-agent + backend-specialist.
- Verificação: 4 ativas + 6 candidatas preenchidas; score RICE-lite calculado; prioridade final explícita.

**T4.2 — Docs de integração individuais (MIMAKI / HP_LATEX / KONICA / WHATSAPP)**
- O quê: consolidar `14_MIMAKI_INTEGRATION.md` → `integrations\MIMAKI.md` (webhook M2M, fila, folderTimestamp único); HP → `integrations\HP_LATEX.md` (EWS accounting.xls, dedução de substrato); Konica → `integrations\KONICA.md` (PrintManager, toner/tinta, delete accurio); WhatsApp → `integrations\WHATSAPP.md` (REWRITE: estado atual com `whatsapp_recipients` multi-destinatário; briefings agendados do PRD marcados como NÃO implementados — BR-016/PROPOSED).
- Agente: documentation-writer + backend-specialist.
- Verificação: nenhuma integração ativa sem doc; docs refletem o código (não promessas do PRD).

**T4.3 — Digerir data-maps brutos**
- O quê: mover conteúdo bruto de `KONICA_PRINTMANAGER_DATA_MAP.md` e `HP_LATEX_330_DATA_MAP.md` para `integrations\data-maps\` (probes) com footer de origem; referenciar planilhas/PDFs de origem quando existirem.
- Agente: documentation-writer.
- Verificação: probes preservam campos observados; originais arquivados em `_archive\` (nunca deletados).

**Tamanho:** L · **Dependência:** Fase 1 · **DoD:** catálogo ranqueado + 4 docs de integração atuais + probes arquivados.

### Fase 5 — Migração e consolidação final

**T5.1 — Migração dos docs canônicos (01–15)**
- O quê: aplicar a matriz do Anexo C: `01_PRD...`→`product\PRD.md`; `02_TRD...`→digerir em `architecture\HLD/LLD`; `03_FRD...`→`product\FRD.md`; `04_USER_STORIES...`→`product\USER_STORIES.md`; `05_SYSTEM_DESIGN_HLD...`→`architecture\HLD.md`; `06_LOW_LEVEL_DESIGN_LLD...`→`architecture\LLD.md`; `07_TECHNICAL_DECISIONS...`→extrair ADR-001..005 para `governance\adr\`; `08_ENGINEERING_GUIDELINES...`→`engineering\`; `09_OPS_AND_INFRASTRUCTURE...`→split `ops\INFRASTRUCTURE.md`+`ops\RUNBOOK.md`; `10_RBAC...`→`user-guides\RBAC.md`; `11_TESTING_TWO_PCS_LAN...`→`ops\RUNBOOK.md` ou `engineering\TESTING_STRATEGY.md`; `12_GUIA_DE_USO...`→`user-guides\GUIA_DE_USO.md`; `13_LAN...`→`ops\INFRASTRUCTURE.md`; `15_RELEASE_NOTES...`→`ops\RELEASE_NOTES.md`. Usar `git mv` (nunca copiar+deletar) e atualizar `00_DOCS_INDEX.md` a cada movimento.
- Agente: documentation-writer (+ code-archaeologist para splits delicados).
- Verificação: matriz 100% CONCLUÍDA; nenhum arquivo de origem perdido.

**T5.2 — Arquivo morto (`_archive\`)**
- O quê: mover TODOS os `PLAN-*`, `DIAG-*`, `amanha.md`, `plano-amanha.md`, `PROMPT_OPENCODE_AGENTE_HP_LATEX.md` e originais já digeridos para `_archive\`, com `_archive\README.md` explicando "por que está aqui / como desarquivar".
- Agente: project-planner + explorer-agent.
- Verificação: raiz `docs\` limpa (só README, 00_DOCS_INDEX e pastas da árvore); nada deletado.

**T5.3 — Link audit + README final**
- O quê: ajustar todos os links internos (footers de fonte, referências cruzadas BR/ADR, navegação); conferir `README.md` da raiz.
- Agente: explorer-agent.
- Verificação: nenhum link quebrado (manual + `docs:check` quando disponível).

**Tamanho:** M · **Dependência:** Fases 1, 3, 4 (destinos finais prontos) · **DoD:** árvore final idêntica a §4; zero arquivos soltos.

### Fase 6 — Mecânica de veracidade

**T6.1 — Script `docs:check`**
- O quê: script standalone (ex.: `docs\scripts\docs-check.mjs` — NÃO tocar em `package.json` para respeitar "sem mudança de código de runtime") que valida: (a) todo BR-*/ADR-* referenciado existe; (b) links internos resolvem; (c) footers de fonte `file:line` apontam para arquivos existentes; (d) nenhum arquivo vive fora da árvore (exceto `_archive`). Acionado via workflow de CI (ex.: `.github\workflows\docs-check.yml`).
- Agente: test-engineer + devops-engineer.
- Verificação: script roda e falha em erros propositais; instruções de uso documentadas.

**T6.2 — Snapshot OpenAPI versionado + CI diff**
- O quê: gerar snapshot do Swagger (runtime) para arquivo versionado (ex.: `grafica-app\backend\openapi\openapi.yaml` — decidir local na tarefa) com job de CI que falha se runtime ≠ snapshot; atualizar `architecture\API.md` para apontar o snapshot.
- Agente: devops-engineer + backend-specialist.
- Verificação: snapshot committable; CI roda em PR de exemplo (dry-run).

**T6.3 — Convenção de contratos BR-* + `engineering\TESTING_STRATEGY.md`**
- O quê: definir que testes que prendem regras de negócio devem conter o ID no nome (ex.: `test("BR-007 ...")`); atualizar `engineering\TESTING_STRATEGY.md` e `engineering\DOC_CONSISTENCY.md`. NÃO editar testes existentes neste esforço — apenas documentar a convenção para trás/para frente.
- Agente: test-engineer + documentation-writer.
- Verificação: convenção documentada com exemplos em markdown (não código).

**Tamanho:** M · **Dependência:** Fase 5 (paths finais) · **DoD:** `docs:check` verde no estado final; snapshot OpenAPI versionado; convenção BR-* documentada.

### Phase X — Verificação final (obrigatória ao término de TODAS as fases)

- [ ] `git status` contém apenas commits de docs; nenhum arquivo de código alterado (comparar com a branch base).
- [ ] `docs:check` sem erros.
- [ ] Árvore final = §4; raiz `docs\` só com README + 00_DOCS_INDEX + pastas.
- [ ] BR-001..BR-021 com status honestos (IMPLEMENTED só com teste).
- [ ] `governance\ADR_INDEX.md` completo (001–014).
- [ ] Snapshot OpenAPI diff verde no CI.
- [ ] Nenhum arquivo deletado (tudo `_archive\` ou migrado via `git mv`).
- [ ] Adicionar marcador `## ✅ PHASE X COMPLETE` + data no final deste PLAN quando tudo passar.

## 6. Mapa de Agents

| Fase | Agentes principais | Papel |
|------|--------------------|-------|
| F0 | explorer-agent, project-planner, documentation-writer | Inventário, índice, README |
| F1 | code-archaeologist, database-architect, documentation-writer, backend-specialist | BR/ADR, glossário, DOMAIN_MODEL |
| F2 | project-planner, documentation-writer, test-engineer | Processo, templates, DoD |
| F3 | code-archaeologist, backend-specialist, database-architect | LAYERS, ledger, SETTINGS_CATALOG |
| F4 | explorer-agent, backend-specialist, documentation-writer | Catálogo, docs de integração, probes |
| F5 | documentation-writer, project-planner, explorer-agent, code-archaeologist | Migração, `_archive`, links |
| F6 | test-engineer, devops-engineer, backend-specialist, documentation-writer | docs:check, OpenAPI, convenções |

> Regra de seleção: documento de domínio → database-architect/documentation-writer; documento de arquitetura/código → code-archaeologist/backend-specialist; processo/governança → project-planner; verificação/mecânica → test-engineer/devops-engineer.

## 7. Verificação por fase (definição de pronto — resumo)

| Fase | Definição de pronto |
|------|---------------------|
| F0 | Inventário 100%; esqueleto criado; `00_DOCS_INDEX.md` com matriz inicial |
| F1 | BR-001..021 publicado; ADR-001..009 indexados; visão bobina gravada em ADR-009 |
| F2 | Templates + workflow + DoD + checklist de PR aplicáveis |
| F3 | LAYERS + ledger + SETTINGS_CATALOG cobrem hotspots reais (`file:line`) |
| F4 | CATALOG INT-001..010 ranqueado; 4 docs de integração atuais; probes arquivados |
| F5 | Matriz 100% CONCLUÍDA; raiz limpa; sem arquivos deletados |
| F6 | `docs:check` verde; snapshot OpenAPI versionado; convenção BR-* documentada |
| X | Checklist da Phase X 100% marcado; marcador `## ✅ PHASE X COMPLETE` adicionado |

## 8. Riscos e Guardrails

| Risco | Mitigação |
|-------|-----------|
| **Doc drift** (docs divergem do código) | Footers `source: file:line`; `docs:check` falha no CI; status IMPLEMENTED só com teste (F6) |
| **Mudança de código prematura** (alguém implementa bobina-ativo ou refactor) | Escopo explícito §2; TARGET = não codar; revisores usam o checklist da F2 |
| **Perda de migração** | NUNCA deletar; `git mv` + `_archive\` com README; `00_DOCS_INDEX.md` rastreia cada movimento |
| **BR status desonesto** (marcar IMPLEMENTED sem prova) | Regra dura em DOC_POLICIES: IMPLEMENTED exige teste com BR-* no nome (F6) |
| **Reabrir decisões travadas** (D1/D2/D3) | §1.2; qualquer tentativa de re-litígio é bloqueada pelo fluxo de governança (F2) |
| **Escopo de integração vazar para implementação** | D3; CATALOG é mapeamento + priorização, sem compromissos |
| **Caminhos relativos divergirem** | Usar paths absolutos neste plano e nos footers; caminhos relativos só dentro da árvore docs |
| **Duplicação de verdade** (mesma regra em 2 docs) | BR-*/ADR-* são fonte única; docs derivados referenciam por ID, não repetem conteúdo |

## 9. Ordem recomendada e dependências

```
F0 -> F1 -> F2 ────────────┐
       │                   │
       ├──> F3 ──> F5 ──> F6
       └──> F4 ──> F5 ─┘
```

- **Serial obrigatório:** F0 → F1 (F1 precisa do índice/vocabulário); F5 → F6 (paths finais).
- **Paralelo permitido:** F3 ‖ F4 (após F1); F2 pode rodar em paralelo com F3/F4.
- **Tamanhos estimados:** F0 **S** · F1 **M** · F2 **M** · F3 **L** · F4 **L** · F5 **M** · F6 **M** · Total **L**.
- **Marcos de valor contínuo:** fim da F1 (o propósito nunca se perde) e fim da F4 (catálogo priorizado para decisões de negócio).

## Anexo A — Semente BR-001..BR-021 (status inicial proposto)

| BR | Regra | Fonte | Status |
|----|-------|-------|--------|
| BR-001 | Estoque agregado por SKU em `stock_items.current_quantity` | schema | IMPLEMENTED |
| BR-002 | Cada bobina física é ativo rastreável (metros, estado, localização) | visão de produto | TARGET (ADR-009) |
| BR-003 | Categorias de material: PAPER_MEDIA / INK_SUPPLY / OTHER | schema | IMPLEMENTED |
| BR-004 | Unidades m / fls / ml / L; conversões via `lib/math.ts` (Big.js) | lib/math.ts | IMPLEMENTED |
| BR-005 | Transações IN / OUT / ADJUSTMENT | schema | IMPLEMENTED |
| BR-006 | Débito de estoque é atômico (transação SQL no read-modify-write) | stock.ts | TARGET (ADR-008) |
| BR-007 | Saldo nunca negativo; política explícita (clamp documentado ou erro) | stock.ts (4+ sites) | TARGET (ADR-006) |
| BR-008 | Idempotência por `source_ref` único (fim do LIKE em `reason`) | stock.ts | TARGET (ADR-007) |
| BR-009 | Status derivado via `computeStatus` centralizado | ~4 arquivos | PARTIAL |
| BR-010 | Vínculo N:N máquinas ↔ itens (`machine_items`) | schema | IMPLEMENTED |
| BR-011 | RBAC DEV_MASTER / ADMIN / OPERATOR | routes/users.ts | IMPLEMENTED |
| BR-012 | Ingestão HP Latex 330 (EWS accounting.xls, poll 60 s) | agente HP | IMPLEMENTED |
| BR-013 | Ingestão Konica C3070 (PrintManager, poll 30 s) | agente Konica | IMPLEMENTED |
| BR-014 | Ingestão Mimaki (webhook M2M + fila, folderTimestamp único) | agente Mimaki | IMPLEMENTED |
| BR-015 | Notificações WhatsApp multi-destinatário (`whatsapp_recipients`) | routes/whatsapp.ts | PARTIAL (doc desatualizado) |
| BR-016 | Briefings agendados via WhatsApp (promessa do PRD) | 01_PRD | PROPOSED (não implementado) |
| BR-017 | Print jobs vinculados a máquinas e consumo de material | routes/jobs.ts | IMPLEMENTED |
| BR-018 | Identificação física de bobina (ID exclusivo, localização) | — | TARGET (ADR-009) |
| BR-019 | Configuração por empresa (single deploy per company) | — | TARGET (ADR-009, D1) |
| BR-020 | Matchers por convenção de nome consolidados (1 implementação) | máquinas/rotas | PARTIAL |
| BR-021 | `settings` tipadas via catálogo (fim de stringly-typed) | tabela settings | TARGET (SETTINGS_CATALOG, F3) |

## Anexo B — Catálogo de integrações INT-### + RICE-lite

**Schema da tabela (`integrations\CATALOG.md`):**
`INT-id | Nome | Direção (in/out) | Protocolo/Transporte | Estado (ATIVA/CANDIDATA) | Campos-chave | Doc de referência | RICE-lite score | Prioridade`

**RICE-lite (escala 1–5, sem pesos de time):**
- **R**each: nº de empresas/usuários afetados
- **I**mpact: impacto por usuário (crítico para o produto?)
- **C**onfidence: quão seguro sabemos estimar?
- **E**ffort: esforço relativo (1 = baixo, 5 = alto) · Score = (R × I × C) / E

**Semente:**
| INT | Nome | Estado | Nota |
|-----|------|--------|------|
| INT-001 | HP Latex 330 (EWS accounting.xls, poll 60 s) | ATIVA | poll → alvo de config (F3) |
| INT-002 | Konica C3070 (PrintManager, poll 30 s) | ATIVA | idem |
| INT-003 | Mimaki (webhook M2M + fila) | ATIVA | folderTimestamp única |
| INT-004 | WhatsApp Baileys (notificações/receptores) | ATIVA | doc 15_WHATSAPP desatualizado → REWRITE |
| INT-005 | WhatsApp Business API | CANDIDATA | oficial, multi-device, templates |
| INT-006 | ERP (Bling/Omie/Tiny ou similar) | CANDIDATA | estoque/fiscal upstream |
| INT-007 | NF-e | CANDIDATA | fiscal, depende do ERP |
| INT-008 | RFID (suporte à bobina física — ADR-009) | CANDIDATA | enabler do modelo de ativo |
| INT-009 | BI/Relatórios (ex.: Metabase) | CANDIDATA | leitura direta Turso |
| INT-010 | E-mail | CANDIDATA | alertas/relatórios |

## Anexo C — Matriz de migração antigo → novo (entrada para `00_DOCS_INDEX.md`)

| Arquivo atual (docs\) | Destino | Ação |
|-----------------------|---------|------|
| `01_PRD_PRODUCT_REQUIREMENTS.md` | `product\PRD.md` | migrar + revisar |
| `02_TRD_TECHNICAL_REQUIREMENTS.md` | `architecture\HLD.md` / `LLD.md` | digerir (split) |
| `03_FRD_FUNCTIONAL_REQUIREMENTS.md` | `product\FRD.md` | migrar |
| `04_USER_STORIES.md` | `product\USER_STORIES.md` | migrar |
| `05_SYSTEM_DESIGN_HLD.md` | `architecture\HLD.md` | migrar/consolidar |
| `06_LOW_LEVEL_DESIGN_LLD.md` | `architecture\LLD.md` | migrar |
| `07_TECHNICAL_DECISIONS_ADR_RFC.md` | `governance\adr\ADR-001..005.md` + `governance\README.md` | extrair ADRs |
| `08_ENGINEERING_GUIDELINES.md` | `engineering\ENGINEERING_GUIDELINES.md` | migrar |
| `09_OPS_AND_INFRASTRUCTURE.md` | `ops\INFRASTRUCTURE.md` + `ops\RUNBOOK.md` | split |
| `10_RBAC_SPECIFICATION.md` | `user-guides\RBAC.md` | migrar |
| `11_TESTING_TWO_PCS_LAN.md` | `ops\RUNBOOK.md` (ou `engineering\TESTING_STRATEGY.md`) | migrar |
| `12_GUIA_DE_USO.md` | `user-guides\GUIA_DE_USO.md` | migrar |
| `13_LAN_CONEXAO_SERVER_CLIENT.md` | `ops\INFRASTRUCTURE.md` | migrar |
| `14_MIMAKI_INTEGRATION.md` | `integrations\MIMAKI.md` (F4) | consolidar |
| `15_RELEASE_NOTES.md` | `ops\RELEASE_NOTES.md` | migrar |
| `15_WHATSAPP_ALERTAS_ARQUITETURA.md` | `integrations\WHATSAPP.md` | REWRITE (desatualizado) |
| `ESTOQUE-LOGICA-ALGORITMO.md` | `business\*` + `governance\adr\*` (F1) | digerir |
| `KONICA_PRINTMANAGER_DATA_MAP.md` | `integrations\data-maps\KONICA_printmanager_probe.md` | mover como probe |
| `HP_LATEX_330_DATA_MAP.md` | `integrations\data-maps\HP_EWS_accounting_probe.md` | mover como probe |
| `DIAG-hp-accounting.md` | `_archive\` | arquivar |
| Todos os `PLAN-*.md` (40+) | `_archive\` (após harvest F1/F3/F4) | arquivar |
| `amanha.md`, `plano-amanha.md` | `_archive\` | arquivar |
| `PROMPT_OPENCODE_AGENTE_HP_LATEX.md` | `_archive\` (ou `integrations\data-maps\`) | arquivar/digerir |

## Anexo D — Fontes absolutas (inputs dos agents)

```
D:\www\2026\felipe-neneu-portfolio\dpi-controle-estoque\docs\                             (toda a documentação atual)
D:\www\2026\felipe-neneu-portfolio\dpi-controle-estoque\grafica-app\src\                 (frontend Next.js 16)
D:\www\2026\felipe-neneu-portfolio\dpi-controle-estoque\grafica-app\backend\src\         (backend Fastify 5)
D:\www\2026\felipe-neneu-portfolio\dpi-controle-estoque\grafica-app\backend\src\routes\stock.ts   (add-roll :289)
D:\www\2026\felipe-neneu-portfolio\dpi-controle-estoque\grafica-app\backend\src\db\schema* (schema Drizzle — localizar)
```

## Anexo E — Hotspots de acoplamento (input para F3)

1. `computeStatus` duplicado em ~4 arquivos (BR-009/PARTIAL).
2. Matchers por convenção de nome duplicados (HP/Konica/etc.) (BR-020/PARTIAL).
3. Conversões já puras em `lib/math.ts` (Big.js) (BR-004).
4. Agents dobram de bibliotecas (`routes/jobs.ts` importa dedutor de estoque do HP).
5. `db` e socket são singletons (acoplamento global).
6. IDs de system-bot duplicados entre arquivos (→ config, F3.3).
7. Contratos UI↔API sincronizados à mão (Swagger gerado em runtime → snapshot, F6.2).
8. Débito read-modify-write sem transação (BR-006) + clamp negativo (BR-007) + reason LIKE (BR-008).
9. `settings` stringly-typed (BR-021 → SETTINGS_CATALOG).
10. Polling intervals hard-coded (HP 60 s, Konica 30 s) → config por empresa (F3.3).
