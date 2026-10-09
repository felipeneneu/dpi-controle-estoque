using PdfSharpCore.Drawing;
using PdfSharpCore.Pdf;
using StepRepeatEngine.Geometry;
using StepRepeatEngine.Marks;

namespace StepRepeatPdf;

public record SmartMarkOptions(
    bool DrawCropMarks = true,
    bool DrawColorBar = true,
    bool DrawSlugline = true,
    bool DrawKnockoutUnderlay = true,
    bool DrawGripperAndSideGuide = true,
    string SluglinePattern = "PEDIDO: $job | CLIENTE: $customer | $upCount | SHEET: $sheetSize | LADO: $side | DATA: $date $time",
    double CropMarkLengthMm = 5.0,
    double CropMarkOffsetMm = 2.0
);

/// <summary>
/// Renderizador de marcas inteligentes em PDF para imposição comercial Step & Repeat.
/// Aplica marcas de corte, barra de cor CMYK, slugline dinâmica, knockout sob marcas e guias de pinagem.
/// </summary>
public static class SmartMarkPdfRenderer
{
    private const double MmToPoints = 72.0 / 25.4;

    public static void Render(
        XGraphics gfx,
        GridCalculationResult gridResult,
        double sheetWidthMm,
        double sheetHeightMm,
        SluglineContext sluglineCtx,
        SmartMarkOptions options)
    {
        double sheetWidthPt = sheetWidthMm * MmToPoints;
        double sheetHeightPt = sheetHeightMm * MmToPoints;
        var sheetRect = new Rect2D(0, 0, sheetWidthMm, sheetHeightMm);

        // 1. Renderizar Marcações de Pinagem e Guia Lateral na margem da folha
        if (options.DrawGripperAndSideGuide)
        {
            RenderGripperAndSideGuide(gfx, gridResult.PrintableArea, sheetWidthMm, sheetHeightMm);
        }

        // 2. Renderizar Slugline Dinâmica com Knockout sob o texto
        if (options.DrawSlugline)
        {
            RenderSlugline(gfx, sheetRect, sluglineCtx, options);
        }

        // 3. Renderizar Barra de Cor CMYK (ColorBar) na margem superior
        if (options.DrawColorBar)
        {
            RenderColorBar(gfx, sheetRect, options.DrawKnockoutUnderlay);
        }

        // 4. Renderizar Marcas de Corte Inteligentes nos cantos das células da grade
        if (options.DrawCropMarks)
        {
            RenderCropMarks(gfx, gridResult, options);
        }
    }

    private static void RenderSlugline(
        XGraphics gfx,
        Rect2D sheetRect,
        SluglineContext ctx,
        SmartMarkOptions options)
    {
        string text = SluglineTokenProcessor.Process(options.SluglinePattern, ctx);
        var font = new XFont("Arial", 8, XFontStyle.Regular);

        // Ancorar a slugline no topo esquerdo da chapa com offset (15, -12) mm
        double markWidthMm = 180;
        double markHeightMm = 6;
        var markRect = AnchorResolver.Resolve(sheetRect, markWidthMm, markHeightMm, AnchorPoint.TopLeft, AnchorPoint.TopLeft, 15.0, -4.0);

        double xPt = markRect.X * MmToPoints;
        double yPt = (sheetRect.Height - markRect.Top) * MmToPoints; // Inversão de Y para PDF (0,0 no canto inferior)
        double wPt = markRect.Width * MmToPoints;
        double hPt = markRect.Height * MmToPoints;

        // Knockout sob a slugline (Retângulo Branco CMYK 0,0,0,0 - Regra R-020)
        if (options.DrawKnockoutUnderlay)
        {
            var whiteBrush = new XSolidBrush(XColor.FromCmyk(0, 0, 0, 0));
            gfx.DrawRectangle(whiteBrush, xPt - 2, yPt - 2, wPt + 4, hPt + 4);
        }

        // Desenhar texto da slugline em Preto K100 (C0 M0 Y0 K100)
        var k100Brush = new XSolidBrush(XColor.FromCmyk(0, 0, 0, 1.0));
        gfx.DrawString(text, font, k100Brush, new XPoint(xPt, yPt + hPt - 2));
    }

    private static void RenderColorBar(XGraphics gfx, Rect2D sheetRect, bool drawKnockout)
    {
        // Ancorar a Barra de Cor no centro superior da chapa com offset (0, -4) mm
        double barWidthMm = 300;
        double barHeightMm = 5;
        var markRect = AnchorResolver.Resolve(sheetRect, barWidthMm, barHeightMm, AnchorPoint.TopCenter, AnchorPoint.TopCenter, 0.0, -4.0);

        double xPt = markRect.X * MmToPoints;
        double yPt = (sheetRect.Height - markRect.Top) * MmToPoints;
        double wPt = markRect.Width * MmToPoints;
        double hPt = markRect.Height * MmToPoints;

        if (drawKnockout)
        {
            var whiteBrush = new XSolidBrush(XColor.FromCmyk(0, 0, 0, 0));
            gfx.DrawRectangle(whiteBrush, xPt - 2, yPt - 2, wPt + 4, hPt + 4);
        }

        // Tira de blocos de cor CMYK (100% C, M, Y, K, 70%, 40%, 10% e registrador 100% CMYK)
        XColor[] cmykSwatches = new[]
        {
            XColor.FromCmyk(1, 0, 0, 0),   // C 100%
            XColor.FromCmyk(0.7, 0, 0, 0), // C 70%
            XColor.FromCmyk(0.4, 0, 0, 0), // C 40%
            XColor.FromCmyk(0, 1, 0, 0),   // M 100%
            XColor.FromCmyk(0, 0.7, 0, 0), // M 70%
            XColor.FromCmyk(0, 0.4, 0, 0), // M 40%
            XColor.FromCmyk(0, 0, 1, 0),   // Y 100%
            XColor.FromCmyk(0, 0, 0.7, 0), // Y 70%
            XColor.FromCmyk(0, 0, 0.4, 0), // Y 40%
            XColor.FromCmyk(0, 0, 0, 1),   // K 100%
            XColor.FromCmyk(0, 0, 0, 0.7), // K 70%
            XColor.FromCmyk(0, 0, 0, 0.4), // K 40%
            XColor.FromCmyk(1, 1, 1, 1),   // ALL (Registration 100% CMYK)
        };

        double swatchWidthPt = wPt / cmykSwatches.Length;
        for (int i = 0; i < cmykSwatches.Length; i++)
        {
            var brush = new XSolidBrush(cmykSwatches[i]);
            gfx.DrawRectangle(brush, xPt + (i * swatchWidthPt), yPt, swatchWidthPt, hPt);
        }
    }

    private static void RenderCropMarks(XGraphics gfx, GridCalculationResult gridResult, SmartMarkOptions options)
    {
        double sheetHeightMm = gridResult.PrintableArea.Y + gridResult.PrintableArea.Height + 15.0; // aprox sheet height
        double markLenPt = options.CropMarkLengthMm * MmToPoints;
        double offsetPt = options.CropMarkOffsetMm * MmToPoints;

        // Traço fino de registro (100% CMYK de registro ou K100)
        var cropPen = new XPen(XColor.FromCmyk(1, 1, 1, 1), 0.35); // 0.35pt

        foreach (var cell in gridResult.Cells)
        {
            // Coordenadas do TrimBox da célula
            double leftPt = cell.TrimBox.Left * MmToPoints;
            double rightPt = cell.TrimBox.Right * MmToPoints;
            double bottomPt = (sheetHeightMm - cell.TrimBox.Bottom) * MmToPoints;
            double topPt = (sheetHeightMm - cell.TrimBox.Top) * MmToPoints;

            // Canto Superior Esquerdo (Top-Left)
            gfx.DrawLine(cropPen, leftPt - offsetPt - markLenPt, topPt, leftPt - offsetPt, topPt);
            gfx.DrawLine(cropPen, leftPt, topPt - offsetPt - markLenPt, leftPt, topPt - offsetPt);

            // Canto Superior Direito (Top-Right)
            gfx.DrawLine(cropPen, rightPt + offsetPt, topPt, rightPt + offsetPt + markLenPt, topPt);
            gfx.DrawLine(cropPen, rightPt, topPt - offsetPt - markLenPt, rightPt, topPt - offsetPt);

            // Canto Inferior Esquerdo (Bottom-Left)
            gfx.DrawLine(cropPen, leftPt - offsetPt - markLenPt, bottomPt, leftPt - offsetPt, bottomPt);
            gfx.DrawLine(cropPen, leftPt, bottomPt + offsetPt, leftPt, bottomPt + offsetPt + markLenPt);

            // Canto Inferior Direito (Bottom-Right)
            gfx.DrawLine(cropPen, rightPt + offsetPt, bottomPt, rightPt + offsetPt + markLenPt, bottomPt);
            gfx.DrawLine(cropPen, rightPt, bottomPt + offsetPt, rightPt, bottomPt + offsetPt + markLenPt);
        }
    }

    private static void RenderGripperAndSideGuide(
        XGraphics gfx,
        Rect2D printableArea,
        double sheetWidthMm,
        double sheetHeightMm)
    {
        var guidePen = new XPen(XColor.FromCmyk(0, 0, 0, 0.4), 0.5); // Linha tracejada indicativa
        guidePen.DashStyle = XDashStyle.Dash;

        double gripperYPt = (sheetHeightMm - printableArea.Y) * MmToPoints;
        double sideGuideXPt = printableArea.X * MmToPoints;
        double sheetWidthPt = sheetWidthMm * MmToPoints;
        double sheetHeightPt = sheetHeightMm * MmToPoints;

        // Linha de limite de Pinagem (Gripper)
        gfx.DrawLine(guidePen, 0, gripperYPt, sheetWidthPt, gripperYPt);

        // Indicador visual de Guia Lateral (SideGuide)
        gfx.DrawLine(guidePen, sideGuideXPt, 0, sideGuideXPt, sheetHeightPt);
    }
}
