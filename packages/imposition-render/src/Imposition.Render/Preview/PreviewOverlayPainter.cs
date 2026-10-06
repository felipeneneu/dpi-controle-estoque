using Imposition.Core.Seams;
using SkiaSharp;

namespace Imposition.Render.Preview;

/// <summary>
/// Orquestrador de desenho de overlays de interface (linhas de corte, hachura de sobreposição e linhas-guia K40% ICC)
/// sobre a superfície de preview (ADR-052 / BR_052).
/// </summary>
public static class PreviewOverlayPainter
{
    private static readonly SKColor CutLineColor = new(255, 0, 128, 220); // Magenta UI
    private static readonly SKColor OverlapShadingColor = new(0, 180, 255, 55); // Ciano semi-transparente UI

    /// <summary>
    /// Calcula as dimensões totais em milímetros da arte original a partir dos painéis de emenda.
    /// </summary>
    public static (double WidthMm, double HeightMm) GetArtworkDimensions(SeamsResult seams)
    {
        if (seams?.Panels == null || seams.Panels.Count == 0)
            return (0.0, 0.0);

        double maxX = 0;
        double maxY = 0;

        foreach (var p in seams.Panels)
        {
            if (double.IsFinite(p.SourceXPositionMm) && double.IsFinite(p.SourceWidthMm))
            {
                maxX = Math.Max(maxX, p.SourceXPositionMm + p.SourceWidthMm);
            }
            if (double.IsFinite(p.SourceYPositionMm) && double.IsFinite(p.SourceHeightMm))
            {
                maxY = Math.Max(maxY, p.SourceYPositionMm + p.SourceHeightMm);
            }
        }

        return (maxX, maxY);
    }

    /// <summary>
    /// Pinta todas as camadas de overlay ativas conforme a configuração da requisição de preview.
    /// </summary>
    public static void PaintOverlays(
        SKCanvas canvas,
        SeamsResult seams,
        SeamPreviewRequest request,
        CmykToDisplayTransform transform,
        int renderWidthPx,
        int renderHeightPx)
    {
        if (canvas == null || seams?.Panels == null || seams.Panels.Count == 0 || request == null || transform == null)
            return;

        if (renderWidthPx <= 0 || renderHeightPx <= 0)
            return;

        var (artworkWidthMm, artworkHeightMm) = GetArtworkDimensions(seams);
        if (!double.IsFinite(artworkWidthMm) || artworkWidthMm <= 0.0 ||
            !double.IsFinite(artworkHeightMm) || artworkHeightMm <= 0.0)
        {
            return;
        }

        var scaleX = (double)renderWidthPx / artworkWidthMm;
        var scaleY = (double)renderHeightPx / artworkHeightMm;

        var isHorizontal = seams.Panels.Count >= 2 &&
                           Math.Abs(seams.Panels[1].SourceYPositionMm - seams.Panels[0].SourceYPositionMm) > 1e-4;

        // 1. Hachura / Sombreado de sobreposição
        if (request.ShowOverlapShading)
        {
            PaintOverlapShading(canvas, seams, isHorizontal, scaleX, scaleY, renderWidthPx, renderHeightPx);
        }

        // 2. Linhas de corte pontilhadas
        if (request.ShowCutLines)
        {
            PaintCutLines(canvas, seams, isHorizontal, scaleX, scaleY, renderWidthPx, renderHeightPx);
        }

        // 3. Linhas-guia de termo-solda (K 40% ICC-aware)
        if (request.ShowGuideLines)
        {
            PaintGuideLines(canvas, seams, transform, scaleX, scaleY);
        }
    }

    private static void PaintOverlapShading(
        SKCanvas canvas,
        SeamsResult seams,
        bool isHorizontal,
        double scaleX,
        double scaleY,
        int renderWidthPx,
        int renderHeightPx)
    {
        using var shadingPaint = new SKPaint
        {
            Style = SKPaintStyle.Fill,
            Color = OverlapShadingColor,
            IsAntialias = false
        };

        foreach (var panel in seams.Panels)
        {
            if (!isHorizontal)
            {
                if (panel.OverlapStartMm > 0)
                {
                    var x1 = (float)(panel.SourceXPositionMm * scaleX);
                    var x2 = (float)((panel.SourceXPositionMm + panel.OverlapStartMm) * scaleX);
                    canvas.DrawRect(new SKRect(x1, 0, x2, renderHeightPx), shadingPaint);
                }

                if (panel.OverlapEndMm > 0)
                {
                    var x1 = (float)((panel.SourceXPositionMm + panel.SourceWidthMm - panel.OverlapEndMm) * scaleX);
                    var x2 = (float)((panel.SourceXPositionMm + panel.SourceWidthMm) * scaleX);
                    canvas.DrawRect(new SKRect(x1, 0, x2, renderHeightPx), shadingPaint);
                }
            }
            else
            {
                if (panel.OverlapStartMm > 0)
                {
                    var y1 = (float)(panel.SourceYPositionMm * scaleY);
                    var y2 = (float)((panel.SourceYPositionMm + panel.OverlapStartMm) * scaleY);
                    canvas.DrawRect(new SKRect(0, y1, renderWidthPx, y2), shadingPaint);
                }

                if (panel.OverlapEndMm > 0)
                {
                    var y1 = (float)((panel.SourceYPositionMm + panel.SourceHeightMm - panel.OverlapEndMm) * scaleY);
                    var y2 = (float)((panel.SourceYPositionMm + panel.SourceHeightMm) * scaleY);
                    canvas.DrawRect(new SKRect(0, y1, renderWidthPx, y2), shadingPaint);
                }
            }
        }
    }

    private static void PaintCutLines(
        SKCanvas canvas,
        SeamsResult seams,
        bool isHorizontal,
        double scaleX,
        double scaleY,
        int renderWidthPx,
        int renderHeightPx)
    {
        using var dashEffect = SKPathEffect.CreateDash([6.0f, 4.0f], 0.0f);
        using var cutPaint = new SKPaint
        {
            Style = SKPaintStyle.Stroke,
            Color = CutLineColor,
            StrokeWidth = 1.5f,
            PathEffect = dashEffect,
            IsAntialias = true
        };

        for (var i = 0; i < seams.Panels.Count - 1; i++)
        {
            var panel = seams.Panels[i];
            if (!isHorizontal)
            {
                var cutX = (float)((panel.SourceXPositionMm + panel.SourceWidthMm) * scaleX);
                canvas.DrawLine(cutX, 0, cutX, renderHeightPx, cutPaint);
            }
            else
            {
                var cutY = (float)((panel.SourceYPositionMm + panel.SourceHeightMm) * scaleY);
                canvas.DrawLine(0, cutY, renderWidthPx, cutY, cutPaint);
            }
        }
    }

    private static void PaintGuideLines(
        SKCanvas canvas,
        SeamsResult seams,
        CmykToDisplayTransform transform,
        double scaleX,
        double scaleY)
    {
        var guideLines = GuideLineCalculator.Calculate(seams);
        if (guideLines.Count == 0)
            return;

        foreach (var guide in guideLines)
        {
            var panel = seams.Panels.FirstOrDefault(p => p.Index == guide.TargetPanelIndex);
            if (panel == null)
                continue;

            var originX = panel.SourceXPositionMm - panel.OverlapStartMm;
            var originY = panel.SourceYPositionMm - panel.OverlapStartMm;

            PreviewSeamGuideOverlay.PaintGuideLine(
                canvas,
                guide,
                transform,
                scaleX,
                scaleY,
                originX,
                originY);
        }
    }
}
