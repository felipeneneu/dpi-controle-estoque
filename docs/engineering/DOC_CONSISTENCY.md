# Consistência da Documentação — especificação do `docs:check`

> **Versão:** 1.0.0 · **Status:** ATIVO · **Owner:** Felipe · **Última atualização:** 2026-09-12
> **Compromisso (D2):** este ciclo não altera runtime. O verificador é **especificado** aqui;
> a **ativação** num script executável é tarefa de implementação (adiada, `docs/_archive/` guarda
> o contrato). Ver `docs/PLAN-enterprise-governance.md` F6.

---

## 1. O que o `docs:check` deve fazer (contrato)

Comando hipotético: `npm run docs:check` na raiz. Quatro verificações:

### 1.1 Links relativos resolvem (dead-link)
- Todo texto `` `caminho.md` `` e `[x](caminho.md)` na árvore **viva** (qualquer `.md` fora de
  `_archive/`) deve apontar para arquivo existente, sob `docs/` ou `backend/src/`.
- **Exceção:** permissão de referência a `_archive/` **apenas** em nota de proveniência
  (`> **Origem:**`, `Consolida o histórico:`).

### 1.2 Regra: árvore viva não referencia `_archive/` no corpo
- Corpo (não-header) citando `docs/_archive/` → WARN (não é erro de link, mas vaza sujeira).

### 1.3 Headers de governança presentes
- Todo arquivo **novo** (pós-F0) tem o bloco `> **Versão:** … **Status:** … **Owner:** … **Última atualização:** …`
- Todo `ARCHIVE`, `PLAN`, `RFC` segue template de status.

### 1.4 IDs referenciados existem
- Toda menção no padrão `BR-\d{3}` / `ADR-\d{3}` / `INT-\d{3}` dentro de `docs/` (exceto
  `_archive/` e `00_DOCS_INDEX.md`) deve existir em `BUSINESS_RULES.md` / `ADR_INDEX.md` / `CATALOG.md`.

## 2. Rollout

| Fase | Onde | Quando |
|------|------|--------|
| **Especificação** | este arquivo | ✅ agora (F6) |
| **Script** `.mjs` + `package.json` script | raiz (monorepo) | ciclo de implementação |
| **CI gate** (PR) | GitHub Actions | idem, junto de lint/typecheck |

## 3. Falhar no CYAN ou no P2?

- Falha de **1.1/1.4** = bloqueante (quebra índice/regras).
- Falha de **1.3** = bloqueante para arquivos novos.
- **1.2** = WARN (mantém histórico vivo reversible).

## 4. Estado de conformidade (2026-09-12)

- [x] 1.1: auditoria manual feita em `F5` (links mortos corrigidos na árvore viva).
- [x] 1.3: archivo/.md novos com headers; `_archive/README.md` com tabela de rota.
- [~] 1.4: varredura manual por regex; **sem regras órfãs conhecidas** (lista de re-check no
  último commit da fase).