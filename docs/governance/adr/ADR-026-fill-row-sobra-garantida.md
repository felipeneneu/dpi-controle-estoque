# ADR-026 — Política `fill_row` garante sobra (ajuste na função de custo)

- **Status:** Proposto
- **Data:** 2026-09-18
- **Domínio:** imposition
- **BR-*:** BR-024, BR-010, BR-021
- **Decisão:** em `SurplusPolicy.FillRow`, o termo de surplus (`wS`) é **zerado** na função de custo; sobra passa a ser objetivo declarado, não custo.

## Contexto

BR-024 exige que `fill_row` preencha a última linha com sobras (drawn > target). Porém o `GridSearchEngine.Score` aplicava `wS = 0.20` ao `surplusRatio` em **todas** as políticas. Resultado: para alvo 200 em 665×986 (gap 0, margem 0, peça 19×34), o motor escolheu a grade "exata" 25×8 = 200 (surplus 0) — desperdiçando a última linha e violando BR-024. `truncate` e `fill_advance` permanecem intactos.

## Decisão

Na função de custo (seção 6.3 do `IMPOSICAO-MOTOR.md`):

```csharp
var surplusTerm = input.SurplusPolicy == SurplusPolicy.FillRow
    ? 0.0
    : 0.20 * (input.TargetCopies > 0
        ? (double)c.Surplus / input.TargetCopies
        : 0.0);

return 0.50 * wasteRatio + 0.30 * lengthPerCopyNorm + surplusTerm;
```

Com wS zerado em `FillRow`, o motor deixa de penalizar sobra e escolhe a grade que minimiza desperdício de área com base em `wA`/`wL` — produzindo surplus naturalmente (ex.: 35×6 = 210 para alvo 200).

## Consequências

- **Positivas:** conformidade com BR-024; golden/oráculos `truncate` imunes; testes BR-010 existentes inalterados.
- **Negativas / trade-off:** em `FillRow`, `wA` passa a dominar sozinha a seleção; alvos exatos (múltiplos do grid) podem ainda fechar com surplus 0 se a grade cheia for justa — comportamento aceito por BR-024, desde que as dimensões do alvo permitam sobra.
- **Alcance:** apenas o motor `GridSearchEngine`; nenhuma mudança de contrato (`ImpositionInput`/`ImpositionResult`), CLI, `.bat`s ou ImpositorKonica.

## Alternativas consideradas

- **Array de candidatos sem surplus em FillRow:** rejeitada — mexe na varredura, não na decisão.
- **Peso negativo (recompensar sobra):** rejeitada — over-engineering; sobra com custo negativo distorce a física.

## Verificação

- `BR_010_aj_FillRow_GaranteSurplus`: alvo 200 em 700×1000, margem 10, gap 2, peça 34×19 → `PlannedUnits ≥ 200` e `Surplus > 0`. Falhava antes, passa após o fix.
- Suite: core 26/26, sidecar 6/6, build 0 erros / 0 warnings.

## Arquivos afetados

- `packages/imposition-core/src/Imposition.Core/Grid/GridSearchEngine.cs` (Score)
- `packages/imposition-core/tests/Imposition.Core.Tests/GridSearchEngineTests.cs` (BR_010_aj)
- `docs/engineering/IMPOSICAO-MOTOR.md` (seção 6.3)