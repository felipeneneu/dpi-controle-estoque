# PLAN: Distribuição Enterprise dos Sidecars, ADRs & Config por Máquina

> **Status:** Planejado (aguardando aprovação) · **Modo:** PLANEJAMENTO — nenhum código foi escrito
> **Projeto:** GraficaOS (MONOREPO — Next.js 16 + Fastify 5 + Electron + Sidecars .NET 8)
> **Data:** 2026-09-16 · **Owner:** Felipe
> **ADRs envolvidos:** ADR-015 (Aprovado — verificar), ADR-016 (Proposto — permanece), ADR-017 (→ Aprovado/Implementado), ADR-018 (→ Aprovado/Implementado no ramo Illustrator; CorelDRAW condicional)
> **Documento de destino:** `docs/PLAN-sidecars-enterprise.md` (este arquivo — fase de planejamento puro)


# Snippets para colar em `docs/PLAN-sidecars-enterprise.md`

## 1. Atualizar a linha de SmartScreen na seção E (Riscos e mitigações)

Substituir a linha:

```
| **Executáveis sem assinatura → SmartScreen** | Bloqueio/medo do operador | CI já usa `signAndEditExecutable: false`; documentar que produção corporativa exige code-signing (OV/EV) + allow-list (Defender/Intune); publicar hash/sha256 nos release notes |
```

Por:

```
| **Executáveis sem assinatura → SmartScreen** | Bloqueio/medo do operador — agravado pelo plano de venda externa (BR-021, single deploy por gráfica): cliente pagante não vai passar por "Mais informações → Executar assim mesmo" sozinho | **Scaffold agora, ativar depois:** manter `signAndEditExecutable: false` no CI, mas como uma **flag explícita documentada** (não um esquecimento) — o step de assinatura já fica presente no pipeline, condicionado a um segredo de certificado que ainda não existe. Ativar exige só configurar o segredo no CI, não redesenhar o workflow. **Gatilho de compra do certificado (OV mínimo):** confirmação do 1º cliente externo pagante — não antes, para não gastar em algo sem uso imediato. Publicar hash/sha256 nos release notes desde já, independente da assinatura. |
```

## 2. Adicionar item novo na seção G (O que NÃO vamos fazer — guardrails)

Adicionar ao final da lista existente:

```
- ❌ **Não** implementar licenciamento/proteção anti-cópia do produto nesta fase —
  decisão nova, separada de tudo que este plano cobre (não é sobre licença de
  terceiro como Illustrator/Ghostscript, é sobre proteger o próprio GraficaOS
  contra cópia não-paga quando vendido a outras gráficas). Fica registrado como
  **decisão futura, a tomar antes do 1º cliente externo confirmado**, com duas
  opções já identificadas para avaliação nesse momento: (a) chave de licença
  simples validada localmente/offline; (b) validação online periódica
  ("phone-home") contra servidor próprio. Não decidir nem implementar agora.
```

## 3. Nota de rastreabilidade (opcional, se quiser registrar a origem da mudança)

No topo do arquivo, no cabeçalho, adicionar uma linha de changelog leve (mesmo
espírito do `RULE_CHANGELOG.md`, mas local ao plano):

```
> **Atualização 2026-09-16:** ajuste de prioridade em E (SmartScreen/code-signing:
> scaffold agora, certificado condicionado a 1º cliente externo) e novo guardrail
> em G (licenciamento do produto como decisão futura) — motivado pela decisão de
> testar na gráfica própria antes de vender a terceiros.
```

---

## A. Objetivo e Decisões

### A.1 Contexto

O GraficaOS agora tem **três sidecars** .NET 8 (win-x64, self-contained, single-file) com maturidades diferentes:

| Módulo | Tipo | Onde vive | Build | Empacotado hoje | ADR |
|--------|------|-----------|-------|-----------------|-----|
| `ImpositorKonica` | WPF interativo (mesa de imposição SRA3) | `sidecars/ImpositorKonica` | publish manual (sem script npm) | ✅ `bin/ImpositorKonica.exe` (electron-builder.yml + client.yml) | ADR-015 Aprovado |
| `AutoImposerCLI` | Console headless (step & repeat 70×100) | `sidecars/AutoImposerCLI` | `npm run build:cli` | ❌ fora do electron-builder | ADR-017 (fase validação → implementado) |
| `IllustratorImposerCLI` | Wrapper COM/ExtendScript (Illustrator) | `sidecars/IllustratorImposerCLI` | `npm run build:cli:illustrator` | ❌ fora do electron-builder | ADR-018 (ramo Illustrator implementado; Corel condicional) |

Gaps detectados (já verificados, não re-derivados):

1. **CI quebra:** o job `installers` de `.github/workflows/ci.yml` empacota Electron **sem compilar os sidecars** antes. Como `electron-builder` copia `extraResources` de paths fixos, o primeiro run em runner limpo falha (ex.: `sidecars/ImpositorKonica/bin/Release/net8.0-windows/win-x64/publish/ImpositorKonica.exe` não existe).
2. **ADR desatualizados:** ADR-017 e ADR-018 dizem "validação"/"avaliação" mas o código já está implementado (runner, orchestrator, `.bat`s, CLI funcional). ADR-016 tem só schema/migração (continua Proposto).
3. **README desatualizado:** descreve só a versão web; sem sidecars, sem Electron, sem módulos de automação.
4. **Sem distribuição standalone:** sidecars só existem dentro do pipeline do Electron; um operador não consegue testar `AutoImposerCLI` isolado sem buildar o monorepo.
5. **Sem override de path:** `getAutoImposerPath()`/`getIllustratorImposerPath()` (TS + JS) não aceitam config/env/args — só candidatos fixos de dev e `process.resourcesPath` em produção.

### A.2 Decisões travadas (clarificações já acordadas)

**Decisão 1 — Distribuição standalone (enterprise-leve):**
- Camada **portátil**: ZIP por sidecar publicado na GitHub Release (exe + `.bat` + payload de exemplo + `RELEASE_ORIENTACAO.md`). O usuário baixa, descompacta em qualquer pasta, arrasta o PDF no `.bat` e testa **sem** depender do sistema inteiro (zero runtime .NET — self-contained).
- Camada **instalada**: continua o NSIS do Electron (`extraResources`/`bin/`); para frota, documentar push gerenciado (winget/choco/SCCM/Intune) como camada futura **opcional** — sem over-engineering para um estúdio pequeno.
- Camada **pipeline**: GitHub Actions compila os 3 sidecars **em paralelo** (`windows-latest` matrix), gera os ZIPs e anexa à Release oficial (tags `v*` + tags `sidecar-v*` para releases somente-sidecar).

**Decisão 2 — Veracidade ADR/README:**
- ADR-017 → **Aprovado (Implementado)** com evidência.
- ADR-018 → **Aprovado (Implementado — Illustrator COM; CorelDRAW condicional, sem implementação)** com evidência.
- ADR-016 → permanece **Proposto** (só schema + migration `0011_glorious_changeling`; watcher/parser/rota pendentes).
- ADR-015 → já "Aprovado"; opcional adicionar "Implementado em:".
- README.md reescrito com módulos, packaging Electron, scripts e instruções standalone.

**Decisão 3 — Config por máquina (Electron + Illustrator):**
- Presença de sidecar é **opcional e detectável em runtime** (path-resolver continua fail-graceful; melhorar mensagem).
- Painel "Módulos instalados" na UI/startup lista o que existe em cada máquina.
- Seleção por máquina de quais módulos instalar (config de instalador ou script pós-instalação de cópia).
- Illustrator plug-and-play: **COM auto-detect permanece primário**, com cadeia de override explícita (seção T5).

### A.3 Recomendação enterprise (pragmática, sem over-engineering)

```
                  ┌─────────────────────────────────────────────────────┐
                  │      Distribuição dos Sidecars (3 camadas)          │
                  ├─────────────────────────────────────────────────────┤
  1. PORTÁTIL     │  GitHub Release → ZIP por sidecar (exe + .bat +     │
     (teste livre)│  sample + orientação) — baixa e roda, zero deps.    │
  2. INSTALADA    │  Electron-builder extraResources → bin/ (NSIS).     │
     (por máquina)│  Seleção per-machine via config do instalador ou    │
                  │  script pós-instalação.                             │
  3. FROTA        │  (FUTURO, opcional) winget/choco/SCCM/Intune +      │
     (gerenciada) │  code-signing EV/OV — documentado, não implementado.│
                  └─────────────────────────────────────────────────────┘
```

**Não** construir MSIX/Intune agora — só documentar a porta de entrada.

---

## B. Task breakdown (T1..T6)

Resumo:

| ID | Tarefa | Agente | Prioridade | Depende | Bloqueia |
|----|--------|--------|------------|---------|----------|
| T1 | Pipeline de release + ZIP standalone por sidecar | devops-engineer | P0 | T4 | T3, T6 |
| T2 | Atualizar ADRs (017, 018, 015, 016) + índice | documentation-writer | P0 | — | T3, T6 |
| T3 | README.md + árvore de docs (SIDECARS.md, índices) | documentation-writer | P1 | T1, T2, T4, T5 | T6 |
| T4 | Electron: extraResources (3 yml) + scripts npm | devops-engineer | P0 | — | T1, T5, T3, T6 |
| T5 | Config por máquina: path-resolver override, painel módulos, Illustrator plug-and-play | backend-specialist + general + frontend-specialist | P1 | T4 | T3, T6 |
| T6 | Fase X — verificação final completa | todos | P2 | T1..T5 | — |

### T1 — Pipeline de release + distribuição standalone (ZIPs por sidecar)

- **Agente:** `devops-engineer`
- **Prioridade:** P0 · **Depende de:** T4 (usa `npm run build:sidecars`/`build:konica` criados no T4) · **Bloqueia:** T3, T6
- **Descrição:** Criar a camada portátil + pipeline central. Corrigir o job `installers` do CI **(hoje quebra por faltar a compilação dos sidecars antes do electron-builder)** e adicionar job paralelo `sidecars` que compila os 3 módulos em matrix `windows-latest`, gera ZIPs portáteis e anexa à Release.
- **Arquivos:**
  - `.github/workflows/ci.yml` (editar): job `installers` — adicionar steps `npm run build:cli`, `npm run build:cli:illustrator`, `npm run build:konica` **antes** de `package:server`/`package:client`; job novo `sidecars` (matrix 3×, upload ZIPs como artifact, anexar na `gh release create` em tags `v*`).
  - `.github/workflows/sidecars-release.yml` (novo): release exclusiva de sidecars em tags `sidecar-v*` ou `workflow_dispatch`.
  - `scripts/package-sidecar.ps1` (novo): empacota um sidecar em ZIP (exe + `.bat` + payload de exemplo + `RELEASE_ORIENTACAO.md` auto-gerado).
  - `sidecars/bin/release/` (output, gerado): `AutoImposerCLI-v*.zip`, `IllustratorImposerCLI-v*.zip`, `ImpositorKonica-v*.zip`.
- **Comandos:**
  - `npm run build:cli`
  - `npm run build:cli:illustrator`
  - `npm run build:konica` (novo, T4)
  - `powershell -ExecutionPolicy Bypass -File scripts/package-sidecar.ps1 -Name AutoImposerCLI`
  - CI: push de tag `v0.2.0` → Release com ZIPs anexados.
- **Critérios de aceite:**
  - ZIP de cada sidecar contém: exe, `.bat` de bancada, payload PDF de exemplo, `RELEASE_ORIENTACAO.md`.
  - Descompactado em máquina limpa **sem .NET** → `AutoImposerCLI.exe` roda e gera PDF imposto.
  - Job `installers` do CI não falha por falta de executável em `extraResources`.
  - Release `v*` anexa os 3 ZIPs; tag `sidecar-v*` libera só sidecars.
- **Rollback:** reverter os yml do workflow e o script — nenhum efeito em runtime/instaladores existentes.

### T2 — Atualizar ADRs e índice (veracidade de status)

- **Agente:** `documentation-writer`
- **Prioridade:** P0 · **Depende de:** — · **Bloqueia:** T3, T6
- **Descrição:** Marcar como implementados os ADRs cujo código já existe (evidência obrigatória). Sem alterar decisões de arquitetura — apenas status + evidência.
- **Arquivos:**
  - `docs/governance/adr/ADR-017-headless-auto-imposer-cli.md` → `## Status` → `Aprovado (Implementado)` + bloco "Implementado em:" (`sidecars/AutoImposerCLI`, `npm run build:cli`, `electron/sidecars/auto-imposer-runner.js`, canal IPC `automation:impose`, `.bat`s `Impor_70x100.bat`).
  - `docs/governance/adr/ADR-018-coreldraw-com-motor-grafico.md` → `## Status` → `Aprovado (Implementado — Illustrator COM; CorelDRAW condicional, sem implementação)` + evidência (`sidecars/IllustratorImposerCLI`, `npm run build:cli:illustrator`, `EnsureIllustratorTypeLibRegistered()`, `engine.jsx`, orchestrator `ILLUSTRATOR_COM`). Manter seção "Gatilhos para Reavaliação" para CorelDRAW.
  - `docs/governance/adr/ADR-015-arquitetura-sidecar-e-ferramentas-nativas.md` → confirmar "Aprovado"; adicionar "Implementado em:" (`extraResources` → `bin/ImpositorKonica.exe` nos yml).
  - `docs/governance/adr/ADR-016-mimaki-tracking-csv-teste.md` → permanece `Proposto`; nota "(apenas schema + migration 0011; watcher/parser/rota pendentes)".
  - `docs/governance/ADR_INDEX.md` → atualizar linhas ADR-015/016/017/018 (coluna Status).
- **Comandos:** nenhum (somente edição de markdown).
- **Critérios de aceite:**
  - `ADR_INDEX.md` consistente com os cabeçalhos dos arquivos.
  - ADR-017/018 têm campo "Implementado em:" com caminhos reais (file:line ou paths).
  - ADR-016 permanece Proposto e o índice deixa claro que só existe schema/migração.
- **Rollback:** git revert dos 4 ADRs + índice — nenhum impacto em código.

### T3 — README.md + árvore de docs (módulos, packaging, standalone)

- **Agente:** `documentation-writer`
- **Prioridade:** P1 · **Depende de:** T1 (ZIPs/instruções), T2 (status), T4 (packaging), T5 (config) · **Bloqueia:** T6
- **Descrição:** Reescrever o README para o estado atual (web + Electron + sidecars) e criar a **home canônica** dos sidecars em `docs/`, refletindo tudo nas árvores de índice (política de `00_DOCS_INDEX.md`: novos docs entram no inventário).
- **Arquivos:**
  - `README.md` (reescrever seções): monorepo real; tabela de módulos (tipo, onde vive, build, empacotado onde, ADR); seção Electron (server/client installers + scripts); tabela de exit codes consolidada; instruções standalone (ZIPs do T1); seção "config por máquina" (resumo do T5); links para ADRs e `docs/desktop/SIDECARS.md`.
  - `docs/desktop/SIDECARS.md` (novo): home canônica — arquitetura (ADR-015/017/018), protocolo de runtime (JSON/`--json`, `RESULT_JSON:`), **tabela de exit codes**, instruções de teste standalone por sidecar (ZIP + `.bat` + payload), cadeia de override do Illustrator, troubleshooting (`TYPE_E_LIBNOTREGISTERED`, ProgID ausente → exit 2 JSON).
  - `docs/00_DOCS_INDEX.md` (editar): adicionar `desktop/SIDECARS.md` à árvore (seção 1).
  - `docs/README.md` (editar): linha da pasta `desktop/` na tabela de pastas.
- **Comandos:** nenhum (markdown puro).
- **Critérios de aceite:**
  - README reflete: sidecars, módulos de automação, packaging Electron (server/client), scripts completos, exit codes, testes standalone, links ADR.
  - Tabela de exit codes mínima: `0` sucesso · `1` cancelamento/arquivo não encontrado · `2` contrato/payload inválido **ou** ProgID Illustrator ausente (JSON error) · `3` erro de subsistema de impressão (Konica) — valores exatos consolidados das fontes em T6.
  - Nenhum link quebrado (validar com `npm run docs:check` se o script existir — ver `engineering/DOC_CONSISTENCY.md`).
  - `00_DOCS_INDEX.md` e `docs/README.md` listam o novo `desktop/SIDECARS.md`.
- **Rollback:** git revert do README/índices — sem efeito em código.

### T4 — Electron: extraResources (3 yml) + scripts npm

- **Agente:** `devops-engineer` (+ `backend-specialist` para wiring de scripts)
- **Prioridade:** P0 · **Depende de:** — · **Bloqueia:** T1, T5, T3, T6
- **Descrição:** Incluir `AutoImposerCLI.exe` e `IllustratorImposerCLI.exe` no `bin/` dos instaladores onde fizer sentido e criar scripts de build dos sidecars na raiz. **Decisão server.yml:** servidor **não** recebe os CLIs de imposição (máquina de servidor não impõe chapas) — mantém o pacote enxuto; comentário no yml explicando a decisão + porta de entrada futura (módulo instalado pós-instalação por máquina).
- **Arquivos:**
  - `electron/electron-builder.yml` (editar `extraResources`):
    ```yaml
    - from: ../sidecars/bin/cli/AutoImposerCLI.exe
      to: bin/AutoImposerCLI.exe
    - from: ../sidecars/bin/cli/IllustratorImposerCLI.exe
      to: bin/IllustratorImposerCLI.exe
    ```
  - `electron/electron-builder.client.yml` (mesmos 2 blocos acima).
  - `electron/electron-builder.server.yml` (editar — **sem** os CLIs de imposição; adicionar comentário de decisão).
  - `package.json` (raiz): novos scripts `build:konica` (`dotnet publish sidecars/ImpositorKonica -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o sidecars/bin/konica`) e `build:sidecars` (encadeia `build:cli` + `build:cli:illustrator` + `build:konica`).
- **Comandos:**
  - `npm run build:sidecars`
  - `npm run package:client` → inspecionar `dist/client/resources/bin/` (3 exes)
  - `npm run package:server` → inspecionar `dist/server/resources/` (SEM os CLIs de imposição)
- **Critérios de aceite:**
  - Client/default installers contêm `bin/AutoImposerCLI.exe` + `bin/IllustratorImposerCLI.exe` **e** `bin/ImpositorKonica.exe`.
  - Server installer **não** contém os 3 CLIs (decisão documentada no yml).
  - `npm run build:sidecars` compila os 3 sem erro em `win-x64` self-contained.
  - Os paths coincidem com o que o path-resolver espera em produção: `process.resourcesPath/bin/<exe>`.
- **Rollback:** reverter yml/scripts — instaladores voltam ao estado atual sem os CLIs.

### T5 — Config por máquina: override de path, detecção de presença, painel "Módulos instalados", Illustrator plug-and-play

- **Agentes:** `backend-specialist` (CLI/config/orchestrator) + `general` (path-resolver TS+JS) + `frontend-specialist` (painel UI). Wiring `main.js`/orchestrator: `backend-specialist`/`general`.
- **Prioridade:** P1 · **Depende de:** T4 (sidecars empacotados para testar end-to-end) · **Bloqueia:** T3, T6
- **Descrição:** Tornar presença de módulo **opcional/detectável** e dar override por máquina. Estabelecer a cadeia de prioridade plug-and-play do Illustrator:

  ```
  1) CLI argumento:      --ai-path <exe>  |  --ai-config <arquivo.json>   (por job)
  2) Env var:            ILLUSTRATOR_CLI_PATH                              (por máquina)
  3) Config file:        illustrator.env  |  .graf-cfg.json  ao lado do exe (portátil)
  4) Machine-level:      %APPDATA%\dpi-controle-estoque\sidecars.json
                         |  resources\config\sidecars.json (lido pelo Electron/orchestrator)
  5) COM auto-detect:    Type.GetTypeFromProgID("Illustrator.Application")
                         + EnsureIllustratorTypeLibRegistered() (win64 self-heal)  [default]
  6) Auto-probe (opcional): D:\Programas\Adobe Illustrator *, 
         C:\Program Files\Adobe\Adobe Illustrator *, chave Uninstall do registro
  7) Falha clara:        exit code 2 + JSON listing onde procurou + como corrigir
  ```
  Mesma cadeia (sem COM/ProgID) vale para o `AutoImposerCLI` com `AUTOIMPOSER_CLI_PATH`.
- **Arquivos:**
  - `electron/src/main/utils/path-resolver.ts` + mirror `electron/utils/path-resolver.js` (editar — `general`): prioridade config/env/file antes dos candidatos dev; mensagem de erro listando onde procurou; expor `sidecarStatus()`.
  - `electron/ipc/modules-ipc.js` (novo — `backend-specialist`): canal `modules:status` (lista módulos presentes/ausentes + versão/exit code de self-check).
  - `electron/main.js` (editar — `backend-specialist`/`general`): registrar `modules-ipc` no bloco try/catch final; checagem de presença no startup (log + evento p/ UI).
  - `electron/services/imposition-orchestrator.js` (editar — `backend-specialist`): ler `%APPDATA%\dpi-controle-estoque\sidecars.json` / `resources\config\sidecars.json` quando existir; repassar `--ai-config` nos calls `ILLUSTRATOR_COM` e `--json` no `CLI_NET`.
  - `sidecars/IllustratorImposerCLI/*.cs` (editar — `backend-specialist`): implementar `--ai-path`, `--ai-config <json>`, env `ILLUSTRATOR_CLI_PATH`, leitura de `illustrator.env`/`.graf-cfg.json` ao lado do exe; melhorar mensagem do exit 2 (lista caminhos pesquisados + instrução); auto-probe opcional.
  - `grafica-app/src/components/modules-panel.tsx` (novo — `frontend-specialist`): painel "Módulos instalados" (presente/ausente/erro de self-check) alimentado pelo canal `modules:status` via preload.
  - `electron/preload.js` (editar — `frontend-specialist`): expor bridge `modules.status()`.
  - `docs/architecture/SETTINGS_CATALOG.md` (editar — `backend-specialist`): registrar novas env/config keys (`ILLUSTRATOR_CLI_PATH`, `AUTOIMPOSER_CLI_PATH`, `GRAFICA_SIDECAR_CONFIG_DIR`, shape de `sidecars.json`) — política P9 do `governance/DOC_POLICIES.md`.
- **Comandos:**
  - `npm run build:cli:illustrator` (recompila CLI com os novos args)
  - `npm run lint` · `npm run build:export` · `npm run build:backend`
  - Teste de cadeia: sem nada → COM detecta; com `ILLUSTRATOR_CLI_PATH` errado → usa env e erro claro; com `--ai-config` → vence tudo.
- **Critérios de aceite:**
  - Cadeia de prioridade 1→7 verificada em testes manuais (arg > env > config-file > machine-level > COM > probe > erro).
  - Máquina sem Illustrator: CLI retorna exit 2 com JSON que **lista onde procurou** e como corrigir.
  - `modules:status` retorna os 3 módulos com presença real; painel UI renderiza.
  - Orchestrator repassa override quando `sidecars.json` existe; sem o arquivo, comportamento atual (COM) intacto.
  - `SETTINGS_CATALOG.md` atualizado no mesmo PR (P9).
- **Rollback:** reverter TS+JS+CLI+UI; remover registro do `modules-ipc` no main.js → comportamento anterior preservado (COM auto-detect).

### T6 — Fase X: verificação final completa

- **Agente:** todos
- **Prioridade:** P2 · **Depende de:** T1..T5 · **Bloqueia:** — (conclusão)
- **Descrição:** Rodar todo o checklist da seção D e anexar o marcador "✅ PHASE X COMPLETE" no fim **deste** arquivo.
- **Arquivos:** `docs/PLAN-sidecars-enterprise.md` (marcador), sem código.
- **Critérios de aceite:** todo checklist verde; marcador adicionado apenas após execução real dos comandos (não marcar sem rodar).

---

## C. Ordem de execução / grafo de dependências

```
Batch 1 (paralelo):
  T2 (ADRs) ────────────────────────────┐
  T4 (packaging electron + scripts) ────┼──►  (independem entre si)

Batch 2 (paralelo, após T4):
  T1 (pipeline/CI + ZIPs) ── usa npm run build:sidecars (T4)
  T5 (config/módulos/override) ── testa empacotado (T4)

Batch 3:
  T3 (README/docs) ── precisa de T1 (ZIPs), T2 (status), T4 (packaging), T5 (config)

Batch 4:
  T6 (Fase X) ── depende de T1..T5

Grafo (bloqueios):
  T4 → T1 │ T4 → T5 │ T2 → T3 │ T1 → T3 │ T4 → T3 │ T5 → T3 │ T1..T5 → T6
```

**Ordem recomendada na prática:** (T2 ∥ T4) → (T1 ∥ T5) → T3 → T6.

---

## D. Checklist de verificação (Fase X)

> **NÃO marcar itens sem executar.** Comandos assumidos como existentes: `npm run lint`, `npm run build:export`, `npm run build:cli`, `npm run build:cli:illustrator` (raiz). Os demais são explícitos abaixo.

**D.1 Build dos sidecars**
- [ ] `npm run build:cli` → `sidecars/bin/cli/AutoImposerCLI.exe` existe (self-contained, single-file)
- [ ] `npm run build:cli:illustrator` → `sidecars/bin/cli/IllustratorImposerCLI.exe` existe (com `Scripts/engine.jsx` embutido)
- [ ] `npm run build:konica` (novo) → `sidecars/bin/konica/ImpositorKonica.exe` existe
- [ ] Todos rodam em máquina **sem .NET runtime** (self-contained confirmado)

**D.2 Lint / tipos / build web**
- [ ] `npm run lint` verde (frontend + backend)
- [ ] `npm run build:export` verde (Next.js static export)
- [ ] `npm run build:backend` verde (Fastify/TS)

**D.3 Empacotamento Electron (T4)**
- [ ] `npm run package:client` → `dist/client/resources/bin/` contém os 3 exes
- [ ] `npm run package:server` → `dist/server/resources/` **sem** os CLIs de imposição (decisão lean)
- [ ] Default `electron-builder.yml` também inclui os 3 exes

**D.4 Distribuição standalone (T1)**
- [ ] ZIP por sidecar com conteúdo mínimo (exe, `.bat`, payload sample, orientação)
- [ ] Smoke test em VM limpa sem .NET: ZIP do AutoImposerCLI gera PDF imposto a partir de payload sample
- [ ] CI `windows-latest` verde; Release `v*` com ZIPs anexados; tag `sidecar-v*` libera só sidecars
- [ ] CI `installers` não falha por `extraResources` ausente (sidecars compilados antes)

**D.5 Config por máquina / plug-and-play (T5)**
- [ ] Prioridade verificada: `--ai-config` > `ILLUSTRATOR_CLI_PATH` > config file ao lado do exe > machine-level `sidecars.json` > COM > probe
- [ ] Máquina sem Illustrator: exit code 2 com JSON listando locais pesquisados + instrução de correção
- [ ] `EnsureIllustratorTypeLibRegistered()` (win64) auto-cura TypeLib quando instalado
- [ ] `modules:status` retorna presença real; painel "Módulos instalados" renderiza na UI
- [ ] Orchestrator repassa override quando `sidecars.json` existe; sem arquivo → COM padrão intacto
- [ ] `docs/architecture/SETTINGS_CATALOG.md` atualizado com as novas env/config keys (P9)

**D.6 Docs / ADRs (T2/T3)**
- [ ] ADR-017/018 com status novo + "Implementado em:"; ADR-016 Proposto; `ADR_INDEX.md` consistente
- [ ] README coberto: módulos, exit codes, packaging, standalone, links ADR
- [ ] `docs/desktop/SIDECARS.md` criado; `00_DOCS_INDEX.md` + `docs/README.md` refletem
- [ ] `npm run docs:check` (se o script existir — ver `engineering/DOC_CONSISTENCY.md`) sem links quebrados

**D.7 Regressão / extras**
- [ ] Fluxos existentes intactos: `Impor_70x100.bat` e `Impor_Illustrator.bat` rodam contra `sidecars/bin/cli/*.exe` (dev)
- [ ] UI/UX/web regressão: opcional rodar `.agent` scripts (`security_scan.py`, `ux_audit.py`, `lighthouse_audit.py`, `playwright_runner.py`) para as mudanças de UI do T5
- [ ] Marcador **✅ PHASE X COMPLETE** adicionado ao final deste arquivo (somente após tudo verde)

---

## E. Riscos e mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Exe self-contained **+35–45 MB** por sidecar | Instalador Electron cresce muito se todos embarcados | Decisão lean: server sem imposição (T4); ZIPs por módulo para quem quer apenas 1; client embarca os 2 CLIs + Konica e pode ser seletivo por máquina no futuro |
| **ProgID ausente** em PC recém-instalado (`TYPE_E_LIBNOTREGISTERED`) | Illustrator COM falha | Auto-cura win64 TypeLib existente + erro claro exit 2 (lista locais) + cadeia de override (T5) + probe de caminhos comuns/registro |
| **x86 vs x64** desalinhado (TypeLib/DLLs) | Crash silencioso | Publicação sempre `win-x64` self-contained; validar registro 64-bit (`WOW6432Node`, `Programs64`); testes na VM limpa |
| **Executáveis sem assinatura → SmartScreen** | Bloqueio/medo do operador | CI já usa `signAndEditExecutable: false`; documentar que produção corporativa exige code-signing (OV/EV) + allow-list (Defender/Intune); publicar hash/sha256 nos release notes |
| **CI falha por sidecar não compilado** (gap atual) | Release quebrada | Job `installers` compila os 3 sidecars antes do electron-builder (T1); `npm run build:sidecars` local para reproduzir |
| **Drift TS ⇄ JS** do path-resolver | Override funciona num e não noutro | Editar TS + JS no mesmo PR; teste manual nas duas portas; lint/typecheck |
| **Licença Adobe/Corel** | Uso cinza/redistribuição indevida | Feature condicional por ProgID (license-aware); nada de redistribuir binários Adobe; ExtendScript via `DoJavaScript` apenas; CorelDRAW segue condicional e sem implementação (ADR-018) |
| **Server sem imposição = expectativa errada** | Operador tenta impor no servidor | Painel "Módulos instalados" deixa claro o que existe na máquina; decisão documentada no yml do server |
| **`sidecars.json` malformado** | Orchestrator quebra no boot | Parse defensivo (try/catch, fallback para COM); schema mínimo documentado no SETTINGS_CATALOG |

---

## F. Rollback / recuperação (global)

- **T2/T3 (docs):** `git revert` — zero impacto em código.
- **T4 (packaging):** reverter yml/scripts → instaladores sem os CLIs (estado atual).
- **T1 (CI/ZIPs):** remover jobs/steps do workflow; ZIPs são artefatos de release, não afetam runtime.
- **T5 (config/override):** reverter TS+JS+CLI+UI e remover registro de `modules-ipc` → comportamento COM atual intacto; sem lock-in (override é aditivo).
- **Dados:** nenhuma migração de banco neste plano — risco de dados nulo.

## G. O que NÃO vamos fazer (guardrails)

- ❌ **Não** implementar MSIX/Intune/winget/choco agora — apenas camada documentada (T1/T3).
- ❌ **Não** incluir CLIs de imposição no `server.yml` (decisão lean, T4).
- ❌ **Não** implementar o ramo CorelDRAW do ADR-018 (permanece condicional).
- ❌ **Não** tocar em `mimaki_jobs`/M2M/schema de estoque (ADR-016 fora de escopo de código).
- ❌ **Não** escrever código nesta fase — este arquivo é planejamento puro.