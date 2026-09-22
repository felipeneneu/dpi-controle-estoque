using System.Globalization;
using System.Text;
using Imposition.Pdf.Contracts;

namespace Imposition.Pdf;

/// <summary>
/// Desenha marcas L-shape nos 4 cantos da grade.
/// </summary>
internal static class MarksRenderer
{
    /// <summary>
    /// Gera o content stream com as 4 marcas em pontos (pt).
    /// </summary>
    public static string GenerateContentStream(
        double gradeLeftPt,
        double gradeBottomPt,
        double gradeRightPt,
        double gradeTopPt,
        MarksOptions options)
    {
        const double MmToPt = 72.0 / 25.4;
        var offset = options.OffsetMm * MmToPt;
        var size = options.SizeMm * MmToPt;
        var width = options.LineWidthPt;

        var sb = new StringBuilder();
        sb.AppendLine("q");
        sb.AppendLine($"{width.ToString(CultureInfo.InvariantCulture)} w");
        sb.AppendLine("0 0 0 RG"); // stroke preto (K)

        // Canto inferior esquerdo (bottom-left)
        AppendCorner(sb, gradeLeftPt - offset, gradeBottomPt - offset, 1, 1, size);
        
        // Canto inferior direito (bottom-right)
        AppendCorner(sb, gradeRightPt + offset, gradeBottomPt - offset, -1, 1, size);
        
        // Canto superior esquerdo (top-left)
        AppendCorner(sb, gradeLeftPt - offset, gradeTopPt + offset, 1, -1, size);
        
        // Canto superior direito (top-right)
        AppendCorner(sb, gradeRightPt + offset, gradeTopPt + offset, -1, -1, size);

        sb.AppendLine("Q");

        return sb.ToString();
    }

    private static void AppendCorner(
        StringBuilder sb,
        double x, double y,
        int dirX, int dirY,
        double size)
    {
        var ci = CultureInfo.InvariantCulture;
        // Linha horizontal
        sb.AppendLine($"{x.ToString(ci)} {y.ToString(ci)} m");
        sb.AppendLine($"{(x + dirX * size).ToString(ci)} {y.ToString(ci)} l");
        sb.AppendLine("S");
        // Linha vertical
        sb.AppendLine($"{x.ToString(ci)} {y.ToString(ci)} m");
        sb.AppendLine($"{x.ToString(ci)} {(y + dirY * size).ToString(ci)} l");
        sb.AppendLine("S");
    }
}
