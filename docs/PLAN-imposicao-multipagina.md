# PLAN — Imposição Multi-Rodada / Multi-Página (imposição geométrica + Form XObject + gap multi-rodada)

> **Estado:** PLANNING ONLY — nenhum código implementado; ESTE arquivo é o único artefato desta etapa.
> **Tipo de projeto:** BACKEND (core .NET puro + sidecar CLI) com extensão WEB (Electron runner + API + UI). Agente primário: `backend-specialist`; suporte: `test-engineer`, `qa-automation-engineer`, `frontend-specialist`, `devops-engineer`.
> **Documentos normativos:** `packages/imposition-core/AGENTS.md` (Regras 1–8), `docs/engineering/IMPOSICAO-MOTOR.md` (contrato vivo, seções 1–7 lidas), `docs/engineering/TESTING_STRATEGY.md`, `docs/governance/DOC_POLICIES.md`, ADR-021, ADR-023, ADR-024, `docs/PLAN-marcas-imposicao.md` (reserva ADR-040; define o ponto de encaixe do overlay de marcas).
> **Regra de ouro:** golden-master é lei (Regra 2) — rodar ANTES e DEPOIS de cada fase; contagem reportada == geometria desenhada (Regra 4 / ADR-023); mudança de contrato exige ADR (Regra 6) — número proposto: **ADR-041**.

---

## 1. Achados da investigação (as-is, verificado arquivo:linha)

### 1.1 Contexto do sistema

- Fonte única alvo: `packages/imposition-core/src/Imposition.Core/Grid/GridSearchEngine.cs` (242 linhas). Função pura `Plan(ImpositionInput)` (`GridSearchEngine.cs:29`), sem IO e sem PackageReference (Regra 8 — doc header `GridSearchEngine.cs:10-15`).
- Tolerância explícita ANTES do floor: `Tolerance.Resolve(...)` em `GridSearchEngine.cs:33`; `floor((utilW + gap + tol)/(pW + gap))` em `:59-63` (com respeito a `ForcedCols`).
- Varredura completa orientações × colunas: orientações em `:46-48`; loop de colunas em `:67-80` (com `rowsFill`/`rowsAdv` por `SurplusPolicy` em `:75-80` e a regra "nunca transbordar silenciosamente" `:88-89`).
- Física folha vs rolo: `fits` em `:93-97` (rolo auto-estende até `MaxLengthMm`; folha fixa em `InitialLengthMm`); candidato que não cabe é descartado (`:97`); nenhum candidato → `GridOverflow` (`:113-117`).
- Scoring: `Score` em `:140-156` com pesos wA=0.50 / wL=0.30 / wS=0.20 (`:155`); `alternativeGrids` top-5 (sem contar o vencedor) em `:125-134`; hash de grade SHA-256 em `:188-195`.
- Contrato: `Contracts/ImpositionInput.cs:9-19` (record de entrada), `SubstrateSpec{Kind,WidthMm,InitialLengthMm,MaxLengthMm,ToleranceMm,RegisterMm,BleedMm,CutInsetMm}` (`:21-29`), `PieceSpec` (`:31`), `GapSpec` (`:33`), `MarginSpec` (`:35-36`). Enum `Orientation.Portrait=0, Landscape=90`; `SubstrateKind.Sheet/Roll`. **Nota:** o contrato C# real difere do schema TS de `IMPOSICAO-MOTOR.md §6.1` (margin per-side aparece fora de `substrate` no C#); isto é o estado as-is e não será alterado por este plano.
- Resultado: `Contracts/ImpositionResult.cs:5-17` (`SchemaVersion "1.0"`, `GridHash`, `Cols/Rows/Total/Orientation/LengthMm/Surplus/PlannedUnits/Placements/Metrics/AlternativeGrids`); `Placement{Index,Row,Col,XMm,YMm,WidthMm,HeightMm,RotationDegrees}` (`:19-27`); `Metrics` (`:29-32`); `AlternativeGrid` (`:34-39`).

### 1.2 DIVERGÊNCIA DE ORIGEM (bug/dívida confirmada)

- O core gera `Placements` **alinhados à margem superior-esquerda, sem centralização**: `x0 = Margin.LeftMm`, `y0 = Margin.TopMm` (`GridSearchEngine.cs:165-166`); `x = x0 + c*(pW+gap)`, `y = y0 + r*(pH+gap)` (`:175-176`), com `Math.Round(x, 2)` (`:180`).
- O CLI **recalcula sozinho** a origem centralizada: `gradeWMm = cols*slotW + (cols-1)*gap`, `startXMm = marginLeft + (utilWMm - gradeWMm)/2.0` (`Program.cs:241-245`) e desenha em `xPt = (startXMm + c*(slotWMm+gapMm))*MM_TO_PT` (`:276-277`), `yPt` análogo em `:277`.
- Consequência: a **posição real desenhada vive no CLI, não no core** — contraria o espírito de ADR-021 §Decisão 1 ("fonte única de verdade"). `IMPOSICAO-MOTOR.md §3.4` (linhas 89-100) documenta "Centralização nos dois eixos (200-204)" com referências de linha já obsoletas (o código atual está em 241-245) — o doc precisará ser atualizado na Fase A.
- **Decisão do usuário:** mover a centralização para o core; o CLI passa a consumir `Placements` tal-qual (ver §1.6 item 3).

### 1.3 Form XObject / operador `Do` (VERIFICADO nos PDFs gerados)

- PDF `etiqueta-teste_IMPOSTO_700x1000mm_187UN.pdf` (7.093 bytes): página com `/Resources << /XObject << /Fm0 10 0 R >> >>`; objeto 10 = `/Type/XObject /Subtype/Form /BBox[0 0 240.945 102.056]` (peça 85×36mm; 1 único form). Content stream (FlateDecode) decompressado = **187 ops `/Fm0 Do`** — exatamente as 187 unidades. O arquivo **não** infla por cópia.
- Padrão por peça decompressado: `q` `cm(0 -1 1 0 tx ty)` (rotação 90 + translação ao slot) `0 0 0 rg` `/GS0 gs` `q` `0 g` `0 G` `1 0 0 1 -offX -offY cm` `100 Tz` `/Fm0 Do` `Q` `Q`. O segundo `cm` com translado grande é o compensador do PdfSharp para a origem do form importado — **redundante por peça, porém correto** (aceitável). Sem rotação o padrão seria `1 0 0 1 tx ty cm` direto.
- Corroboração no código: o CLI desenha cada peça com `gfx.DrawImage(arteForm, ...)` (`Program.cs:279-290`) a partir de `XPdfForm.FromFile` (`:114`) — o PdfSharp vira a arte importada em 1 Form XObject e emite `Do` por repetição (prova registrada em `Imposition/PdfReadBack.cs:9-11`: "1015 DrawImage = 1015 Do").
- Conclusão: **(a)** replicação via `Do` já implementada e correta; **(b)** redundância do compensador aceitável; **(c)** NÃO há teste que trave esse comportamento — vale criar harness de inspeção (`Fase B`).

### 1.4 Read-back existente (reutilizável)

- `Imposition/PdfReadBack.cs:16-33` — `CountDrawnUnits` abre o PDF (`PdfReader.Open(..., Import)`), itera **todas as páginas** (`:22`) e conta `Do` recursivamente em COperator/CSequence (`:35-54`). **Já soma múltiplas páginas** — pronto para multi-página.
- `Imposition/CountIntegrity.cs:19-46` — valida `plannedUnits == drawnUnits` e `readBackUnits` (Regra 4 / ADR-023); `E_COUNT_MISMATCH` (`:13`); `--strict` aborta, `--warn` loga.
- CLI instrumenta o loop (`geradas`, `Program.cs:315`) e faz read-back (`:316-319`); campos `plannedUnits/drawnUnits/readBackUnits` no `RESULT_JSON` (`Program.cs:429-431`).
- Golden-master: `packages/imposition-core/tests/.../GoldenMaster/CaseCanonicalTests.cs:16-36` (`BR_010_n`, casos `000-canonical`: 19×34mm em 665×986mm, gap 0, margens 0, alvo 1015 → `cols=35, rows=29, total=1015, orientation=0`; esperado `IMPOSICAO-MOTOR.md §3.1`/`§8.1`).

### 1.5 O GAP REAL — multi-rodada / multi-página (não existe hoje)

- `GridSearchEngine` resolve **um único substrato**: folha fixa (não cabe → candidato descartado, e `GridOverflow` se nenhum cabe, `GridSearchEngine.cs:93-97,113-117`) ou rolo que auto-estende até `MaxLengthMm` — **nunca divide em múltiplas páginas/chapas**. `TargetCopies` > capacidade de uma chapa ⇒ falha em vez de gerar 2+ chapas.
- CLI cria **sempre 1 página**: `var page = outputDoc.AddPage();` (`Program.cs:259-262`) e trunca em `targetCopies` (`:271-274`, `:293-296`). Nome de saída `{base}_IMPOSTO_{W:F0}x{H:F0}mm_{geradas}UN.pdf` (`:303`) — guardrail de naming (ADR-021 §Decisão 7).
- **Nenhuma noção de "rodada", página, ou segmentação por limite físico** em qualquer ponto do core/CLI (busca por `ForcedRounds|MultiRound|MultiSheetPlanner` no repo: zero ocorrências fora de documentação).

### 1.6 Decisões do usuário (gate socrático — NÃO redecidir)

1. **Formato de saída multi-rodada: AMBOS, via flag no job** — (a) PDF único multi-página (1 página por chapa/rodada; padrão livro/revista); (b) 1 arquivo por chapa (`..._{UN}UN_p1.pdf`, `_p2.pdf`, ...) para distribuir chapas a máquinas distintas.
2. **Gatilho de divisão: os 3** — (a) capacidade por chapa (folha E rolo: enche chapas completas + sobra parcial no fim); (b) rolo também quando `lengthMm > maxLengthMm` da bobina (segmentação); (c) **rodadas forçadas explícitas** no job (operador pode pedir N rodadas).
3. **Origem/centralização: mover para o core** — `GridSearchEngine` passa a centralizar; CLI desenha exatamente nas coordenadas dos `Placements`; golden-master deve continuar igual.
4. **Profundidade Preps: plano .NET primeiro** — Preps é referência conceitual (chapa/assinatura/páginas); sem análise JDF.
5. **Marcas/slugline: fora deste plano** — existe `docs/PLAN-marcas-imposicao.md`. Este plano apenas reserva o **ponto de encaixe**: render pós-placements/pré-save, com hook de overlay por página (C3/D3).

---

## 2. Critérios de sucesso (mensuráveis)

- **Neutralidade 1-rodada:** sem flags novas, comportamento byte-equivalente ao atual no caso canônico e em chapas que cabem (golden-master Regra 2 passa em CI em todas as fases).
- **Origem única:** `Placements` do core = coordenadas desenhadas pelo CLI (sem recomputo de `startX/startY` no CLI); equivalência posicional provada por teste para margens assimétricas e rotação 90.
- **Multi-rodada correta:** 3000 cópias com capacidade ~seja qual for → `ceil(restante/capacidade)` rodadas; somatório dos `PlannedUnits` das rodadas == `TargetCopies` (ou alvo do surplusPolicy no fim); contagem verificada por página E no arquivo inteiro.
- **Rolo segmentado:** `lengthMm` por rodada ≤ `MaxLengthMm`; divisão por capacidade e por limite de bobina respeitadas.
- **Form XObject travado:** 1 único form por página; `Σ Do == drawnUnits`; BBox do form == peça escalada ± tolerância — qualquer regressão (ex.: desenho inline no lugar de `Do`) falha o teste.
- **Compatibilidade:** `RESULT_JSON` continua parseável por leitores atuais (`auto-imposer-runner.js:101-112`); novos campos são aditivos (`rounds`, `outputFiles`, checksum por arquivo); `schemaVersion` bumped sem quebra.
- **Governança:** ADR-041 aprovado/registrado (`ADR_INDEX.md` atualizado), contrato vivo `IMPOSICAO-MOTOR.md` com seção "Rodadas/segmentos", `docs:check` verde.

---

## 3. Stack e estrutura alvo

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Core (planner) | .NET (`net8`; `net10` conforme ADR-024) — `packages/imposition-core` | fonte única (ADR-021); Sem IO / sem PackageReference (Regra 8) |
| Render | PdfSharp 6.1.1 — `sidecars/AutoImposerCLI` | Form XObject vetorial (ADR-017/018) |
| Inspeção/read-back | PdfSharp 6.1.1 (ContentReader) — projeto de teste do sidecar | já usado por `PdfReadBack`; não pode viver no core (Regra 8) |
| Testes | xUnit + FluentAssertions, convenção BR-* (`TESTING_STRATEGY.md`) | testes de contrato cross-motor |
| Runner/UI | Electron (`auto-imposer-runner.js`, `imposition-orchestrator.js`) + `grafica-app` (Fastify/Drizzle/React) | flags de saída, progresso por rodada, exibição de chapas |

### 3.1 Estrutura de arquivos (alvo)

```
docs/
  PLAN-imposicao-multipagina.md                          <- este plano
  engineering/IMPOSICAO-MOTOR.md                         <- atualizado (nova seção "Rodadas/segmentos")
  governance/adr/ADR-041-imposicao-multirodada.md        <- Fase C (ADR-040 fica reservado p/ marcas)
  governance/ADR_INDEX.md                                <- linha ADR-041

packages/imposition-core/src/Imposition.Core/            (função pura, sem IO — Regra 8)
  Grid/GridSearchEngine.cs                               <- Fase A (centralização)
  Grid/MultiSheetPlanner.cs      (NOVO)                  <- Fase C (orquestrador por rodada)
  Contracts/ImpositionInput.cs   (+ 1 campo aditivo)     <- Fase C (ForcedRounds via ADR-041)
  Contracts/MultiRoundResult.cs  (NOVO)                  <- Fase C (envelope Round[])

packages/imposition-core/tests/Imposition.Core.Tests/
  GoldenMaster/CaseCanonicalTests.cs                     <- Fase A (regressão)
  MultiRound/MultiSheetPlannerTests.cs (NOVO)            <- Fase C/F
  Centering/PlacementCenteringTests.cs (NOVO)            <- Fase A

sidecars/AutoImposerCLI/
  Program.cs                                             <- Fase A/D/E (consumo de Placements, loop multi-página, flags)
  Imposition/ImpositionBridge.cs                         <- Fase C/E (BuildInput p/ rounds/roll)
  Imposition/PdfReadBack.cs                              <- reutilizado (já itera páginas)
  Imposition/CountIntegrity.cs                           <- Fase D (validação por arquivo/total)

sidecars/AutoImposerCLI.Tests/            (NOVO projeto) <- Fase B (harness de inspeção deve viver AQUI, fora do core)
  PdfInspectorTests.cs                                   <- Fase B
  PdfInspector.cs  (NOVO, util)                          <- Fase B

electron/
  sidecars/auto-imposer-runner.js                        <- Fase E (flags, progresso, outputFiles[])
  services/imposition-orchestrator.js                    <- Fase E (payload rounds/outputMode)

grafica-app/backend (schema/routes de automação)         <- Fase E (migration/rota p/ campos novos)
grafica-app/.../Imposicao UI (React)                     <- Fase E (exibição de rodadas/chapas)
```
---

## 4. Fases e tarefas (task breakdown)

> **Legenda de arquivos:** [C]=core src, [T]=core tests, [S]=sidecar, [ST]=sidecar tests (novo), [E]=electron, [G]=grafica-app, [D]=docs/governance.
> **Convenção BR-*:** seguir `docs/engineering/TESTING_STRATEGY.md`; sugestão de faixas: BR-040* (centralização), BR-041* (multi-rodada), BR-042* (harness/inspeção).
> **Regra de parada:** rodar golden-master (Regra 2) ANTES e DEPOIS de cada tarefa que toque geometria.

### Fase A — Hardening geométrico (origem única)

| Task | Nome | Agente | Arquivos | Deps | Done |
|---|---|---|---|---|---|
| **A0** | Baseline golden-master + snapshot do caso assimétrico atual | `test-engineer` | [T] `CaseCanonicalTests.cs`, saída CLI | — | Registrar `cols=35, rows=29, total=1015, orientation=0` (CI verde) e salvar PDF/coord do caso L=10/R=20/T=5/B=15 para comparação posterior |
| **A1** | Mover centralização para `BuildResult` do core | `backend-specialist` | [C] `GridSearchEngine.cs` (`:164-182`) | A0 | `Placements` calculam `gradeW/W/H` e `startX = marginLeft + (utilW-gradeW)/2`; `Placements.XMm/YMm` centrados. Quando `grade == util` (caso canônico) resultado idêntico. NÃO mudar contrato nesta fase |
| **A2** | CLI passa a consumir `Placements` tal-qual | `backend-specialist` | [S] `Program.cs` (`:241-245`, `:276-277`) | A1 | Remover recomputo de `startX/startY`; `xPt = placement.XMm*MM_TO_PT`, `yPt = placement.YMm*MM_TO_PT`; console segue igual; **zero mudança de contrato JSON** |
| **A3** | Testes de equivalência posicional | `test-engineer` | [T] `PlacementCenteringTests.cs` (novo), `CaseCanonicalTests.cs` | A1 | (a) canônico inalterado; (b) margens assimétricas: coord centrada no core == coord que o CLI desenhava antes (comprovado por extração de `cm` do PDF gerado); (c) rotação 90 modo JSON: coordenadas do core com slot rotacionado == desenho do CLI (fecha a inconsistência do modo JSON, ver risco R5) |
| **A4** | E2E de equivalência + atualizar `IMPOSICAO-MOTOR.md` §3.4/§8 | `qa-automation-engineer` + `backend-specialist` | [S] CLI, [D] `IMPOSICAO-MOTOR.md` | A2, A3 | rodar binário antes/depois nos 2 casos → coordenadas equivalentes; doc sem refs obsoletas |

**INPUT(fase):** `GridSearchEngine.BuildResult` margem-alinhado + CLI centralizando sozinho. **OUTPUT:** core centraliza; CLI consome `Placements`. **VERIFY:** golden-master verde; teste de equivalência posicional A3; `dotnet test` verde.

### Fase B — Harness de inspeção PDF (trava 1 form / N Do)

| Task | Nome | Agente | Arquivos | Deps | Done |
|---|---|---|---|---|---|
| **B0** | Criar projeto `sidecars/AutoImposerCLI.Tests` (xUnit + PdfSharp + FluentAssertions) e util `PdfInspector` | `test-engineer` | [ST] `.csproj`, `PdfInspector.cs` (novo) | A0 | Projeto compila; util abre PDF, lê content streams por página (`ContentReader`), coleta `cm`/`Do` e resolve nomes de Form XObject (`/Fm0` etc.) via dicionário `/Resources/XObject` |
| **B1** | Asserts do golden + casos assimétricos | `test-engineer` | [ST] `PdfInspectorTests.cs` | B0 | Para cada PDF: (1) **1 form por página** (contagem de nomes únicos == 1); (2) `Σ Do` por página == `drawnUnits` da página e total do arquivo == `readBackUnits`; (3) BBox do form == peça escalada ± tol |
| **B2** | Trava de regressão estrutural | `test-engineer` | [ST] `PdfInspectorTests.cs` | B1 | Teste que **falha** se alguém trocar `DrawImage` por desenho inline (conta `re`/`f`/inline images ou verifica que o único operador de desenho da peça é `Do`) |
| **B3** | Integração com CI (script raiz/build) | `devops-engineer` | scripts de build/CI, `.csproj` | B2 | `dotnet test sidecars/AutoImposerCLI.Tests` roda no mesmo ciclo dos goldens |

**INPUT(fase):** PDFs gerados pelo CLI + `PdfReadBack` existente. **OUTPUT:** leitor de streams + asserts de forma/contagem/BBox. **VERIFY:** testes verdes; regressão provocada (inline draw) falha na CI. **Nota de arquitetura:** o harness NÃO pode morar em `imposition-core` (Regra 8: sem PdfSharp) — por isso o projeto de teste fica no sidecar.

### Fase C — Contrato multi-página (ADR-041 + planner puro)

| Task | Nome | Agente | Arquivos | Deps | Done |
|---|---|---|---|---|---|
| **C0** | Redigir ADR-041 "Imposição multi-rodada" | `backend-specialist` (+ review governança) | [D] `ADR-041-imposicao-multirodada.md`, `ADR_INDEX.md` | A1 | ADR registrado com: escopo (core + Motor 1), gatilhos de divisão (capacidade / maxLength do rolo / rodadas forçadas), formato de saída (multi-page | per-sheet via flag), regra da última rodada, naming, checksum, compat `RESULT_JSON`, respostas às perguntas da §8 |
| **C1** | Definir algoritmo de rodadas (documentar no ADR + planner) | `backend-specialist` | ADR-041, [C] `MultiSheetPlanner.cs` (esqueleto) | C0 | Algoritmo: itera `GridSearchEngine` por rodada; rodada cheia = grade vencedora; última parcial = `remaining` cópias na melhor grade que caiba (mesma orientação/grade da cheia, salvo impossibilidade — ver Q8); rolo: segmenta quando `length > maxLength`; `rounds` forçados respeitam N |
| **C2** | Implementar `MultiSheetPlanner` + `Contracts/MultiRoundResult.cs` (função pura, sem IO) | `backend-specialist` | [C] `MultiSheetPlanner.cs`, `Contracts/MultiRoundResult.cs` (novos) | C1 | `MultiRoundResult{SchemaVersion, Rounds[], TotalPlannedUnits, GridHashs[]}`; cada `RoundResult{RoundIndex, ImpositionResult Plan, CopiesThisRound}` reutiliza `ImpositionResult` (zero mudança no contrato do motor); `ForcedRounds` aditivo opcional em `ImpositionInput` |
| **C3** | Bridge/consumo: `MultiRoundResult` → CLI (estrutura de dados; render na Fase D) | `backend-specialist` | [S] `Imposition/ImpositionBridge.cs`, [C] `MultiSheetPlanner.cs` | C2 | `BuildMultiRoundInput(...)` aditivo; bridge expõe `PlanRounds(ImpositionInput)`; CLI (em memória) recebe `Round[]` |
| **C4** | Testes unitários do planner | `test-engineer` | [T] `MultiSheetPlannerTests.cs` (novo) | C2 | Casos: (1) target ≤ capacidade → 1 rodada == comportamento atual; (2) 3000 cópias em chapa 1000 → 3 rodadas (2 cheias + 1 parcial) com somatório == alvo; (3) rolo estoura `maxLength` → segmentos ≤ limite; (4) `ForcedRounds` N; (5) surplusPolicy na última rodada |

**INPUT(fase):** `ImpositionInput` atual + decisões do gate. **OUTPUT:** ADR-041 aprovado + `MultiRoundResult` + planner puro. **VERIFY:** ADR registrado no índice; testes C4 verdes; golden-master (1 rodada) inalterado.

### Fase D — Render multi-página no CLI

| Task | Nome | Agente | Arquivos | Deps | Done |
|---|---|---|---|---|---|
| **D0** | Loop de páginas/arquivos consumindo `Round[]` | `backend-specialist` | [S] `Program.cs` (`:259-298`) | C3 | Substituir `AddPage` único por loop por rodada; modo multi-page: 1 `PdfPage` por rodada no mesmo doc; modo per-sheet: 1 `PdfDocument` por rodada com naming `_p{n}` |
| **D1** | Reuso do Form XObject entre páginas | `backend-specialist` | [S] `Program.cs` | D0 | Verificar experimento: `XPdfForm.FromFile` importado uma vez é compartilhado entre páginas do mesmo `PdfDocument` (`/Fm0` referenciado em todas) — se PdfSharp recriar por página, avaliar custo e registrar no ADR (aceitável se tamanho/arquivo contínua linear por página) |
| **D2** | Manter matrizes `cm` idênticas e contagem verificada por arquivo | `backend-specialist` | [S] `Program.cs`, `CountIntegrity.cs` | D0, D1 | Para cada página: `planned/drawn/readBack` da página; no fim, total do arquivo; `--strict` valida página a página e total |
| **D3** | `RESULT_JSON` aditivo: `rounds`, `outputFiles[]`, checksum por arquivo | `backend-specialist` | [S] `Program.cs` (`:313-331`, modelos `:413-432`) | D2 | Campos novos aditivos (`rounds: [...]`, `outputFiles: []`, `outputFile` = primeiro/único para compat); leitor antigo continua parseando; multi-page 1 arquivo → `outputFiles` de 1 elemento + checksum único |
| **D4** | Ponto de encaixe das marcas (gestão de overlay, SEM desenhar) | `backend-specialist` | [S] `Program.cs` | D3 | Hook pós-placements/pré-save: função `ApplyMarksPerRound()` invocada por página (no-op hoje); contrato do hook documentado para o `PLAN-marcas-imposicao.md` (T2.x) |

**INPUT(fase):** `MultiRoundResult` + CLI atual. **OUTPUT:** PDF(s) multi-rodada com 1 form por página e contagem verificada. **VERIFY:** B1 (harness) roda sobre saída multi-página E per-sheet; `RESULT_JSON` compat; golden 1-rodada byte-equivalente (mesmo fluxo anterior a flags).

### Fase E — CLI/API/UI

| Task | Nome | Agente | Arquivos | Deps | Done |
|---|---|---|---|---|---|
| **E0** | Flags `--rounds N`, `--multi-page|--per-sheet` no CLI + help | `backend-specialist` | [S] `Program.cs` (`:20-30`) | D4 | Parser/help atualizados; `--rounds 1` == comportamento atual; validar combinações inválidas |
| **E1** | Electron runner: payload + progresso por rodada + `outputFiles[]` | `backend-specialist` | [E] `auto-imposer-runner.js` (`:27-99`, `:172-281`, PATCH `:246-253`) | E0, D3 | `buildAutoImposerArgs` envia `rounds`/`outputMode`; parse de `outputFiles[]`; PATCH com lista de arquivos, `outputUnits` total, checksum por arquivo; feedback progresso por rodada (log/PATCH) |
| **E2** | Orquestrador: correção da assimetria de margens + novos campos | `backend-specialist` | [E] `imposition-orchestrator.js` | E1 | Envia margens per-side nos dois caminhos (`IMPOSICAO-MOTOR.md §5.2`) e repassa `rounds/outputMode` |
| **E3** | DB/API: migration + rota (checklist PLANO_FASE1 — troca de contrato exige migration) | `backend-specialist` | [G] schema/routes de automação, [E] `imposition-db-ipc.js` | E1 | Campos novos (`rounds`, `outputMode`, `outputFiles`) persistidos; rota antiga compat; migração versionada |
| **E4** | Front: exibição da quebra em rodadas na tela de imposição | `frontend-specialist` | [G] UI React/Electron da imposição | E3 | Tela mostra N chapas/arquivos, progresso por rodada, link para cada PDF gerado |

**INPUT(fase):** CLI D4 + runner atual. **OUTPUT:** job com rodadas executando ponta-a-ponta (UI → runner → CLI → API). **VERIFY:** E2E de job com `--multi-page` e `--per-sheet`; `outputFiles` persistidos e exibidos; leitor antigo do `RESULT_JSON` não quebra.

### Fase F — Testes & verificação final

| Task | Nome | Agente | Arquivos | Deps | Done |
|---|---|---|---|---|---|
| **F0** | Golden-master final cross-motor (motor 1 + core) | `test-engineer` | [T] `CaseCanonicalTests.cs` | Todas | `cols=35, rows=29, total=1015, orientation=0`; arquivo `_IMPOSTO_665x986mm_1015UN.pdf` com 1 página e 1 form |
| **F1** | Casos novos de aceitação | `test-engineer` | [T] `MultiSheetPlannerTests.cs`, [ST] `PdfInspectorTests.cs` | F0 | (1) 3000 cópias → 3 rodadas (2 cheias + 1 parcial) e somatório == alvo; (2) rolo target estoura maxLength → segmentos ≤ limite; (3) rodadas forçadas N==1 == atual; (4) equivalência posicional central vs CLI (A3); (5) contagem do harness por página e arquivo inteiro (B1) |
| **F2** | E2E manual/smoke (QA) | `qa-automation-engineer` | CLI + runner | F1 | Abrir PDFs: 1 rodada idêntico ao atual; multi-page com N páginas e contagem total; per-sheet com N arquivos `_p{n}` e checksum por arquivo |
| **F3** | Performance: 3000+ cópias, N páginas | `qa-automation-engineer` (+ `devops-engineer`) | CLI | F2 | Métricas: tamanho do arquivo ~linear por página (não por cópia); tempo por página aceitável; registrar baseline no relatório |

**INPUT(fase):** tudo das fases A–E. **OUTPUT:** relatório de verificação + suíte completa verde. **VERIFY:** checklist da §9 100% marcada; `dotnet test`, `npm run build:cli`, `npm run lint`, `docs:check` verdes.

---

## 5. Grafo de dependências

```
A0 ──> A1 ──> A2 ──> A4 ─┐
        │                │
        └──> A3 ─────────┘
B0 ──> B1 ──> B2 ──> B3        (B pode rodar em paralelo a A partir de B0)

C0 ──> C1 ──> C2 ──> C3 ─┐
                │        ├──> D0 ──> D1 ──> D2 ──> D3 ──> D4
                └──> C4 ─┘                        │
                                   (paralelismo: D e E4 dependem de D3/D4)
D4 ──> E0 ──> E1 ──> E2 ──> E3 ──> E4
Todas ──> F0 ──> F1 ──> F2 ──> F3
```

**Caminho crítico:** A0→A1→A2→(A3/A4) ; C0→C1→C2→C3→D0→D1→D2→D3→D4→E0→E1→E3→E4 ; F0→F1→F2→F3.
**Paralelos permitidos:** B (qualquer ponto após A0), E4 (após E3), F1 (após C4+B1).
**Bloqueadores duros:** C0 (ADR) bloqueia C1–C4; D0 bloqueia D2–D4; D3 bloqueia E1/E3.
---

## 6. Riscos e mitigações

| # | Risco | Detalhe | Mitigação |
|---|---|---|---|
| R1 | **Muda o checksum/schema do RESULT_JSON** | `auto-imposer-runner.js:101-112,246-253` lê `outputPath`, `outputUnits`, `checksum` únicos; multi-arquivo quebra leitores antigos | Campos **aditivos** (`rounds`, `outputFiles[]`, checksum por arquivo) + `schemaVersion` bump; runner tolerante: `outputFiles ?? [outputFile]`; preservar `outputFile`/`checksum` quando 1 rodada |
| R2 | **PdfSharp recriar o Form XObject por página** | Se `XPdfForm` não for compartilhado entre páginas, arquivo infla por página e perde o benefício Do | Spike D1 documentado: medir `/Fm0` no dicionário de cada página; se recriar, avaliar custo e registrar no ADR (linear por página é aceitável); trava B1 garante 1 form por página, não global |
| R3 | **Custo de muitas páginas (10k+ cópias)** | N páginas/chapas ⇒ tamanho e memória crescem por página; `PdfDocument.Save` só no fim segura tudo em memória | Times/tamanho medidos em F3; per-sheet salva 1 doc por rodada (menor pico); para multi-page, avaliar save incremental se necessário (P1) |
| R4 | **4 motores desalinhados** | Motor 2 (JSX), Motor 3 (TS), Motor 4 (Konica) não conhecem rodadas; mudança de contrato afeta a teia | ADR-041 declara escopo: **core + Motor 1**; mudanças em `ImpositionInput` são aditivas (sem quebra dos consumidores atuais); outros motores continuam consumindo `ImpositionInput` como antes; alinhamento em P2/P3 (roadmap §7 do MOTOR) |
| R5 | **Centralização muda Placements** | Qualquer teste/consumidor que pine coordernadas margem-alinhadas quebra; no modo JSON do CLI, `slotW/H` ignoram rotação (`Program.cs:158-159`) enquanto o core reporta dims rotacionadas (`GridSearchEngine.cs:181`) | Teste de equivalência A3 cobre os 2 modos (legado + JSON) e rotação 90; update de expects com justificativa (Regra 2); gridHash **não** muda (o hash não inclui Placements), logo o cache por `gridHash` (ADR-021 §3) continua válido — apenas recalcular preview |
| R6 | **Contagem poluída por marcas** | Quando `PLAN-marcas` implementar overlay, formas de marca emitem `Do` e poluem `PdfReadBack.CountDrawnUnits` | Harness B distingue por **nome de form** (`/Fm0` peça vs `/FmN` marca); CountIntegrity continua somando só a forma da peça; documentado na interface com o plano de marcas (D4) |
| R7 | **Arredondamento da última rodada** | Sobra parcial no fim pode gerar grade de 1 peça ou surplus indesejado com fill_advance | Regra decidida no ADR (default: `truncate` na última rodada; `fill_row`/`fill_advance` só se declarado e documentado); C4 testa todas as políticas |
| R8 | **Rolo: semântica de "segmento"** | Bobina contínua não tem "página" natural; segmentar por `maxLengthMm` cria páginas artificiais | ADR define: rodada em rolo = trecho de bobina de comprimento `lengthMm` (≤ maxLength); segmento vira página (multi-page) ou arquivo `_p{n}` (per-sheet) — mesmo modelo de chapa |
| R9 | **Flag combos inválidos** | `--rounds 1 --per-sheet` gerando `_p1` desnecessário; `--rounds 0`; round forçado maior que capacidade | Validação E0: `rounds >= 1`; `per-sheet` com 1 rodada → nome atual (sem sufixo `_p`), preservando guardrail de naming (ADR-021 §7) |
| R10 | **Regressão estrutural do PDF** | Substituição futura de `DrawImage` por desenho inline | Trava B2 falha a CI se `Do` não for o operador principal por peça |

---

## 7. Perguntas abertas para resolver no ADR-041

1. **Forma da extensão de contrato:** campo aditivo `ForcedRounds: int?` em `ImpositionInput` (backward-compat, recomendado) vs novo `RoundSpec { copiesPerRound? , rounds? }`? Recomendação do plano: **`ForcedRounds: int?`** + regras derivadas (capacidade/maxLength) calculadas pelo planner; `SchemaVersion` sobe para `"1.1"` de forma aditiva.
2. **Semântica de rodada forçada:** `--rounds N` distribui `target` uniformemente entre N rodadas? Se `target` não divide por N, quanto em cada? Sobra entra na última? (Recomendação: rodadas cheias + sobra na última, mesma regra da divisão por capacidade.)
3. **Última rodada parcial:** manter a mesma grade/orientação da rodada cheia (uniformidade de registro/corte — recomendado) ou re-otimizar o restante? Se o restante não couber em nenhuma grade com a grade da cheia, re-otimizar é permitido (e registrado no resultado).
4. **Rolo e maxLength:** quando `target` estoura, a **capacidade por rodada** é calculada com `initialLength` ou com `maxLength`? (Recomendação: rodada = trecho de comprimento `lengthMm` do grid vencedor; se esse grid não couber nos `maxLength` restantes da bobina, subdividir por comprimento contínuo.)
5. **RESULT_JSON shape:** incluir `rounds` sempre (mesmo 1 rodada, `rounds: [1 item]`) ou só quando > 1? (Recomendação: sempre incluir para estabilidade de schema; leitores antigos ignoram campos desconhecidos.)
6. **Checksum agregado:** manter `checksum` do arquivo único para o caminho 1-rodada; para multi-arquivo, `outputFiles[].checksum` e um `checksum` = hash da concatenação ordenada dos arquivos? (Decidir no ADR; runner/API consomem a lista.)
7. **Naming multi-arquivo:** `_p1.pdf` começa em 1 e segue ordem de rodada — confirmar colisão com nome existente (`xxx_p1.pdf` de um job anterior) e política de sobrescrita.
8. **Número do ADR:** ADR-040 está reservado para marcas (`docs/PLAN-marcas-imposicao.md:87,109,189-206`); índice atual termina em ADR-024 (`ADR_INDEX.md:30`) — **proposta: ADR-041**; validar com governança antes de escrever.
9. **Substrato rolo na ponte:** `ImpositionBridge.BuildInput` hoje fixa `Kind: Sheet` (`ImpositionBridge.cs:30`) e `SurplusPolicy.Truncate` (`:40`) — expor `Kind/MaxLength/SurplusPolicy` no payload do runner (aditivo, sem quebrar chamadas existentes)?
10. **Progresso por rodada no PATCH:** adicionar `progress`/`roundIndex` no PATCH intermediário (`auto-imposer-runner.js:246-253`) ou apenas log? (Front E4 precisa decidir UX antes.)

---

## 8. Checklist final de verificação (Phase X)

> Rodar na ordem; marcar `[x]` SOMENTE com execução real. Scripts do repo/CI conforme `TESTING_STRATEGY.md` e convenções raiz.

- [ ] **Golden-master (Regra 2):** `cols=35, rows=29, total=1015, orientation=0, lengthMm=986, surplus=0` — casou ANTES e DEPOIS de cada fase (CI verde).
- [ ] **Testes de equivalência (A3):** margens assimétricas e rotação 90 — coordenadas `Placements` do core == coordenadas desenhadas pelo CLI (via extração `cm`).
- [ ] **Harness B:** 1 form por página; `Σ Do` por página == drawnUnits da página; total arquivo == readBackUnits; BBox == peça ± tol; trava B2 exercitada (falha provocada → CI vermelha).
- [ ] **Multi-rodada (C4/F1):** 3000 cópias → N rodadas com somatório == alvo; rolo estoura maxLength → segmentos ≤ limite; `ForcedRounds` respeitado; `--rounds 1` == fluxo atual.
- [ ] **Contagem verificada (ADR-023/Regra 4):** planned == drawn == readBack por página e no arquivo inteiro, nos modos `--strict` e default.
- [ ] **Compat RESULT_JSON:** leitor antigo (`auto-imposer-runner.js`) parseia saída nova; `outputFile`/`checksum` preservados no caminho 1-rodada.
- [ ] **Build & lint:** `dotnet test` (core + sidecar + sidecar tests), `npm run build:cli`, `npm run lint`, `docs:check` — todos verdes.
- [ ] **E2E manual (F2):** abrir PDFs — 1 rodada idêntico ao atual; multi-page com N páginas; per-sheet com N arquivos `_p{n}` e checksum por arquivo; nomes respeitam guardrail ADR-021 §7.
- [ ] **Performance (F3):** arquivo cresce ~linear por página (não por cópia); baseline registrado no relatório.
- [ ] **Governança:** `ADR-041-*.md` + `ADR_INDEX.md` atualizados; `IMPOSICAO-MOTOR.md` com seção "Rodadas/segmentos" e refs de linha corretas; `docs/PLAN-marcas-imposicao.md` recebe o contrato do hook D4.
- [ ] **Qualidade do plano (regras do orquestrador):** sem hex roxo; sem layout de template padrão; gate socrático respeitado (decisões do §1.6 não foram redecididas).

## ✅ PHASE X COMPLETE (preencher ao final)
- Lint: ☐ · Security: ☐ · Build: ☐ · Testes: ☐ · Docs: ☐ · Data: [····]