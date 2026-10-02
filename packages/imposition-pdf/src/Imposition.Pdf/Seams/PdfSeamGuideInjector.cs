using System.Globalization;
using System.Text;
using Imposition.Core.Seams;

namespace Imposition.Pdf.Seams;

/// <summary>
/// Injeta linhas-guia de emenda vetoriais diretamente no content stream PDF (ADR-051, BR_053).
/// Utiliza operadores nativos PDF (q, k, w, m, l, S, Q) sem rasterizar e sem tocar nas camadas OCG.
/// </summary>
internal static class PdfSeamGuideInjector
{
    /// <summary>Fator de conversão mm -> pt (ISO 32000: 1 pt = 25.4 / 72 mm).</summary>
    internal const double MmToPt = 72.0 / 25.4;

    /// <summary>
    /// Gera os operadores de content stream PDF para desenhar a linha-guia de emenda.
    /// Retorna string vazia se o guide for nulo.
    /// </summary>
    public static string GenerateContentStream(
        GuideLineDefinition? guide,
        double pageLeftPt,
        double pageBottomPt)
    {
        if (guide == null)
            return string.Empty;

        // Determina se a linha é horizontal (quando X == 0 e Y > 0) ou vertical (caso padrão)
        var isHorizontal = Math.Abs(guide.XPositionMm) < 1e-6 && guide.YPositionMm > 0.0;

        double x1Pt = pageLeftPt + (guide.XPositionMm * MmToPt);
        double y1Pt = pageBottomPt + (guide.YPositionMm * MmToPt);
        double x2Pt;
        double y2Pt;

        if (isHorizontal)
        {
            x2Pt = x1Pt + (guide.LengthMm * MmToPt);
            y2Pt = y1Pt;
        }
        else
        {
            x2Pt = x1Pt;
            y2Pt = y1Pt + (guide.LengthMm * MmToPt);
        }

        var sb = new StringBuilder();
        sb.AppendLine("q");
        sb.AppendLine($"{N(guide.Cyan)} {N(guide.Magenta)} {N(guide.Yellow)} {guide.Black.ToString("0.00", CultureInfo.InvariantCulture)} k");
        sb.AppendLine($"{N(guide.ThicknessPt)} w");
        sb.AppendLine($"{N(x1Pt)} {N(y1Pt)} m");
        sb.AppendLine($"{N(x2Pt)} {N(y2Pt)} l");
        sb.AppendLine("S");
        sb.AppendLine("Q");

        return sb.ToString();
    }

    /// <summary>
    /// Formata número real sem notação exponencial (ISO 32000-1 §7.3.3 proíbe '1E-05').
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
