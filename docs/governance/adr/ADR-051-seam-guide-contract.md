# ADR-051: Contrato da Linha-Guia de Emenda (Módulo Seams)

> **Status:** Aprovado  
> **Data:** 2026-10-02  
> **Autor:** Felipe / Engenharia GraficaOS  
> **Domínio:** imposition / prepress  
> **Regra de Negócio:** BR-053  
> **Substitui / Complementa:** Complementa ADR-047, ADR-049  

---

## 1. Contexto

Na montagem e acabamento de banners e painéis divididos em múltiplos painéis (módulo `Seams`, ADR-049), o operador de acabamento precisa alinhar a borda do painel superior sobre o painel inferior antes de realizar a termo-solda ou aplicação de fita dupla-face.

Sem uma referência visual milimétrica no painel inferior, o alinhamento da sobreposição (*overlap*) fica sujeito a erro humano de posicionamento, gerando desalinhamento da arte ou perda de esquadro no produto final. A linha-guia visual atua como marca de gabarito para posicionamento exato da borda do painel subsequente.

---

## 2. Decisões

### Decisão 1: Posição Exata na Borda da Sobreposição (BR_053_GUIDE_EXACT_EDGE)
A linha-guia fica localizada exatamente na **borda exata** da área de sobreposição no painel inferior, demarcando a linha de encontro onde o painel superior deve encostar. A hipótese inicial de recuo de 1 mm dentro da área de cola foi descartada após validação de chão de fábrica: a linha na borda exata garante alinhamento milimétrico sem risco de visualização no painel final montado.

### Decisão 2: Espessura e Cor Padrão (BR_053_GUIDE_THICKNESS_PT e BR_053_GUIDE_CMYK)
- **Espessura:** 1.0 pt PDF (`BR_053_GUIDE_THICKNESS_PT = 1.0`), correspondente a `1.0 * 25.4 / 72.0` mm (~0.3528 mm).
- **Cor:** CMYK puro com 40% de preto: `C: 0.0, M: 0.0, Y: 0.0, K: 0.40` (`BR_053_GUIDE_CMYK = (0, 0, 0, 0.40)`).
- Não há presença de Cyan, Magenta ou Yellow na linha vetorial no arquivo final.

### Decisão 3: Aplicação Exclusiva no Painel Inferior (`HasGuideLine = true`)
A linha-guia é gerada exclusivamente nos painéis que servem de base inferior na emenda (`HasGuideLine == true` em `PanelPlacement`):
- Em divisão de $N$ painéis, exatamente $N - 1$ painéis recebem a linha-guia (painéis 1 a $N - 1$).
- O painel superior (último painel, índice $N$) sobrepõe o painel anterior e não recebe linha-guia (`HasGuideLine == false`).
- Em arte de painel único ($N = 1$), nenhuma linha-guia é gerada.

### Decisão 4: PDF Vetorial via QDF e Raster via SkiaSharp
- **PDF (vetorial):** A injeção é realizada diretamente no content stream PDF via manipulação QDF (`PdfSeamGuideInjector` em `Imposition.Pdf`), utilizando operadores PDF nativos (`q`, `0 0 0 0.40 k`, `1 w`, `m`, `l`, `S`, `Q`), preservando camadas OCG e sem rasterizar o conteúdo.
- **Imagens / Raster (JPG/TIFF):** A renderização é realizada via `RasterSeamGuidePainter` (`Imposition.Render`) utilizando `SKCanvas` do SkiaSharp.

### Decisão 5: Conversão CMYK→RGB Apenas para Renderização de Preview
Para exibição e renderização raster em telas/RGB, adota-se a fórmula padrão determinística de conversão prescrita:
$$\text{RGB} = \text{Round}(255 \times (1.0 - K)) \implies 255 \times (1.0 - 0.40) = 153 \implies \text{Hex: \#999999}$$
No arquivo PDF de saída final, a cor permanece estritamente CMYK `0 0 0 0.40 k`, sem aproximação ou conversão em RGB.

---

## 3. Consequências

- **Positivas:**
  - Alinhamento de emenda confiável e padronizado na fábrica.
  - Zero alteração nas camadas OCG do cliente.
  - Fidelidade de cor CMYK no fluxo de impressão vetorial.
- **Negativas / Limitações:**
  - Requer injeção precisa no content stream QDF no pipeline de PDF.
