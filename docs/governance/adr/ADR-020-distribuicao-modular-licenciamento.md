# ADR-020 — Distribuição Modular de Sidecars, Gating por RBAC e Licenciamento por Edições

- **Status:** Proposto
- **Data:** 2026-09-16
- **Owner:** Felipe Neneu / GraficaOS Core Team
- **Domínio:** desktop/imposition | ops | company-config
- **Links:** cita `BR-021` (settings tipadas por empresa), `BR-018` (RBAC); complementa `ADR-002` (matriz RBAC), `ADR-015` (arquitetura sidecar), `ADR-016` (canal teste Mimaki), `ADR-017` (AutoImposerCLI headless), `ADR-018` (motor gráfico externo COM). Afeta: `electron/electron-builder.yml`, `electron/electron-builder.server.yml`, `electron/electron-builder.client.yml`, `electron/src/main/utils/path-resolver.ts` (+ espelho JS), `electron/services/imposition-orchestrator.js` (+ TS), `electron/main.js`, `.github/workflows/ci.yml`, `sidecars/*`, `grafica-app/backend/src/middleware/runner-auth.ts`, `docs/architecture/SETTINGS_CATALOG.md`, `README.md`.
- **Base conceitual:** `docs/PLAN-sidecars-enterprise.md`; modelo de *product editions* praticado por Adobe Creative Cloud (completo vs single-app), JetBrains (All Products Pack vs IDE isolada) e CorelDRAW Graphics Suite.
- **Escopo de execução:** este ADR registra a **decisão**. O passo a passo, dependências e critérios de aceite vivem em `docs/PLAN-sidecars-enterprise.md`.

---

## Contexto

O GraficaOS possui hoje **três sidecars nativos** (.NET 8, `win-x64`, *self-contained single-file*) com maturidades distintas:

| Módulo | Tipo | ADR | Estado atual de distribuição |
|--------|------|-----|------------------------------|
| `ImpositorKonica` | WPF interativo (mesa SRA3) | ADR-015 | Empacotado no Electron (`bin/ImpositorKonica.exe`) |
| `AutoImposerCLI` | Console headless (Step & Repeat) | ADR-017 | Fora do Electron; build manual via `npm run build:cli` |
| `IllustratorImposerCLI` | Wrapper COM/ExtendScript (Illustrator) | ADR-018 | Fora do Electron; build via `npm run build:cli:illustrator` |

Gaps verificados que motivam esta decisão:

1. **Sem distribuição standalone.** Um operador não consegue testar um sidecar sem buildar o monorepo inteiro. Não há artefato portátil publicável.
2. **Empacotamento incompleto.** `AutoImposerCLI.exe` e `IllustratorImposerCLI.exe` não constam em `extraResources` do electron-builder; o CI empacota o Electron sem compilar os sidecars antes (quebra em runner limpo).
3. **Sem configuração por máquina.** `getAutoImposerPath()` / `getIllustratorImposerPath()` só têm candidatos fixos de dev e `process.resourcesPath`; não há override por máquina. O `IllustratorImposerCLI` depende exclusivamente do ProgID COM `Illustrator.Application`.
4. **Sem gating de produto.** A RBAC (`ADR-002`) controla **usuário**, mas não existe controle de **quais módulos** uma instalação/empresa possui. Hoje "completo" e "módulo avulso" não são distinguíveis.
5. **Necessidade comercial.** Deseja-se vender o **GraficaOS Completo** (tudo) e também **módulos isolados** (ex.: só Estoque, só Pré-impressão, só Automação) a partir da **mesma base de código**.

### Opções consideradas

**Distribuição:**
- (A) Monólito — só instalador Electron completo. Rejeitada: impede teste isolado e venda modular.
- (B) Módulos acoplados como DLL no processo Electron. Rejeitada: perde isolamento de falha/memória e refaz o que a arquitetura sidecar (ADR-015) já resolve.
- **(C) Sidecars desacoplados com distribuição em camadas** — escolhida.

**Controle de acesso a módulos:**
- (a) ACL de filesystem apenas (negar leitura a operador). Rejeitada como controle primário: inoperante quando o usuário é admin local e frágil (o processo precisa ler o binário).
- (b) Gating somente de UI. Rejeitada: não impede chamada direta ao `.exe` nem ao endpoint.
- **(c) RBAC de usuário + Entitlement de produto, reforçados por instalação seletiva** — escolhida.

---

## Decisão

Adotar **distribuição modular em camadas**, com **gating de módulos em duas dimensões** (usuário via RBAC, produto via *entitlement*) e **licenciamento por edições** (Completo vs módulos), tudo sobre a mesma base de código.

### 1. Distribuição em três camadas (enterprise-leve)

1. **Portátil (teste livre):** cada sidecar gera um **ZIP autocontido** (`.exe` + `.bat` de bancada + payload de exemplo + `LEIA-ME`), publicado na **GitHub Release**. O usuário baixa, descompacta em qualquer pasta e arrasta o PDF no `.bat` — **zero runtime .NET** (self-contained), sem depender do sistema.
2. **Instalada (por máquina):** o instalador NSIS do Electron embute os sidecars via `extraResources` para as máquinas que os possuem; a presença do binário é **opcional e detectada em runtime**.
3. **Pipeline:** GitHub Actions compila os três sidecars **em paralelo** (`windows-latest`, matrix) e anexa os ZIPs à Release (`v*` para produto; `sidecar-v*` para releases somente-sidecar).

*Camada futura opcional (sem over-engineering agora):* push gerenciado por frota (winget/choco/SCCM/Intune).

### 2. Gating de módulos em duas dimensões

| Dimensão | Pergunta | Entidade | Onde é aplicado |
|----------|----------|----------|-----------------|
| **RBAC** | "Quem pode usar?" | Usuário/Role | Backend (JWT/`runner-auth.ts`) e canais IPC |
| **Entitlement** | "O produto possui esse módulo?" | Empresa/Licença/Máquina | Início do app + gate antes de spawnar o sidecar |

- O **orchestrator** e os endpoints de automação só invocam um sidecar se **RBAC E entitlement** permitirem.
- A **não instalação** do binário em uma máquina é a camada de defesa em profundidade (não há o que executar).
- ACL de filesystem no diretório `bin/` é aceita **apenas como camada extra**, nunca como controle primário.

### 3. Configuração por máquina (plug-and-play)

- **Presença de sidecar é opcional e detectável.** O path-resolver permanece *fail-graceful*, com mensagem clara listando onde procurou e como corrigir.
- **Override de caminho** com precedência explícita (ex.: parâmetro CLI → variável de ambiente → arquivo de config da máquina → candidatos de dev/`resourcesPath`).
- **Illustrator:** a **detecção COM (`Illustrator.Application`) permanece o caminho primário plug-and-play** (já inclui auto-registro do TypeLib win64). O override é reservado a máquinas fora do padrão. A feature é **desabilitada silenciosamente** quando o motor não está registrado.
- Um **catálogo de módulos instalados** (`sidecars.json`) e um painel/verificação de startup exibem o que existe em cada máquina.

### 4. Licenciamento por edições (produto vendável completo ou modular)

- **Edições** mapeadas a *feature flags* por entitlement (base: `settings` tipadas / `flags` de empresa — `BR-021`, `SETTINGS_CATALOG.md`):

  | Edição | Entitlements liberados |
  |--------|------------------------|
  | **Completo** | todos (`inventory.*`, `imposition.*`, `automation.*`, `integrations.*`) |
  | **Estoque** | `inventory.*` |
  | **Pré-impressão** | `imposition.*` |
  | **Automação** | `automation.*` |

- **Licença assinada offline:** arquivo `license.json` (edições, módulos, expiração, limite de máquinas, fingerprint) assinado com chave privada; o app valida com **chave pública embutida** (funciona sem internet), no modelo de serial/offline activation.
- **Ativação online opcional:** o backend registra instalação/seat (device fingerprint, contagem de assentos) permitindo revogar/transferir.
- **Gate em runtime** no orchestrator/IPC: sem entitlement, o módulo aparece indisponível — não é erro, é ausência de direito.

### 5. Fases de implementação (evitar over-engineering)

- **Fase 1 — Flags:** entitlements simples por empresa/edição (+ RBAC de módulo), empacotamento por edição, distribuição standalone e config por máquina. Cobre a venda modular básica.
- **Fase 2 — Licença assinada:** `license.json` assinado + validação por chave pública + ativação online e emissão de licenças. Só entra com demanda comercial real.

---

## Consequências

- **Positivas:**
  - Mesma base de código serve **Completo** e **módulos avulsos** (SKUs múltiplos sem *fork*).
  - Sidecars testáveis isoladamente (portátil) e instaláveis por máquina (defesa em profundidade).
  - Separação limpa entre "quem usa" (RBAC) e "o que foi comprado" (entitlement).
  - Instalação plug-and-play em outros PCs, com fallback automático e override opcional.
  - Pipeline de release padronizado e reprodutível (CI matrix + ZIPs + installer).
- **Negativas / Mitigações:**
  - **Tamanho:** cada `.exe` self-contained adiciona ~35–45 MB ao pacote → empacotar por edição, distribuir só o que a máquina possui.
  - **Fragilidade de ACL de filesystem** → usada apenas como camada extra; controle real fica no gate de aplicação.
  - **Dependência de COM/licença Adobe (ou Corel)** → feature condicional por registro na workstation, com fallback clássico e sem aviso de regressão.
  - **Complexidade de licenciamento** → postergado para Fase 2; Fase 1 usa apenas flags.
  - **Assinatura de binário** (SmartScreen) é recomendável, mas não bloqueante no MVP.
- **Migração:**
  - Nenhuma mudança de schema produtivo na Fase 1 (flags em `settings`).
  - `extraResources` e scripts de build passam a incluir os sidecars; exige recompilar antes do `electron-builder` no CI.
  - `SETTINGS_CATALOG.md` e `README.md` devem ser atualizados no mesmo PR (política P9 de `DOC_POLICIES.md`).

---

## Verificação

1. Pipeline gera **um ZIP por sidecar** e anexa à Release; o ZIP roda em máquina **sem .NET instalado** (self-contained).
2. `electron-builder` empacota `AutoImposerCLI.exe` e `IllustratorImposerCLI.exe` em `bin/`; o CI compila os sidecars **antes** do empacotamento (sem falha em runner limpo).
3. Máquina **sem** um sidecar inicia sem erro; a UI/painel marca o módulo como indisponível e o orchestrator **não** o invoca.
4. Override de path (CLI/env/config) tem precedência sobre o candidato padrão; ausência de config cai no COM/path padrão sem regressão.
5. Usuário sem role `ADMIN`/`DEV_MASTER` **não** dispara `automation:impose` nem o endpoint de jobs (RBAC).
6. Instalação sem entitlement de um módulo **não** spawna o sidecar correspondente, mesmo com o binário presente (entitlement).
7. Edição "Estoque" não expõe pré-impressão/automação; edição "Completo" expõe tudo — mesma build.
8. Pack de testes automatizados (`npm run lint`, `build:export`, `build:cli`, `build:cli:illustrator`) permanece verde.
