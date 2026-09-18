# Auditoria `imposition-roll-math.ts` vs `imposition-core` (PR #3b)

## 1. Resumo Executivo
A auditoria identificou **divergências estruturais e comportamentais graves** entre o `roll-math.ts` (interpolador UI) e o `GridSearchEngine.cs` (motor raiz v1). As diferenças na função de custo (priorização de exatidão em detrimento do aproveitamento), a falta de tolerância de flutuação (truncamento incorreto) e a ausência de limites rígidos de comprimento exigem bloqueio da migração direta até que a regra de negócio seja unificada (Fase B abortada).

## 2. Mapeamento Função-por-Função

| Função em `roll-math.ts` | Equivalente no core | Bate? | Observações |
|---|---|---|---|
| Decisão de orientação e seleção | `Score(c, input, lengthLim)` | ❌ NÃO | Core usa pesos (desperdício 50%, comprimento 30%, surplus 20%). O `roll-math.ts` prioriza `isExact` absoluto, escolhendo grids com colunas vazias se isso evitar *surplus*. |
| Tolerância em colunas/linhas | `Tolerance.Resolve()` | ❌ NÃO | Core adiciona tolerância paramétrica (ex: `+0.1mm`) antes do `Floor` para compensar *floats*. O `roll-math.ts` usa `Math.floor` puro. |
| Política de Surplus | `SurplusPolicy` | ⚠️ PARCIAL | Core implementa `Truncate` e fluxos formais de preenchimento. `roll-math` manipula o alvo de forma restrita a `fill_row` ou `fill_advance`. |
| Limite de Comprimento / Rolo | `maxLengthMm` / `SubstrateKind` | ❌ NÃO | Core lança `E_GRID_OVERFLOW` caso o alvo estoure o `maxLengthMm` do rolo. O `roll-math.ts` estende o comprimento infinitamente, apenas retornando `fits: false`. |
| Margens Laterais | `MarginSpec` | ❌ NÃO | Core aceita 4 margens independentes (TRBL). O `roll-math.ts` aceita apenas recuos simétricos (`sideMarginMm`, `topBottomMarginMm`). |

## 3. Resultados Comportamentais

| Caso | `roll-math.ts` | `imposition-core` | Bate? |
|---|---|---|---|
| **1. Canônico** (19×34 / 665×986 / alvo 1015) | `cols=35, rows=29, total=1015`, direct | `cols=35, rows=29, total=1015`, direct | ✅ SIM |
| **2. Margens assimétricas** (left 20, alvo 950) | `cols=33, rows=29, total=957`, direct | `cols=33, rows=29, total=957`, direct | ✅ SIM (forçado simétrico no teste) |
| **3. Rolo auto-extend** (estoura limite 2000mm) | `cols=30, rows=100, total=3000`, direct | **Exception:** `E_GRID_OVERFLOW` | ❌ NÃO |
| **4. Fill row vs truncate** | `cols=35, rows=29, total=1015` | `cols=35, rows=29, total=1015` | ✅ SIM |
| **5. Epsilon mágico** (33.333mm em 100mm) | `cols=2, rows=5, total=10`, rotated | `cols=3, rows=4, total=12`, direct | ❌ NÃO |

## 4. Divergências Encontradas (Detalhamento)

1. **Epsilon Mágico (Tolerância Float):**
   - **Caso exposto:** `Epsilon magico` (peça de 33.33333333mm em 100mm).
   - **Divergência:** `roll-math` calcula `floor(100 / 33.333...) = 2 colunas`. O Core usa `floor(100.1 / 33.333...) = 3 colunas`.
   - **Correto:** `imposition-core` (Regra 1 do `AGENTS.md`).
2. **Priorização de `isExact` vs Custo Ponderado:**
   - **Caso exposto:** `Rolo auto-extend` (com alvo absurdo).
   - **Divergência:** Para evitar *surplus*, o `roll-math` sacrifica 5 colunas inteiras de aproveitamento (escolhe 30 colunas e 100 linhas em vez de 35 colunas) só porque 30×100 dá exatamente 3000 peças.
   - **Correto:** `imposition-core`. A função de custo do motor primário garante a escolha baseada em métricas financeiras/físicas da gráfica.
3. **Estouro de Comprimento Silencioso:**
   - **Caso exposto:** `Rolo auto-extend` (limite do rolo 2000mm, necessário 3000+ mm).
   - **Divergência:** Core barra a operação com erro (`E_GRID_OVERFLOW`). O `roll-math` computa a grade que gasta o espaço necessário, mesmo estourando fisicamente a mídia, apenas alterando uma *flag* `fits = false`.
   - **Correto:** `imposition-core`.

## 5. Recomendação Final

🚨 **A Fase B (Aplicação) deve ser PARADA.**

Não podemos simplesmente adicionar os testes de contrato (Fase B), pois o `roll-math.ts` **não passa neles**. A divergência comportamental na tolerância de floats e na ordem de escolha de opções (`isExact` vs *Score*) causaria falha permanente na integração contínua (CI).

**Recomendação de próximos passos ao PO:**
(a) Reescrever o `imposition-roll-math.ts` integralmente (ou gerar WASM do core) para eliminar a divergência matemática do frontend, ou
(b) Descartar o `roll-math.ts` e realizar todas as chamadas de interpolação diretamente via `imposition-grid-cli` (IPC), assumindo a latência da comunicação.
