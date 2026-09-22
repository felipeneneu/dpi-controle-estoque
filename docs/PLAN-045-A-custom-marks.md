---
Contexto: "Injeção de PDFs externos como Marks"
Domínio: imposition-pdf
Status: Draft
Referências: ADR-045, ADR-046
---
# PLAN-045-A: Custom Marks (--mark-file)

## Escopo IN/OUT
- **IN**: Adição de --mark-type custom e --mark-file <path> na interface CLI.
- **IN**: Conversão de um PDF de marca externa em XObject e overlay nas 4 quinas.
- **OUT**: Preflight do arquivo de marca (assume-se confiável).

## Arquivos a tocar
- packages/imposition-pdf/src/Imposition.Pdf/Contracts/MarksOptions.cs (Atualizado)
- packages/imposition-pdf/src/Imposition.Pdf/MarksRenderer.cs (implementar injeção XObject)
- sidecars/AutoImposerCLI/Program.cs (parse das flags)

## Fórmulas / Matemática
- X = TrimBox.Left - Offset - Mark.Width
- Y = TrimBox.Bottom - Offset - Mark.Height

## Testes Previstos
- **BR-MRK-01**: InjetaMarcaCustomizada_GeraXObjectPdf.
- **BR-MRK-02**: ArquivoMarcaNaoEncontrado_FalhaGraciosamente.
- **BR-MRK-GM**: GoldenMaster_ImposicaoComMarcaCustomizada_Canonica.

## Guardrails e STOP conditions
- Garantir cache do arquivo de marca (ler o XObject 1 vez e reusar).

<source: file:29>
