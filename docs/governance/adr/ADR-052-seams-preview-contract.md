# ADR-052: Contrato de Preview ICC-Aware e Display Adaptation (Módulo Seams)

> **Status:** Aprovado  
> **Data:** 2026-10-03  
> **Autor:** Felipe / Engenharia GraficaOS  
> **Domínio:** imposition / prepress / render  
> **Regra de Negócio:** BR-052  
> **Substitui / Complementa:** Complementa ADR-049, ADR-050, ADR-051; Aplica Regra R-020  

---

## 1. Contexto

Na interface de imposição e emendas de grandes formatos (módulo `Seams`), o operador necessita de feedback visual interativo e instantâneo ao manipular parâmetros de sobreposição (*overlap*), distribuição de rolos, linhas de refile e linhas-guia de termo-solda.

Trabalhos de comunicação visual frequentemente utilizam artes com gigabytes de dados rasterizados (ex.: painéis de 10 a 30 metros a 150–300 DPI em espaço de cor CMYK). Decodificar e converter a arte integral em tempo real durante zoom e pan provoca lentidão inaceitável (> 5 segundos) e esgotamento de memória.

Ao mesmo tempo, converter arbitrariamente o arquivo fonte para RGB destroi a integridade das separações de tinta gráfica. Conforme a **Regra R-020 (CMYK sempre)**, arquivos de saída permanecem 100% em CMYK puro, e o preview em tela deve ser estritamente uma **adaptação visual de exibição (*display adaptation*) via perfil ICC**, nunca uma conversão de cor destrutiva ou uso de valores hexadecimais arbitrários.

---

## 2. Decisões

### Decisão 1: Três Modos de Renderização de Preview (BR_052_MODES)
O motor de preview oferece três níveis operacionais com metas determinísticas de latência e fidelidade:
1. **`Performance` (Modo Rápido):** Fit-to-viewport agressivo com downscale em baixa resolução e amostragem rápida. Meta: **< 100 ms** para thumbnail e manipulação interativa fluida.
2. **`Balanced` (Modo Padrão):** Escala proporcional intermediária com filtro bilinear/bicúbico. Meta: **< 300 ms** para ajuste visual de sangria e emendas.
3. **`Quality` (Modo Alta Resolução):** Renderização 1:1 ou amostragem de alta densidade (~100 DPI) com filtragem de alta precisão. Meta: **< 1000 ms** para inspeção fina de detalhes de corte.

### Decisão 2: Preview é Display Adaptation via ICC (Regra R-020)
- O pipeline de preview processa o buffer CMYK da fonte diretamente.
- A transformação para o espaço do monitor ocorre exclusivamente na etapa final de apresentação através do LittleCMS (`lcms2`), aplicando o mapeamento de cores entre o perfil de entrada CMYK e o perfil do monitor.
- A exibição em tela é documentada e tratada como aproximação visual de exibição, preservando o arquivo fonte e o fluxo de produção intactos em CMYK.

### Decisão 3: Perfil CMYK Padrão e Configurável por Equipamento
- O perfil de entrada CMYK padrão adotado é **FOGRA39 (ISO Coated v2 / ECI)**.
- O contrato aceita substituição por perfis ICC customizados da impressora (ex.: perfis calibrados Mimaki/HP Latex/Konica).

### Decisão 4: Perfil do Monitor e Rendering Intent
- O perfil de saída padrão para display é o **sRGB padrão**.
- Suporte nativo a perfis ICC de monitores calibrados especificados no `ColorProfileConfig`.
- O *Rendering Intent* padrão é `RelativeColorimetric` (Colorimétrico Relativo com compensação de ponto preto).

### Decisão 5: Cache em Disco por Hash Composto (BR_052_CACHE)
- Cache em disco persistente utilizando chave SHA-256 composta por:
  $$\text{Hash} = \text{SHA256}(\text{ImageHash} + \text{Mode} + \text{Viewport} + \text{CmykProfileHash} + \text{MonitorProfileHash} + \text{OverlayFlags})$$
- Previews com perfis ICC distintos não colidem nem reaproveitam cache indevidamente.
- Política de retenção: TTL de 7 dias, limite máximo de 500 MB e descarte LRU (*Least Recently Used*).
- Escrita atômica via arquivo temporário com substituição segura (*temp + rename*).

### Decisão 6: Overlays de UI (Corte e Hachura) em Espaço RGB
- Marcadores de interface do usuário (linhas de corte pontilhadas em magenta, hachura semi-transparente de sobreposição) são desenhados diretamente em RGB sobre o buffer adaptado, pois representam guias de UI e não tinta de impressão.

### Decisão 7: Linha-Guia K40% Adaptada via ICC (Correção de Ruling R-020)
- A linha-guia de solda de 1.0 pt com cor CMYK `(0, 0, 0, 0.40)` (K 40%) representa tinta de impressão.
- Seu valor RGB para preview em tela é calculado obrigatoriamente pela transformação ICC (`CmykToDisplayTransform`) a partir de `CMYK(0, 0, 0, 0.40)` $\rightarrow$ sRGB: valor medido e fixado como `RGB(166, 166, 166)` (`#A6A6A6`) no espaço calibrado FOGRA39, eliminando constantes hexadecimais mágicas arbitrárias como `#999999` (153).

### Decisão 8: Thread-Safety e Gestão de Recursos do LittleCMS
- `lcms2` (`cmsHTRANSFORM`) não é reentrante/thread-safe para execuções concorrentes no mesmo handle.
- O wrapper `CmykToDisplayTransform` encapsula a execução com sincronização determinística (`lock` / pool de transforms), garantindo isolamento entre threads e liberação atômica no `Dispose()`.

### Decisão 9: Escopo do MVP e SLA de Performance
- **Escopo do MVP:** Focado estritamente em matrizes raster CMYK (JPEG/TIFF). Ghostscript não integra o pipeline do MVP de preview.
- **SLA < 100 ms:** A meta de latência no modo `Performance` aplica-se exclusivamente a imagens raster CMYK via downsampling em buffer de memória.
- **Diretriz Futura de Rasterização PDF:** Caso venha a ser necessária rasterização direta de PDF em pipelines futuros, o dispositivo de separação adotado será `tiff32nc` (nunca `pamcmyk32`), preservando a fidelidade CMYK 32-bit.

---

## 3. Consequências

- **Positivas:**
  - Resposta instantânea da UI mesmo com imagens gigantescas.
  - Conformidade estrita com a Regra R-020: zero conversão destrutiva do arquivo fonte.
  - Fidelidade visual cromática de prova de tela (*soft proofing*) calibrada via ICC.
  - Overlays responsivos e customizáveis.
  - Isolamento seguro de recursos nativos C/C++ sem corrupção de memória.
- **Negativas / Mitigações:**
  - Exige binding com LittleCMS (`lcms2`) para transformações de espaço de cores, mitigado por wrapper P/Invoke de alta performance e thread-safe.
