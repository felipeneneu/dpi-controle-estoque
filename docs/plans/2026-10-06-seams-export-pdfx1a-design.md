# Design Document: Exportação PDF/X-1a de Painéis de Emenda (`seams-export-pdfx1a`)

**Data:** 2026-10-06  
**Status:** Aprovado  
**Branch Alvo:** `feat/seams-export-pdfx1a`  
**Referência:** `docs/engineering/SEAMS-PLANO-FEATURES.md` (Feature 6)  
**Domínio de Regra de Negócio:** `BR-055` (reservada em `docs/business/BUSINESS_RULES.md`)  
**ADR Correspondente:** `ADR-054` (Contrato de Exportação PDF/X-1a)  

---

## 1. Visão Geral e Contexto

O módulo `seams` subdivide artes de comunicação visual (banners, lonas, fachadas) que excedem a largura física da bobina/rolo da impressora em múltiplos painéis contíguos com sobreposição (*overlap*).

Esta feature implementa a exportação vetorial de cada painel como **PDF/X-1a** (ISO 15930-1), com preservação rigorosa de vetores e curvas (sem rasterização), injeção estrutural do dicionário `/OutputIntents` com perfil CMYK padrão FOGRA39 (*ISO Coated v2 ECI*), nomenclatura padronizada e preflight estrutural de validação pós-exportação.

---

## 2. Decisões Arquiteturais Fechadas (ADR-054)

### Decisão 1: Pipeline QDF Puro em C# (Sem Rasterização)
- O fatiamento e ajuste geométrico de `/MediaBox` e `/CropBox` ocorrem no pipeline QDF/PDF gerenciado em C#.
- Todos os operadores de curva, caminho, fontes e marcas são preservados em sua resolução nativa vetorial.

### Decisão 2: Perfil ICC Padrão FOGRA39
- O padrão da indústria gráfica para impressão CMYK é FOGRA39 (*ISO Coated v2 ECI*).
- O perfil ICC é embutido como stream no PDF de saída e referenciado via `/DestOutputProfile`.

### Decisão 3: Seleção de Biblioteca e Arquitetura do Motor (Opção C: QDF Puro no MVP)
- **Zero Dependências Nativas no MVP:** Para fatiamento, injeção de OutputIntent e validação estrutural parcial, o `imposition-pdf` utiliza **exclusivamente o parser e manipulador estrutural QDF em C# gerenciado**.
- **Independência de `pdfium.dll`:** O motor de exportação e validação não depende de `pdfium.dll` no runtime nem no CI. Isso evita binários no repositório (regra do monorepo), dependências de plataforma RID e problemas de empacotamento.
- **iText7 é expressamente rejeitado** conforme a governança do monorepo (`AGENTS.md` proíbe dependências AGPL ou comerciais restritivas no GraficaOS).

### Decisão 4: Política para Camadas OCG em PDF/X-1a (Ajuste Crítico 1)
- O padrão PDF/X-1a (baseado em PDF 1.3) **proíbe camadas opcionais (OCG)**.
- **Decisão adotada:** Rejeição explícita na entrada. Se o PDF fonte contiver `/OCProperties`, o fluxo aborta com o código de erro `ErrorCodes.SourceHasOcg` (`E_SOURCE_HAS_OCG`), formalmente reservado em `Imposition.Core.Errors.ErrorCodes`. Em banners e comunicação visual, artes com OCG são exceções; o operador deve achatar as camadas na pré-impressão antes do fatiamento. Suporte a PDF com OCG e transparências é escopo futuro (Fase 2 via PDF/X-4).

### Decisão 5: Escopo do `PdfxValidator` como Validador Estrutural Parcial (Ajuste Crítico 2)
- O `PdfxValidator` é classificado honestamente como **validador estrutural parcial (checklist reduzido)** executado via QDF em C#, e não validador ISO completo.
- **O que cobre:**
  - Presença de cabeçalho PDF 1.3+.
  - Presença do dicionário `/OutputIntents` com `/S /GTS_PDFX`.
  - Stream `/DestOutputProfile` válido com header ICC consistente (`acsp`).
  - Ausência de `/OCProperties` (OCG).
  - Ausência de grupos de transparência não achatados (`/Group << /S /Transparency >>`).
  - Ausência de operadores literais `rg`/`RG` e `/DeviceRGB` em recursos e imagens.
- **O que NÃO cobre:**
  - Verificação exaustiva de incorporação de subconjuntos de glifos de fontes raras (que exigiria um parser OpenType/TrueType completo ou VeraPDF).

### Decisão 6: Estratégia de Detecção e Abortagem de RGB (R-020 / Ajuste Crítico 3)
Em cumprimento da Regra R-020 (*CMYK sempre, RGB nunca no arquivo final*), a detecção de RGB ocorre em 4 etapas estritas via scanner QDF:
1. **Recursos de Espaço de Cor:** Procura `/DeviceRGB` em dicionários `/ColorSpace`.
2. **Perfis ICC Base:** Procura `/ICCBased` com componente `/N 3` (3 canais = RGB).
3. **Content Streams:** Varrer tokens gráficos procurando operadores de cor RGB (`rg` para preenchimento e `RG` para traço) que não estejam mapeados em espaços CMYK.
4. **XObjects de Imagem:** Inspecionar `/ColorSpace` de imagens raster embutidas rejeitando `/DeviceRGB` ou ICC com `/N 3`.
- Se qualquer uma dessas condições for detectada, o pipeline aborta com `ImpositionException(ErrorCodes.ExportSourceNotCmyk, ...)`.

### Decisão 7: Validação Rigorosa de Perfil ICC (Header Real)
A injeção e o preflight exigem perfil ICC estritamente válido segundo a especificação ICC.1:
- Tamanho mínimo de 128 bytes (tamanho obrigatório do cabeçalho ICC).
- Tamanho declarado no campo de 4 bytes big-endian inicial (`Profile Size`) consistente com os bytes fornecidos.
- Magic signature nos bytes 36–39 contendo `'a', 'c', 's', 'p'` (`0x61637370`).
- Bytes que violem qualquer desses requisitos causam rejeição imediata com `ErrorCodes.InvalidIccProfile` (`E_INVALID_ICC_PROFILE`).

### Decisão 8: Atualização Incremental para Xref e Escrita Atômica
- **Incremental Update:** Anexa os novos objetos (stream ICC e dicionário OutputIntent) ao final do arquivo com nova tabela/stream de xref e trailer apontando para a raiz anterior (`/Prev`), preservando 100% da integridade original do arquivo.
- **Nomenclatura e Escrita Atômica:** Nomenclatura padrão `{job}_painel_{index:D2}.pdf` gerada inicialmente como `.tmp.pdf` e substituída atomicamente via `File.Move(..., overwrite: true)`.

---

## 3. Contratos Públicos

```csharp
namespace Imposition.Pdf.Preflight;

/// <summary>
/// Especificação de OutputIntent para conformidade PDF/X-1a (ISO 15930-1).
/// </summary>
public sealed record PdfxOutputIntent(
    string OutputConditionIdentifier,   // "FOGRA39"
    string Info,                         // "ISO Coated v2 (ECI)"
    byte[] IccProfileBytes);

/// <summary>
/// Injeta dicionário de OutputIntent via Incremental Update com validação de header ICC.
/// </summary>
public static class PdfxOutputIntentInjector
{
    public static void Inject(string pdfPath, PdfxOutputIntent intent);
}

/// <summary>
/// Resultado da validação estrutural parcial de PDF/X-1a.
/// </summary>
public sealed record PdfxValidationResult(
    bool IsCompliant,
    IReadOnlyList<string> Issues);

/// <summary>
/// Validador estrutural de pré-impressão para conformidade básica com ISO 15930-1 (QDF puro).
/// </summary>
public static class PdfxValidator
{
    public static PdfxValidationResult Validate(string pdfPath);
}
```

```csharp
namespace Imposition.Pdf.Seams;

/// <summary>
/// Parâmetros de exportação de painéis em lote.
/// </summary>
public sealed record PdfxExportOptions(
    PdfxOutputIntent OutputIntent,
    string NamingPattern = "{job}_painel_{index:D2}.pdf");

/// <summary>
/// Desfecho da exportação contendo resultados individuais por painel (Regra R-019).
/// </summary>
public sealed record PdfxExportResult(
    IReadOnlyList<string> GeneratedFiles,
    IReadOnlyList<PdfxValidationResult> PerPanelResults,
    TimeSpan ElapsedTime)
{
    /// <summary>
    /// Retorna verdadeiro se todos os painéis gerados passaram no checklist estrutural.
    /// </summary>
    public bool AllCompliant => PerPanelResults.Count > 0 && PerPanelResults.All(r => r.IsCompliant);
}

/// <summary>
/// Fatiador vetorial baseado em ajuste de CropBox/MediaBox e matrizes de corte.
/// </summary>
public sealed class QdfPanelSplitter
{
    public Task<IReadOnlyList<string>> SplitAsync(
        string sourcePdfPath,
        SeamsResult seams,
        string outputDirectory,
        string namingPattern,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Orquestrador de exportação de painéis PDF/X-1a.
/// </summary>
public sealed class PdfxPanelExporter
{
    public Task<PdfxExportResult> ExportAsync(
        string sourcePdfPath,
        SeamsResult seams,
        string outputDirectory,
        PdfxExportOptions options,
        IProgress<double>? progress = null,
        CancellationToken cancellationToken = default);
}
```

---

## 4. Resolução do Tech Debt `qpdf.exe` (Task 0.5)

### Problema
Cinco testes em `Imposition.Pdf.Tests/PdfImposerTests.cs` falhavam por ausência do binário `qpdf.exe` no PATH e ausência de arquivos reais de cliente na pasta `Fixtures/`:
- `BR_043_a_ImposePreservesOcg`
- `BR_043_c_NoOcgThrowsException`
- `BR_043_d_TempFilePathIsValid`
- `BR_044_a_CropMarksDrawn`
- `BR_044_b_MimakiTipo1MarksDrawn`

### Solução
1. Adotar geração determinística de buffers QDF sintéticos em memória/disco temporário com `CreateSampleQdfWithOcg`, alinhando-se ao padrão já validado em `SluglineRendererIntegrationTests` e `QdfSeamGuideIntegrationTests`.
2. Validar operadores de corte e marcas diretamente no content stream gerado sem depender de `Process.Start("qpdf.exe")`.
3. Resultado esperado: Suíte `imposition-pdf` atinge **34/34 testes verdes** sem necessidade de executáveis externos.

---

## 5. Estratégia de Testes e Cobertura BR-055

| Teste | Escopo | Critério |
|---|---|---|
| `BR_055_a_InjectOutputIntent` | `PdfxOutputIntentInjector` | Adiciona dicionário no catálogo com bytes ICC sem corromper xref. |
| `BR_055_b_RejectRgbSource` | `PdfxPanelExporter` | Lança `E_EXPORT_SOURCE_NOT_CMYK` em presença de RGB nos 4 pontos. |
| `BR_055_c_RejectOcgSource` | `PdfxPanelExporter` | Lança `E_SOURCE_HAS_OCG` se o arquivo contiver camadas OCG. |
| `BR_055_d_PreserveVectors` | `QdfPanelSplitter` | Verifica que objetos vetoriais e curvas não sofreram rasterização. |
| `BR_055_e_AtomicFileWrite` | `PdfxPanelExporter` | Arquivos parciais `.tmp` limpos em caso de cancelamento. |
| `BR_055_f_StructuralValidation` | `PdfxValidator` | Valida checklist ISO 15930-1 estrutural e relata problemas por painel. |
| `BR_055_g_SmokeE2E` | Integração E2E | Fatiamento de banner de 3000x1000mm gera painéis conformes e válidos. |
