# ADR-049: Contrato de Cálculo e Compensação Térmica de Emendas (Módulo Seams)

> **Status:** Aprovado  
> **Data:** 2026-09-30  
> **Autor:** Felipe / Engenharia GraficaOS  
> **Domínio:** imposition / prepress  
> **Regra de Negócio:** BR-050  
> **Substitui / Complementa:** Complementa ADR-015, ADR-017, ADR-021, ADR-041  

---

## 1. Contexto

Banners e painéis de grande formato (comunicação visual) frequentemente excedem a largura física imprimível dos rolos de substrato (lonas de 1,60 m, 2,20 m, 3,20 m). O processo de divisão da arte em múltiplos painéis verticais ou horizontais exige:
1. Sobreposição (*overlap*) geométrica precisa para montagem por solda térmica ou fita dupla-face.
2. Linhas-guia visuais para conferência e alinhamento milimétrico na mesa de acabamento.
3. Compensação de encolhimento térmico provocado pelo calor do cabeçote/secador/cura UV na impressora e na máquina de solda de alta frequência.

O cálculo da divisão precisa ser determinístico, estritamente validado contra valores não-finitos (Regra R-013 do `AGENTS.md`) e desacoplado de operações de IO (`imposition-core`).

---

## 2. Decisões

### Decisão 1: Fórmula de Encolhimento Térmico (BR_050.b)
A compensação de encolhimento é calculada pela fórmula empírica de fábrica:
$$\text{Acréscimo (mm)} = 10.0 + (\lceil L_{\text{metros}} \rceil \times 10.0)$$
Onde:
- Parcela fixa: `10.0 mm` (1 cm) compensa tração de fixação no tubete/garra.
- Parcela linear: `10.0 mm` por metro linear arredondado para cima (`Math.Ceiling(L_mm / 1000.0)`).
- Exemplos canônicos:
  - 1,0 m (1000 mm) $\rightarrow 10 + (1 \times 10) = 20\text{ mm}$ (Comprimento final: 1020 mm / 102 cm).
  - 2,1 m (2100 mm) $\rightarrow 10 + (3 \times 10) = 40\text{ mm}$ (Comprimento final: 2140 mm / 214 cm).
  - 3,0 m (3000 mm) $\rightarrow 10 + (3 \times 10) = 40\text{ mm}$ (Comprimento final: 3040 mm / 304 cm).
  - 5,0 m (5000 mm) $\rightarrow 10 + (5 \times 10) = 60\text{ mm}$ (Comprimento final: 5060 mm / 506 cm).
  - 0 mm $\rightarrow 10\text{ mm}$ (apenas o fixo).

### Decisão 2: Isolamento do Encolhimento no Eixo do Comprimento
O encolhimento afeta exclusivamente a dimensão do **comprimento do painel** (eixo de tração e avanço do rolo, Y na orientação vertical). A largura útil do rolo imprimível (eixo X) permanece invariante como limite físico do equipamento (`PrintableRollWidthMm`).

### Decisão 3: Orientação Padrão Vertical (`SeamOrientation.Vertical`)
A divisão padrão é vertical (painéis fatiados ao longo da largura da arte e impressos longitudinalmente no rolo), com suporte a fatiamento horizontal (`SeamOrientation.Horizontal`).

### Decisão 4: Ordem Padrão Esquerda $\rightarrow$ Direita (`SeamDirection.LeftToRight`)
No Core, o painel 1 inicia na extremidade esquerda/superior da arte. A inversão (`RightToLeft`) é parametrizável.

### Decisão 5: Validação Estrita de Ponto Flutuante (Regra R-013)
Todas as dimensões em milímetros (`ArtworkWidthMm`, `ArtworkHeightMm`, `PrintableRollWidthMm`, `OverlapMm`, `CustomPanelWidthMm`) são validadas com `!double.IsFinite(x) || x <= 0` antes de qualquer divisão. Valores não finitos (`NaN`, `±Infinity`) ou menores/iguais a zero disparam `ImpositionException` com código `ErrorCodes.InvalidSeamsInput` em PT-BR.

### Decisão 6: Namespace Isolado `Imposition.Core.Seams`
O contrato público de emendas reside estritamente em `Imposition.Core.Seams` (`SeamsInput`, `PanelPlacement`, `SeamsResult`, `ShrinkageCalculator`, `PanelCalculator`, `SeamsValidator`), sem poluir o `ImpositionInput` de chapas/etiquetas do motor principal.

---

## 3. Consequências

- **Positivas:**
  - Eliminação de divergências na solda de banners em fábrica.
  - Zero refugo de lonas curtas por encolhimento térmico.
  - Alinhamento rigoroso com a arquitetura de cálculo puro do `imposition-core`.
- **Negativas / Cuidados:**
  - Operadores devem ser instruídos de que o arquivo impresso terá acréscimo milimétrico para corte pós-solda.

---

## 4. Referências

- PRD v3.2 (Módulo Seams / Emendas de Banners)
- `docs/engineering/SEAMS-PLANO-FEATURES.md`
- `docs/governance/adr/ADR-015-arquitetura-sidecar-e-ferramentas-nativas.md`
- `docs/governance/adr/ADR-041-imposicao-multi-rodada.md`
