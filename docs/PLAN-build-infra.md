# PLAN — PR #3-0: Infraestrutura de build unificada

> Modo: **PLANNING ONLY** — este arquivo descreve **o que** fazer e **como validar**.
> Nenhum arquivo de runtime é editado por este plano (nem `package.json`, nem `.gitignore`, nem `.csproj`). A execução acontece na sequência, sempre com os guardrails da seção 7.

## 1. Resumo da missão e decisões

Preparar o monorepo `dpi-controle-estoque` (Windows, PowerShell, git) para o PR #3a, no qual o `AutoImposerCLI` ganhará `ProjectReference` para `imposition-core` — o build precisa estar cimentado **antes** de qualquer mudança de runtime. Este PR é infraestrutura pura: cria a solução C# unificada (`packages/imposition.slnx`), pina o SDK (`packages/global.json`), adiciona scripts npm de orquestração (`build:core`, `build:all`, `test:all`), amplia o `.gitignore` com artefatos de teste/publish e documenta o fluxo em `docs/engineering/BUILD.md`. Nenhum código C#/TS/JS de produção é alterado.

| # | Decisão |
|---|---------|
| D1 | Solução unificada em formato `.slnx` (formato vigente no repo — exemplo real `packages/imposition-core/imposition-core.slnx`), com **6 projetos** (fato da realidade, não os "5" do título do pedido). |
| D2 | `global.json` em `packages/` com `8.0.100` + `rollForward: latestFeature`; escopo limitado a comandos `dotnet` rodados dentro de `packages/` (limitação documentada, não blocker). |
| D3 | Scripts npm **aditivos** via edição cirúrgica do `package.json` raiz, preservando TODOS os scripts existentes. |
| D4 | Guardrail de build: **nunca** executar `dotnet publish -p:PublishAot=true` (projeto `Imposition.GridCli` é AOT-ready; `dotnet build` e `dotnet test` não disparam AOT). |
| D5 | `BUILD.md` documenta o destino **real** do `build:cli:illustrator` (`sidecars/bin/cli`, idêntico ao do `build:cli`) — a divergência com o `sidecars/bin/illustrator` do pedido é assumida como erro de redação e NÃO será "corrigida" no código. |
| D6 | Contagem de testes: o pedido diz "25 testes"; a contagem estática atual é exatamente **25 `[Fact]`** em 7 arquivos — o número REAL de testes verdes será reportado pelo runner (`dotnet test`). |

## 2. Fatos verificados (verdade da realidade — já confirmados, não re-explorar)

1. **SDK .NET:** apenas `8.0.425` instalado (`dotnet --list-sdks` retorna só 8.0.425); `dotnet --version` já retorna 8.0.x.
2. **`package.json` raiz** já possui: `build:cli` e `build:cli:illustrator` (ambos `dotnet publish ... -o sidecars/bin/cli` — **mesmo destino**), `build:backend`, `build:export`, `package:client` (empacota Electron com `ImpositorKonica.exe` como `extraResources`).
3. **Divergência confirmada:** `build:cli` e `build:cli:illustrator` publicam **ambos** em `sidecars/bin/cli` (não `sidecars/bin/illustrator`).
4. `grafica-app/package.json` não tem scripts `package:*`; `build` = `next build`.
5. **Formato de solução vigente:** `.slnx` (XML) — exemplo real em `packages/imposition-core/imposition-core.slnx`.
6. **Caminhos reais dos `.csproj`** (6 projetos para a solução unificada):
   - `packages/imposition-core/src/Imposition.Core/Imposition.Core.csproj`
   - `packages/imposition-core/tests/Imposition.Core.Tests/Imposition.Core.Tests.csproj`
   - `packages/imposition-grid-cli/Imposition.GridCli.csproj`
   - `sidecars/AutoImposerCLI/AutoImposerCLI.csproj`
   - `sidecars/IllustratorImposerCLI/IllustratorImposerCLI.csproj` (net8.0-windows, COM/ExtendScript)
   - `sidecars/ImpositorKonica/ImpositorKonica.csproj` (WPF, net8.0-windows)
7. `packages/imposition.slnx`, `packages/global.json` e `docs/engineering/BUILD.md` **não existem** hoje (glob confirmado vazio).
8. `.gitignore` atual já ignora `**/bin/`, `**/obj/`, `build/`, `**/build/`; as entradas novas são **aditivas** (explicitam `TestResults/` e `sidecars/bin/`).
9. `Imposition.GridCli.csproj` tem `PublishAot=true` + `RuntimeIdentifier=win-x64`, mas `dotnet build`/`dotnet test` NÃO disparam AOT (só `dotnet publish` faz) — por isso D4.
10. npm no Windows executa scripts via `cmd.exe`: `cd packages && dotnet build ...` e `cd packages/imposition-core && dotnet test ...` são válidos.
11. Contagem estática de testes: **25 `[Fact]`** nos 7 arquivos de teste de `imposition-core` (inclui golden-masters). Número real será reportado na Tarefa F.
12. Workflows `.github/workflows/imposition-core.yml` e `imposition-grid-release.yml` NÃO serão tocados. `packages/imposition-core/imposition-core.slnx` também não.

## 3. Divisão em tarefas

Ordem obrigatória: A) slnx → B) global.json → C) scripts npm → D) .gitignore → E) BUILD.md → F) validação completa. Cada tarefa é pequena (2–10 min) com critério de aceite verificável.

### Tarefa A — Criar `packages/imposition.slnx`
- **Responsável:** general/devops (ou backend-specialist)
- **Arquivos tocados:** `packages/imposition.slnx` (criar — ver seção 4.1)
- **Comando de validação:**
  ```powershell
  cd packages
  dotnet build imposition.slnx -c Release
  ```
- **Critério de aceite:** build compila os **6 projetos** sem erro no Windows (Core, Core.Tests, GridCli, AutoImposerCLI, IllustratorImposerCLI, ImpositorKonica). WPF/COM compilam com SDK 8.0.x presente. Se falhar por razão ≠ plataforma → PARAR e reportar (guardrail).

### Tarefa B — Criar `packages/global.json`
- **Responsável:** general/devops
- **Arquivos tocados:** `packages/global.json` (criar — ver seção 4.2)
- **Comando de validação:**
  ```powershell
  cd packages
  dotnet --version   # esperado: 8.0.x (ex.: 8.0.425), sem warning de SDK ausente
  dotnet build imposition.slnx -c Release   # re-validar a solução com o pin ativo
  ```
- **Critério de aceite:** SDK resolvido via `8.0.100` + `rollForward: latestFeature` → `8.0.425`; nenhum alerta de "SDK não encontrado"; build da solução continua verde.

### Tarefa C — Adicionar scripts npm `build:core`, `build:all`, `test:all`
- **Responsável:** general/devops
- **Arquivos tocados:** `package.json` (raiz — edição cirúrgica, preservar os scripts existentes; ver seção 4.3)
- **Comando de validação:**
  ```powershell
  node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('JSON ok')"
  npm run build:core   # da raiz → sucesso
  npm run test:all     # da raiz → suíte verde
  ```
- **Critério de aceite:** `package.json` continua JSON válido; scripts antigos (`build:cli`, `build:cli:illustrator`, `build:backend`, `build:export`, `package:*`, `dev:*`, `e2e`, etc.) intactos; `build:core` e `test:all` funcionam da raiz.

### Tarefa D — Ampliar `.gitignore` (bloco aditivo)
- **Responsável:** general/devops
- **Arquivos tocados:** `.gitignore` (modificar — ver seção 4.4; só ADICIONAR, não remover nada)
- **Comando de validação:** após `npm run test:all` e `npm run build:cli`, rodar:
  ```powershell
  git status --porcelain
  ```
- **Critério de aceite:** `TestResults/` e `sidecars/bin/cli` NÃO aparecem como untracked; nenhuma regra existente alterada.

### Tarefa E — Criar `docs/engineering/BUILD.md`
- **Responsável:** general/devops
- **Arquivos tocados:** `docs/engineering/BUILD.md` (criar — estrutura na seção 4.5)
- **Comando de validação:** leitura/revisão do documento (nenhum comando de build executado nesta tarefa).
- **Critério de aceite:** documento cobre pré-requisitos, tabela de comandos (com destino real `sidecars/bin/cli`), limitação do `global.json`, guardrail AOT e seção de validação reproduzível.

### Tarefa F — Validação completa (end-to-end)
- **Responsável:** test-engineer / general
- **Arquivos tocados:** nenhum (apenas execução)
- **Comandos:** sequência exata da seção 5, na ordem.
- **Critério de aceite:** todos os passos da tabela da seção 6 com "Aprovado?" marcado como sim; **número REAL de testes verdes reportado** (expectativa estática: 25 `[Fact]`; vale o que o runner disser — se divergir, reportar, não ajustar a suíte).

## 4. Conteúdo sugerido/detalhado por arquivo

### 4.1 `packages/imposition.slnx` (criar)

Caminhos relativos a `packages/`. Formato espelhado no `imposition-core.slnx` vigente (XML raiz `<Solution>`).

```xml
<Solution>
  <Folder Name="/imposition-core/">
    <Project Path="imposition-core/src/Imposition.Core/Imposition.Core.csproj" />
    <Project Path="imposition-core/tests/Imposition.Core.Tests/Imposition.Core.Tests.csproj" />
  </Folder>
  <Folder Name="/imposition-grid-cli/">
    <Project Path="imposition-grid-cli/Imposition.GridCli.csproj" />
  </Folder>
  <Folder Name="/sidecars/">
    <Project Path="../sidecars/AutoImposerCLI/AutoImposerCLI.csproj" />
    <Project Path="../sidecars/IllustratorImposerCLI/IllustratorImposerCLI.csproj" />
    <Project Path="../sidecars/ImpositorKonica/ImpositorKonica.csproj" />
  </Folder>
</Solution>
```

> **6 projetos** (Core, Core.Tests, GridCli, AutoImposerCLI, IllustratorImposerCLI, ImpositorKonica).

### 4.2 `packages/global.json` (criar)

```json
{
  "sdk": {
    "version": "8.0.100",
    "rollForward": "latestFeature"
  }
}
```

### 4.3 `package.json` (modificar — scripts aditivos, preservando os existentes)

Adicionar ao bloco `scripts` (sugestão: logo após `build:cli:illustrator`, agrupando os builds):

```json
"build:core": "cd packages && dotnet build imposition.slnx -c Release",
"build:all": "npm run build:core && npm run build:cli && npm run build:cli:illustrator && npm run build:backend && npm run build:export",
"test:all": "cd packages/imposition-core && dotnet test -c Release"
```

- `&&` é válido porque npm no Windows executa via `cmd.exe` (fato 10).
- `build:all` NÃO inclui `package:client` (empacota Electron; fica fora do ciclo de CI básico e não deve ser exigido na validação obrigatória).

### 4.4 `.gitignore` (modificar — bloco aditivo ao final do arquivo)

```gitignore
# dotnet test artifacts (TRX / ART)
TestResults/
**/TestResults/

# sidecar publish output
sidecars/bin/
**/sidecars/bin/
```

> Aditivo: não remove nem altera as regras existentes (`**/bin/`, `**/obj/`, `build/`, `**/build/`).

### 4.5 `docs/engineering/BUILD.md` (criar) — estrutura e seções

1. **Título + visão geral** — o que é o build unificado e por que existe (PR #3-0 cimenta o build antes do `ProjectReference` do `AutoImposerCLI` para `imposition-core`).
2. **Pré-requisitos** — Windows (obrigatório para sidecars WPF/COM), SDK .NET 8.0.100+ (ambiente atual: 8.0.425), Node.js + npm.
3. **Comandos principais** (tabela):
   - `npm run build:core` → build da solução `packages/imposition.slnx` (`-c Release`).
   - `npm run test:all` → `dotnet test -c Release` em `packages/imposition-core`.
   - `npm run build:all` → core + sidecars (publish) + backend + export.
   - `npm run build:cli` → publica `AutoImposerCLI` em `sidecars/bin/cli`.
   - `npm run build:cli:illustrator` → publica `IllustratorImposerCLI` em **`sidecars/bin/cli`** (destino real do script; NÃO `sidecars/bin/illustrator` — anotar explicitamente).
   - `npm run build:backend` / `npm run build:export` / `npm run package:client` (contexto Electron).
4. **Escopo do `global.json`** — limitação honesta: a resolução de SDK do `dotnet` varre do cwd para cima; `packages/global.json` trava apenas comandos executados **dentro de `packages/`** (ex.: `build:core`, `test:all`). Os sidecars (`build:cli`, `build:cli:illustrator`) rodam `dotnet publish` da raiz e NÃO ficam pinados — limitação conhecida, não blocker (hoje só existe 8.0.425 instalado).
5. **Guardrails de build** — nunca `dotnet publish -p:PublishAot=true` (GridCli é AOT-ready; `dotnet build`/`dotnet test` não disparam AOT); sidecars WPF/COM exigem Windows; `build:all` não roda `package:client`.
6. **Artefatos ignorados** — `TestResults/` e `sidecars/bin/` estão no `.gitignore`.
7. **Validação** — sequência de comandos e resultados esperados (mesma da seção 5 deste plano).

## 5. Fase de validação (sequência exata de comandos e resultados esperados)

> Ordem importa: solução → SDK → scripts → testes → gitignore → sanidade. Rodar da raiz do repo, salvo onde indicado.

```powershell
# 1. Build da solução unificada (de packages/)
cd packages
dotnet build imposition.slnx -c Release
# Esperado: 6 projetos compilados com sucesso, 0 erros, no Windows

# 2. SDK pinado
dotnet --version
# Esperado: 8.0.x (ex.: 8.0.425) — sem warning de SDK não encontrado

# 3. Build via npm (da raiz)
cd ..
npm run build:core
# Esperado: sucesso (mesmo resultado do passo 1)

# 4. Testes via npm (da raiz)
npm run test:all
# Esperado: suíte imposition-core verde; reportar o NÚMERO REAL de testes
# passados (contagem estática atual: 25 [Fact]; o valor do runner é o que vale)

# 5. Sanidade do .gitignore (da raiz)
git status --porcelain
# Esperado: NENHUM artefato TestResults/ nem sidecars/bin/ aparecendo como untracked

# 6. Sanidade do package.json (da raiz)
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('JSON ok')"
# Esperado: imprime "JSON ok"
```

> **Validação opcional:** `npm run build:all` (dispara publish dos sidecars + builds npm de `grafica-app`); só rodar se o ambiente permitir. **Nunca** `dotnet publish -p:PublishAot=true`.

## 6. Checklist de verificação

| # | Passo | Comando | Resultado esperado | Aprovado? |
|---|-------|---------|--------------------|-----------|
| 1 | Build da solução | `cd packages; dotnet build imposition.slnx -c Release` | 6 projetos, 0 erros | ☐ |
| 2 | SDK | `dotnet --version` | 8.0.x | ☐ |
| 3 | Script `build:core` | `npm run build:core` (raiz) | sucesso | ☐ |
| 4 | Script `test:all` | `npm run test:all` (raiz) | suíte verde; **reportar nº real de testes** | ☐ |
| 5 | Gitignore | `git status --porcelain` | sem `TestResults/` nem `sidecars/bin/` untracked | ☐ |
| 6 | JSON válido | `node -e "JSON.parse(...)"` (raiz) | imprime "JSON ok" | ☐ |
| 7 | BUILD.md | leitura | cobre seções da 4.5 | ☐ |
| 8 | Guardrails | `git diff --stat` | nenhum `.cs`/`.ts`/`.js`/`.csproj` de runtime alterado | ☐ |

## 7. Perguntas abertas / divergências com a realidade

1. **Destino do `build:cli:illustrator`:** o pedido original mencionava `sidecars/bin/illustrator`, mas o `package.json` real publica o `IllustratorImposerCLI` em **`sidecars/bin/cli`** (mesmo destino do `AutoImposerCLI`). **Decisão:** documentar o comportamento real no `BUILD.md`; NÃO alterar o script nem criar `sidecars/bin/illustrator`.
2. **"5 projetos" vs. 6 reais:** o título do pedido fala em 5, mas há 6 `.csproj` no repo (Core, Core.Tests, GridCli, AutoImposerCLI, IllustratorImposerCLI, ImpositorKonica). **Decisão:** a `packages/imposition.slnx` inclui os 6; `ImpositorKonica` (WPF) e `IllustratorImposerCLI` (net8.0-windows, COM) compilam no Windows com o SDK instalado.
3. **Escopo do `packages/global.json`:** o pin de SDK só cobre comandos `dotnet` rodados dentro de `packages/`; os sidecars rodam `dotnet publish` da raiz e não ficam pinados. **Decisão:** limitação documentada honestamente no `BUILD.md` (não blocker — hoje só existe 8.0.425 instalado).
4. **Contagem de testes:** o pedido assume "25 testes". A contagem estática encontrada é exatamente **25 `[Fact]`** (7 arquivos de teste, incluindo golden-masters), mas o número REAL de testes verdes deve ser o reportado pelo `dotnet test` na Tarefa F — se divergir de 25, reportar a divergência em vez de ajustar a suíte.

## 8. Guardrails (inalteráveis durante a execução)

- NÃO alterar código C# de produção; NÃO alterar TS/JS.
- NÃO alterar `.csproj` de runtime (nenhum dos 6).
- NÃO alterar golden-masters (testes `GoldenMaster/`).
- NÃO tocar em `.github/workflows/imposition-core.yml` nem `imposition-grid-release.yml`.
- NÃO alterar `packages/imposition-core/imposition-core.slnx`.
- NÃO instalar SDK .NET (usar o 8.0.425 existente via rollForward).
- Se algo não compilar por razão ≠ plataforma → **PARAR e reportar**, não contornar.