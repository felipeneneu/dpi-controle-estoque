using PdfSharp.Pdf;
using PdfSharp.Pdf.Content;
using PdfSharp.Pdf.Content.Objects;
using PdfSharp.Pdf.IO;

namespace AutoImposerCLI.Imposition;

/// <summary>
/// Read-back da contagem real de formas desenhadas no PDF gerado (ADR-023).
/// Conta operadores Do no content stream — cada DrawImage vetorizado gera um
/// "Do" (prova feita no PR #3a: 1015 DrawImage = 1015 Do, ADR-017 preservado).
/// Retorna -1 quando o PDF não é inspecionável (best-effort, nunca bloqueia).
/// </summary>
public static class PdfReadBack
{
    public static int CountDrawnUnits(string pdfPath)
    {
        try
        {
            using var doc = PdfReader.Open(pdfPath, PdfDocumentOpenMode.Import);
            var total = 0;
            foreach (var page in doc.Pages)
            {
                var seq = ContentReader.ReadContent(page);
                total += CountDo(seq);
            }
            return total;
        }
        catch
        {
            return -1;
        }
    }

    private static int CountDo(CSequence seq)
    {
        var count = 0;
        foreach (var o in seq)
        {
            switch (o)
            {
                case COperator { OpCode.OpCodeName: OpCodeName.Do }:
                    count++;
                    break;
                case COperator op when op.Operands is not null:
                    count += CountDo(op.Operands);
                    break;
                case CSequence nested:
                    count += CountDo(nested);
                    break;
            }
        }
        return count;
    }
}