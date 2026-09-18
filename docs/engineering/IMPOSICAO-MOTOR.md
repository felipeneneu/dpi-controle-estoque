# Motor de Imposição e Step & Repeat — Algoritmo, Engenharia e Refinamento

> 📦 **Documento técnico de engenharia** — baseado em análise verificada do código-fonte (code-archaeologist).
> Escopo: os 4 motores de imposição do monorepo `dpi-controle-estoque`, o algoritmo *as-is*, e o modelo alvo unificado `GridSearchEngine`.
> Status: **proposta técnica (to-be) + registro do estado atual (as-is)**.

| Campo | Valor |
|---|---|
| Caminho | `docs/engineering/IMPOSICAO-MOTOR.md` |
| Decisões relacionadas | `docs/governance/adr/ADR-015-arquitetura-sidecar-e-ferramentas-nativas.md`, `ADR-017-headless-auto-imposer-cli.md`, `ADR-018-coreldraw-com-motor-grafico.md` |
| Convenções de teste | `docs/engineering/TESTING_STRATEGY.md` |
| Público | Engenharia (backend, sidecars, automação de pré-impressão) |

---

## 1. Visão Geral e Propósito

**Imposição** (ou *step & repeat*) é o pré-press que distribui `N` cópias de uma peça gráfica em uma grade (grid) sobre um substrato — **bobina/rolo** ou **folha/chapa** — respeitando margens, *gap* entre cópias, rotação opcional (±90°) e a quantidade alvo. O resultado é um arquivo final pronto para a gráfica (PDF), com posicionamento exato para **corte e registro**.

A imposição é crítica por três razões:

- **Aproveitamento de substrato (custo).** O substrato é o maior custo unitário do processo. Cada milímetro desperdiçado em margem, sobra mal distribuída ou grade mal escolhida vira prejuízo direto. Uma grade que economiza 2% de comprimento de bobina em 1.000 cópias paga o salário da otimização.
- **Register (qualidade).** O desenho tem que casar com o corte dentro de tolerância industrial (tipicamente 0,1 mm / 1/10 mm). Decisões de rotação e escala que deslocam o contorno da peça em relação à matriz de corte geram refugo.
- **Escala do negócio (automação).** Uma pequena gráfica impõe centenas de cópias em folhas A3/70×100. Uma gráfica gigante impõe dezenas de milhares de cópias em bobinas contínuas — onde o comprimento é **variável** (o motor pode auto-estender a bobina), a folha/chapa é **fixa** (ou cabe no formato ou sobra material), e o *gang-run* multi-SKU (várias peças na mesma chapa) passa a ser obrigatório.

Este monorepo implementa **quatro motores independentes e divergentes** para o mesmo problema (ver seção 2), detalhados na seção 3, com bugs conhecidos listados na seção 5. As decisões de arquitetura de sidecar, CLI headless e motor gráfico via COM estão registradas nos ADRs **015**, **017** e **018** (`docs/governance/adr/`).

O objetivo deste documento é fixar o estado atual e definir o **modelo alvo** (seção 6) que unifica os quatro motores em uma única fonte de verdade — `GridSearchEngine` — com precisão máxima e automação escalável de rolo a folha e de pequena a gigante.

---

## 2. Os 4 Motores e Seus Contratos

| # | Motor | Tecnologia | Bibliotecas | Entrada | Saída | Exit code | Papel |
|---|---|---|---|---|---|---|---|
| 1 | `sidecars/AutoImposerCLI/Program.cs` | .NET 10 (console, headless) | PdfSharp 6.1.1 | Arte PDF + dimensões de chapa/folha + cópias (posicional) | PDF imposto + `RESULT_JSON:{ImpositionResult}` (linha 279) | `0` ok; `1` uso/erros | **Chapa/folha** — gera PDF vetorial paginado, letterbox, centrado |
| 2 | `sidecars/IllustratorImposerCLI/Program.cs` + `Scripts/engine.jsx` | .NET 10-windows + COM (ExtendScript) | `Type.GetTypeFromProgID("Illustrator.Application")` (143), oleaut32 `GetActiveObject` (215-216), `InvokeMember("DoJavaScript")` (158-164) | Arte (AI/PDF) + dimensões + cópias (posicional) | PDF via Illustrator (PDFSaveOptions ACROBAT8, engine.jsx:170-176) + JSON inline (187) | `0` ok; `1` uso; `2` Illustrator ausente | **Rolo/bobina** — rotação por colunas, *roll auto-extend*, preenche última linha |
| 3 | `src/lib/imposition-roll-math.ts` (== `grafica-app/src/lib/imposition-roll-math.ts`, cópias idênticas) | TypeScript puro (matemática, sem runtime de imposição) | nenhuma (math pura) | `{rollWidthMm, piece, targetCopies, margins, gap, lengthMm, fillMode}` | `alternativeGrids` + `maxCopiesInAdvance` + `totalLengthMeters` (136-154) | n/a (biblioteca) | **Matemática de referência** para o front e para pré-visualização de bobina |
| 4 | `sidecars/ImpositorKonica/Views/CanvasImposicao.cs` | WPF (interativo) | SkiaSharp 4.152.0, QRCoder 1.6.0 | Múltiplas peças (SKUs) + chapa | PDF via Skia + QR por etiqueta | n/a (GUI) | **Gang-run multi-SKU** — round-robin; sem orientação/alvo/sobras |

> ⚠️ **Observação de arquitetura:** o orquestrador do Electron (`electron/services/imposition-orchestrator.js` == `.ts`) despacha para `CLI_NET` ou `ILLUSTRATOR_COM`, lê MediaBox via regex latin1 (24-25, com fallback silencioso de 50×50 mm) e injeta **comportamentos divergentes** entre os dois caminhos (ver seção 5).

---

## 3. Funcionamento Atual do Algoritmo (as-is)

### 3.1 Caso canônico usado neste documento

O caso que aparece nos samples do repositório (`Impor_70x100.bat`, `Impor_Illustrator.bat`):

```
peça        : 19 × 34 mm   (largura × altura)
substrato   : 665 × 986 mm (chapa/bobina)
gap         : 0 mm
margens     : 0 mm
alvo        : 1015 cópias
```

Este caso é um **ajuste perfeito**: `35 colunas × 29 linhas = 1015 cópias` exatas em `665/19 = 35` e `986/34 = 29`. É por isso que os três motores concordam nele — e é um excelente golden-master (seção 8). Em qualquer entrada fora do "caso mágico", eles divergem (seção 5).

### 3.2 Motor 3 — roll-math (TypeScript): enumeração e seleção

Fonte: `src/lib/imposition-roll-math.ts` (idêntico em `grafica-app/src/lib/imposition-roll-math.ts`).

1. **Largura útil** (linha 52): `utilWidth = rollWidth − 2·sideMargin` → `665 − 0 = 665 mm`.
2. **Enumera as duas orientações.** Para cada orientação `o ∈ {0, 90}` troca `pW × pH` da peça:
   - **Orientação A** (`pW=19, pH=34`): `maxCols = floor((utilW + gap)/(pW + gap)) = floor(665/19) = 35` (linha 68); `maxRows = floor((lengthMm + gap)/(pH + gap)) = floor(986/34) = 29` (linha 72).
   - **Orientação B** (`pW=34, pH=19`): `maxCols = floor(665/34) = 19`; orientação `maxRows = floor(986/19) = 51` → `19×51 = 969` (faltam 46 cópias).
3. **Janela de colunas** (77-83): para `c` de `maxCols` descendo até `max(1, maxCols − 25)` (janela de 26 cols) calcula:
   - `r = fill_advance ? maxRows : ceil(target/c)`
   - `total = c·r`; `lengthMm = r·pH + (r−1)·gap`; `surplus = total − target`.
4. **Seleção** (109-122): `fill_advance` prefere **total maior**; `fill_row` prefere **fits → isExact → menor comprimento**.
5. **Resultado do caso:** orientação A vence — `cols=35, rows=29, total=1015, length=986, surplus=0`, `fits=true`. A orientação B em `fill_row` exigiria `ceil(1015/19)=54` linhas → `54×19 = 1026 mm > 986 mm`, ou seja, não cabe no comprimento inicial (só caberia com auto-extensão, que o roll-math não decide sozinho).

### 3.3 Motor 2 — engine.jsx (Illustrator/ExtendScript): rotação por colunas, fator exato e auto-extend

Fonte: `sidecars/IllustratorImposerCLI/Scripts/engine.jsx`.

1. **Dimensões da arte** (38-45): usa `doc.artboards[].artboardRect` (`[left, top, right, bottom]`), **não** o bounding box dos pageItems.
2. **Decisão de rotação** (56-62, ε na 59-60): compara **somente colunas**: `cols90 > cols0` (com `+0.000001` de epsilon).
   - `cols0 = floor(665/19) = 35`; `cols90 = floor(665/34) = 19` → `19 > 35`? Não → **sem rotação**.
3. **Fator exato de colunas** (87-103): varre `c` de `maxPossibleCols` descendo até `max − 10` procurando `targetCopies % c === 0`.
   - `1015 % 35 === 0` → `cols = 35`; `rows = ceil(1015/35) = 29` (105-108). Grade exata.
4. **Roll auto-extend** (110-114): `requiredHeightMm = rows·pH + (rows−1)·gap + 2·marginTop = 986 ≤ SheetH` → mantém 986 mm. (Se `SheetH` fosse 0/ausente ou menor, `SheetH = ceil(required)`.)
5. **Artboard** (116-118): redimensiona para `[0, 0, W·mmToPt, −(H·mmToPt)]`; **centraliza só horizontalmente** e alinha **topo** (120-133).
6. **Multiplicação** (135-168): duplica o `pageItem` por camada, **preenchendo a última linha** (sobras viram cópias extras). **Não escala** — se a peça não couber no slot, transborda.
7. Saída ACROBAT8 com `preserveEditability` (170-176) e JSON inline (187).

### 3.4 Motor 1 — AutoImposerCLI (.NET/PdfSharp): escala letterbox e centralização real

Fonte: `sidecars/AutoImposerCLI/Program.cs`.

1. **Área útil** (115-116): `util = sheet − margins` por lado (75-78); valida `util ≤ 0` → erro (118-123). Caso: `util = 665 × 986`.
2. **Decisão de rotação** (linha 153) — **por área** (produto): `rotacionar = cols90·rows90 > cols0·rows0`.
   - `cols0·rows0 = 35·29 = 1015`; `cols90·rows90 = 19·51 = 969` → `969 > 1015`? Não → **sem rotação**. (Concorda com o caso, mas diverge em outros — ver 5.1.)
3. **Grid pré-computado** via JSON ou re-derivado (130-143): `35 × 29`.
4. **Scale-to-fit letterbox** (185-198): `scale0 = min(slotW·MM_TO_PT/artW, slotH·MM_TO_PT/artH)` — como o slot é exatamente `665/35 × 986/29 = 19 × 34 mm`, se a arte for 19×34 mm, `scale0 ≈ 1`.
5. **Centralização nos dois eixos** (200-204) — **movida para o core no PR #3c**: o CLI consome `Placements` do `GridSearchEngine` sem recálculo (ADR-021).
6. **Geração** (226-256): uma página `PdfDocument` + `XGraphics`, loop `rows × cols` **truncando em `targetCopies`** (não preenche a última linha — aqui 1015 exatos, sem truncamento).
7. **Saída** (262): `{base}_IMPOSTO_{sheetW:F0}x{sheetH:F0}mm_{geradas}UN.pdf` → ex. `_IMPOSTO_665x986mm_1015UN.pdf`; SHA-256 (290-296); contrato `RESULT_JSON` (279).

> **Nota (PR #3c, ADR-021):** a centralização passa a viver no `GridSearchEngine.BuildResult` (fonte única de verdade). Regra: **X** sempre centraliza (`startX = marginLeft + (utilW − gradeW)/2`) em sheet e rolo; **Y** centraliza em folha (`startY = marginTop + (utilH − gradeH)/2`) e alinha no **topo** em rolo (`startY = marginTop`) — a página do rolo cresce até a última cópia. O CLI deixou de calcular `startXMm/startYMm` e desenha exatamente os `Placements`.

> **Ajuste `--trim-to-content`:** o PDF pode ser gerado com o
> tamanho da grade (+ margens) em vez do substrato inteiro — em rolo e em
> chapa. Útil para HP Latex e Mimaki (evita borda morta) e para folha com
> sobra morta. Em rolo, Y já nasce no topo (nenhum offset): só encurta X;
> em folha, o core centraliza X e Y e o trim corta os DOIS lados
> (`offsetXMm/offsetYMm` = negativo do centramento). Aplicável apenas ao
> fluxo por argumentos (modo JSON/Electron segue sem trim). Flag opcional
> — sem a flag, comportamento atual mantido.

> ✅ **Neste caso os três concordam** (`35 cols × 29 rows = 1015`, sem rotação, comprimento 986). Isso torna o caso ideal para caracterização. Nos demais casos, cada motor chega a um grid diferente — ver seção 5.

### 3.5 Multi-rodadas: exit code 4 e protocolo `OPTION_*` (stderr)

Quando `targetCopies > capacidade`, o Motor 1 **não gera PDF**: escreve no
**stderr** as linhas `OPTION_*` (parseáveis por `for /f`) e termina com
**exit code 4**. Quem invoca (o `MontarPDF.bat`) decide. Contrato:

- Mensagens (stderr), todas ASCII (evita mojibake no `cmd`):
  `[ERRO] Pedido de N UN excede a capacidade da chapa WxHmm.`,
  `Capacidade por rodada: {cap} UN ({cols} cols).`,
  `Rodadas necessarias: {N}.`
- Opções (stderr): `OPTION_COUNT=3`; `OPTION_1_*` = **1 rodada de `capacidade`**
  (máximo); `OPTION_2..4_*` = rodadas `N, N+1, N+2` com
  `copiasRodada = ceil(target/N)` arredondado **para múltiplo de `cols`**
  (cada rodada é uma chapa cheia só de linhas completas) e
  `sobra = copiasRodada·N − target`; `OPTION_BASE_*` = base p/ labels.
- Fórmula: `N¹ = ceil(target/capacidade)`; `total = copiasRodada·N`;
  `sobra = total − target`. Nunca excede `capacidade` por rodada
  (`capacidade` é múltiplo de `cols`).
- Exit codes intactos: 0 sucesso; 1 erro de entrada/args; 2 PDF inválido;
  3 erro de saída; **4 pedido excede a chapa**.
- `--trim-to-content` e contratos existentes não são alterados no fluxo 4.

> **Nota (cmd):** o `set "VAR=!VAR: =!"` (remove espaços) sobre variável
> **vazia** é um bug conhecido do `cmd` — corrompe o valor e quebra o default
> `[ENTER]`. Todos os strips do `MontarPDF.bat` são condicionais:
> `if not "!VAR!"=="" set "VAR=!VAR: =!"`.

---

## 4. Bibliotecas e Unidades

### 4.1 Stack por motor

| Motor | Biblioteca | Versão | Uso |
|---|---|---|---|
| AutoImposerCLI | PdfSharp | 6.1.1 | PDF vetorial: página `PdfDocument` + `XGraphics`, Form XObject implícito na duplicação |
| ImpositorKonica | SkiaSharp | 4.152.0 | Renderização via Skia (`SkiaPdfExporter`, regenera QR por etiqueta, linha 99) |
| ImpositorKonica | QRCoder | 1.6.0 | QR por etiqueta/cópia |
| IllustratorImposerCLI | COM oleaut32 + ExtendScript | n/a | `GetActiveObject`, `Type.GetTypeFromProgID`, `InvokeMember("DoJavaScript")` (143, 158-164, 215-216); API Illustrator: `artboards`, `pageItems`, `PDFSaveOptions` |
| Todos os CLIs | .NET | 10 (target) | Runtime dos sidecars headless |

### 4.2 Conversões, epsilon e arredondamentos

| Item | Motor | Valor | Local |
|---|---|---|---|
| mm → pt | AutoImposerCLI | `MM_TO_PT = 72/25.4` | `Program.cs:26` |
| pt → mm | AutoImposerCLI | `PT_TO_MM = 25.4/72` | `Program.cs:27` |
| mm → pt | engine.jsx | `mmToPt` (artboard e offsets) | `engine.jsx:116-133` |
| Epsilon de rotação | engine.jsx | `+0.000001` na comparação de colunas | `engine.jsx:59-60` |
| Epsilon em outros motores | roll-math, AutoImposerCLI | **ausente** (comparações cruas `>`/`%`) | `imposition-roll-math.ts:68-88`, `Program.cs:153` |
| `floor` | roll-math | `maxCols`, `maxRows` | `imposition-roll-math.ts:68,72` |
| `floor` | AutoImposerCLI | grid derivado de `util` | `Program.cs:115-153` |
| `ceil` | engine.jsx | `rows = ceil(target/cols)` | `engine.jsx:105-108` |
| `F0` | AutoImposerCLI | nome do arquivo: `{sheetW:F0}x{sheetH:F0}` | `Program.cs:262` |
| `round`/tolerância | todos | **não existem** — não há conceito de tolerância ou 1/10 mm em nenhum motor | n/a |

> ⚠️ **A ausência de epsilon fora do `engine.jsx` é uma bomba-relógio:** `floor((665.0000001)/(19))` pode dar 34 em vez de 35 dependendo da precisão do double, sem nenhum sinal de alerta. O modelo alvo (seção 6) substitui a mágica `+0.000001` por **tolerância explícita**.

---

## 5. Divergências e Bugs Conhecidos (Alerta)

> 🔬 Agrupados por tema. Referências `arquivo:linha`. O número é o do relatório de análise (24 issues); os mais impactantes estão aqui.

### 5.1 Decisão de orientação incompatível (3 critérios diferentes)

- **Área**: (Resolvido no Motor 1 no PR #3a, agora consome o core)
- **Colunas**: `engine.jsx:56-62,59-60` — `cols90 > cols0` (único com epsilon).
- **Custo/ordenação**: `imposition-roll-math.ts:109-122` — a orientação é resolvida **por ordenação de score**, não por comparação binária.

Resultado: os motores 2 e 3 ainda podem escolher orientações opostas (Motor 1 resolvido via fonte única).

### 5.2 Margens assimétricas e orquestrador inconsistente

- Margens **por lado** só existem no `AutoImposerCLI` (75-78). Roll-math usa `sideMargin` simétrico (`imposition-roll-math.ts:52`); `engine.jsx` usa `marginSide + marginTop` simétrico (50-53, 111, 123).
- O orquestrador envia ao `CLI_NET` **apenas** `marginLeft + marginTop` (`electron/services/imposition-orchestrator.js:63-64`).
- `Boolean(params.rotate)` transforma `undefined → 0° forçado` no caminho CLI_NET (`:65`), enquanto o Illustrator recebe `null → auto` (`:133`) — **mesmo parâmetro, semântica oposta**.

### 5.3 Contagem de unidades e `target_copies` ignorado

- `targetCopies` posicional: resolvido no Motor 1 no PR #3a (respeita o argumento e trunca conforme o plano).
- **JSX preenche a última linha** com sobras (`engine.jsx:135-168`) → pendente de alinhamento com a política de sobras unificada.

### 5.4 Auto-extensão de rolo só no JSX

- `engine.jsx:110-114` auto-estende `SheetH` quando `!SheetH || SheetH < requiredHeightMm`.
- No `AutoImposerCLI` o mesmo cenário (ex.: `SheetHMm = 0`) vira erro `utilH < 0` (118-123). Não há política de extensão unificada.

### 5.5 Escala: um escala, outro transborda

- `AutoImposerCLI` aplica **scale-to-fit letterbox** (185-198) e centraliza (200-204).
- `engine.jsx` **nunca escala**: peça maior que o slot transborda silenciosamente. Não há bleed, cutInset, thickness nem tolerance em nenhum motor, e **não há preflight** (validação de overflow/oversized antes da geração).

### 5.6 Rotação/centroide do engine.jsx

- `engine.jsx:65-72` rotaciona **cada pageItem ±90° em torno do próprio centro**, mas o cálculo do footprint `footprintTopPt = refTop − (pageW + pageH)/2` é algebricamente suspeito (mistura largura/altura sem provar que o centro de rotação coincide com o slot). Risco de deslocamento de registro.
- O tamanho da arte vem de `artboardRect` (38-45) e **não** do bounding box — se o artboard não estiver colado à arte, o centro diverge.

### 5.7 Medidas do substrato

- MediaBox lido via regex latin1 (`electron/services/imposition-orchestrator.js:24-25`) — **falha em object streams** e cai no fallback silencioso 50×50 mm.

### 5.8 Retry / erro / idempotência

- `electron/sidecars/auto-imposer-runner.js` faz PATCH `running → done/failed` e parse de `RESULT_JSON`, **mas não há retry/backoff** nem semântica de erro uniforme entre motores (exit codes 1 vs 2 vs lançamento de exceção no Komica é GUI).

### 5.9 Outros (menores)

- `ImpositorKonica` ignora orientação/alvo/sobras; `ExecuteAutoGang` (755-803) só faz round-robin; capacidade **hardcoded** 40/36 no `MainWindow` (`CanvasImposicao.cs:50`).
- Auto-cure de TypeLib cobre **um único CLSID** `{D19BF46D-D108-4617-8D8B-0A94E64B348E}` (`Program.cs:191-213`).
- Código duplicado: `src/lib/imposition-roll-math.ts` == `grafica-app/src/lib/imposition-roll-math.ts`; `electron/services/imposition-orchestrator.js` == `.ts`; 2 wizards do Electron.

---

## 6. Modelo Alvo (to-be): `GridSearchEngine` Unificado

> 📦 **Fonte única de verdade.** Um único módulo de matemática/otimização que os 4 motores consomem. Local sugerido: `packages/imposition-core` (ver prompt na seção 9).

### 6.1 Contrato de entrada (schema)

```ts
interface ImpositionInput {
  substrate: {
    kind: "roll" | "sheet";            // rolo(auto-extende) vs folha(chapa fixa)
    widthMm: number;                   // largura útil do substrato
    initialLengthMm: number;           // folha: altura da chapa; rolo: comprimento inicial
    maxLengthMm: number;               // rolo: limite físico da bobina
    margin: { leftMm; rightMm; topMm; bottomMm }; // per-side (obrigatório)
    toleranceMm: number;               // tolerância de arredondamento >= 0.1 (substitui +0.000001)
    bleedMm: number;                   // sangria por lado da peça
    cutInsetMm: number;                // recuo de corte (contorno da lâmina)
    registerMm: number;                // registro de corte (precisão exigida)
  };
  piece: { widthMm: number; heightMm: number };
  targetCopies: number;
  surplusPolicy: "truncate" | "fill_row" | "fill_advance";
  scalePolicy: "fit" | "bleed" | "reject"; // fit=letterbox; bleed=usa sangria como folga; reject=falha se scale<1
  forcedOrientation: 0 | 90 | null;    // null = auto
  forcedCols: number | null;           // override de grade (respeitando regras)
}
```

### 6.2 Algoritmo (7 passos)

1. **Normalizar unidades com tolerância explícita ANTES do `floor`.** Nenhuma mágica `+0.000001`. Toda divisão de grade usa `tol = max(toleranceMm, registerMm, 0.1)`:
   `cols = floor((utilW + gap + tol) / (pW + gap))`.
2. **Enumerar TODAS as orientações × TODAS as colunas** (varredura completa, não janela de 26 nem busca em `max−10`). Para cada par `(orientação, c)` calcular `rows` conforme `surplusPolicy` e `total/c/length/surplus`.
3. **Função de custo** (tabela abaixo): pontuar cada candidato e selecionar `argmin`, com `alternativeGrids` ranqueadas (top-N ordenado) para o front exibir alternativas.
4. **Física rolo vs folha:** rolo só cresce em comprimento (auto-extend até `maxLengthMm`, com alerta se ultrapassar); **folha/chapa é fixa** — se não couber, candidato descartado ou aviso explícito (nunca transbordar silenciosamente).
5. **Ponto de extensão multi-peça / gang-run:** quota round-robin entre SKUs (evolução do `ExecuteAutoGang` da Konica), com soma de áreas por chapa.
6. **Política de precisão:** relatório de desvios em mm e registro residual (máximo desvio de corte por chapa); suporte a **configuragrama em 1/10 mm** para reporte de register.
7. **Saída única** (contrato estável para os 4 motores consumirem): grade vencedora + alternativas + métricas (aproveitamento %, metros lineares, sobras, desvio de register, decisão de escala/bleed).

> **Nota (PR #3c, ADR-021):** a **centralização** da grade dentro da área útil é responsabilidade do core (`BuildResult`) — fonte única de verdade; consumidores desenham os `Placements` sem recalcular offsets. Regra: X centraliza sempre; Y centraliza em folha e alinha no topo em rolo.

### 6.3 Função de custo (pesos)

| Componente | Peso | Fórmula (normalizada) |
|---|---|---|
| Desperdício de área | `wA = 0.50` | `wasteRatio = (substrateArea − usedArea)/substrateArea` |
| Comprimento linear (rolo) | `wL = 0.30` | `lengthPerCopy = lengthMm / targetCopies` (minimizar) |
| Sobras (cópias extras) | `wS = 0.20` | `surplusRatio = surplus / targetCopies` (minimizar; `truncate` zera) |
| Register/desvio | `wR` informativo | usado como **desempate** e reportado — não domina a seleção |

`score = wA·wasteRatio + wL·lengthPerCopyNorm + wS·surplusRatio` — candidatos inválidos (não cabem e não há auto-extend; `scalePolicy='reject'` com `scale < 1 − tol`) são **descartados antes** da pontuação.

> **Nota (ADR-026, 2026-09-18):** em `SurplusPolicy.FillRow`, o termo `wS` é **zerado** — surplus é o objetivo declarado do operador (BR-024), não um custo. Os pesos `wA=0.50` e `wL=0.30` permanecem. Ver `docs/governance/adr/ADR-026-fill-row-sobra-garantida.md`.

### 6.4 Pseudocódigo

```text
function gridSearchEngine(input): ImpositionResult {
  const tol = Math.max(input.substrate.toleranceMm, input.substrate.registerMm, 0.1);
  const candidates = [];

  // Passo 2: varredura completa
  const orientations = input.forcedOrientation ?? [0, 90];
  for (const rot of orientations) {
    const { pW, pH } = rot === 90 ? swap(input.piece) : input.piece;
    const maxCols = floor((input.substrate.widthMm - left - right + gap + tol) / (pW + gap));
    const maxRows = substrate.kind === "roll"
      ? floor((input.substrate.initialLengthMm + gap + tol) / (pH + gap))
      : floor((input.substrate.initialLengthMm + gap + tol) / (pH + gap));

    for (let c = 1; c <= (input.forcedCols ?? maxCols); c++) {
      const rowsFill = ceil(targetCopies / c);                    // fill_row / truncate
      const rowsAdv = floor((lengthLimit + gap) / (pH + gap));    // fill_advance
      for (const rows of surplusPolicy === "fill_row" ? [rowsFill] : [rowsAdv, rowsFill]) {
        const total = c * rows;
        const length = rows * pH + (rows - 1) * gap;
        const surplus = total - targetCopies;
        const fits = substrate.kind === "roll"
          ? length <= substrate.maxLengthMm                      // rolo auto-estende
          : length <= substrate.initialLengthMm;                  // folha fixa
        if (!fits) continue;                                      // nunca transbordar

        const candidate = scoreCandidate({ rot, cols: c, rows, total, length, surplus });
        candidates.push(candidate);
      }
    }
  }

  // Passo 3 + 6: custo, alternativas ranqueadas e relatório de precisão
  const ranked = candidates.sort(byCostAsc);                       // cost fn da 6.3
  const best   = ranked[0];
  return {
    ...best,
    alternativeGrids: ranked.slice(0, 5),
    metrics: {
      utilizationPct: usedArea / substrateArea * 100,
      lengthMeters: best.length / 1000,
      surplus, registerWorstCaseMm: reportRegister(best, input.substrate.registerMm),
    },
  };
}
```

> ✅ **Ganhos do modelo alvo:** tolerância explícita (adeus `+0.000001`), margens per-side universais, uma única decisão de orientação (por custo), política de sobras explícita, física rolo vs folha correta, escala/bleed com política declarada, gang-run como *extension point*, e relatório de registro em 1/10 mm — sem quebrar os nomes de saída nem os exit codes dos CLIs existentes.

---

## 7. Roadmap de Refinamento (matriz esforço × impacto)

| Prioridade | Item | Esforço | Impacto | Arquivos alvo |
|---|---|---|---|---|
| **P0** | Unificar decisão de orientação (custo via `GridSearchEngine`; eliminar área/colunas) | 1–2 dias | Alto — grids corretos em todos os motor | `Program.cs:153`, `engine.jsx:56-62`, `imposition-roll-math.ts:109-122` |
| **P0** | Tolerância explícita em todos os `floor`/`%` (fim do `+0.000001` isolado) | 1 dia | Alto — estabilidade em borda exata | `imposition-roll-math.ts:68-88`, `Program.cs:153`, `engine.jsx:59-60` |
| **P0** | Margens per-side em todos os caminhos + corrigir assimetria do orquestrador | 1–2 dias | Alto — consistência de layout | `imposition-orchestrator.js:63-65,133`, `engine.jsx:50-53`, `imposition-roll-math.ts:52` |
| **P0** | Política de sobras única (`truncate` vs `fill_row`) propagada via contrato | 1–2 dias | Alto — PDFs com contagem correta | `Program.cs:226-256`, `engine.jsx:135-168` |
| **P0** | Golden-master de caracterização (seção 8) antes de qualquer refactor | 1 dia | Alto — rede de segurança | `docs/engineering/TESTING_STRATEGY.md`, novos testes |
| **P1** | `packages/imposition-core` com `GridSearchEngine` (seção 6) como fonte única | 1–2 semanas | Máximo — unifica tudo | novo pacote + adaptações nos 4 motores |
| **P1** | Física folha vs rolo: auto-extend declarado, erro/aviso em folha que não cabe | 3–5 dias | Alto — fim do transbordo silencioso | `Program.cs:118-123`, `engine.jsx:110-114` |
| **P1** | `scalePolicy` (fit/bleed/reject) + preflight de overflow | 3–5 dias | Alto — qualidade de saída | `Program.cs:185-198`, `engine.jsx` (hoje sem escala) |
| **P1** | Relatório de registro/desvio (1/10 mm) no `RESULT_JSON` | 2–3 dias | Médio — confiabilidade na gráfica | `Program.cs:279`, `imposition-roll-math.ts:136-154` |
| **P2** | Gang-run multi-SKU por quota (evolução da Konica) no `GridSearchEngine` | 2–3 semanas | Alto — aproveitamento em escala | `CanvasImposicao.cs:755-803`, `packages/imposition-core` |
| **P2** | Performance 1000+ cópias: geração vetorial leve (Form XObject/duplicação estrutural), estratégia para não explodir Illustrator | 1–2 semanas | Médio — escala gigante | `Program.cs:226-256`, `engine.jsx:135-168` |
| **P2** | Retry/backoff + auto-cure multi-CLSID + MediaBox robusta (parse de object streams) | 1 semana | Médio — resiliência | `auto-imposer-runner.js`, `Program.cs:191-213`, `imposition-orchestrator.js:24-25` |
| **P3** | Limpeza arqueológica: dedup `src/lib` ↔ `grafica-app`, services `.js` ↔ `.ts`, 2 wizards, remover hardcodes da Konica | 2–4 semanas | Médio — manutenibilidade | `CanvasImposicao.cs:50`, `imposition-roll-math.ts`, orquestrador |

---

## 8. Estratégia de Verificação

> 🔬 Segue as convenções de `docs/engineering/TESTING_STRATEGY.md`.

### 8.1 Golden-master (caracterização)

Fixar o caso canônico **19×34 / 665×986 / gap 0 / margens 0 / 1015 cópias** e assertar, **em CADA motor**, ANTES e DEPOIS de qualquer mudança:

```
cols=35, rows=29, total=1015, orientation=0, lengthMm=986, surplus=0, file=_IMPOSTO_665x986mm_1015UN.pdf
```

- Motor 3 (roll-math): teste unitário que importa `src/lib/imposition-roll-math.ts` e verifica os campos do retorno (136-154).
- Motor 1 (AutoImposerCLI): rodar o binário com os mesmos parâmetros e parsear `RESULT_JSON` (279) + conferir o nome do arquivo (262).
- Motor 2 (IllustratorImposerCLI): mesmo fluxo via COM (marcar como *skip* se o Illustrator não estiver instalado no CI).
- Motor 4 (Konica): GUI/WPF — caracterização manual; fora do CI.

### 8.2 Testes unitários do `GridSearchEngine`

- Tolerância explícita: entradas em borda exata (`665/19 = 35.0000001`) devem dar `cols=35` sem epsilon mágico.
- Margens per-side: `left≠right` e `top≠bottom` produzem grid correto e centralização simétrica.
- Física rolo vs folha: rolo auto-estende até `maxLengthMm`; folha descarta/avisa quando não cabe.
- Políticas de sobras: `truncate` zera surplus; `fill_row` completa; `fill_advance` maximiza total.
- Fator exato: `1015 % 35 === 0` com `forcedCols` respeitando regras.
- Desvio de registro: relatório ≤ `registerMm` para grids exatos.

### 8.3 E2E smoke (manual e CI)

`MontarPDF.bat` (genérico) / `Montar_Chapa_70x100.bat` / `Montar_SRA3_Konica.bat` / `Montar_Rolo_Mimaki.bat` / `Impor_Illustrator.bat` → CLI → abrir o PDF gerado e conferir: página única, grade visível, contagem de cópias, nome de arquivo e checksum SHA-256 (`Program.cs:290-296`). Repetir após P0/P1 em cada PR que toque os motores.

---

## 9. PROMPT PARA AGENTE — Implementador do `GridSearchEngine`

> 📦 Copie o bloco abaixo e cole para Claude/Gemini/outro agente. É autossuficiente e cita os arquivos, comandos e guardrails. Ajuste caminhos se o monorepo mudar.

```text
# Contexto
Você está no monorepo `dpi-controle-estoque`. Existem 4 motores de imposição/step&repeat
divergentes (ver docs/engineering/IMPOSICAO-MOTOR.md, seções 2-5):
  1. sidecars/AutoImposerCLI/Program.cs          (.NET 10 + PdfSharp 6.1.1, chapa/folha)
  2. sidecars/IllustratorImposerCLI/Program.cs + Scripts/engine.jsx (COM/ExtendScript, rolo)
  3. src/lib/imposition-roll-math.ts             (= grafica-app/src/lib/imposition-roll-math.ts, math TS)
  4. sidecars/ImpositorKonica/Views/CanvasImposicao.cs (WPF + SkiaSharp + QRCoder, gang-run)
Sua missão: criar packages/imposition-core (ou equivalente) com o motor unificado
GridSearchEngine conforme a SEÇÃO 6 do doc, unificar os 4 motores sobre ele e corrigir
os top-10 bugs listados abaixo. NÃO realize outras refatorações.

# Passo 0 — Leia antes de tocar em qualquer coisa
- docs/engineering/IMPOSICAO-MOTOR.md (inteiro; a seção 6 é o contrato).
- docs/engineering/TESTING_STRATEGY.md (convenções de teste do repo).
- Os 4 arquivos de motor citados acima + electron/services/imposition-orchestrator.js
  (= .ts) + electron/sidecars/auto-imposer-runner.js + os .bat raiz
  (MontarPDF.bat, Montar_Chapa_70x100.bat, Montar_SRA3_Konica.bat, Montar_Rolo_Mimaki.bat, Impor_Illustrator.bat).
- AGENTS.md e as regras de docs do Next.js (não gerar docs fora do escopo).

# Passo 1 — Golden-master ANTES (caracterização)
Rode o golden-master do caso canônico 19x34mm em 665x986mm, gap 0, margens 0,
1015 cópias, e registre as saídas de CADA motor. Esperado: cols=35, rows=29,
total=1015, orientation=0, lengthMm=986, surplus=0,
file=_IMPOSTO_665x986mm_1015UN.pdf.
- Motor 3: teste unitário TS importando src/lib/imposition-roll-math.ts.
  Comando sugerido: npm run lint && npx tsx caminho/do/teste  (confirme o runner do repo).
- Motor 1: rode o CLI .NET com os argumentos posicionais do parser
  (PREENCHA a ordem exata lendo Program.cs antes) e parseie RESULT_JSON + nome do arquivo.
  Comando sugerido: npm run build:cli seguido de dotnet run --project sidecars/AutoImposerCLI -- <args>.
- Motor 2 (Illustrator): idêntico via COM; se o Illustrator não estiver instalado, marque
  como SKIP no relatório (não falhe o golden-master por isso).
- Motor 4 (Konica): WPF, fora de CI — não cobre no golden-master.
Salve o resultado em packages/imposition-core/test/golden-master-before.json.

# Passo 2 — Crie o GridSearchEngine
Crie packages/imposition-core com:
- Contrato de entrada EXATO da seção 6.1 (substrate{kind,widthMm,initialLengthMm,
  maxLengthMm,margin per-side,toleranceMm,bleedMm,cutInsetMm,registerMm}, piece,
  targetCopies, surplusPolicy, scalePolicy, forcedOrientation, forcedCols).
- Algoritmo em 7 passos da seção 6.2: tolerância explícita ANTES do floor
  (tol = max(toleranceMm, registerMm, 0.1) — NUNCA +0.000001), varredura COMPLETA de
  orientações x colunas (sem janela de 26 nem busca max-10), função de custo com pesos
  wA=0.50/wL=0.30/wS=0.20 da seção 6.3, física rolo (auto-extend até maxLengthMm) vs
  folha (fixa, nunca transbordar), alternativeGrids top-N ranqueadas, relatório de
  registro em 1/10 mm, ponto de extensão gang-run (quota round-robin).
- Pseudocódigo da seção 6.4 como base.
- Tests unitários da seção 8.2 (tolerância, margens per-side, rolo vs folha,
  políticas de sobras, fator exato, desvio de registro).

# Passo 3 — Unifique os 4 motores sobre o GridSearchEngine
- AutoImposerCLI: use o GridSearchEngine para decidir orientação/grid; mantenha
  escala letterbox e centralização; DELETE a comparação por área da linha 153.
- engine.jsx: receba o grid/rotação PRÉ-CALCULADO via JSON (não decida mais por
  colunas no ExtendScript); mantenha a duplicação vetorial por camada e o
  PDFSaveOptions ACROBAT8 + preserveEditability.
- imposition-roll-math.ts: vire re-export do GridSearchEngine (ou adaptador fino),
  preservando a assinatura pública atual para não quebrar o front.
- ImpositorKonica: ExecuteAutoGang passa a usar o GridSearchEngine por SKU com
  quota round-robin; remova o hardcode 40/36.
- Orquestrador: corrija a assimetria (undefined->0 forçado vs null->auto); envie
  margens per-side em AMBOS os caminhos; MediaBox passa por parse robusto de PDF
  (object streams) em vez do regex latin1; mantenha o fallback 50x50mm apenas como
  último recurso, com WARNING no log.

# Passo 4 — Corrija os top-10 bugs
1. Epsilon ausente fora do engine.jsx (tolerância explícita em todos os floor/%).
2. Orientação incompatível: área vs colunas vs custo -> resolver só por custo.
3. Margens não-per-side nos caminhos TS/JSX + assimetria do orquestrador.
4. targetCopies ignorado no fluxo CLI/bat (respeite o argumento posicional).
5. Contagem divergente: truncate (CLI) vs fill_row (JSX) -> política única via contrato.
6. Auto-extend só no JSX: CLI deve auto-estender rolo OU avisar em folha.
7. footprintTopPt da rotação no engine.jsx: recalcular centroide rigidamente (prove por teste).
8. Escala: JSX nunca escala -> aplique scalePolicy (fit/bleed/reject) + preflight de overflow.
9. Sem bleed/cutInset/thickness/tolerance: adicione ao contrato e ao relatório de registro.
10. Auto-cure de 1 CLSID + sem retry: generalize auto-cure e adicione retry/backoff no runner.

# Passo 5 — Verifique (golden-master DEPOIS + lint + scripts raiz)
- Rode o golden-master NOVAMENTE (mesmo caso). As saídas dos 4 motores devem
  continuar iguais (se algum motor mudar de grid, exija justificativa por escrito
  no relatório, pois o caso é ajuste perfeito).
- Rode os scripts raiz: npm run build:cli, npm run build:cli:illustrator,
  npm run build:export e npm run lint — TODOS devem passar.
- Rode os unit tests do packages/imposition-core.
- E2E smoke: rode MontarPDF.bat e Impor_Illustrator.bat e abra os PDFs gerados.

# GUARDRAILS (obrigatórios, não negociáveis)
- NÃO mude o naming de saída: _IMPOSTO_{W:F0}x{H:F0}mm_{N}UN.pdf (e o padrão do JSX).
- NÃO quebre exit codes: CLI 0/1, Illustrator 0/1/2 (2 = Illustrator ausente).
- NÃO rasterize nada: mantenha vetor / Form XObject na geração PDF.
- MANTENHA o caminho COM/ExtendScript (Windows) — não migre para outro motor gráfico.
- Respeite AGENTS.md e as regras de docs do Next.js (sem doc fora do escopo).
- Rode o golden-master ANTES e DEPOIS de CADA mudança incremental, não só no final.
- Não altere a assinatura pública de imposition-roll-math.ts sem adapter no front.

# Entrega
- packages/imposition-core com código + testes + README curto.
- Relatório final em PT-BR com a TABELA DE SCORES unificada: por motor, antes/depois,
  para o caso canônico (cols, rows, total, orientation, length, surplus, nome do arquivo)
  e para 3 casos de estresse (folha que não cabe, rolo com auto-extend, margens
  assimétricas). Liste quais top-10 bugs foram corrigidos e quais ficaram para depois.
```

---

## Apêndice — Checklist de qualidade

- [ ] Golden-master pins o caso 19×34/665×986/1015/gap0 nos 4 motores.
- [ ] Tolerância explícita substitui `+0.000001` em todos os caminhos.
- [ ] Margens per-side fluem do orquestrador até os 4 motores.
- [ ] Política de sobras única (contrato `surplusPolicy`).
- [ ] Física rolo (auto-extend) vs folha (fixa) respeitada.
- [ ] `RESULT_JSON` inclui métricas de aproveitamento e desvio de registro.
- [ ] Naming de saída, exit codes e vetorização preservados.