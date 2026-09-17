# Reporte Final — PR #3-0: Infraestrutura de build unificada

> **Versão:** 1.0.0 · **Status:** ATIVO · **Owner:** Felipe · **Última atualização:** 2026-09-17
> Execução do PLAN `docs/PLAN-build-infra.md` (com ajustes pós-PR #3-00 definidos na missão).

---

## 1. Resumo da execução

Infraestrutura pura executada na ordem A→F, sem tocar em runtime. Soluções `.slnx` unificada criada com 6 projetos (0 erros), `global.json` apenas verificado (já existia na raiz com `10.0.100`/`latestFeature`), 3 scripts npm aditivos (`build:core`, `build:all`, `test:all`), `.gitignore` ampliado, `BUILD.md` com as 8 seções e fallback `net8.0`→`net10.0` corrigido em `Impor_70x100.bat:7`. Validação end-to-end: 7 passos verdes.

## 2. Arquivos criados/modificados

| Tipo | Arquivo | Observação |
|---|---|---|
| ✅ Criado | `packages/imposition.slnx` | Solução unificada com os 6 projetos |
| ✅ Criado | `docs/engineering/BUILD.md` | Documentação do fluxo de build (8 seções) |
| ♻️ Modificado | `package.json` (raiz) | Scripts `build:core`, `build:all`, `test:all` (aditivos) |
| ♻️ Modificado | `.gitignore` (raiz) | Append `TestResults/` + `sidecars/bin/` |
| ♻️ Modificado | `Impor_70x100.bat` | Linha 7: fallback `net8.0`→`net10.0` |
| 🚫 Não tocado | `docs/PLAN-build-infra.md`, `docs/engineering/REPORTE-source-json-gen-grid-cli.md` | Permaneceram untracked (guardrail) |

## 3. Tarefa A — `packages/imposition.slnx`

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

Build de validação:

```
6 projetos compilados (Core, Core.Tests, GridCli, AutoImposerCLI, IllustratorImposerCLI, ImpositorKonica)
Compilação com êxito. 0 Aviso(s) 0 Erro(s)
```

## 4. Tarefa B — `global.json` (só verificação)

Já existia na raiz (feito no PR #3-00):

```json
{
  "sdk": {
    "version": "10.0.100",
    "rollForward": "latestFeature"
  }
}
```

`dotnet --version` → `10.0.401`. Nada criado ou alterado.

## 5. Tarefa C — Scripts npm (aditivos, sem remover nada)

Adicionados ao bloco `scripts` do `package.json` raiz:

```json
"build:core": "cd packages && dotnet build imposition.slnx -c Release",
"build:all": "npm run build:core && npm run build:cli && npm run build:cli:illustrator && npm run build:backend && npm run build:export",
"test:all": "cd packages/imposition-core && dotnet test -c Release"
```

Todos os scripts existentes (`build:cli`, `build:cli:illustrator`, `build:backend`, `build:export`, `package:*`, `dev:*`, `e2e`) preservados.

Validação:

```
$ node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('JSON ok')"
JSON ok

$ npm run build:core
Compilação com êxito. 0 Aviso(s) 0 Erro(s)
```

## 6. Tarefa D — `.gitignore` (append)

```gitignore
# dotnet test artifacts
TestResults/
**/TestResults/

# sidecar publish output
sidecars/bin/
**/sidecars/bin/
```

Nenhuma regra existente alterada. `git status --porcelain` não mostra `TestResults/` nem `sidecars/bin/` como untracked.

> Nota do PLAN: `sidecars/bin/` já era coberto por `bin/`; as linhas novas são explícitas e documentais.

## 7. Tarefa D.1 — Fix do fallback do `.bat`

`Impor_70x100.bat:7`, trocando apenas o segmento do caminho de fallback:

```diff
-set "BIN=%~dp0sidecars\AutoImposerCLI\bin\Release\net8.0\win-x64\publish\AutoImposerCLI.exe"
+set "BIN=%~dp0sidecars\AutoImposerCLI\bin\Release\net10.0\win-x64\publish\AutoImposerCLI.exe"
```

Caminho primário (`sidecars\bin\cli\...`), argumentos, echoes e exit codes intactos. `Impor_Illustrator.bat` não tem o padrão `net8.0` (só erro se o binário não existir) — nada feito ali.

Validação:

```
$ Select-String -Path Impor_*.bat -Pattern "net8\.0" | Measure-Object | Select Count
0
```

## 8. Tarefa E — `docs/engineering/BUILD.md`

Novo documento PT-BR cobrindo as 8 seções obrigatórias:

1. **Visão geral** — build unificado e o motivo (cimentar build antes do ProjectReference do PR #3a).
2. **Pré-requisitos** — Windows, SDK .NET 10.0.100+, Node.js; runtime 8 não é mais necessário.
3. **Comandos** — tabela com os 8 scripts (`build:core`, `build:all`, `test:all`, `build:cli`, `build:cli:illustrator`, `build:backend`, `build:export`, `package:client`).
4. **Ordem de dependências** — `imposition-core → AutoImposerCLI → package:client`.
5. **Solução unificada vs. CI** — a `.slnx` é usada só localmente; CI builda projetos individuais (local e CI divergem por design).
6. **Compatibilidade da solução** — `.slnx` inclui 2 projetos Windows-only (WPF/COM) → só compila em Windows.
7. **Guardrails** — nunca `dotnet publish -p:PublishAot=true` local; `build:all` não inclui `package:client`.
8. **Artefatos ignorados** — `TestResults/`, `sidecars/bin/`; **Validação** — sequência reproduzível.

Footer com `source: file:line` (P2) e PT-BR (P7).

## 9. Tarefa F — Validação end-to-end

| # | Passo | Resultado |
|---|---|---|
| 1 | `dotnet build imposition.slnx -c Release` | ✅ 6 projetos, 0 erros |
| 2 | `dotnet --version` | ✅ 10.0.401 |
| 3 | `npm run build:core` | ✅ sucesso |
| 4 | `npm run test:all` | ✅ Aprovado: 25, Com falha: 0, Ignorado: 0 |
| 5 | `git status --porcelain` | ✅ sem `TestResults/` nem `sidecars/bin/` |
| 6 | `node -e "JSON.parse(...)"` | ✅ `JSON ok` |
| 7 | `Select-String Impor_*.bat "net8\.0"` | ✅ 0 ocorrências |

## 10. Declaração

"Não alterei código de runtime, `.csproj`, workflows de CI, golden-masters, nem `global.json`."

## 11. Divergências com o PLAN

1. **`global.json` na raiz (não em `packages/`):** o PLAN antigo previa criar `packages/global.json` com `8.0.100`. A missão atual corrigiu para só verificar o de raiz (`10.0.100`), refletindo o estado pós-PR #3-00 — seguido conforme o prompt.
2. **`BUILD.md`:** o PLAN listava 7 seções; a missão adicionou a obrigatória "Solução unificada vs. CI" (8 seções totais) — coberta.
3. Nenhum outro desvio da realidade encontrado durante a execução.

---

Fonte: `packages/imposition.slnx`, `package.json:19-21` (scripts), `.gitignore:61-68` (artefatos), `Impor_70x100.bat:7` (fallback), `docs/engineering/BUILD.md`.