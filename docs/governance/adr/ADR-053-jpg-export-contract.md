# ADR-053: Contrato de Exportação de Painéis JPG CMYK (Módulo Seams)

> **Status:** Aprovado  
> **Data:** 2026-10-05  
> **Autor:** Felipe / Engenharia GraficaOS  
> **Domínio:** imposition / prepress / export  
> **Regra de Negócio:** BR-054  
> **Substitui / Complementa:** Complementa ADR-049, ADR-050, ADR-051, ADR-052; Aplica Regra R-020  

---

## 1. Contexto

No fluxo de produção gráfica de grandes formatos (módulo `Seams`), lonas e banners divididos em múltiplos painéis precisam ser enviados para os RIPs de impressão (Photoprint, Wasatch, Caldera, Onyx) em arquivos raster de alta qualidade.

Conforme a **Regra R-020 (CMYK sempre)**, arquivos de saída de produção **nunca** passam por conversões para RGB, pois isso destruiria as separações de tinta CMYK e a calibração de cor do birô. A exportação deve manter 100% dos dados originais no espaço de cor CMYK puro do início ao fim do pipeline.

---

## 2. Decisões

### Decisão 1: Buffer CMYK Puro de Ponta a Ponta (Regra R-020)
- O pipeline de exportação opera diretamente no espaço de 4 canais CMYK (Cyan, Magenta, Yellow, Black).
- Zero conversão para RGB em qualquer etapa do fatiamento, bufferização e escrita em disco.
- Nenhum pixel de saída passa por LittleCMS ou display adaptation (o ICC de display é reservado exclusivamente para o preview em tela na ADR-052).

### Decisão 2: Encoder Nativo libjpeg-turbo via P/Invoke
- A compressão JPEG de cada painel utiliza a biblioteca nativa `libjpeg-turbo` configurada com `JCS_CMYK` como espaço de cor de entrada e de saída (`in_color_space = JCS_CMYK`, `jpeg_color_space = JCS_CMYK`).
- Permite compressão de alta performance com escrita progressiva em `Stream` para minimizar consumo de memória.

### Decisão 3: Qualidade de Compressão e Fator de Escala
- A qualidade padrão de exportação é **100** (qualidade máxima sem perdas visíveis).
- Intervalo configurável entre 80 e 100 via `JpgExportOptions`.

### Decisão 4: Resolução em DPI e Conversão Milimétrica
- Resolução padrão de exportação: **150 DPI** (padrão da indústria de grandes formatos).
- A conversão de dimensões de saída dos painéis (`OutputWidthMm`, `OutputHeightMm`) para pixels utiliza:
  $$\text{Pixels} = \text{Math.Round}\left(\text{DimensaoMm} \times \frac{\text{DPI}}{25.4}\right)$$
- As densidades horizontal e vertical (`X_density`, `Y_density`) e unidade (`density_unit = 1` - dots/inch) são escritas explicitamente no cabeçalho JFIF do arquivo JPEG.

### Decisão 5: Perfil ICC CMYK Embutido (Opcional)
- Suporte a incorporar o perfil ICC de entrada CMYK (ex.: FOGRA39 ou perfil da impressora) nos marcadores `APP2` do arquivo JPEG via flag `EmbedIccProfile`.

### Decisão 6: Validação Estrita da Fonte (Abortar se não-CMYK)
- Se a imagem fonte não estiver no espaço de cor CMYK (ex.: RGB, Grayscale), a exportação **aborta imediatamente** lançando `ImpositionException` com o código `E_EXPORT_SOURCE_NOT_CMYK`.
- Proibida qualquer conversão silenciosa ou aproximação automática.

### Decisão 7: Padrão Determinístico de Nomenclatura
- Nomenclatura dos arquivos de saída segue o padrão:
  $$\text{<job>\_painel\_<NN>.jpg}$$
  onde `NN` é o índice sequencial do painel formatado com 2 dígitos (zero-padded, ex.: `01`, `02`, `03`).

### Decisão 8: Escrita Atômica em Disco
- Cada painel é gerado primeiramente em um arquivo temporário com extensão `.tmp` no mesmo volume de destino.
- Após a conclusão da escrita do arquivo completo e flush do stream, é executado `File.Move(tempPath, finalPath, overwrite: true)`.
- Garante que arquivos incompletos ou corrompidos por cancelamento ou falha de I/O nunca fiquem visíveis para o RIP.

---

## 3. Consequências

- **Positivas:**
  - Preservação estrita das 4 separações de tinta gráfica (C, M, Y, K) conforme R-020.
  - Compatibilidade nativa com todos os RIPs de grandes formatos do mercado brasileiro.
  - Alta performance de exportação com baixo consumo de memória RAM via streaming scanline a scanline.
  - Segurança de produção contra interrupções via escrita atômica.
- **Negativas / Mitigações:**
  - Dependência binária de `libjpeg-turbo` nativo 64-bit, mitigada por `NativeLoader` multiplataforma com fallback gracioso.
