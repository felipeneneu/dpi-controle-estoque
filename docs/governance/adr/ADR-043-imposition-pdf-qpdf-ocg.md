# ADR-043: Imposition.Pdf.dll (QPDF + preservação OCG)

- **Status:** Proposto
- **Data:** 2026-09-20
- **Autor:** Felipe Neneu / GraficaOS Core Team
- **Domínio:** imposition / pre-press / pdf
- **Links:** BR-010, BR-021; complementa ADR-017, ADR-021, ADR-041;
  aplica padrão do spike `spikes/qpdf-csharp-imposition/`.

## Contexto

O `AutoImposerCLI` (Motor 1) usa **PdfSharp** para escrever o PDF
imposto. O gate do PR #4 provou que PdfSharp **achata camadas OCG**
(`/OCProperties`), inviabilizando o fluxo Mimaki (COR, BRANCO, FACA
separados via RasterLink).

Além disso, PdfSharp **reescreve** o PDF (reinterpreta streams, fontes,
transparências), com risco de alterar arquivos de clientes.

Spike em `spikes/qpdf-csharp-imposition/` provou que:
- **QPDF** (Apache 2.0) preserva `/OCProperties` byte-a-byte.
- **C#** manipula o QDF do QPDF para aplicar N-up.
- A **Abordagem B** (QDF editado em C#) é a recomendada.

## Decisão

### 1. Novo pacote `imposition-pdf`

Criar `packages/imposition-pdf/` com `Imposition.Pdf.dll`:
- Referencia `imposition-core` (sem IO) e chama `qpdf.exe`.
- **Permitido IO** (diferente de `imposition-core`, que é puro).
- Consumido por `AutoImposerCLI.exe`, `ImpositorKonica.exe`, futuros.

### 2. Abordagem QDF (não PdfSharp Modify)

Usar **Abordagem B** (edição do QDF em C# + xref própria):
- Sem dependência de comportamento não-documentado do PdfSharp.
- C# controla integralmente a escrita do PDF.
- QPDF preserva os objetos do cliente byte-a-byte.

### 3. Detecção automática de OCG

- PDF **com** OCG → caminho QPDF.
- PDF **sem** OCG → caminho PdfSharp (fallback).
- Aviso no stderr quando o input tem OCG mas `qpdf.exe` não existe.

### 4. Empacotamento

`qpdf.exe` + DLLs distribuídos junto do `AutoImposerCLI.exe` em
`sidecars/bin/cli/qpdf/`. Não commitados (baixados via script).

## Consequências

### Positivas
- **OCG preservado** — Mimaki funciona.
- **Arquivo do cliente intacto** — só posições mudam.
- **Zero dependência comercial** — Apache 2.0 + MIT.
- **C# + QPDF** — sem Python, sem C++.
- **Fallback PdfSharp** para PDFs sem camadas.

### Negativas / Mitigações
- **Dependência do `qpdf.exe`** — empacotado, ~5 MB.
- **QDF é texto** — mais memória em PDFs grandes. Mitigação:
  processar por página.
- **Manutenção do código QDF** — encapsulado em `imposition-pdf`,
  testado com PDFs reais.

### Alternativas rejeitadas
- **PdfSharp Modify (Abordagem A).** Funciona, mas depende de
  comportamento não-documentado.
- **PDFStitcher (Python).** Empacotar Python é anti-padrão.
- **Syncfusion/Aspose.** Licença comercial.
- **iText.** AGPL.
- **Reescrever em C++.** Meses de trabalho.

## Verificação

- Golden-master: PDF com 3 camadas → output com 3 camadas.
- Regressão: PDF sem camadas → comportamento atual.
- `qpdf --check` limpo em todos os outputs.

## Gatilhos para Reavaliação

- QPDF tiver breaking change em versão futura.
- Aparecer PDF com estrutura OCG não-padrão que QPDF não leia.
- Latência do subprocesso QPDF for problemática em produção.

---

`source: spikes/qpdf-csharp-imposition/RESULT.md` · `packages/imposition-core/AGENTS.md:Regra 8` · `docs/engineering/IMPOSICAO-MOTOR.md:§3`
