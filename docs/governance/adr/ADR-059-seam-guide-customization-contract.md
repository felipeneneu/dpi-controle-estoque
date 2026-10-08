# ADR-059: Contrato de Customização da Linha-Guia de Emenda (Presença, Cores CMYK e Espessura)

> **Status:** Aprovado  
> **Data:** 2026-10-08  
> **Autor:** Engenharia GraficaOS  
> **Domínio:** imposition / prepress / export  
> **Regra de Negócio:** BR-059  
> **Complementa:** ADR-051, ADR-053, ADR-054, ADR-055, ADR-056; Aplica Regras R-013, R-020  

---

## 1. Contexto

A ADR-051 e a regra BR-053 estabeleceram a linha-guia visual de sobreposição como traço fixo de 1.0 pt em K 40% (cinza claro).
Na prática de fábrica e em diferentes mídias e tipos de arte (por exemplo, lonas muito escuras com fundo preto ou muito claras com áreas brancas puras), uma linha cinza fixa pode se tornar invisível ou indesejada pelo impressor:
- Em artes de alta exigência visual, o operador pode preferir **não imprimir nenhuma linha**, confiando apenas na sobreposição física de colagem.
- Em artes predominantemente pretas, uma linha K 40% é imperceptível, exigindo **linha branca ou magenta**.
- Para operadores com dificuldade de corte ou solda térmica, um traço mais espesso (ex: 1.5 pt a 2.5 pt) facilita a montagem manual.

---

## 2. Decisões

### Decisão 1: Chave de Habilitação da Linha-Guia (`--guide-line`)
- Por padrão, a linha-guia continua **habilitada** (`GuideLine = true`), preservando retrocompatibilidade total com a ADR-051.
- A linha pode ser suprimida passando `--guide-line false` ou a flag `--no-guide-line`.
- Quando desabilitada, o gerador não grava pixels de guia no raster JPEG/TIFF e não insere operadores de traçado vetorial no PDF/X-1a.

### Decisão 2: Parametrização de Cor CMYK Estrita (Regra R-020)
- Toda cor da linha-guia é expressa e manipulada unicamente nos canais CMYK (`Cyan`, `Magenta`, `Yellow`, `Black` em `[0.0, 1.0]`).
- O parâmetro CLI `--line-color <valor>` aceita:
  - Presets padronizados:
    - `k40` (padrão de fábrica: C:0, M:0, Y:0, K:0.40)
    - `k100` / `black` (preto puro: C:0, M:0, Y:0, K:1.0)
    - `magenta` / `m100` (magenta de contraste: C:0, M:1.0, Y:0, K:0)
    - `cyan` / `c100` (ciano puro: C:1.0, M:0, Y:0, K:0)
    - `yellow` / `y100` (amarelo: C:0, M:0, Y:1.0, K:0)
    - `white` (branco / ausência de tinta: C:0, M:0, Y:0, K:0)
    - `red` (magenta + amarelo: C:0, M:1.0, Y:1.0, K:0)
  - Notação percentual explícita: `C,M,Y,K` (ex: `0,0,0,50` para K 50% ou `0,100,100,0` para vermelho gráfico).
- Qualquer entrada inválida ou componente fora de `[0, 100]%` lança erro descritivo e recusa a operação antes do processamento.

### Decisão 3: Espessura do Risco em Pontos (`--line-thickness`)
- A espessura do traço é especificada em pontos PDF (`pt`), com padrão de `1.0 pt`.
- A validação utiliza rigorosamente `!double.IsFinite(thickness) || thickness <= 0` (Regra R-013).
- No raster, a espessura em pixels é convertida por `Math.Max(1, (int)Math.Round(thicknessPt * dpi / 72.0))`.
- No PDF, a espessura é injetada diretamente no operador `w` (linewidth).

### Decisão 4: Modelo Puro no `imposition-core`
- Criação do tipo imutável `GuideLineConfig` no pacote `imposition-core`.
- A função pura `GuideLineCalculator.Calculate(result, config)` recebe a configuração sem IO, calculando as coordenadas e cores determinísticas.

---

## 3. Consequências

- **Positivas:** Flexibilidade operacional total para lonas pretas, brancas ou coloridas, com opção de suprimir o traço quando solicitado pelo cliente.
- **Conformidade:** Garante 100% de conformidade com as regras de governança R-013 (validação finita de double) e R-020 (saída estritamente em canais CMYK, sem RGB).
