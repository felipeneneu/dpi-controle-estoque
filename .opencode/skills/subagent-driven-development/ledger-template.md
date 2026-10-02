---
name: sdd-ledger-template
description: "Molde do ledger progress.md do SDD. Copiado para .sdd/<feature>/progress.md."
component: template
parent-skill: subagent-driven-development
version: 1.0.0
---

# SDD Ledger — <nome-da-feature>

> Fora do tracking do git. Persistente entre sessoes.
> Fonte de verdade do progresso do SDD. A conversa NAO e fonte de verdade.

## Feature

- Branch: <branch>
- PRD/Spec: <caminho>
- Inicio: <data ISO>

## Contexto

<!--
Uma frase: o que esta feature entrega.
Dominio: quais pacotes/camadas ela toca.
-->

## Tarefas

<!--
Status validos: pendente | em_andamento | revisao | concluida | bloqueada
Tarefas sao VERTICAIS: cada uma produz resultado observavel de ponta a ponta.
-->

| #   | Descricao                                          | Status   | Tentativas | Ultima ruling |
| --- | -------------------------------------------------- | -------- | ---------- | ------------- |
| 1   | ...                                                | pendente | 0          | —             |
| 2   | ...                                                | pendente | 0          | —             |
| 3   | ...                                                | pendente | 0          | —             |

### Detalhe das tarefas

<!--
Uma secao por tarefa. E daqui que o implementador tira o contexto.
-->

### Tarefa 1 — <nome>

- **Descricao:** <o que fazer, em uma frase>
- **Spec:** <caminho:linha>
- **Arquivos autorizados:**
  ```
  <lista fechada>
  ```
- **Criterio de pronto:**
  ```
  <comando de verificacao que passa 100%>
  ```
- **Depende de:** <numeros das tarefas, ou "nenhuma">

## Rulings

<!--
Decisoes formais, nao perguntas. Timestamp ISO.
Formato: - [timestamp] <decisao> — <contexto> — <justificativa>
-->

- [<timestamp>] <decisao tomada, contexto, justificativa>

## Historico de Sessoes

<!--
- [timestamp] Orquestrador iniciado. Tarefas 1–3 planejadas.
- [timestamp] Tarefa 1: implementacao OK. Spec review reprovou (escopo extra).
-->

- [<timestamp>] Orquestrador iniciado. Tarefas 1–N planejadas.

## Relatorio Final

<!--
Preenchido na Fase 2 (whole-branch review).
-->

- **Build:** <verde / vermelho, com comando>
- **Testes:** <N passed, M failed>
- **Tarefas concluidas:** <N>/<total>
- **Rulings:** <N>
- **Branch review:** <aprovado / aprovado com ressalvas / reprovado>
- **Pendencias:** <lista ou "nenhuma">
