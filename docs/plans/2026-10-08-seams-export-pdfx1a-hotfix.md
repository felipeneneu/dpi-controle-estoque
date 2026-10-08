# seams-export-pdfx1a-hotfix Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Corrigir a exportação de painéis PDF/X-1a implementando clone do documento fonte com Form XObject incremental e origem normalizada em (0,0), garantindo 100% de integridade de imagens, fontes e perfis em RIPs de mercado.

**Architecture:** Encapsula a arte da página original em `/FmOriginal` (/BBox completo do source) preservando streams verbatim e usando wrappers para multi-streams. Cada painel recebe uma nova página com `/MediaBox [0 0 panelW panelH]`, translação `cm`, overlays em coordenadas locais e serialização incremental não-destrutiva (ISO 32000).

**Tech Stack:** C# .NET 10, QDF puro, PDFtoImage v5.4.0 (PDFium) para validação cruzada externa (R-021).

---

### Task 0: Governança — ADR-060, Regras R-022/R-023 no AGENTS.md e BR-055

**Files:**
- Create: `docs/governance/adr/ADR-060-pdf-object-graph-contract.md`
- Modify: `docs/governance/ADR_INDEX.md` (append-only — **R-009**)
- Modify: `AGENTS.md` (adicionar regras R-022 e R-023)
- Modify: `docs/governance/BUSINESS_RULES.md` (atualizar `BR-055`)

**Step 1: Criar ADR-060 documentando as decisões arquiteturais**
- Decisão 1: Clone integral do documento base (single-page) e byte-identity (`0..sourceLen`).
- Decisão 2: Form XObject com translação para origem `(0,0)` e `/BBox [0 0 sourceW sourceH]`.
- Decisão 3: Numeração de novos objetos via `/Size` do trailer final (`maxId = Size - 1`).
- Decisão 4: Preservação verbatim de streams (sem descompressão/recompressão).
- Decisão 5: Form XObject wrapper para arrays multi-stream (`[14 0 R 15 0 R]`).
- Decisão 6: Resolução de `/Resources`, `/MediaBox`, `/CropBox` e `/Rotate` via `/Parent` chain.
- Decisão 7: Validação cruzada com `PDFtoImage` (PDFium) — Regra R-021.
- Decisão 8: Novos códigos de erro: `E_PDF_MULTI_PAGE_UNSUPPORTED`, `E_PDF_TRANSPARENCY_UNSUPPORTED`, `E_PDF_USERUNIT_UNSUPPORTED`, `E_PDF_INVALID_TRAILER`.

**Step 2: Atualizar ADR_INDEX.md em modo append-only (R-009)**
- Adicionar linha da ADR-060 sem tocar nos bytes anteriores do arquivo.

**Step 3: Adicionar Regras R-022 e R-023 no AGENTS.md**
- R-022: Preservação Verbatim em PDF (Form XObject e Incremental Update em vez de descompressão/recompressão).
- R-023: Herança de Propriedades em PDF via `/Parent` Chain.

**Step 4: Atualizar BR-055 em BUSINESS_RULES.md**

**Step 5: Commit**
```bash
git add docs/governance/adr/ADR-060-pdf-object-graph-contract.md docs/governance/ADR_INDEX.md AGENTS.md docs/governance/BUSINESS_RULES.md
git commit -m "docs(governance): ADR-060 e regras R-022/R-023 para exportacao PDF/X-1a"
```

---

### Task 0.5: Auditoria & Reprodução do Bug Atual (TDD RED)

**Files:**
- Create: `packages/imposition-pdf/tests/Imposition.Pdf.Tests/Seams/PdfSplitterAuditTests.cs`

**Step 1: Escrever teste reproduzindo o bug estrutural de 1.824 bytes e página em branco**
- Criar fixture PDF em runtime contendo imagem CMYK DCTDecode e texto.
- Executar `QdfPanelSplitter.SplitAsync`.
- Assert que falha: verificar que o painel gerado atualmente tem tamanho ínfimo (< 3 KB) e objeto de imagem ausente no arquivo.

**Step 2: Executar teste para verificar falha RED esperada**
Run: `dotnet test packages/imposition-pdf/tests/Imposition.Pdf.Tests/Imposition.Pdf.Tests.csproj --filter "FullyQualifiedName~PdfSplitterAuditTests"`
Expected: Teste documenta o bug com precisão (objeto referenciado no `/Resources` não existe no arquivo).

**Step 3: Commit da auditoria**
```bash
git add packages/imposition-pdf/tests/Imposition.Pdf.Tests/Seams/PdfSplitterAuditTests.cs
git commit -m "test(imposition-pdf): auditoria e reproducao RED do bug estrutural de Resources"
```

---

### Task 1: `PdfStructureResolver` & `FormXObjectBuilder`

**Files:**
- Create: `packages/imposition-pdf/src/Imposition.Pdf/Seams/PdfStructureResolver.cs`
- Create: `packages/imposition-pdf/src/Imposition.Pdf/Seams/FormXObjectBuilder.cs`
- Create: `packages/imposition-pdf/tests/Imposition.Pdf.Tests/Seams/PdfStructureResolverTests.cs`

**Step 1: Escrever testes unitários para resolução de estrutura e Form XObject**
- Leitura de `/Size` do trailer final (com e sem updates incrementais anteriores).
- Resolução de `/Resources` direto na página e herdado do nó `/Pages` ancestral (`/Parent` chain).
- Construção de `/FmOriginal` verbatim a partir de stream único (`14 0 R`).
- Construção de `/FmOriginal` container a partir de array multi-stream (`[14 0 R 15 0 R]`).

**Step 2: Rodar testes para garantir que falham (RED)**

**Step 3: Implementar `PdfStructureResolver` e `FormXObjectBuilder`**
- `PdfStructureResolver.ResolveTrailerSize(string pdfContent)`
- `PdfStructureResolver.ResolveResources(PdfObject pageObj, IReadOnlyList<PdfObject> allObjs)`
- `PdfStructureResolver.ResolveRotate(PdfObject pageObj, IReadOnlyList<PdfObject> allObjs)`
- `FormXObjectBuilder.BuildFormXObject(...)`

**Step 4: Rodar testes unitários para garantir sucesso (GREEN)**
Run: `dotnet test packages/imposition-pdf/tests/Imposition.Pdf.Tests/Imposition.Pdf.Tests.csproj --filter "FullyQualifiedName~PdfStructureResolverTests"`
Expected: PASS.

**Step 5: Commit**
```bash
git add packages/imposition-pdf/src/Imposition.Pdf/Seams/ packages/imposition-pdf/tests/Imposition.Pdf.Tests/Seams/
git commit -m "feat(imposition-pdf): implementa PdfStructureResolver e FormXObjectBuilder"
```

---

### Task 2: Integração no `QdfPanelSplitter` com 3 Estágios e Validação Estrita

**Files:**
- Modify: `packages/imposition-pdf/src/Imposition.Pdf/Seams/QdfPanelSplitter.cs`
- Create: `packages/imposition-pdf/src/Imposition.Pdf/Seams/PanelSplitMetadata.cs`
- Modify: `packages/imposition-pdf/src/Imposition.Pdf/Seams/PdfxPanelExporter.cs`
- Create: `packages/imposition-pdf/tests/Imposition.Pdf.Tests/Seams/QdfPanelSplitterValidationTests.cs`

**Step 1: Escrever 6 testes dedicados de pré-vôo para as rejeições estritas**
- Teste 1: `/OCProperties` -> `ErrorCodes.SourceHasOcg`
- Teste 2: `/DeviceRGB` -> `ErrorCodes.ExportSourceNotCmyk`
- Teste 3: `/Pages` com `/Count > 1` -> `E_PDF_MULTI_PAGE_UNSUPPORTED`
- Teste 4: `/Group << /S /Transparency /I true >>` -> `E_PDF_TRANSPARENCY_UNSUPPORTED`
- Teste 5: `/UserUnit 2.0` -> `E_PDF_USERUNIT_UNSUPPORTED`
- Teste 6: Trailer sem `/Size` -> `E_PDF_INVALID_TRAILER`

**Step 2: Rodar testes de pré-vôo para confirmar falhas (RED)**

**Step 3: Refatorar `QdfPanelSplitter` para a arquitetura de 3 estágios**
- Executar os 6 checks de pré-vôo.
- Retornar `PanelSplitMetadata` estruturado (arquivos, tamanhos em bytes, hadAnnotations, hadRotate, warnings).
- Executar emissão incremental anexando bytes originais (`0..sourceLen`), novos objetos, tabela `xref` incremental e trailer com `/Prev`.
- Normalizar `/MediaBox [0 0 panelWPt panelHPt]` e `/CropBox [0 0 panelWPt panelHPt]`, aplicando translação `cm`.
- Injetar linha-guia normalizada em coordenadas do painel.

**Step 4: Rodar testes de validação e testes existentes do splitter (GREEN)**
Run: `dotnet test packages/imposition-pdf/tests/Imposition.Pdf.Tests/Imposition.Pdf.Tests.csproj`
Expected: Todos os testes passando com zero warnings.

**Step 5: Commit**
```bash
git add packages/imposition-pdf/src/Imposition.Pdf/Seams/ packages/imposition-pdf/tests/Imposition.Pdf.Tests/Seams/
git commit -m "feat(imposition-pdf): integra 3 estagios, incremental append e PanelSplitMetadata no QdfPanelSplitter"
```

---

### Task 3: Validação Cruzada E2E com `PDFtoImage` (R-021) e Consumo no CLI

**Files:**
- Modify: `packages/imposition-pdf/tests/Imposition.Pdf.Tests/Imposition.Pdf.Tests.csproj` (adicionar `PDFtoImage`)
- Create: `packages/imposition-pdf/tests/Imposition.Pdf.Tests/Seams/PdfxPanelExporterE2ETests.cs`
- Modify: `sidecars/SeamsCLI/Execution/SeamsWorkflowExecutor.cs` (aviso de 500 MB e consumo de warnings do `PanelSplitMetadata`)

**Step 1: Adicionar dependência NuGet `PDFtoImage` v5.4.0 ao projeto de testes**

**Step 2: Escrever testes E2E com as 5 validações obrigatórias**
- V1: Tamanho de disco > 100 KB.
- V2: `PDFtoImage` abre o documento sem erro.
- V3: Dimensões físicas conferem com `OutputWidthMm` e `OutputHeightMm`.
- V4: Renderização não-branca comprovada (inspeção de buffer de pixels renderizados).
- V5: Byte-identity verificado via streaming por chunks de 1 MB (`source[0..len] == panel[0..len]`).
- Salvar painéis gerados em `.tmp/e2e-output/`.

**Step 3: Implementar consumo de metadados no `SeamsWorkflowExecutor`**
- Avisar em stderr e adicionar warning se algum painel exceder 500 MB.

**Step 4: Rodar suíte de testes completa do monorepo**
Run: `dotnet test packages/imposition-pdf/tests/Imposition.Pdf.Tests/Imposition.Pdf.Tests.csproj`
Run: `dotnet test sidecars/SeamsCLI/tests/SeamsCLI.Tests/SeamsCLI.Tests.csproj`
Expected: 100% dos testes aprovados.

**Step 5: Commit**
```bash
git add packages/imposition-pdf/tests/Imposition.Pdf.Tests/ sidecars/SeamsCLI/Execution/
git commit -m "test(imposition-pdf): validacao cruzada E2E com PDFtoImage (R-021) e streaming V5"
```
