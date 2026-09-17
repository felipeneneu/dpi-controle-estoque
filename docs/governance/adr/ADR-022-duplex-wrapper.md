# ADR-022: Duplex Head-to-Head / Head-to-Foot como Camada Wrapper do Core

- **Status:** Proposto
- **Data:** 2026-09-17
- **Autor:** Felipe Neneu / GraficaOS Core Team
- **Domínio:** imposition / pre-press
- **Links:** BR-010, BR-021; depende de ADR-021; aplica `AGENTS.md` Regra 5
  (terminologia Head-to-Head / Head-to-Foot) e Regra 6 (mudança de contrato = ADR).

---

## Contexto

`IMPOSICAO-MOTOR.md` §6.1 define `ImpositionInput` **sem** campo de duplex.
`packages/imposition-core/AGENTS.md` **Regra 5** define explicitamente os
dois pareamentos físicos suportados:

- **Head-to-Head:** topo da frente e topo do verso na mesma ponta da folha
  (padrão mais comum; material vira lateralmente — típico de livro).
- **Head-to-Foot** (= Head-to-Toe): topo da frente alinha com a base do verso
  (material vira de cima pra baixo — típico de calendário de mesa).

A Regra 5 afirma textualmente: *"a escolha errada desperdiça a tiragem
inteira, não uma peça."* Motivo suficiente para centralizar a lógica em uma
camada única com teste dedicado, tirada de cada renderer.

Adicionalmente, o motor 2 (`engine.jsx:65-72`) rotaciona cada `pageItem` em
torno do próprio centro, mas o cálculo `footprintTopPt = refTop − (pageW +
pageH)/2` é algebricamente suspeito (mistura largura/altura sem provar
coincidência com o slot). É um bug histórico de registro que motivou esta ADR.

Adicionar duplex ao `ImpositionInput` é mudança de contrato
(`packages/imposition-core/AGENTS.md` Regra 6) → esta ADR.

---

## Decisão

### 1. Core single-sided imutável

`GridSearchEngine` resolve **apenas frente**. Nenhuma lógica de espelhamento
ou rotação de verso vive no core. Invariante testável:
`DuplexTests.CoreHasNoMirrorLogic`.

### 2. `DuplexPlanner` é wrapper acima do core

Contrato público:

```csharp
public enum DuplexPairing
{
    HeadToHead,   // topo-frente alinha com topo-verso
    HeadToFoot,   // topo-frente alinha com base-verso (Head-to-Toe)
}

public sealed record DuplexPlan(
    ImpositionResult Front,
    ImpositionResult Back,
    DuplexPairing Pairing,
    string GridHash);