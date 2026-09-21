# BUILD — Infraestrutura de build unificada

> **Versão:** 1.0.0 · **Status:** ATIVO · **Owner:** Felipe · **Última atualização:** 2026-09-17

## 1. Visão geral

Build unificado do monorepo `dpi-controle-estoque`: uma solução C# única
(`packages/imposition.slnx`) agrupando os 6 projetos, orquestrada por
scripts npm na raiz. Existe para cimentar o build **antes** do
`ProjectReference` do `AutoImposerCLI` para `imposition-core` (PR #3a):
com a solução no lugar, qualquer consumidor — humano no terminal, script
npm ou CI — compila o mesmo conjunto de projetos de forma reproduzível.

Este PR (#3-0) é infraestrutura pura: nenhum código de runtime muda.

## 2. Pré-requisitos

| Requisito | Versão | Observação |
|---|---|---|
| Windows | — | Obrigatório: 2 dos 6 projetos são `net10.0-windows` (WPF/COM) |
| SDK .NET | 10.0.100+ | Pinado via `global.json` na raiz (`10.0.100` + `rollForward: latestFeature`) |
| Node.js + npm | — | Executor dos scripts de orquestração |
| Runtime .NET 8 | **não** | Não é mais necessário após o PR #3-00 (migração para .NET 10) |

## 3. Comandos

| Script npm | O que faz | Saída principal |
|---|---|---|
| `npm run build:core` | Build da solução `packages/imposition.slnx` (`-c Release`) | 6 projetos compilados |
| `npm run test:all` | `dotnet test -c Release` em `packages/imposition-core` | Suíte verde |
| `npm run build:all` | `build:core` + sidecars (publish) + backend + export | Todos os builds |
| `npm run build:cli` | Publish do `AutoImposerCLI` | `sidecars/bin/cli/AutoImposerCLI.exe` |
| `npm run build:cli:illustrator` | Publish do `IllustratorImposerCLI` | `sidecars/bin/cli/IllustratorImposerCLI.exe` |
| `npm run build:backend` | Build do backend `grafica-app/backend` | Bundle do backend |
| `npm run build:export` | Build do frontend/export do `grafica-app` | `out/` |
| `npm run package:client` | Empacota o cliente Electron com o `ImpositorKonica` | Installer |

> Nota: `build:cli` e `build:cli:illustrator` publicam **ambos** em
> `sidecars/bin/cli` (mesmo destino real dos scripts em
> `package.json:17-18`).

## 4. Ordem de dependências

```
imposition-core ──► AutoImposerCLI ──► package:client
       │
       └──► Imposition.GridCli
       │
       └──► Imposition.Core.Tests
```

`imposition-core` é a raiz de tudo; os CLIs (AutoImposerCLI, GridCli) e a
suíte de testes dependem dele. `package:client` fragua o Electron e é o
único passo que não participa do ciclo básico de build (ver §5).

## 5. Solução unificada vs. CI

A solução `packages/imposition.slnx` é usada **apenas localmente** por
`npm run build:core`. Os workflows de CI continuam buildando projetos
individuais (`imposition-core.slnx` no `imposition-core.yml`; `grid-cli`
no `imposition-grid-release.yml`) para:

1. Minimizar tempo de CI (não compila 6 projetos quando só precisa de 2).
2. Evitar compilar projetos Windows-only em runner Linux.

**Local e CI divergem por design.**

## 6. Compatibilidade da solução

`packages/imposition.slnx` inclui 6 projetos; dois são
`net10.0-windows` — `ImpositorKonica` (WPF) e `IllustratorImposerCLI`
(COM/ExtendScript). Por isso a solução só compila no **Windows**. Em
qualquer outro SO, use os builds individuais do CI ou rode apenas o
subset necessário (`dotnet build packages/imposition-core/imposition-core.slnx`).

## 7. Guardrails de build

- **Nunca** rodar `dotnet publish -p:PublishAot=true` localmente —
  `Imposition.GridCli` é AOT-ready, mas o publish AOT é exclusivo do CI
  (`packages/imposition-grid-cli/Imposition.GridCli.csproj:13`).
  `dotnet build` e `dotnet test` não disparam AOT.
- `build:all` **não** inclui `package:client` (empacota Electron; fica
  fora do ciclo básico e da validação obrigatória).
- Sidecars WPF/COM exigem Windows.
- Não alterar `.csproj` produz impacto em vários consumidores — mudanças
  aí passam por ADR (Regra 6 do `AGENTS.md` do `imposition-core`).

## 8. Artefatos ignorados

Regras aditivas no `.gitignore` da raiz:

```gitignore
TestResults/          # artefatos de teste (TRX/ART)
**/TestResults/
sidecars/bin/         # output de publish dos sidecars
**/sidecars/bin/
```

Nenhuma regra existente foi alterada.

## 9. Validação

Sequência reproduzível a partir da raiz do repo:

```powershell
# 1. Solução unificada compila (de packages/)
cd packages
dotnet build imposition.slnx -c Release   # 6 projetos, 0 erros

# 2. global.json ativo
dotnet --version                          # 10.0.x

# 3. build:core
cd ..
npm run build:core                        # sucesso

# 4. test:all
npm run test:all                          # suíte verde (25 testes)

# 5. Sanidade .gitignore
git status --porcelain                    # sem TestResults/ nem sidecars/bin/

# 6. Sanidade package.json
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('JSON ok')"

# 7. Fix do .bat confirmado (fallback net10.0)
Select-String -Path MontarPDF.bat,Montar_*.bat -Pattern "net8\.0"   # 0 ocorrências
```

---

Fonte: `MontarPDF.bat:5-8` (fallback `net8.0` → `net10.0`),
`package.json:17-18` (destinos de publish dos CLIs),
`packages/imposition-grid-cli/Imposition.GridCli.csproj:13` (PublishAot),
`.gitignore:61-68` (artefatos ignorados).
## QPDF (depend�ncia do Imposition.Pdf)
O Imposition.Pdf.dll chama qpdf.exe para preservar camadas OCG.
O bin�rio � baixado via script:

`powershell
.\scripts\fetch-qpdf.ps1
``n
Colocado em sidecars/bin/cli/qpdf/. Empacotado no publish.
**N�o � versionado no git.**
