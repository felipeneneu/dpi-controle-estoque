# `_archive/` — Arquivo Morto (destino de docs superseded)

> **Versão:** 1.0.0 · **Status:** PASSIVO · **Última atualização:** 2026-09-12
> **Regra (P6):** nada aqui é apagado. Arquivo aqui **nunca** é referenciado da árvore viva
> sem `docs/00_DOCS_INDEX.md` apontar o caminho vivo correspondente.

---

## Por que existem aqui

Tudo que foi migrado/consolidado/digerido durante o ciclo **F5** (MIGRAÇÃO DA ÁRVORE):
evolução natural de `PLAN-*` → RFC/ADR/BR/INT, e a renumeção dos antigos `01_..15_*`.

## Leia-me sobre os grupos

| Grupo | O que era | Onde vive agora (vivo) |
|-------|-----------|------------------------|
| `PLAN-*` (42+) | fazendas de decisões pontuais pré-ciclo | RFC/ADR/BR/INT + `docs/architecture/` |
| `01/03/04` | PRD/FRD/user stories | `docs/product/` |
| `02` | requisitos técnicos | `architecture/HLD.md` + `SETTINGS_CATALOG.md` |
| `05` | HLD | `architecture/HLD.md` |
| `06` | LLD | `architecture/LLD.md` |
| `07` | decisões ADR/RFC | `governance/adr/ADR-001..009` + `governance/ADR_INDEX` |
| `08` | guidelines | `engineering/ENGINEERING_GUIDELINES.md` |
| `09/13` | infra + LAN | `ops/INFRASTRUCTURE.md` |
| `10` | RBAC | `user-guides/RBAC.md` |
| `11` | teste 2 PCs | `ops/RUNBOOK.md` |
| `12` | guia de uso | `user-guides/GUIA_DE_USO.md` |
| `14` | integração Mimaki | `integrations/MIMAKI.md` |
| `15` | release notes / whatsapp | `ops/RELEASE_NOTES.md` + `integrations/WHATSAPP.md` |
| `ESTOQUE-LOGICA-ALGORITMO` | lógica estoque | `business/BUSINESS_RULES.md` + `governance/adr/` |
| `DIAG-hp-accounting` | diagnóstico parser HP | `integrations/HP_LATEX.md` + `ops/INCIDENTS.md` |
| `amanha/plano-amanha/titlebar/versao-estavel` | notas avulsas | — (resolvidas ou absorvidas) |
| `PROMPT_OPENCODE_AGENTE_HP_LATEX`, `hp-agent-integration`, `PLAN-MIMAKI-FIX` | integração agente HP (raiz) | `integrations/HP_LATEX.md` |
| `KONICA_PRINTMANAGER_DATA_MAP` / `HP_LATEX_330_DATA_MAP` | probes brutos | `integrations/data-maps/` (probes) |

> Busca textual de contexto histórico deve ler o `.md` aqui (preservado integralmente), não
> perder conteúdo em OpenAI/anexos de chat.