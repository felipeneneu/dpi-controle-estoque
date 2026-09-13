# GraficaOS — Documentação (árvore governada)

> **Propósito:** este é o coração documental do GraficaOS. Aqui vive a **regra de negócio canônica** (o "porquê" do produto), as **decisões arquiteturais** (ADRs) e o mapa de **modularização por empresa**. A regra de ouro: **o documento é a fonte da verdade — o código é a implementação das regras que já alcançou.**
> **Última reorganização:** 2026-09-12 (migração dos docs 01–15 → árvore por domínio).

---

## Por que este produto existe

O GraficaOS controla estoque e maquinário de uma gráfica / comunicação visual. A visão de produto (gravada em [ADR-009](governance/adr/ADR-009-bobina-asset-model.md)) é que **cada bobina física é um ativo rastreável individual** — com metros restantes próprios, estado (em uso / em estoque / vazia) e localização física. Hoje o sistema trata estoque como quantidade agregada por SKU; o modelo-bobina é o destino, documentado como `TARGET` no registro de regras.

## Índice da árvore

| Pasta | Conteúdo | Entrar por |
|-------|----------|------------|
| `business/` | Regras canônicas (BR-*), glossário, modelo de domínio, changelog de regras | `business/BUSINESS_RULES.md` |
| `product/` | PRD, FRD, user stories, roadmap | `product/PRD.md` |
| `architecture/` | HLD, LLD, camadas (LAYERS), catálogo de settings, contrato de API | `architecture/HLD.md` |
| `integrations/` | Catálogo e contratos de integração (Mimaki, HP, Konica, WhatsApp) + data-maps | `integrations/CATALOG.md` |
| `governance/` | Processo de decisão, ADRs, políticas de documentação | `governance/README.md` |
| `ops/` | Infraestrutura, runbook, release notes, incidentes | `ops/INFRASTRUCTURE.md` |
| `user-guides/` | Guia de uso do operador e permissões (RBAC) | `user-guides/GUIA_DE_USO.md` |
| `engineering/` | Padrões de engenharia, estratégia de testes, consistência docs↔código | `engineering/ENGINEERING_GUIDELINES.md` |
| `_archive/` | Artefatos retirados (PLAN-*, DIAG-*, WIP) — nunca deletar | `_archive/README.md` |

Para a matriz exata de migração antigo→novo e o inventário completo, veja [`00_DOCS_INDEX.md`](00_DOCS_INDEX.md).

## Identidade das regras: BR-* e ADR-*

A identidade de uma regra/decisão vive nos **IDs**, não na numeração de arquivos:

- **BR-XXX** — regras de negócio canônicas (`business/BUSINESS_RULES.md`), com status honesto (`IMPLEMENTED` / `PARTIAL` / `TARGET` / `PROPOSED`).
- **ADR-XXX** — decisões arquiteturais (`governance/adr/`), apontando para as BR-* que impactam.

> Um arquivo pode conter várias regras; uma regra nunca é duplicada entre docs — docs derivados referenciam por ID.

## Como navegar por função

- **"Qual a regra de débito de estoque?"** → `business/BUSINESS_RULES.md` (BR-006..008, BR-010..013) + `governance/adr/ADR-006..008`.
- **"Qual o modelo de dados atual?"** → `architecture/LLD.md` + `business/DOMAIN_MODEL.md`.
- **"Como a máquina X manda dados?"** → `integrations/` (MIMAKI / HP_LATEX / KONICA).
- **"O que uma empresa nova precisa configurar?"** → `architecture/LAYERS.md` + `architecture/SETTINGS_CATALOG.md`.
- **"Como decidir uma mudança?"** → `governance/README.md` (fluxo RFC → ADR).

## Fonte de verdade por caminho absoluto

Todos os documentos carregam footer `Fonte:` com caminho absoluto `file:line` para o código que implementa a regra (política em `governance/DOC_POLICIES.md`). Caminhos relativos são usados apenas para navegação dentro da árvore.