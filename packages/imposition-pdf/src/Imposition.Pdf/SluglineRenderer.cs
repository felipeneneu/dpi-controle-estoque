using System.Globalization;
using System.Text;
using Imposition.Core.Slugline;

namespace Imposition.Pdf;

/// <summary>
/// Escreve o texto da slugline como objeto de texto PDF (ADR-047, Decisao 4):
/// <c>BT /F1 ... Tf ... Td (...) Tj ET</c> no content stream, no mesmo espaco
/// das marcas de corte. O catalogo de OCG nao e tocado — a preservacao de
/// camadas vem do QDF, nao de PdfSharp (ADR-043).
/// O <see cref="SluglinePlacement"/> NAO e calculado aqui: a geometria e o texto
/// sao decididos pelo <c>SluglineCalculator</c> do core (fonte unica de verdade);
/// este renderer so converte mm -> pt e escreve operadores.
/// </summary>
internal static class SluglineRenderer
{
    /// <summary>Fator de conversao mm -> pt (ISO 32000: 1pt = 25.4/72 mm).</summary>
    internal const double MmToPt = 72.0 / 25.4;

    /// <summary>
    /// Gera o content stream PDF com a slugline. As coordenadas de entrada da
    /// chapa estao em pt; as do placement, em mm relativos a chapa.
    /// Devolve string vazia quando nao ha texto a desenhar.
    /// </summary>
    public static string GenerateContentStream(
        SluglinePlacement placement,
        double sheetLeftPt,
        double sheetBottomPt)
    {
        if (string.IsNullOrWhiteSpace(placement.Text))
            return string.Empty;

        // O texto ja vem normalizado para latin-1 do core (ADR-047, Decisao 3),
        // compativel com o /WinAnsiEncoding declarado no recurso /Font da pagina.
        var sb = new StringBuilder();
        sb.AppendLine("BT");
        sb.AppendLine($"/F1 {N(MmToPt * placement.FontSizeMm)} Tf");
        sb.AppendLine($"{N(TextLeftPt(placement, sheetLeftPt))} {N(sheetBottomPt + MmToPt * placement.BaselineYMm)} Td");
        sb.AppendLine($"({Escape(placement.Text)}) Tj");
        sb.AppendLine("ET");

        return sb.ToString();
    }

    /// <summary>
    /// X do canto esquerdo do texto: ancora centrada menos metade da largura
    /// estimada, para o rodape ficar no meio da chapa.
    /// </summary>
    private static double TextLeftPt(SluglinePlacement placement, double sheetLeftPt)
    {
        double anchorCenterXPagePt = sheetLeftPt + MmToPt * placement.AnchorXCenterMm;
        double textWidthPt = MmToPt
            * SluglineFormatter.EstimateTextWidthMm(placement.Text, placement.FontSizeMm);
        return anchorCenterXPagePt - textWidthPt / 2.0;
    }

    /// <summary>
    /// Escapa os delimitadores de string literal do PDF (ISO 32000 §7.3.4.2).
    /// Sem isso, um "(" no nome do arquivo fecharia a string e corromperia o
    /// content stream inteiro.
    /// </summary>
    private static string Escape(string text)
        => text.Replace("\\", "\\\\", StringComparison.Ordinal)
               .Replace("(", "\\(", StringComparison.Ordinal)
               .Replace(")", "\\)", StringComparison.Ordinal);

    /// <summary>
    /// Numero real sem notacao exponencial (ISO 32000-1 §7.3.3 proibe "1E-05").
    /// Mesmo formato do <c>MarksRenderer.N</c>: zero vira "0" e nao "0E+0".
    /// </summary>
    private static string N(double d)
    {
        if (Math.Abs(d) < 1e-6) return "0";
        var s = d.ToString(CultureInfo.InvariantCulture);
        if (s.Contains('E') || s.Contains('e'))
            return d.ToString("0.################", CultureInfo.InvariantCulture);
        return s;
    }
}
