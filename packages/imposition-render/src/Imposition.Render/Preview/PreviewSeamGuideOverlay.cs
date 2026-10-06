using Imposition.Core.Seams;
using SkiaSharp;

namespace Imposition.Render.Preview;

/// <summary>
/// Renderizador de linha-guia visual de emenda (K 40%) adaptada via ICC (ADR-052 / Regra R-020).
/// Transforma a cor CMYK de impressão em sRGB display adaptation utilizando CmykToDisplayTransform.
/// </summary>
public static class PreviewSeamGuideOverlay
{
    /// <summary>Fator de conversão pt -> mm (1 pt = 25.4 / 72.0 mm).</summary>
    private const double PtToMm = 25.4 / 72.0;

    /// <summary>
    /// Obtém a cor SKColor no espaço de exibição (sRGB) adaptada via ICC a partir dos componentes CMYK [0.0, 1.0].
    /// </summary>
    public static SKColor GetGuideLineDisplayColor(
        CmykToDisplayTransform transform,
        double cyan = 0.0,
        double magenta = 0.0,
        double yellow = 0.0,
        double black = 0.40)
    {
        ArgumentNullException.ThrowIfNull(transform, nameof(transform));

        var c = (byte)Math.Clamp((int)Math.Round(Math.Clamp(cyan, 0.0, 1.0) * 255.0), 0, 255);
        var m = (byte)Math.Clamp((int)Math.Round(Math.Clamp(magenta, 0.0, 1.0) * 255.0), 0, 255);
        var y = (byte)Math.Clamp((int)Math.Round(Math.Clamp(yellow, 0.0, 1.0) * 255.0), 0, 255);
        var k = (byte)Math.Clamp((int)Math.Round(Math.Clamp(black, 0.0, 1.0) * 255.0), 0, 255);

        Span<byte> cmyk = stackalloc byte[] { c, m, y, k };
        Span<byte> rgb = stackalloc byte[3];

        transform.Transform(cmyk, rgb, 1);

        return new SKColor(rgb[0], rgb[1], rgb[2], 255);
    }

    /// <summary>
    /// Renderiza uma linha-guia individual sobre o canvas informado.
    /// </summary>
    public static void PaintGuideLine(
        SKCanvas canvas,
        GuideLineDefinition guide,
        CmykToDisplayTransform transform,
        double pixelsPerMmX,
        double pixelsPerMmY,
        double originX = 0.0,
        double originY = 0.0)
    {
        if (canvas == null || guide == null || transform == null)
            return;

        if (!double.IsFinite(pixelsPerMmX) || pixelsPerMmX <= 0.0 ||
            !double.IsFinite(pixelsPerMmY) || pixelsPerMmY <= 0.0 ||
            !double.IsFinite(originX) || !double.IsFinite(originY) ||
            !double.IsFinite(guide.XPositionMm) || !double.IsFinite(guide.YPositionMm) ||
            !double.IsFinite(guide.LengthMm) || guide.LengthMm <= 0.0)
        {
            return;
        }

        var color = GetGuideLineDisplayColor(transform, guide.Cyan, guide.Magenta, guide.Yellow, guide.Black);

        var thicknessMm = guide.ThicknessPt * PtToMm;
        var avgPixelsPerMm = (pixelsPerMmX + pixelsPerMmY) / 2.0;
        var thicknessPx = (float)Math.Max(1.0, thicknessMm * avgPixelsPerMm);

        using var paint = new SKPaint
        {
            Style = SKPaintStyle.Stroke,
            Color = color,
            StrokeWidth = thicknessPx,
            IsAntialias = false
        };

        var isHorizontal = Math.Abs(guide.XPositionMm) < 1e-6 && guide.YPositionMm > 0.0;

        float x1Px = (float)((originX + guide.XPositionMm) * pixelsPerMmX);
        float y1Px = (float)((originY + guide.YPositionMm) * pixelsPerMmY);
        float x2Px;
        float y2Px;

        if (isHorizontal)
        {
            x2Px = (float)((originX + guide.XPositionMm + guide.LengthMm) * pixelsPerMmX);
            y2Px = y1Px;
        }
        else
        {
            x2Px = x1Px;
            y2Px = (float)((originY + guide.YPositionMm + guide.LengthMm) * pixelsPerMmY);
        }

        canvas.DrawLine(x1Px, y1Px, x2Px, y2Px, paint);
    }
}
