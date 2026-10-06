# seams-export-pdfx1a Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Exportar painéis de banners/lonas subdivididos pelo módulo de emendas (`seams`) como arquivos PDF/X-1a (ISO 15930-1) preservando vetores, com perfil ICC CMYK embutido (FOGRA39), nomenclatura padronizada e preflight estrutural parcial em QDF puro.

**Architecture:** Fatiamento geométrico de `/CropBox` e `/MediaBox` gerenciado em C# via QDF com injeção incremental de `/OutputIntents` (ICC FOGRA39 validado via signature `acsp`) e validação estrutural pós-exportação (sem dependência de `qpdf.exe` nem `pdfium.dll` no MVP). Aborta na entrada se houver `DeviceRGB` (R-020) ou camadas OCG (incompatíveis com PDF/X-1a).

**Tech Stack:** .NET 10, C# 13, QDF / PDF ISO 32000 puro gerenciado, xUnit, FluentAssertions.

---

### Task 0: ADR-054 (Contrato de Exportação PDF/X-1a), Reserva BR-055 e Reserva de ErrorCodes

**Files:**
- Create: `docs/governance/adr/ADR-054-pdfx1a-export-contract.md`
- Modify: `docs/governance/ADR_INDEX.md` (append-only — **R-009**)
- Modify: `docs/business/BUSINESS_RULES.md` (reserva `BR-055`)
- Modify: `packages/imposition-core/src/Imposition.Core/Errors/ImpositionException.cs` (reservar `SourceHasOcg` e `InvalidIccProfile`)

**Step 1: Reservar códigos de erro em `ErrorCodes`**
- Adicionar em `packages/imposition-core/src/Imposition.Core/Errors/ImpositionException.cs`:
  ```csharp
  public const string SourceHasOcg       = "E_SOURCE_HAS_OCG";
  public const string InvalidIccProfile   = "E_INVALID_ICC_PROFILE";
  ```

**Step 2: Criar o documento ADR-054**
- Formalizar as decisões:
  1. Pipeline QDF puro em C# sem rasterização.
  2. Perfil ICC padrão FOGRA39 embutido.
  3. Seleção de biblioteca: Opção C (QDF Puro no MVP, zero binários ou dependências nativas no runtime/CI). Rejeição explícita do iText7.
  4. Política OCG: rejeição com `E_SOURCE_HAS_OCG` (PDF/X-1a não suporta OCG).
  5. Escopo do validador: validador estrutural parcial (checklist reduzido).
  6. Regra R-020: detecção em 4 etapas (recursos, ICC N=3, operadores rg/RG, imagens) abortando com `E_EXPORT_SOURCE_NOT_CMYK`.
  7. Atualização de Xref via Incremental Update.
  8. Nomenclatura `<job>_painel_<NN>.pdf` e escrita atômica via `.tmp`.

**Step 3: Atualizar ADR_INDEX.md**
- Registrar ADR-054 na tabela sem read-modify-write de todo o arquivo (R-009).

**Step 4: Reservar BR-055 em BUSINESS_RULES.md**
- Adicionar linha para BR-055 (`imposition/export-pdfx1a`).

---

### Task 0.5: Resolver Tech Debt `qpdf.exe` em `imposition-pdf`

**Files:**
- Modify: `packages/imposition-pdf/tests/Imposition.Pdf.Tests/PdfImposerTests.cs`
- Create: `packages/imposition-pdf/tests/Imposition.Pdf.Tests/TestHelpers/PdfInspector.cs`

**Step 1: Criar helper de inspeção e buffers QDF sintéticos**
- Implementar `TestHelpers/PdfInspector.cs` e gerador de QDF com/sem OCG em memória/disco temporário.

**Step 2: Reescrever os 5 testes legados**
- `BR_043_a_ImposePreservesOcg`: testar fluxo N-up com QDF sintético contendo OCG.
- `BR_043_c_NoOcgThrowsException`: testar lançamento de exceção quando não há OCG.
- `BR_043_d_TempFilePathIsValid`: testar resiliência de caminhos temporários.
- `BR_044_a_CropMarksDrawn`: verificar operadores de marcas de corte (`0 0 0 RG`, `S Q`) diretamente no QDF gerado sem invocar `qpdf.exe`.
- `BR_044_b_MimakiTipo1MarksDrawn`: verificar operadores das marcas Mimaki Tipo 1 no QDF sem `qpdf.exe`.

**Step 3: Executar testes de imposition-pdf**
- Executar: `dotnet test packages/imposition-pdf/tests/Imposition.Pdf.Tests`
- Critério: **34/34 testes verdes** sem dependência de executáveis externos.

---

### Task 1: `PdfxOutputIntentInjector` com Validação Real de Perfil ICC

**Files:**
- Create: `packages/imposition-pdf/src/Imposition.Pdf/Preflight/PdfxOutputIntent.cs`
- Create: `packages/imposition-pdf/src/Imposition.Pdf/Preflight/PdfxOutputIntentInjector.cs`
- Create: `packages/imposition-pdf/tests/Imposition.Pdf.Tests/Preflight/PdfxOutputIntentInjectorTests.cs`

**Step 1: Escrever testes com falha (TDD)**
- Cenários:
  1. Injeção de OutputIntent em PDF/QDF sem OutputIntent pré-existente.
  2. Idempotência: não duplica se já existir.
  3. Rejeita bytes vazios ou nulos lançando `E_INVALID_ICC_PROFILE`.
  4. Rejeita buffer de 128+ bytes aleatórios sem assinatura `'acsp'` (bytes 36–39) lançando `E_INVALID_ICC_PROFILE`.
  5. Rejeita ICC truncado (tem `'acsp'`, mas tamanho total < declared size no header) lançando `E_INVALID_ICC_PROFILE`.
  6. Aceita perfil ICC real válido (FOGRA39).

**Step 2: Implementar contratos e injeção incremental**
- Validação estrita do header ICC (tamanho >= 128, profile size consistente, bytes 36–39 == 0x61637370).
- Injetar no `/Root` do catálogo a referência para `/OutputIntents [ << /Type /OutputIntent /S /GTS_PDFX ... >> ]`.
- Embutir o stream de bytes ICC com `/Length` e `/N 4`.
- Aplicar escrita via append incremental preservando o xref original.

**Step 3: Executar testes**
- Executar: `dotnet test packages/imposition-pdf/tests/Imposition.Pdf.Tests --filter FullyQualifiedName~Preflight`
- Critério: Todos aprovados.

---

### Task 2: `QdfPanelSplitter`

**Files:**
- Create: `packages/imposition-pdf/src/Imposition.Pdf/Seams/QdfPanelSplitter.cs`
- Create: `packages/imposition-pdf/tests/Imposition.Pdf.Tests/Seams/QdfPanelSplitterTests.cs`

**Step 1: Escrever testes com falha (TDD)**
- Cenários:
  1. Subdivisão de arte em 3 painéis verticais gerando 3 arquivos com `/CropBox` e `/MediaBox` ajustados.
  2. Preservação integral do content stream original (sem rasterização de vetores).
  3. Rejeição com `E_SOURCE_HAS_OCG` se o PDF fonte tiver `/OCProperties`.
  4. Detecção e rejeição com `E_EXPORT_SOURCE_NOT_CMYK` se houver RGB (nos 4 pontos: recursos /ColorSpace, ICC /N 3, operadores rg/RG no stream, imagem XObject).
  5. Respeito ao `CancellationToken` (limpeza de parciais temporários).

**Step 2: Implementar `QdfPanelSplitter`**
- Calcular janelas em pontos (`pt = 72.0 / 25.4`).
- Injetar linha-guia K40% se o painel possuir sobreposição ativa (`PdfSeamGuideInjector`).
- Fatiar geometricamente os limites visíveis.

**Step 3: Executar testes**
- Executar: `dotnet test packages/imposition-pdf/tests/Imposition.Pdf.Tests --filter FullyQualifiedName~Splitter`
- Critério: Todos aprovados.

---

### Task 3: `PdfxPanelExporter` com Contrato Formal `PerPanelResults`

**Files:**
- Create: `packages/imposition-pdf/src/Imposition.Pdf/Seams/PdfxExportOptions.cs`
- Create: `packages/imposition-pdf/src/Imposition.Pdf/Seams/PdfxExportResult.cs`
- Create: `packages/imposition-pdf/src/Imposition.Pdf/Seams/PdfxPanelExporter.cs`
- Create: `packages/imposition-pdf/tests/Imposition.Pdf.Tests/Seams/PdfxPanelExporterTests.cs`

**Step 1: Formalizar contrato `PdfxExportResult`**
```csharp
public sealed record PdfxExportResult(
    IReadOnlyList<string> GeneratedFiles,
    IReadOnlyList<PdfxValidationResult> PerPanelResults,
    TimeSpan ElapsedTime)
{
    public bool AllCompliant => PerPanelResults.Count > 0 && PerPanelResults.All(r => r.IsCompliant);
}
```

**Step 2: Escrever testes com falha (TDD)**
- Cenários:
  1. Exportação completa de N painéis aplicando `PdfxOutputIntent` em cada um.
  2. Nomenclatura zero-padded `{job}_painel_{index:D2}.pdf`.
  3. Escrita atômica: cria `.tmp` e move com `File.Move`.
  4. Progresso reportado via `IProgress<double>` (0.0 até 1.0).
  5. Regra R-019: campos `GeneratedFiles`, `PerPanelResults` e `ElapsedTime` preenchidos após o término.

**Step 3: Implementar `PdfxPanelExporter`**
- Orquestrar `QdfPanelSplitter` + `PdfxOutputIntentInjector` + `PdfxValidator`.

**Step 4: Executar testes**
- Executar: `dotnet test packages/imposition-pdf/tests/Imposition.Pdf.Tests --filter FullyQualifiedName~ExporterTests`
- Critério: Todos aprovados.

---

### Task 4: `PdfxValidator` (Validador Estrutural Parcial)

**Files:**
- Create: `packages/imposition-pdf/src/Imposition.Pdf/Preflight/PdfxValidator.cs`
- Create: `packages/imposition-pdf/tests/Imposition.Pdf.Tests/Preflight/PdfxValidatorTests.cs`

**Step 1: Escrever testes com falha (TDD)**
- Cenários:
  1. PDF/X-1a válido retorna `IsCompliant = true` e lista de issues vazia.
  2. Ausência de `/OutputIntents` retorna `IsCompliant = false` com issue específica.
  3. Detecção de `/OCProperties` retorna `IsCompliant = false`.
  4. Detecção de operadores literais `rg`/`RG` ou `/DeviceRGB` retorna `IsCompliant = false`.
  5. Transparência não achatada retorna `IsCompliant = false`.

**Step 2: Implementar `PdfxValidator`**
- Parser estrutural de preflight checando dicionários do `/Catalog` e content streams.

**Step 3: Executar testes**
- Executar: `dotnet test packages/imposition-pdf/tests/Imposition.Pdf.Tests --filter FullyQualifiedName~Validator`
- Critério: Todos aprovados.

---

### Task 5: Smoke E2E

**Files:**
- Create: `packages/imposition-pdf/tests/Imposition.Pdf.Tests/Seams/PdfxPanelExporterIntegrationTests.cs`

**Step 1: Criar cenário de teste ponta a ponta**
- Gerar PDF CMYK sintético com curvas vetoriais (ex: banner de 3000x1000 mm).
- Processar cálculo de emendas com `SeamsEngine` (rolo 1520 mm, overlap 10 mm).
- Exportar painéis via `PdfxPanelExporter`.
- Validar que todos os painéis gerados possuem `AllCompliant == true`, arquivos em disco existem e não contêm artefatos de rasterização.

**Step 2: Executar testes e validar suíte completa**
- Executar:
  ```powershell
  dotnet test packages/imposition-core/tests/Imposition.Core.Tests
  dotnet test packages/imposition-render/tests/Imposition.Render.Tests --filter Category!=Performance
  dotnet test packages/imposition-pdf/tests/Imposition.Pdf.Tests
  ```
- Critério: 100% dos testes aprovados, zero warnings.
