# Políticas de Documentação — GraficaOS

> **Versão:** 1.0.0 · **Propósito:** regras de integridade e veracidade dos documentos. Determinam quando a documentação está "verdadeira" e o que acontece quando alguém muda uma regra ou um código.

---

## P1 — A documentação é a fonte da verdade
O código é a implementação das regras que já alcançou. Quando código e documento divergem, o documento manda — e a divergência deve ser registrada ([RULE_CHANGELOG](business/RULE_CHANGELOG.md) + ADR).

## P2 — Footer de origem (`source: file:line`)
Todo documento que descreve comportamento deve citar, no corpo ou num rodapé, o arquivo e a linha que o implementa (ex.: `Fonte: D:\www\2026\felipe-neneu-portfolio\dpi-controle-estoque\grafica-app\backend\src\routes\stock.ts:408-414`). Caminhos absolutos ou relativos a partir da raiz do repo; relativos apenas dentro da árvore `docs/`.

## P3 — `IMPLEMENTED` exige prova
Uma regra BR-* pode dizer `IMPLEMENTED` apenas se:
- (a) existe teste automatizado que a prenda (nome com convenção BR-*), OU
- (b) foi verificada à mão na release atual, com data no `RULE_CHANGELOG.md`.
Caso contrário: `PARTIAL` / `TARGET` / `PROPOSED`.

## P4 — Nunca deletar
Arquivos retirados vão para `docs/_archive/` via `git mv`. Nenhum conteúdo é destruído; o git preserva o histórico. Exceção: e-mail/arquivos fora do repo.

## P5 — Uma regra, um lugar
Nunca duplique o texto de uma regra entre docs: doc derivado **referencia** por ID (`BR-XXX`, `ADR-XXX`, `INT-XXX`). Duplicação = candidata a correção.

## P6 — Sem "amanha/TODO" em docs canônicos
Itens futuros vão para `product/ROADMAP.md` ou RFC. Docs canônicos descrevem o que é/decidido.

## P7 — Idioma
Documentos em PT-BR (termos técnicos em inglês quando idiomáticos). Códigos e exemplos em inglês.

## P8 — Status honesto
Rebaixe staus de regras performativas. Não marque `IMPLEMENTED` para agradar.

## P9 — Checklist de PR (docs ou código)
- [ ] ADR existe/aceita e `ADR_INDEX.md` atualizado (se mudou decisão).
- [ ] BR-* afetada por uma ADR foi citada.
- [ ] Linha/status da BR-* atualizados + entrada em `RULE_CHANGELOG.md` (se mudou regra).
- [ ] Teste pinando a regra existe/é citado (P3).
- [ ] `source: file:line` presente nos docs alterados.
- [ ] `architecture/SETTINGS_CATALOG.md` atualizado se `settings`/env mudou.
- [ ] Snapshot OpenAPI versionado reflete o diff (quando aplicável).
- [ ] `docs:check` verde (quando disponível).
- [ ] Bala de release note redigida.

## P10 — Veracidade mecânica
A mecânica de verificação (script `docs:check`, snapshot OpenAPI, convenção de testes BR-*) está especificada em `engineering/DOC_CONSISTENCY.md`. Este esforço de documentação NÃO altera código de runtime — apenas especifica; a ativação no CI fica para o ciclo de implementação.

## P11 — Escopo de execução
Este ciclo de governança não altera código, schema, rotas, migrações nem UI (decisão D2 em `PLAN-enterprise-governance.md`). Nenhuma política aqui autoriza mudança de código fora do fluxo normal de PR.