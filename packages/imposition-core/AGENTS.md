# AGENTS.md — packages/imposition-core

> Este arquivo é carregado automaticamente por agentes de IA que trabalham dentro
> desta pasta. Contém regras de domínio **permanentes**, não instruções de uma
> tarefa específica (essas ficam no prompt de cada trabalho). Se uma instrução de
> tarefa contradizer este arquivo, este arquivo vence — pare e pergunte antes de
> prosseguir.

## Regra 1 — Precisão numérica: tolerância explícita, NUNCA decimal/Big.js, NUNCA epsilon mágico

Milímetro de corte/registro **tem tolerância física real** (tipicamente 0,1mm — a
espessura de precisão da lâmina). Isso não é um problema de "float não é preciso o
suficiente" — é um problema de comparação na borda exata de uma divisão.

- **Correto:** `tol = max(toleranceMm, registerMm, 0.1)` aplicado ANTES de qualquer
  `floor`/`%`: `cols = floor((utilW + gap + tol) / (pW + gap))`.
- **Errado:** trocar `double` por `decimal`/Big.js — mais lento, sem ganho real,
  porque o problema não é precisão decimal, é tolerância física de fabricação.
- **Errado:** epsilon mágico tipo `+0.000001` sem explicação — isso já é bug
  conhecido do `engine.jsx` (ver `IMPOSICAO-MOTOR.md` seção 4.2), não um padrão a
  copiar.

## Regra 2 — Golden-master é lei, não sugestão

Antes de qualquer mudança: rodar o caso canônico (`19×34mm` em `665×986mm`, gap 0,
margens 0, alvo 1015 cópias → esperado `cols=35, rows=29, total=1015, orientation=0`)
e confirmar que ainda bate. Depois de qualquer mudança: rodar de novo. Se o
resultado mudar, é preciso justificativa escrita explícita — nunca assumir que
"deve ter melhorado".

## Regra 3 — Nunca transbordar silenciosamente

Um candidato de grade que não cabe fisicamente no substrato (`fits=false`) é
**descartado antes** de entrar na pontuação de custo — nunca escolhido "porque
pontuou melhor". Rolo pode auto-estender até `maxLengthMm`; folha/chapa é fixa e
rejeita, nunca estica.

## Regra 4 — A contagem reportada tem que bater com a geometria real desenhada

Este é o ponto mais importante e mais fácil de violar por acidente: se o motor
reporta `total=1015`, o PDF gerado precisa ter **exatamente 1015 formas
desenhadas** — nem mais (sobra não documentada), nem menos (truncamento
silencioso). O bug histórico do repo (CLI trunca, JSX preenche última linha com
sobra) é exatamente a violação desta regra — os dois comportamentos são válidos
**se declarados** via `surplusPolicy`, mas nunca podem divergir do que foi
reportado no `RESULT_JSON`.

**Verificação obrigatória:** depois de gerar o PDF, contar programaticamente as
formas desenhadas nele e comparar com `total` do resultado. Divergência = bug
bloqueante, não aviso.

## Regra 5 — Terminologia de frente/verso (duplex)

- **Head-to-Head:** topo da frente e topo do verso na mesma ponta da folha
  (padrão mais comum; usado quando o material vira lateralmente, tipo livro).
- **Head-to-Foot** (= Head-to-Toe): topo da frente alinha com a base do verso —
  verso fica invertido em relação à frente (usado quando o material vira de cima
  pra baixo, tipo calendário de mesa).
- Nunca confundir os dois nomes — a escolha errada desperdiça a tiragem inteira,
  não uma peça.

## Regra 6 — Uma mudança de contrato = ADR, sempre

Se a mudança adicionar/remover campo do `ImpositionInput` ou mudar o significado
de um campo existente, isso é uma decisão de arquitetura — precisa de entrada em
`governance/adr/` e `governance/ADR_INDEX.md`, seguindo `governance/DOC_POLICIES.md`.
Não é opcional, mesmo que pareça um campo pequeno.

## Referências obrigatórias antes de codar

- `docs/engineering/IMPOSICAO-MOTOR.md` (documento inteiro — é o contrato vivo)
- `docs/engineering/TESTING_STRATEGY.md` (convenção de testes do repo)
- `docs/governance/adr/ADR-015-*.md`, `ADR-017-*.md`, `ADR-018-*.md`