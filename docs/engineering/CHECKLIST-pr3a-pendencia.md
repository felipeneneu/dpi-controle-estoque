# Checklist — PR #3a (Pendências)

> Estado do checkpoint `8f0ec9d` no branch `feature/sidecar-impositor-konica`.
> Motor 1 (`AutoImposerCLI`) migrando para `imposition-core` como fonte única de
> grade (ADR-021 Decisão 6) + contagem verificada (ADR-023).

## Concluído até `8f0ec9d`

- [x] **D.1** — `AutoImposerCLI.csproj`: `ProjectReference` para `imposition-core` + `<InternalsVisibleTo Include="AutoImposerCLI.Tests" />`.
- [x] **Risco (b)** — read-back via `PdfSharp.Pdf.Content.ContentReader.ReadContent` contando `OpCodeName.Do` provado viável (1015 `DrawImage` → 1015 `Do`; vetorização preservada).
- [x] **`Imposition/ImpositionBridge.cs`** — `BuildInput(...)` (Sheet, tol/register 0.1, `SurplusPolicy.Truncate`, `ScalePolicy.Fit`, `ForcedOrientation?`) + `Plan(input)` → `GridSearchEngine.Plan`.
- [x] **`Imposition/CountIntegrity.cs`** — `E_COUNT_MISMATCH`; `Validate(planned, drawn, readBack, strict)`; `readBack == -1` nunca bloqueia.
- [x] **`Imposition/PdfReadBack.cs`** — `CountDrawnUnits(pdfPath)` com `PdfDocumentOpenMode.Import`; retorna `-1` em caso de falha.
- [x] **`Program.cs`** — fluxos legado e JSON rodam pelo bridge (elimina decisão de orientação por área de `Program.cs:153`); alvo legado default = capacidade; `targetCopies` vem de `plano.PlannedUnits`; `RESULT_JSON` ganhou `plannedUnits`/`drawnUnits`/`readBackUnits`; flags `--strict`/`--warn`; erro amigável "Dimensão da arte excede a área útil do substrato." p/ `capacidade == 0` e `E_GRID_OVERFLOW`/`E_INVALID_TARGET`.
- [x] Build `AutoImposerCLI` em Release limpo (0 warn / 0 err).

## Pendente

### 1. Projeto de testes `AutoImposerCLI.Tests`
Criar em `sidecars/AutoImposerCLI/tests/AutoImposerCLI.Tests/`:

- [ ] `AutoImposerCLI.Tests.csproj` espelhando o csproj de testes do core
      (`Test.Sdk 17.11.1`, `xunit 2.9.2`, runner `2.8.2`,
      `FluentAssertions 6.12.1`).
  - `ProjectReference`:
    - `../../AutoImposerCLI/AutoImposerCLI.csproj`
    - `../../../packages/imposition-core/src/Imposition.Core/Imposition.Core.csproj`
  - `None Include="GoldenMaster/**/*.json" CopyToOutputDirectory="PreserveNewest"`.
- [ ] `CrossMotorTests.cs`:
  - BR-010_ae: `GridHash` do plan via bridge == `GridHash` do core direto para o
    mesmo input.
  - BR-010_af: contagem — gerar PDF com `N` `DrawImage` e conferir
    `PdfReadBack.CountDrawnUnits(file) == N`; caso arquivo inválido → `-1`.
- [ ] `GoldenMaster/CrossMotorGoldenTests.cs` + `GoldenMaster/cases/000-canonical/`
  - `input.json` — flat do bridge (sheet 665×986, piece 19×34, gap 0, margens 0,
    `targetCopies 1015`, `forcedOrientation` null/auto).
  - `expected.json` — espelho do golden do core: `cols=35, rows=29, total=1015,
    orientation=0, lengthMm=986, surplus=0, plannedUnits=1015`, e `GridHash` == core.
- [ ] Não adicionar ao `imposition.slnx` (manter 6 projetos); validar com `dotnet test` isolado.

### 2. Documentação
- [ ] Atualizar `docs/engineering/IMPOSICAO-MOTOR.md` §5.1/§5.3: marcar decisão
      de orientação do Motor 1 como resolvida no PR #3a (fonte única = core).

### 3. Validação obrigatória (Regra 2/Regra 4)
- [ ] Golden canônico (19×34 em 665×986, alvo 1015 → 35×29) continua batendo via bridge.
- [ ] `dotnet build packages/imposition.slnx -c Release` → 6 projetos OK.
- [ ] `dotnet test` no core → 25/25 verdes.
- [ ] `dotnet test` no `AutoImposerCLI.Tests` → verdes.
- [ ] Smoke do CLI (canônico): conferir arquivo `_IMPOSTO_665x986mm_1015UN.pdf`
      e `RESULT_JSON` com `plannedUnits=drawnUnits=readBackUnits=1015`.

### 4. Relatório final
- [ ] Relatório PT-BR em `docs/engineering/` do PR #3a, incluindo:
  - E.1: **não existe** workflow de CI para `AutoImposerCLI`/`AutoImposerCLI.Tests`
    (só `ci.yml`, `imposition-core.yml`, `imposition-grid-release.yml`) — reportar,
    não inventar.
  - Assinatura final do `ImpositionBridge.BuildInput` (decidida/implementada):
    `(sheetWidthMm, sheetHeightMm, gapMm, marginTopMm, marginRightMm,
    marginBottomMm, marginLeftMm, pieceWidthMm, pieceHeightMm, targetCopies,
    Orientation? forcedOrientation = null)`.

## Guardrails ao continuar (resumo)

- Não alterar `imposition-core` (exceto o que já foi validado), `imposition-grid-cli`,
  `.bat` da raiz, `package.json`, `.gitignore`, `global.json`.
- Nunca `decimal`/epsilon mágico (Regra 1). Contagem reportada == geometria real
  (Regra 4). `readBack == -1` nunca bloqueia.
- **Não commitar** os docs untracked protegidos:
  `docs/PLAN-build-infra.md`, `docs/engineering/REPORTE-build-infra-pr3-0.md`,
  `docs/engineering/REPORTE-source-json-gen-grid-cli.md`.