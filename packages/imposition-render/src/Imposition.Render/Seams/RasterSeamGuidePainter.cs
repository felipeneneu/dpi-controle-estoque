using Imposition.Core.Seams;
using SkiaSharp;

namespace Imposition.Render.Seams;

/// <summary>
/// Desenha linhas-guia visuais de emenda (K 40%) sobre um canvas raster (SKCanvas) para JPG/TIFF (ADR-051, BR_053).
/// Utiliza conversão de cor CMYK->RGB determinística documentada e dimensionamento proporcional à resolução (pixelsPerMm).
/// </summary>
public static class RasterSeamGuidePainter
{
    /// <summary>Fator de conversão pt -> mm (1 pt = 25.4 / 72.0 mm).</summary>
    private const double PtToMm = 25.4 / 72.0;

    /// <summary>
    /// Renderiza a linha-guia no canvas SkiaSharp informado.
    /// Caso canvas ou guide sejam nulos, ou pixelsPerMm seja inválido/zero, a operação é ignorada silenciosamente (guard clause).
    /// </summary>
    /// <param name="canvas">Destino de pintura SkiaSharp.</param>
    /// <param name="guide">Definição geométrica e de cor da linha-guia.</param>
    /// <param name="pixelsPerMm">Resolução da imagem em pixels por milímetro (DPI / 25.4).</param>
    public static void Paint(
        SKCanvas canvas,
        GuideLineDefinition guide,
        double pixelsPerMm)
    {
        if (canvas == null || guide == null)
            return;

        if (!double.IsFinite(pixelsPerMm) || pixelsPerMm <= 0.0)
            return;

        if (!double.IsFinite(guide.XPositionMm) || !double.IsFinite(guide.YPositionMm) ||
            !double.IsFinite(guide.LengthMm) || guide.LengthMm <= 0.0)
            return;

        // Conversão determinística CMYK -> RGB
        var color = CmykToRgb(guide.Cyan, guide.Magenta, guide.Yellow, guide.Black);

        // Espessura da linha em pixels com base na resolução alvo
        var thicknessMm = guide.ThicknessPt * PtToMm;
        var thicknessPx = (float)Math.Max(1.0, thicknessMm * pixelsPerMm);

        using var paint = new SKPaint
        {
            Style = SKPaintStyle.Stroke,
            Color = color,
            StrokeWidth = thicknessPx,
            IsAntialias = false
        };

        var isHorizontal = Math.Abs(guide.XPositionMm) < 1e-6 && guide.YPositionMm > 0.0;

        float x1Px = (float)(guide.XPositionMm * pixelsPerMm);
        float y1Px = (float)(guide.YPositionMm * pixelsPerMm);
        float x2Px;
        float y2Px;

        if (isHorizontal)
        {
            x2Px = (float)((guide.XPositionMm + guide.LengthMm) * pixelsPerMm);
            y2Px = y1Px;
        }
        else
        {
            x2Px = x1Px;
            y2Px = (float)((guide.YPositionMm + guide.LengthMm) * pixelsPerMm);
        }

        canvas.DrawLine(x1Px, y1Px, x2Px, y2Px, paint);
    }

    /// <summary>
    /// Converte componentes CMYK [0.0, 1.0] para RGB [0, 255] segundo a fórmula determinística padrão:
    /// R = 255 * (1 - C) * (1 - K)
    /// G = 255 * (1 - M) * (1 - K)
    /// B = 255 * (1 - Y) * (1 - K)
    /// Para CMYK 0/0/0/0.40: R=153, G=153, B=153 (Hex #999999, K 40%).
    /// </summary>
    public static SKColor CmykToRgb(double cyan, double magenta, double yellow, double black)
    {
        var c = Math.Clamp(cyan, 0.0, 1.0);
        var m = Math.Clamp(magenta, 0.0, 1.0);
        var y = Math.Clamp(yellow, 0.0, 1.0);
        var k = Math.Clamp(black, 0.0, 1.0);

        var r = (byte)Math.Clamp(Math.Round(255.0 * (1.0 - c) * (1.0 - k)), 0, 255);
        var g = (byte)Math.Clamp(Math.Round(255.0 * (1.0 - m) * (1.0 - k)), 0, 255);
        var b = (byte)Math.Clamp(Math.Round(255.0 * (1.0 - y) * (1.0 - k)), 0, 255);

        return new SKColor(r, g, b, 255);
    }
}
