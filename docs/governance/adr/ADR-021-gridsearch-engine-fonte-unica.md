# ADR-021: GridSearchEngine como Fonte Única de Verdade da Imposição

- **Status:** Proposto
- **Data:** 2026-09-17
- **Autor:** Felipe Neneu / GraficaOS Core Team
- **Domínio:** imposition / pre-press
- **Links:** BR-010, BR-021; complementa ADR-015, ADR-017, ADR-018, ADR-020;
  formaliza `docs/engineering/IMPOSICAO-MOTOR.md` §6; obedece
  `packages/imposition-core/AGENTS.md`.

---

## Contexto

O monorepo possui **4 motores de imposição/step&repeat divergentes**, catalogados
em `docs/engineering/IMPOSICAO-MOTOR.md` §2 e §5:

- Motor 1 — `sidecars/AutoImposerCLI/Program.cs` (.NET 8 + PdfSharp 6.1.1, chapa/folha).
- Motor 2 — `sidecars/IllustratorImposerCLI/Program.cs` + `Scripts/engine.jsx` (COM/ExtendScript, rolo).
- Motor 3 — `src/lib/imposition-roll-math.ts` (idêntico a `grafica-app/src/lib/imposition-roll-math.ts`, matemática TS).
- Motor 4 — `sidecars/ImpositorKonica/Views/CanvasImposicao.cs` (WPF + SkiaSharp, gang-run).

As divergências estão listadas em `IMPOSICAO-MOTOR.md` §5. As três que motivam
esta decisão:

1. **Decisão de orientação incompatível** — área (`Program.cs:153`), colunas com
   epsilon mágico `+0.000001` (`engine.jsx:56-62,59-60`) e ordenação por score
   (`imposition-roll-math.ts:109-122`). Os motores escolhem orientações opostas
   para a mesma entrada.
2. **Margens per-side** só existem no motor 1 (`Program.cs:75-78`); o orquestrador
   envia só `marginLeft + marginTop` (`electron/services/imposition-orchestrator.js:63-64`).
3. **Física rolo vs folha inconsistente** — JSX auto-estende (`engine.jsx:110-114`);
   CLI erra com `utilH < 0` (`Program.cs:118-123`).

O `IMPOSICAO-MOTOR.md` §6 já define o **modelo alvo** (`GridSearchEngine`), o
**contrato de entrada** (§6.1), o **algoritmo em 7 passos** (§6.2), a **função
de custo** (§6.3) e o **pseudocódigo** (§6.4). Falta a decisão formal de onde
esse motor vive, quem o consome e como a fonte única é garantida em build-time.

Adicionalmente, o `packages/imposition-core/AGENTS.md` **Regra 6** determina que
toda mudança de contrato exige ADR, e a **Regra 5** exige terminologia
Head-to-Head / Head-to-Foot para duplex — o que implica extensão do contrato
`ImpositionInput` (§6.1), coberta pela ADR-022.

---

## Decisão

### 1. Localização canônica

O motor vive em `packages/imposition-core` — biblioteca .NET 8, **sem IO**
(Regra 8 do `AGENTS.md` do pacote), sem dependências externas de runtime
(PdfSharp, SkiaSharp, COM). Todos os sidecars C# referenciam via
`ProjectReference`.

### 2. Contrato

`ImpositionInput` e `ImpositionResult` exatamente como
`IMPOSICAO-MOTOR.md` §6.1, com `schemaVersion` versionado e serialização JSON
estável. Alteração de campo exige ADR subsequente (Regra 6 do pacote).

### 3. Binário CLI nativo para o frontend

`imposition-grid.exe` (`NativeAOT`, `win-x64`) lê `ImpositionInput` em
`stdin` e escreve `ImpositionResult` em `stdout`. **Não referencia** PdfSharp,
SkiaSharp nem COM — só o core. Startup < 30 ms. Front (Electron/Next) spawna
via `child_process` e cacheia por `gridHash`.

*Justificativa da plataforma:* `ADR-015` §Negativas fixa Windows como SO de
chão de fábrica. `osx-arm64` só entra sob demanda real de operador (não de
dev), como publish adicional — não é reescrita.

### 4. Resolução de defaults em 4 camadas

O core recebe `ImpositionInput` **completo e resolvido** — nunca decide
defaults. A precedência é resolvida **antes** do core, por um componente
`EffectiveInputResolver`:

| Camada | Dono | Quando decide | Exemplo |
|---|---|---|---|
| 1 — Chamada (CLI, `.bat`, UI) | Operador / PCP | Por job | `--target 1015 --surplus truncate` |
| 2 — Preset / receita | PCP / operador | Por cliente/tipo | "Cartão 90×50 Cliente X" |
| 3 — MachineProfile | Dono da gráfica / TI | Uma vez por máquina | "Konica da Loja Centro: fill_row" |
| 4 — System default | Dev | Uma vez por release | `truncate`, `toleranceFloor=0.1` |

**Precedência:** camada 1 sobrescreve 2 sobrescreve 3 sobrescreve 4.

O PR #1 implementa **apenas a camada 4** (defaults do sistema) + a assinatura
pública do resolver. As camadas 1–3 chegam em PRs subsequentes sem alterar
contrato (o resolver é uma função pura em `Contracts/`).

**Mudança de precedência entre camadas exige ADR subsequente.**

### 5. roll-math.ts rebaixado a interpolador de UI

> **Nota (2026-09-18):** esta decisão foi **substituída** pela ADR-025.
> O `roll-math.ts` foi deprecado e o preview migrou para C# nativo
> in-process ao `imposition-core`. Ver `ADR-025-preview-nativo-csharp.md`.

`src/lib/imposition-roll-math.ts` (e a cópia em `grafica-app/`) passa a ser
**interpolador durante drag de slider** e **confirmador contra o core ao
soltar**. Nunca é fonte de verdade. A assinatura pública atual
(`imposition-roll-math.ts:136-154`) é preservada para não quebrar o front.

### 6. Motores consumidores

- **Motor 1** (`AutoImposerCLI`): consome o core; elimina a comparação por
  área de `Program.cs:153`.
- **Motor 2** (`engine.jsx`): recebe grid/rotação **pré-calculados** via JSON;
  elimina a decisão por colunas de `engine.jsx:56-62`.
- **Motor 3** (`roll-math.ts`): vira re-export/adaptador fino do core.
- **Motor 4** (`ImpositorKonica`): consome o core no `ExecuteAutoGang`
  (evolução do round-robin de `CanvasImposicao.cs:755-803`) — fica para P2 do
  roadmap §7, PR subsequente.

### 7. Guardrails preservados (imutáveis)

- **Naming de saída:** `_IMPOSTO_{W:F0}x{H:F0}mm_{N}UN.pdf` (`Program.cs:262`)
  e o padrão do `engine.jsx`.
- **Exit codes:** CLI `0/1`; Illustrator `0/1/2` (`ADR-015` §Decisão 3); Konica
  `0/1/2/3`.
- **Vetorização:** Form XObject + matriz afim `cm` (`ADR-017` §Decisão 3).
- **Caminho COM/ExtendScript** mantido (`ADR-018` §Decisão 1).

---

## Consequências

### Positivas

- Uma implementação de verdade — fim dos 3 critérios de orientação, das
  margens assimétricas e da física rolo-vs-folha divergente.
- Tolerância explícita `tol = max(toleranceMm, registerMm, 0.1)` aplicada
  **antes** do `floor` substitui o `+0.000001` de `engine.jsx:59-60`
  (Regra 1 do `AGENTS.md`).
- Frontend com preview rápido via binário nativo + cache por `gridHash`.
- Golden-master do caso canônico (`IMPOSICAO-MOTOR.md` §3.1, §8.1) vira teste
  de contrato cross-motor.
- Precedência de defaults isolada em um resolver puro — cada gráfica
  (pequena/grande) configura seu comportamento uma vez no `MachineProfile`.

### Negativas / Mitigações

- **Plumbing IPC novo (~2 dias).** Mitigado com binário `NativeAOT` pequeno +
  cache LRU em memória + persistente.
- **Empacotamento por plataforma.** Mitigado: escopo inicial `win-x64`; Mac
  só sob demanda real (`ADR-015` §Negativas).
- **Dívida: `roll-math.ts` sobrevive no hot-path.** Mitigado por telemetria
  de hit/miss; aposentadoria em P3 do roadmap §7.
- **Não corrige gang-run multi-SKU nesta ADR.** Fica em PR P2 (§7 do
  `IMPOSICAO-MOTOR.md`), consumindo o mesmo core.

### Alternativas rejeitadas

- **TS como fonte + contratos gerados para C#/JSX.** Repete o problema atual
  (`IMPOSICAO-MOTOR.md` §5).
- **C# → WASM (`NativeAOT`) consumido por JS e C#.** Debugging caro;
  complexidade de empacotamento dentro do single-file do `ADR-015`.
- **Apenas contrato JSON + golden-master, sem código compartilhado.** É o
  modelo que já falhou neste repo.

---

## Verificação

- **Golden-master do caso canônico** roda em CI a cada PR que toque os
  motores (`TESTING_STRATEGY.md` §1, §4). Esperado:
  `cols=35, rows=29, total=1015, orientation=0, lengthMm=986, surplus=0`.
- **Teste de contrato cross-motor:** mesmo `ImpositionInput` enviado aos
  motores 1, 2, 3 e 4 produz `gridHash` idêntico (motor 2 é `SKIP` se
  Illustrator ausente; motor 4 é GUI, coberto por teste manual datado).
- **Testes unitários do core** seguem a convenção BR-* (`TESTING_STRATEGY.md`
  §2) com tag BR-010 / BR-021.
- **Testes de precedência do resolver** (camada 4 do PR #1):
  `BR_010_o`, `BR_010_p`, `BR_010_q`.
- `docs:check` verde (`DOC_POLICIES.md` P9, P10).

## Nota de honestidade (P8)

Enquanto `packages/imposition-core` não estiver em produção sombra por ≥ 1
semana sem divergência de contagem, o status desta ADR permanece **Proposto**.
Só vira **Aprovado** após o golden-master cross-motor passar em CI por 5 dias
consecutivos sem flake.

## Gatilhos para Reavaliação

- Primeiro job real de booklet/caderno que exija dobras por assinatura.
- Primeiro cliente que exija `cutInsetMm ≠ 0` em produção.
- Migração de stack de runtime do chão de fábrica para fora de Windows.

---

`source: docs/engineering/IMPOSICAO-MOTOR.md:§2,§5,§6` · `packages/imposition-core/AGENTS.md:Regra 1,Regra 6,Regra 8` · `docs/governance/adr/ADR-015.md:§Negativas,§Decisão 3` · `docs/governance/adr/ADR-017.md:§Decisão 3`