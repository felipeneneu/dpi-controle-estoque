# ADR-054: Contrato de Exportação de Painéis PDF/X-1a (Módulo Seams)

> **Status:** Aprovado  
> **Data:** 2026-10-06  
> **Autor:** Felipe / Engenharia GraficaOS  
> **Domínio:** imposition / prepress / export  
> **Regra de Negócio:** BR-055  
> **Substitui / Complementa:** Complementa ADR-043, ADR-049, ADR-050, ADR-051; Aplica Regra R-020  

---

## 1. Contexto

No fluxo de produção gráfica de grandes formatos (módulo `Seams`), lonas e banners divididos em múltiplos painéis precisam frequentemente ser exportados em formato vetorial padronizado para os RIPs de impressão (Wasatch, Caldera, Onyx, Photoprint).

O padrão internacional **PDF/X-1a (ISO 15930-1)** é o formato de intercâmbio cego mais amplamente exigido na indústria gráfica tradicional. Ele impõe restrições estritas de conformidade:
1. Todo o conteúdo deve estar em CMYK ou Gray (espaços DeviceRGB e Lab são estritamente proibidos).
2. O arquivo deve declarar um `/OutputIntent` com identificador de condição de saída e perfil ICC CMYK embutido (padrão FOGRA39 / ISO Coated v2 ECI).
3. Não são permitidas camadas opcionais (OCG / `/OCProperties`), pois o PDF/X-1a é baseado na especificação PDF 1.3.
4. Transparências não achatadas são proibidas.
5. Todas as curvas, textos e marcas vetoriais devem ser preservados sem rasterização para manter a máxima nitidez e fidelidade.

---

## 2. Decisões

### Decisão 1: Pipeline QDF Puro em C# Sem Rasterização
- Todo o fatiamento e ajuste geométrico de `/MediaBox` e `/CropBox` é executado diretamente sobre o content stream e objetos PDF gerenciados em C# via QDF.
- Não há reinterpretação ou rasterização gráfica de vetores, preservando 100% da resolução e nitidez dos traços originais.

### Decisão 2: Perfil ICC Padrão FOGRA39 Embutido
- O perfil de saída padrão adotado é o **FOGRA39** (*ISO Coated v2 ECI*), padrão do mercado gráfico brasileiro e europeu.
- O perfil ICC é embutido como objeto de stream PDF no arquivo de saída e referenciado no dicionário de OutputIntent via chave `/DestOutputProfile`.

### Decisão 3: Seleção de Biblioteca e Arquitetura do Motor (Opção C: QDF Puro no MVP)
- O motor de fatiamento, injeção e validação é implementado **estritamente em C# gerenciado com o parser estrutural QDF**.
- **Sem `pdfium.dll` no MVP:** Elimina a necessidade de binários nativos no repositório (cumprindo a regra do monorepo), eliminando riscos de incompatibilidade RID e falhas de runtime no CI.
- **iText7 é expressamente proibido:** Atendendo à regra explícita de governança do `AGENTS.md` contra licenças AGPL e comerciais restritivas.

### Decisão 4: Política para Camadas OCG em PDF/X-1a (Opção C: Rejeição na Entrada)
- Como a ISO 15930-1 (PDF/X-1a) é baseada em PDF 1.3, camadas OCG (`/OCProperties`) são proibidas por norma.
- Se o PDF fonte contiver `/OCProperties`, a exportação aborta imediatamente lançando `ImpositionException` com o código `ErrorCodes.SourceHasOcg` (`E_SOURCE_HAS_OCG`).
- O operador deve achatar as camadas na pré-impressão antes de enviar ao fluxo de emendas. O suporte a camadas OCG e transparências é planejado para uma etapa posterior via PDF/X-4.

### Decisão 5: Validador Estrutural Parcial (Checklist Reduzido)
- O `PdfxValidator` é classificado formalmente como um **validador estrutural parcial**, com escopo focado em checagens determinísticas de conformidade em QDF:
  - Presença de cabeçalho PDF 1.3+.
  - Presença do dicionário `/OutputIntents` do tipo `/GTS_PDFX`.
  - Stream `/DestOutputProfile` válido com header ICC consistente (`acsp`).
  - Ausência de `/OCProperties`.
  - Ausência de grupos de transparência não achatados (`/Group << /S /Transparency >>`).
  - Ausência de operadores literais `rg`/`RG` e `/DeviceRGB` em recursos e imagens.
- Não cobre validação tipográfica exaustiva de incorporação de fontes raras (que exigiria VeraPDF/SDK externo).

### Decisão 6: Detecção e Abortagem de RGB em 4 Etapas (Regra R-020)
Em cumprimento irrestrito da Regra R-020 (*CMYK sempre, RGB nunca no arquivo final*), a detecção de elementos RGB ocorre em 4 etapas:
1. **Recursos de Espaço de Cor:** Varrer `/ColorSpace` nos dicionários de recursos procurando `/DeviceRGB`.
2. **Perfis ICC Base:** Varrer `/ICCBased` identificando perfis com `/N 3` (RGB).
3. **Content Streams:** Varrer operadores de cor gráfica procurando `rg` e `RG` literais não mapeados para espaços CMYK.
4. **XObjects de Imagem:** Inspecionar `/ColorSpace` de imagens raster rejeitando `/DeviceRGB` ou ICC com 3 componentes.
- Se qualquer uma dessas etapas detectar elementos RGB, o fluxo aborta lançando `ImpositionException(ErrorCodes.ExportSourceNotCmyk, ...)` (`E_EXPORT_SOURCE_NOT_CMYK`).

### Decisão 7: Validação Rigorosa de Perfil ICC
A injeção de OutputIntent valida o stream ICC antes de inseri-lo no PDF:
- Tamanho mínimo obrigatório de 128 bytes (tamanho fixo do cabeçalho da especificação ICC.1).
- Assinatura mágica obrigatória nos bytes 36–39 contendo `'a', 'c', 's', 'p'` (`0x61637370`).
- Campo big-endian `Profile Size` (bytes 0–3) consistente com o comprimento real do buffer.
- Falhas nessa validação disparam `ImpositionException(ErrorCodes.InvalidIccProfile, ...)` (`E_INVALID_ICC_PROFILE`).

### Decisão 8: Atualização Incremental (Incremental Update) para Xref
- Para garantir compatibilidade com PDFs 1.5+ (que utilizam Xref Streams e Object Streams comprimidos), a injeção do OutputIntent utiliza **Incremental Update**:
  - Anexa novos objetos ao final do PDF existente.
  - Atualiza o `/Catalog` (`/Root`) referenciando `/OutputIntents`.
  - Escreve nova seção de xref e novo trailer apontando para a raiz anterior (`/Prev`).
  - Preserva 100% da integridade original e evita corrupção por reindexação global.

### Decisão 9: Nomenclatura, Escrita Atômica e Resultados por Painel
- Nomenclatura dos arquivos gerados: `{job}_painel_{index:D2}.pdf` (zero-padded com 2 dígitos).
- Escrita atômica: gravação em arquivo temporário `.tmp.pdf` com posterior `File.Move(..., overwrite: true)`.
- Contrato de resultado com granularidade por painel:
  ```csharp
  public sealed record PdfxExportResult(
      IReadOnlyList<string> GeneratedFiles,
      IReadOnlyList<PdfxValidationResult> PerPanelResults,
      TimeSpan ElapsedTime)
  {
      public bool AllCompliant => PerPanelResults.Count > 0 && PerPanelResults.All(r => r.IsCompliant);
  }
  ```

---

## 3. Consequências

- **Positivas:**
  - Exportação vetorial pura sem distorção ou perda de nitidez de traços e textos.
  - Total conformidade com a política de governança do monorepo (zero dependências de binários nativos no git/CI).
  - Isolamento de testes de pré-impressão rápidos e determinísticos.
  - RIPs de impressão recebem arquivos no padrão universal da indústria (PDF/X-1a CMYK FOGRA39).
- **Negativas / Limitações:**
  - Arquivos contendo camadas OCG ou transparências não achatadas são rejeitados na entrada, exigindo intervenção prévia do operador de pré-impressão.
