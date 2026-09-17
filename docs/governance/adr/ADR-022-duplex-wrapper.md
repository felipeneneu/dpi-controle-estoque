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
```

### 3. Contrato do duplex — `ImpositionInput` **não muda** (Regra 5)

Diferente da proposta inicial, o `duplex` **não é campo** do `ImpositionInput`.
A Regra 5 do `AGENTS.md` diz textualmente: *"GridSearchEngine resolve SOMENTE
frente (single-sided)"*. Adicionar `duplex` ao contrato do core faria o core
*saber* que duplex existe — violando o espírito da Regra.

Contrato novo, **separado** do core:

```csharp
public enum DuplexPairing
{
    HeadToHead,
    HeadToFoot,
}

public sealed record DuplexRequest(
    ImpositionInput FrontInput,
    DuplexPairing Pairing);
```

O `DuplexPlanner` é o **único** ponto de entrada do duplex. Renderers que
não querem duplex nunca tocam `DuplexRequest` nem `DuplexPlan` — continuam
chamando `GridSearchEngine.Plan(input)` diretamente.

**Compatibilidade:** nenhum motor atual precisa mudar para continuar
funcionando single-sided. `ImpositionInput` permanece byte-compatível com
o schema da v1 (PR #1).

### 5. Guardrail de API

O `GridSearchEngine` **não tem como** receber `duplex` — o parâmetro de
entrada é `ImpositionInput`, que não tem esse campo. Não há guardrail de
runtime necessário: a API simplesmente não permite o erro.

O `DuplexPlanner.Plan` é o único caminho para duplex. Não existe entrada
alternativa nem overload que aceite duplex no core.

## Verificação

- Teste estrutural: `ImpositionInput` **não contém** campo `duplex`.
  `it('BR-010.z: ImpositionInput não expõe duplex (reflexão)')`

## Histórico de alterações

- **2026-09-17 (r1):** proposta inicial com `duplex` como campo opcional do
  `ImpositionInput` (Forma 1).
- **2026-09-17 (r2):** alterado para contrato separado (`DuplexRequest`)
  por fidelidade à Regra 5 do `AGENTS.md` — o core permanece totalmente
  alheio a duplex. Ajuste de §Decisão 3, §Decisão 5, §Verificação.