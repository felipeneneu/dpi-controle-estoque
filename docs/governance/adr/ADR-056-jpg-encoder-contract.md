# ADR-056: Contrato do Codificador JPEG CMYK (Módulo Seams / Hotfix)

> **Status:** Aprovado  
> **Data:** 2026-10-07  
> **Autor:** Felipe / Engenharia GraficaOS  
> **Domínio:** imposition / prepress / export  
> **Regra de Negócio:** BR-054  
> **Substitui / Complementa:** Substitui decisões de encoder de ADR-053; Aplica Regras R-020 e R-021  

---

## 1. Contexto

Durante testes em fábrica (2026-10-07) do módulo `Seams`, verificou-se que os arquivos JPEG CMYK gerados pelo exportador de painéis eram sumariamente rejeitados pelo Adobe Photoshop, Adobe Illustrator e RIPs gráficos com erro fatal de arquivo corrompido / marcador inválido.

A investigação diagnóstica revelou três falhas estruturais graves no encoder anterior:
1. **Incompatibilidade com a especificação JFIF (ISO/IEC 10918-5):** O codificador inseria um cabeçalho `APP0` (JFIF) em arquivos de 4 canais. O padrão JFIF suporta unicamente 1 canal (Grayscale) ou 3 canais (YCbCr). A presença de `APP0` em um stream de 4 componentes corrompe a especificação e leva à rejeição imediata por visualizadores profissionais.
2. **Corrupção do bitstream de entropia Huffman:** Na rotina de compressão anterior, o código de final de bloco (`EOB`) foi gravado erroneamente como `00` (2 bits). Contudo, na tabela padrão AC definida no cabeçalho `DHT`, o símbolo para `00` é `0x01` (run 0, size 1), exigindo bits de valor subsequentes. O código canônico real de `EOB` (`0x00`) possui 4 bits (`1010`). Essa divergência causava desincronização instantânea na decodificação do primeiro bloco 8x8 de qualquer parser do mercado.
3. **Ausência de DCT e quantização real:** O algoritmo realizava apenas uma média aritmética simples para a componente DC, sem matrizes reais de transformada e quantização.

Adicionalmente, a dependência nativa de `turbojpeg.dll` prevista na ADR-053 não se encontrava empacotada no repositório, violando políticas de portabilidade e disparando o fallback defeituoso.

---

## 2. Decisões

### Decisão 1: Codificador Gerenciado Baseado em BitMiracle.LibJpeg.NET
- O exportador de painéis JPEG CMYK utiliza a biblioteca gerenciada pura `BitMiracle.LibJpeg.NET` (port C# oficial e maduro do `libjpeg` IJG).
- Suporte nativo e completo a 4 canais CMYK (`Colorspace.Cmyk`), cálculo matemático real de DCT, quantização e tabelas canônicas de Huffman.
- Distribuição 100% via pacote NuGet oficial, eliminando necessidade de binários nativos de terceiros no repositório ou complexidades de RID por plataforma.

### Decisão 2: Adiamento de libjpeg-turbo Nativo
- Não empacotar `turbojpeg.dll` neste momento.
- O requisito crítico imediato é **corretude estrita e interoperabilidade**, não micro-otimização via SSE/AVX. O ganho de tempo não justifica o risco de distribuição de binários nativos no git. Futura migração será avaliada em ADR própria caso o volume de processamento exija.

### Decisão 3: Validação Cross-Tool Obrigatória nos Testes (Regra R-021)
- Conforme a nova regra de governança **R-021**, nenhum arquivo gerado pelo pipeline de exportação pode ser validado unicamente por código proprietário.
- A biblioteca `Magick.NET` (ImageMagick para .NET) é integrada como dependência de teste para validação cruzada. Todo teste de integração deve abrir os arquivos de saída gerados e confirmar:
  - Ausência de falhas ou exceções de decodificação.
  - `ColorSpace == ColorSpace.Cmyk` e contagem exata de 4 canais.
  - Dimensões em pixels e densidade em DPI.

### Decisão 4: Perfil ICC CMYK FOGRA39 Incorporado
- A opção `JpgExportOptions.EmbedIccProfile` permanece ativa por padrão (`true`).
- O perfil de cor incorporado utiliza a especificação real **FOGRA39** (ISO Coated v2 ECI) em marcadores `APP2 ICC_PROFILE`, garantindo consistência cromática estrita nos birôs de impressão.

### Decisão 5: Remoção Completa de Mockups Legados
- O tipo `NativeLoader` e as rotinas manuais `EncodeManagedCmyk` / `DecodeManagedCmyk` são **completamente removidos**.
- O contrato de codificação fica centralizado na classe limpa `JpegCmykEncoder`, com um único fluxo previsível de execução.

### Decisão 6: Metadados Estruturais Estritos (Adobe APP14)
- Em conformidade com o padrão gráfico da Adobe para JPEG CMYK:
  - Marcador `APP0` (JFIF) **nunca** é gravado em arquivos CMYK.
  - Marcador `APP14` (Adobe) é gravado com `ColorTransform = 0` (Direct CMYK, sem conversão para YCCK).
  - Resolução em DPI é registrada nos metadados de densidade suportados sem corromper o padrão de 4 componentes.

---

## 3. Consequências

- **Positivas:**
  - JPEGs CMYK gerados abrem com fidelidade absoluta no Adobe Photoshop, Adobe Illustrator, CorelDraw, GIMP e RIPs de grandes formatos.
  - Zero dependências de DLLs compiladas fora do ecossistema .NET.
  - Cobertura de testes garantida por validação cruzada independente com ImageMagick (R-021).
  - Preservação estrita das 4 separações de cor (Regra R-020).
- **Negativas / Mitigações:**
  - Codificação 100% gerenciada consome um pouco mais de CPU em arquivos gigantes comparada à vetorização AVX nativa, mitigada pela arquitetura de fatiamento individual por painel e escrita direta em streaming.
