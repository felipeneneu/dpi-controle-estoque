# ADR-024: Migração dos Projetos C# para .NET 10

- **Status:** Proposto
- **Data:** 2026-09-17
- **Autor:** Felipe Neneu / GraficaOS Core Team
- **Domínio:** build / devops / toolchain
- **Links:** aplica `packages/imposition-core/AGENTS.md` Regra 6; pré-requisito do PR #3-0/#3a; complementa ADR-015, ADR-017, ADR-020.

---

## Contexto

O monorepo compila os 6 projetos C# em `net8.0` / `net8.0-windows`. O .NET 10
é a versão LTS vigente (suporte até nov/2028), e o ambiente de home office já
tem SDK 10.x. Manter `8.0.x` trava a toolchain fora do LTS atual e gera
fricção recorrente (o PR #1 registrou comportamento divergente de compilação
entre `dotnet 8` e `dotnet 10`).

A migração é uma **mudança de contrato de compilação** de todo o toolchain
.NET do repo — por isso exige ADR (Regra 6 do `packages/imposition-core/AGENTS.md`).

---

## Decisão

1. Migrar os 6 projetos de `net8.0`/`net8.0-windows` para
   `net10.0`/`net10.0-windows`:
   - `Imposition.Core`, `Imposition.Core.Tests`, `imposition-grid-cli`,
     `AutoImposerCLI` → `net10.0`.
   - `IllustratorImposerCLI`, `ImpositorKonica` → `net10.0-windows`.
2. `global.json` na **raiz** do repo com `10.0.100` + `rollForward:
   latestFeature` — pinagem uniforme para qualquer subpasta (a resolução de
   SDK do `dotnet` é baseada no cwd do comando; um `global.json` só em
   `packages/` não cobriria os sidecars que rodam da raiz).
3. Workflows CI (`imposition-core.yml`, `imposition-grid-release.yml`):
   `dotnet-version: '8.0.x'` → `'10.0.x'`.
4. **Não** sobe versão de nenhuma dependência externa (PdfSharp 6.1.1,
   SkiaSharp 4.152.0, QRCoder 1.6.0) — todas consumíveis a partir de
   `net10.0`. Se alguma quebrar, é PR separado com esta ADR revisitada.
5. **Não** muda `PublishAot`, `RuntimeIdentifier`, `SelfContained` nem
   qualquer outra propriedade dos `.csproj` — apenas `TargetFramework`.
6. Sidecars continuam `self-contained` → os `.exe` publicados não dependem
   do runtime instalado; o `.bat` da raiz segue válido (o caminho primário
   `sidecars\bin\cli\*.exe` não referencia versão).

---

## Consequências

### Positivas

- Toolchain alinhada ao LTS vigente (suporte até nov/2028).
- `TargetFramework` único em todo o monorepo (sem espalhar versões).
- Build determinístico em qualquer máquina via `global.json` da raiz.

### Negativas / Mitigações

- Risco de API removida no .NET 10 nos sidecars. Mitigação: build de cada
  um dos 6 projetos em sequência na validação; falha de incompatibilidade →
  reportar, nunca contornar com `#if`/`#pragma`.
- Caminho de artefato do workflow `imposition-grid-release.yml` referencia
  `net8.0/...` e passa a `net10.0/...` — ajuste mecânico obrigatório junto
  com o `dotnet-version` (senão a etapa de upload quebra).

### Alternativas rejeitadas

- **Manter `net8.0`:** fora do LTS atual; fricção contínua com o SDK 10.
- **`global.json` apenas em `packages/`:** não cobre sidecars nem raiz
  (resolução de SDK por cwd).

---

## Verificação

- `dotnet --version` → `10.0.x` da raiz e de qualquer subpasta.
- `dotnet build` de cada um dos 6 projetos com 0 erro / 0 warning novo.
- `dotnet test -c Release` no `imposition-core` → 25 testes verdes
  (mesmo número pré-migração; golden-masters intactos).
- `dotnet publish` dos 2 sidecars headless → `.exe` self-contained em
  `sidecars\bin\cli`.

## Gatilhos para Reavaliação

- Qualquer dependência externa (PdfSharp/SkiaSharp/QRCoder) publicar TFM
  próprio `net10.0` que altere o grafo de pacotes.
- Próxima major do .NET (11+) encerrar o suporte a `net10.0`.

---

`source: packages/imposition-core/Directory.Build.props:3` · `packages/imposition-grid-cli/Imposition.GridCli.csproj:4` · `sidecars/AutoImposerCLI/AutoImposerCLI.csproj:5` · `sidecars/IllustratorImposerCLI/IllustratorImposerCLI.csproj:5` · `sidecars/ImpositorKonica/ImpositorKonica.csproj:5` · `global.json:1` · `.github/workflows/imposition-core.yml:23` · `.github/workflows/imposition-grid-release.yml:17,23`