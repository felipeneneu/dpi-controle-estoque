---
name: subagent-driven-development
description: Protocolo de desenvolvimento orientado a subagentes. Subagente fresco por tarefa, dupla revisao (Spec Compliance + Code Quality), ledger persistente progress.md e rulings em vez de bloqueios. Use para features com multiplas tarefas dependentes.
when_to_use: "Use ao iniciar qualquer feature com multiplas tarefas dependentes, plano aprovado em docs/plans ou writing-plans ativo, e mais de uma tarefa a implementar. Nao use para correcoes de uma linha, refactor mecanico ou spikes descartaveis."
triggers:
  - implementa o plano aprovado
  - continua a feature pelo ledger
  - SDD
  - subagent-driven-development
  - retoma a feature
  - plano de implementacao aprovado, pode comecar
allowed-tools: Read, Glob, Grep, Bash, Write, Edit, Agent
version: 1.0.0
---

# Subagent-Driven Development (SDD) — Protocolo do Orquestrador

> Adaptacao do framework [obra/superpowers](https://github.com/obra/superpowers) para
> o monorepo GraficaOS, usando as primitivas nativas do Antigravity
> (`invoke_subagent`, `define_subagent`, `run_command`) e do OpenCode
> (subagent `task`, `read`, `bash`, `grep`, `glob`, `edit`, `write`).

---

## 1. Quando usar

Use esta skill quando **todas** as condicoes forem verdadeiras:

| Condicao | Exemplo |
|---|---|
| Feature com 3+ tarefas dependentes | Slugline: core -> pdf -> cli |
| Plano escrito e aprovado | `docs/plans/*.md`, ADR aceita |
| Tarefas sao verticais (testam de ponta a ponta) | "CLI gera PDF com slugline" |
| Cada tarefa cabe em um subagente com contexto Quirurgico | 1 branch de trabalho por vez |

**Nao use** para: correcao de typo, ajuste de constante, spike descartavel,
refactor puramente mecanico, ou documento. Nesses casos o trabalho inline e mais barato.

---

## 2. Os quatro pilares

| Pilar | O que resolve |
|---|---|
| **Subagente fresco por tarefa** | Degradacao de contexto. O orquestrador nunca carrega o codigo da tarefa; so o resultado. |
| **Dupla revisao obrigatoria** | Spec Compliance (atendeu a spec?) + Code Quality (atendeu os padroes?). Nenhuma passa sozinha. |
| **Ledger persistente** | `progress.md` fora do git. Se o contexto compactar ou a sessao morrer, o proximo orquestrador retoma sem perguntar nada. |
| **Rulings, not stalls** | Ambiguidade pequena = decisao formal gravada com timestamp. Nao e pergunta para o usuario. |

> **Regra de ouro:** implementador NUNCA e revisor. Sempre dois subagentes distintos,
> ambos com contexto limpo, nunca o mesmo subagente que produziu o codigo.

---

## 3. Fluxo do orquestrador

### Fase 0 — Preparacao

1. Ler a spec/PRD da feature (`docs/plans/`, ADR, ou conversa validada).
2. Criar o workspace e o ledger:
   ```powershell
   .agents/skills/subagent-driven-development/scripts/sdd-workspace.ps1 `
     -FeatureName "slugline" -BranchName "feat/slugline-sdd"
   ```
3. Quebrar a spec em **tarefas verticais** e gravar no ledger. Cada tarefa:
   - tem resultado observavel ("`dotnet test` passa", "PDF gerado"),
   - tem lista fechada de arquivos que pode tocar,
   - tem um unico comando de verificacao.
4. Se o ledger ja existir: **ler e retomar**. Nao replanejar.

### Fase 1 — Ciclo por tarefa

Para cada tarefa com status `pendente`:

```
(a) IMPLEMENTAR
    -> subagente com implementer-prompt.md preenchido
    -> subagente fresco, sem historico de outras tarefas
    -> espera status == "concluido"

(b) REVISAO DE SPEC   (spec-reviewer-prompt.md)
    -> subagente somente-leitura
    -> le o diff, nao o historico do implementador
    -> aprovado == false  =>  ruling em R, volta para (a) com o ruling anexado

(c) REVISAO DE QUALIDADE (code-quality-reviewer-prompt.md)
    -> subagente somente-leitura
    -> aprovado == false  =>  ruling em Q, volta para (a) com o ruling anexado

(d) LEDGER
    -> status = "concluida"
    -> Attempts += 1
    -> Last ruling = ultima (ou "aprovado em duas revisoes")
```

**Spec antes de qualidade. Sempre.** Revisar estilo de um codigo que nem
implementa a spec wastes o trabalho do revisor.

### Fase 2 — Fechamento

1. **Whole-branch review**: um subagente somente-leitura revisa o diff
   completo `main...HEAD` contra a spec inteira. Catches: contradicao entre
   tarefas, camada que furou a regra de dependencia, feature incompleta.
2. Gravar o relatorio final no `progress.md`.
3.build verde: `dotnet build /warnaserror` + suite completa.

---

## 4. Templates de prompt

Todos em `.agents/skills/subagent-driven-development/`. **Copie, preencha e despache
o conteudo** — nunca despache o subagente com "implemente a tarefa 2".

| Arquivo | Papel | Ferramentas |
|---|---|---|
| `implementer-prompt.md` | Escreve o codigo | Read, Edit, Write, Bash, Glob, Grep |
| `spec-reviewer-prompt.md` | Julga aderencia a spec | Read, Grep, Glob, Bash (leitura) |
| `code-quality-reviewer-prompt.md` | Julga padroes GraficaOS | Read, Grep, Glob, Bash (leitura) |
| `ledger-template.md` | Molde do `progress.md` | — |
| `scripts/sdd-workspace.ps1` | Cria `.sdd/<feature>/` | — |

---

## 5. Mapeamento de primitivas por plataforma

| Acao | Antigravity | OpenCode | Claude Code |
|---|---|---|---|
| Despachar subagente | `invoke_subagent` (subagent `inherit`/`flash`/`pro`) | `task` com `subagent_type: "general"` | `Task` |
| Restringir revisor a leitura | `define_subagent` com lista de `tools` | subagente com prompt de "somente leitura" + sem `Edit`/`Write` | `Task` + `tools:` |
| Rodar testes | `run_command` | `bash` | `Bash` |
| Ler diff | `run_command` (`git diff`) | `bash` (`git diff`) | `Bash` |
| Ler arquivo | `read_file` | `read` | `Read` |
| Workspace isolado | `invoke_subagent` com `workspace: inherit` | worktree manual (`using-git-worktrees`) | worktree manual |

> Workspaces isolados sao opcionais. Para tarefas sequenciais (que e o caso
> padrao do SDD), `workspace: inherit` no mesmo worktree e correto e barato.

---

## 6. Regras inviolaveis

1. **Nunca despachar subagente sem prompt completo.** O subagente nao tem
   memoria da conversa. Contexto = task + arquivos + criterio de pronto + restricoes.
2. **Sempre ler o ledger ao retomar.** Status das tarefas e rulings sao a unica
   fonte de verdade. A conversa nao e.
3. **Rulings sempre com timestamp ISO** (`Get-Date -Format "yyyy-MM-ddTHH:mm:ss"`).
4. **Maximo de 3 tentativas por tarefa.** Na 3a falha, gravar ruling e **parar** —
   devolver ao humano. Nao adivinhar, nao gambiarra, nao "tentar mais uma vez".
5. **Revisor nunca edita.** Se o revisorrewriteu o codigo, a revisao nao aconteceu.
6. **Zero warnings.** `TreatWarningsAsErrors=true` nao e opcao.
7. **PT-BR em comentario, doc e mensagem de erro** (P7 do `DOC_POLICIES`).
   English em identificadores.
8. **Nao commitar `.sdd/`.** O ledger e estado local, nao artefato de entrega.
9. **Diff pequeno por tarefa.** Se o diff passou de ~400 linhas, a tarefa esta
   grande demais — divida no ledger e prossiga.
10. **Um subagente por vez** (a nao ser que as tarefas sejam independentes e o
    git worktrees esteja em uso). SDD e sequencial por padrao.

---

## 7. Armadilhas conhecidas

| Armadilha | Sintoma | Preventivo |
|---|---|---|
| Contexto degenerado | Implementador "esquece" convencao do repo apos 10 tarefas | Subagente fresco + convencoes no prompt |
| Revisor complacente | Aprova tudo em 1 linha | Template exige lista explicita de `requisitos_atendidos[]` |
| Escopo creep | Implementador refatora o vizinho "ja que tava la" | Revisor de spec reporta `escopo_extra[]` |
| Teste ajustado para passar | `Assert.Equal` mudado em vez do codigo | Implementador proibido de editar testes ja verdes que nao sejam o da tarefa |
| Ledger desatualizado | Orquestrador refaz tarefa concluida | Fase 0 sempre le o ledger |
| Epsilon magico | `+0.000001` em geometria | Revisor de qualidade bloqueia (AGENTS.md regra 8) |

---

## 8. Retomada de sessao

Ao iniciar uma sessao cujo trabalho anterior foi SDD:

```
1. Glob(".sdd/*/progress.md")               -> localizar ledger
2. Read(ledger)                              -> status + rulings
3. git log --oneline -15 ; git status       -> alinhar com o codigo real
4. Se status = em_andamento  -> rodada de revisao (Fase 1 b/c)
5. Se status = pendente      -> implementacao (Fase 1 a)
6. Se todas concluidas       -> Fase 2 (whole-branch review)
```

Se `git status` contradisser o ledger: **o ledger ganha o registro, o git ganha a
correcao** — um subagente somente-leitura reconcilia e grava ruling.
