# Design Doc: Hotfix `seams-export-pdfx1a` (Form XObject Incremental Viewport)

- **Data:** 2026-10-08
- **Status:** Aprovado via Brainstorming
- **Autor / Time:** GraficaOS Prepress Engine Team
- **ADR Relacionada:** ADR-060
- **Regras Permanentes no AGENTS.md:** R-022, R-023
- **Business Rule:** BR-055

---

## 1. Contexto & Diagnóstico da Causa Raiz

Em testes de fábrica realizados em 2026-10-07/08 com arquivos PDF reais de comunicação visual (~800 KB):
1. O `QdfPanelSplitter` gerava painéis de saída com apenas **1.824 bytes** (quando o esperado seria ~400–800 KB por painel).
2. Softwares de mercado (Adobe Acrobat, Adobe Illustrator e RIPs) abriam os arquivos gerados, mas **renderizavam uma página em branco** ou emitiam erro de objeto ausente.
3. **Causa Raiz Estrutural:** O método `BuildPanelPdf` copiava a string literal do dicionário `/Resources` para dentro de um Form XObject sintético com apenas 5 objetos no arquivo, mas **não emitia os objetos indiretos referenciados** (imagens `/XObject << /Im10 10 0 R >>`, fontes, perfis ICC, etc.) nem na tabela `xref`.

---

## 2. Princípios Arquiteturais & Regras de Governança

### 2.1 Regra R-022: Preservação Verbatim em PDF
> *"Em transformações de PDF, priorizar sempre a preservação de bytes verbatim e mecanismos nativos de composição (Form XObject, Incremental Update) em vez de rotinas de descompressão/recompressão."*

- **Byte-Identity:** Os bytes do PDF fonte permanecem 100% idênticos do offset `0` ao `sourceLength`.
- **Zero Descompressão:** Streams comprimidos (imagens DCTDecode, vetores FlateDecode, LZW, etc.) mantêm seus filtros e comprimentos originais sem modificação de bytes.
- **Form XObject Wrapper para Multi-Stream:** Se `/Contents` for um array `[14 0 R 15 0 R ...]`, cada stream é encapsulado em um sub-form individual (`/SubFm1..K`) e o `/FmOriginal` atua como container executando `q /SubFm1 Do ... /SubFmK Do Q`. Zero parsing/merge de streams compactados.

### 2.2 Regra R-023: Herança de Propriedades via `/Parent` Chain
> *"Herança em PDF é sempre resolvida via `/Parent` chain. Nunca assumir que uma propriedade está presente no objeto folha `/Page`. Propriedades como `/Resources`, `/MediaBox`, `/CropBox` e `/Rotate` podem estar declaradas em nós ancestrais `/Pages` e devem ser resolvidas subindo a hierarquia até encontrar."*

---

## 3. Especificação do Pipeline de Fatiamento (3 Estágios)

### Estágio 1: Pré-Vôo e Validação Estrita (Fail-Fast)
O `QdfPanelSplitter` executa 6 validações estritas antes de iniciar qualquer operação de IO:
1. **Camadas OCG:** Rejeita `/OCProperties` com `ErrorCodes.SourceHasOcg`.
2. **Espaço de Cor RGB:** Rejeita `/DeviceRGB`, `/ICCBased` com 3 canais, operadores `rg`/`RG` e imagens RGB com `ErrorCodes.ExportSourceNotCmyk` (Regra R-020).
3. **Multi-Página no MVP:** Rejeita `/Pages` com `/Count > 1` com `E_PDF_MULTI_PAGE_UNSUPPORTED`.
4. **Transparência não-achatada:** Rejeita `/Page` contendo `/Group << /S /Transparency ... >>` com `E_PDF_TRANSPARENCY_UNSUPPORTED`.
5. **UserUnit não-unitária:** Rejeita `/UserUnit` diferente de 1.0 com `E_PDF_USERUNIT_UNSUPPORTED`.
6. **Trailer Inválido:** Rejeita PDFs sem `/Size` no trailer final com `E_PDF_INVALID_TRAILER`.

### Estágio 2: Resolução de Estrutura e Encapsulamento
1. **Numeração Canônica:** Obtém `origSize` do trailer final. Novos objetos recebem IDs a partir de `origSize`.
   O novo trailer terá `/Size = Math.Max(origSize, lastNewObjId + 1)`.
2. **Resolução de Recursos:** Extrai `/Resources` da página original subindo a cadeia `/Parent` (Regra R-023).
3. **Encapsulamento da Arte Original:**
   - Cria `/FmOriginal` com `/BBox [0 0 sourceWPt sourceHPt]` (dimensões completas da arte original).
   - Se `/Contents` for stream único (`14 0 R`), copia o stream verbatim para `/FmOriginal`.
   - Se `/Contents` for array, cria sub-forms verbatim e um container unificador.

### Estágio 3: Emissão Incremental por Painel
Para cada painel:
1. Grava no arquivo temporário `.tmp` os bytes do PDF original intactos (`0..sourceLength`).
2. Cria novo content stream (`PainelContent`) com:
   ```pdf
   q
   1 0 0 1 -cropXPt -cropYPt cm
   /FmOriginal Do
   Q
   ```
   Seguido dos operadores da linha-guia visual calculados em coordenadas locais do painel `[0..panelWPt, 0..panelHPt]`.
3. Cria a nova `/Page` (`PainelPage`) com `/MediaBox [0 0 panelWPt panelHPt]`, `/CropBox [0 0 panelWPt panelHPt]` e `/Rotate` herdado preservado.
4. Cria o novo `/Pages` (`PainelPages`) e `/Catalog` (`PainelCatalog`) descartando quaisquer `/OutputIntents` pré-existentes do source e delegando a injeção canônica do perfil FOGRA39 ao `PdfxOutputIntentInjector` (ADR-054).
5. Injeta a tabela `xref` incremental e novo trailer com `/Prev <offsetStartXrefOriginal>`.
6. Conclui com escrita atômica via `File.Move(..., overwrite: true)`.

---

## 4. Contrato de Metadados da Biblioteca

O `QdfPanelSplitter` é uma biblioteca pura (sem IO para console nem `Console.Error`). Retorna metadados estruturados:

```csharp
namespace Imposition.Pdf.Seams;

public sealed record PanelSplitMetadata(
    IReadOnlyList<string> GeneratedFiles,
    IReadOnlyList<long> FileSizesBytes,
    IReadOnlyList<string> Warnings);
```

- **Consumo pelo CLI (`SeamsWorkflowExecutor`):**
  - Se algum arquivo em `FileSizesBytes` exceder 500 MB (524.288.000 bytes), emite `[AVISO]` em stderr e adiciona à lista `warnings[]` do `RESULT_JSON`.
  - Propaga quaisquer `Warnings` retornados pelo splitter para a saída do workflow.

---

## 5. Estratégia de Verificação e Validação Cruzada (R-021)

### 5.1 Validador Externo: `PDFtoImage` (PDFium)
- **Pacote NuGet:** `PDFtoImage` v5.4.0 (suporte oficial a .NET 8/9/10, sem dependência de Ghostscript/AGPL).
- **Fallback:** `Docnet.Core` v2.6.0.

### 5.2 Fixtures de Teste
- **Camada Rápida (Unitária / CI):** Gerada programaticamente em runtime com imagem DCTDecode (JPEG CMYK embutido) + texto + retângulos vetoriais + recursos diretos.
- **Camada Complexa (`[Trait("Category", "ComplexPdf")]`):**
  - Array multi-stream com 3+ streams de conteúdo.
  - Form XObject aninhado.
  - Imagem com filtro `/LZWDecode`.
  - Recursos herdados do nó `/Pages` pai.
  - `/Rotate 90`.
  - Perfil `/ICCBased`.

### 5.3 As 5 Validações Obrigatórias por Painel
1. **V1 (Tamanho):** `file.Length > 100 KB` (compatível com source, combate o bug de 1.8 KB).
2. **V2 (Abertura PDFium):** `PDFtoImage` carrega o arquivo sem exceções de sintaxe ou xref.
3. **V3 (Geometria):** Dimensões da página batem com `OutputWidthMm` e `OutputHeightMm` calculados.
4. **V4 (Render Não-Branco):** Renderiza bitmap bruto em memória e comprova que **não é branco puro** (pixels de arte presentes).
5. **V5 (Byte-Identity por Streaming):** Comparação em streaming via buffers de 1 MB:
   ```csharp
   using var source = File.OpenRead(sourcePath);
   using var panel = File.OpenRead(panelPath);
   Assert.True(StreamUtils.ComparePrefix(source, panel, source.Length));
   ```
   Zero estouro de memória no CI com arquivos de centenas de megabytes.

---

## 6. Plano de Rollout (5 Tarefas SDD)

1. **Task 0:** Governança — Criar `ADR-060`, atualizar `ADR_INDEX.md` (append-only R-009), registrar `R-022` e `R-023` no `AGENTS.md` e atualizar `BR-055`.
2. **Task 0.5:** Auditoria & Reprodução RED — Teste reproduzindo o bug atual de 1.8 KB e preenchendo a tabela no ledger.
3. **Task 1:** `PdfStructureResolver` & `FormXObjectBuilder` — Leitura de `/Size`, `/Parent` chain e Form multi-stream wrapper com testes unitários.
4. **Task 2:** Integração no `QdfPanelSplitter` — 3 estágios, serialização incremental, 6 testes de pré-vôo dedicados e retorno de `PanelSplitMetadata`.
5. **Task 3:** Integração no CLI & Smoke E2E com `PDFtoImage` — Validações V1 a V5 e emissão dos PDFs em `.tmp/e2e-output/` para inspeção humana no Acrobat.
