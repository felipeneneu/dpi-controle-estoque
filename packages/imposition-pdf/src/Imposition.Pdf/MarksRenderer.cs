using System.Globalization;
using System.Text;
using Imposition.Pdf.Contracts;

namespace Imposition.Pdf;

/// <summary>
/// Desenha marcas L-shape nos 4 cantos da grade.
/// Cada canto tem uma orientação distinta para formar uma "moldura"
/// apontando para dentro da área útil.
/// </summary>
internal static class MarksRenderer
{
    /// <summary>Fator de conversão mm → pt (ISO 32000: 1pt = 25.4/72 mm).</summary>
    internal const double MmToPt = 72.0 / 25.4;

    /// <summary>
    /// Gera o content stream PDF com as 4 marcas nos cantos da grade.
    /// Todas as coordenadas de entrada estão em pt.
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

        var offsetPt = spec.OffsetMm * MmToPt;
        var sizePt = spec.SizeMm * MmToPt;
        // Conversão mm → pt para espessura do traço (1mm → 2.835pt)
        var strokePt = spec.StrokeMm * MmToPt;

        var sb = new StringBuilder();
        sb.AppendLine("q");
        
        if (spec.HasRdgFill)
        {
            var (res, setup) = Imposition.Pdf.Marks.SpotRegistry.BuildSeparation(spec.RdgSpotName, 0, 0, 0, 0);
            requiredSpots[spec.RdgSpotName] = res;
            
            sb.AppendLine(setup);
            double fillBorderPt = spec.RdgBorderMm * MmToPt;
            double fillSizePt = sizePt + fillBorderPt * 2;
            
            // Retângulos de fundo RDG: um por canto, cobrindo exatamente o bounding box da marca L + borda
            // Bottom-Left
            sb.AppendLine($"{N(gradeLeftPt - offsetPt - sizePt - fillBorderPt)} {N(gradeBottomPt - offsetPt - sizePt - fillBorderPt)} {N(fillSizePt)} {N(fillSizePt)} re f");
            // Bottom-Right
            sb.AppendLine($"{N(gradeRightPt + offsetPt - sizePt - fillBorderPt)} {N(gradeBottomPt - offsetPt - sizePt - fillBorderPt)} {N(fillSizePt)} {N(fillSizePt)} re f");
            // Top-Left
            sb.AppendLine($"{N(gradeLeftPt - offsetPt - sizePt - fillBorderPt)} {N(gradeTopPt + offsetPt - fillBorderPt)} {N(fillSizePt)} {N(fillSizePt)} re f");
            // Top-Right
            sb.AppendLine($"{N(gradeRightPt + offsetPt - sizePt - fillBorderPt)} {N(gradeTopPt + offsetPt - fillBorderPt)} {N(fillSizePt)} {N(fillSizePt)} re f");
        }

        sb.AppendLine($"{N(strokePt)} w");
        
        string colorSetup;
        if (spec.SpotName != null)
        {
            var (res, setup) = Imposition.Pdf.Marks.SpotRegistry.BuildSeparation(spec.SpotName, 0, 0, 0, 1);
            requiredSpots[spec.SpotName] = res;
            colorSetup = setup.TrimEnd();
            sb.AppendLine(colorSetup);
        }
        else
        {
            colorSetup = "0 0 0 1 K\n0 0 0 1 k";
            sb.AppendLine(colorSetup); // stroke e fill preto CMYK puro (K)
        }

        // ── 4 marcas L com orientação distinta (moldura) ──────────────
        // Cada marca tem o vértice no canto externo e as hastes apontam
        // para dentro da grade.
        //
        // Coordenadas dos cantos das marcas (em pt):
        // mx = posição X do canto exterior da marca
        // my = posição Y do canto exterior da marca

        // Canto inferior esquerdo: └ — hastes para direita e para cima
        double blX = gradeLeftPt - offsetPt;
        double blY = gradeBottomPt - offsetPt;
        DrawBottomLeft(sb, blX - sizePt, blY - sizePt, sizePt);

        // Canto inferior direito: ┘ — hastes para esquerda e para cima
        double brX = gradeRightPt + offsetPt;
        double brY = gradeBottomPt - offsetPt;
        DrawBottomRight(sb, brX - sizePt, brY - sizePt, sizePt);

        // Canto superior esquerdo: ┌ — hastes para direita e para baixo
        double tlX = gradeLeftPt - offsetPt;
        double tlY = gradeTopPt + offsetPt;
        DrawTopLeft(sb, tlX - sizePt, tlY, sizePt);

        // Canto superior direito: ┐ — hastes para esquerda e para baixo
        double trX = gradeRightPt + offsetPt;
        double trY = gradeTopPt + offsetPt;
        DrawTopRight(sb, trX - sizePt, trY, sizePt);

        sb.AppendLine("Q");

        return sb.ToString();
    }

    /// <summary>
    /// Retorna a expansão necessária do MediaBox em cada lado (em mm)
    /// para acomodar as marcas. Retorna (0,0) se não houver marcas.
    /// </summary>
    public static (double expandWMm, double expandHMm) GetMarksExpansion(MarksOptions? marks)
    {
        if (marks is null) return (0, 0);

        var spec = Imposition.Pdf.Marks.MarkSpecs.All.FirstOrDefault(s => s.Type == marks.Type)
                   ?? Imposition.Pdf.Marks.MarkSpecs.All[0];

        // Cada lado expande offset + size (marca ocupa esse espaço fora da grade)
        double expansionPerSideMm = spec.OffsetMm + spec.SizeMm;

        // Inclui borda RDG se aplicável
        if (spec.HasRdgFill)
            expansionPerSideMm += spec.RdgBorderMm;

        // Total em cada eixo = 2 × expansão por lado
        return (2 * expansionPerSideMm, 2 * expansionPerSideMm);
    }

    internal static string N(double d)
    {
        if (Math.Abs(d) < 1e-6) return "0";
        var s = d.ToString(CultureInfo.InvariantCulture);
        if (s.Contains('E') || s.Contains('e'))
            return d.ToString("0.################", CultureInfo.InvariantCulture);
        return s;
    }

    // ── 4 funções explícitas de desenho por canto ────────────────────
    // Cada uma desenha uma L-shape com orientação fixa.
    // mx, my = canto inferior-esquerdo do bounding box da marca.
    // size = comprimento da haste (em pt).

    /// <summary>Canto superior esquerdo: ┌ — hastes para direita e para baixo.</summary>
    internal static void DrawTopLeft(StringBuilder sb, double mx, double my, double size)
    {
        // Ponto de ancoragem: canto superior esquerdo do bounding box
        // Haste horizontal: (mx, my + size) → (mx + size, my + size)
        // Haste vertical:   (mx, my + size) → (mx, my)
        AppendLine(sb, mx, my + size, mx + size, my + size);
        AppendLine(sb, mx, my + size, mx, my);
    }

    /// <summary>Canto superior direito: ┐ — hastes para esquerda e para baixo.</summary>
    internal static void DrawTopRight(StringBuilder sb, double mx, double my, double size)
    {
        // Ponto de ancoragem: canto superior direito do bounding box
        // Haste horizontal: (mx + size, my + size) → (mx, my + size)
        // Haste vertical:   (mx + size, my + size) → (mx + size, my)
        AppendLine(sb, mx + size, my + size, mx, my + size);
        AppendLine(sb, mx + size, my + size, mx + size, my);
    }

    /// <summary>Canto inferior esquerdo: └ — hastes para direita e para cima.</summary>
    internal static void DrawBottomLeft(StringBuilder sb, double mx, double my, double size)
    {
        // Ponto de ancoragem: canto inferior esquerdo do bounding box
        // Haste horizontal: (mx, my) → (mx + size, my)
        // Haste vertical:   (mx, my) → (mx, my + size)
        AppendLine(sb, mx, my, mx + size, my);
        AppendLine(sb, mx, my, mx, my + size);
    }

    /// <summary>Canto inferior direito: ┘ — hastes para esquerda e para cima.</summary>
    internal static void DrawBottomRight(StringBuilder sb, double mx, double my, double size)
    {
        // Ponto de ancoragem: canto inferior direito do bounding box
        // Haste horizontal: (mx + size, my) → (mx, my)
        // Haste vertical:   (mx + size, my) → (mx + size, my + size)
        AppendLine(sb, mx + size, my, mx, my);
        AppendLine(sb, mx + size, my, mx + size, my + size);
    }

    /// <summary>Desenha uma linha (move-to + line-to + stroke).</summary>
    internal static void AppendLine(StringBuilder sb, double x1, double y1, double x2, double y2)
    {
        sb.AppendLine($"{N(x1)} {N(y1)} m");
        sb.AppendLine($"{N(x2)} {N(y2)} l");
        sb.AppendLine("S");
    }
}
