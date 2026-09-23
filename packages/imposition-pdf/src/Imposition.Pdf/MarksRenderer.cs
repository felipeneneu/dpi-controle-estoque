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
        MarksOptions options,
        out Dictionary<string, string> requiredSpots)
    {
        requiredSpots = new Dictionary<string, string>();
        
        var spec = Imposition.Pdf.Marks.MarkSpecs.All.FirstOrDefault(s => s.Type == options.Type) 
                   ?? Imposition.Pdf.Marks.MarkSpecs.All[0];

        const double MmToPt = 72.0 / 25.4;
        var offset = spec.OffsetMm * MmToPt;
        var size = spec.SizeMm * MmToPt;
        var width = spec.StrokePt;

        var sb = new StringBuilder();
        sb.AppendLine("q");
        
        if (spec.HasRdgFill)
        {
            var (res, setup) = Imposition.Pdf.Marks.SpotRegistry.BuildSeparation(spec.RdgSpotName, 0, 0, 0, 0);
            requiredSpots[spec.RdgSpotName] = res;
            
            sb.AppendLine(setup);
            double fillBorder = spec.RdgBorderMm * MmToPt;
            double fillSize = size + fillBorder * 2;
            
            // Bottom-Left
            sb.AppendLine($"{N(gradeLeftPt - offset - fillBorder)} {N(gradeBottomPt - offset - fillBorder)} {N(fillSize)} {N(fillSize)} re f");
            // Bottom-Right
            sb.AppendLine($"{N(gradeRightPt + offset - size - fillBorder)} {N(gradeBottomPt - offset - fillBorder)} {N(fillSize)} {N(fillSize)} re f");
            // Top-Left
            sb.AppendLine($"{N(gradeLeftPt - offset - fillBorder)} {N(gradeTopPt + offset - size - fillBorder)} {N(fillSize)} {N(fillSize)} re f");
            // Top-Right
            sb.AppendLine($"{N(gradeRightPt + offset - size - fillBorder)} {N(gradeTopPt + offset - size - fillBorder)} {N(fillSize)} {N(fillSize)} re f");
        }

        sb.AppendLine($"{N(width)} w");
        
        if (spec.SpotName != null)
        {
            var (res, setup) = Imposition.Pdf.Marks.SpotRegistry.BuildSeparation(spec.SpotName, 0, 0, 0, 1);
            requiredSpots[spec.SpotName] = res;
            sb.AppendLine(setup.TrimEnd());
        }
        else
        {
            sb.AppendLine("0 0 0 RG"); // stroke preto (K)
        }

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

    private static string N(double d) => d.ToString(CultureInfo.InvariantCulture);

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
