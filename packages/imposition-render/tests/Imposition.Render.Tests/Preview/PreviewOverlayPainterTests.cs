using FluentAssertions;
using Imposition.Core.Seams;
using Imposition.Render.Preview;
using SkiaSharp;
using Xunit;

namespace Imposition.Render.Tests.Preview;

[Trait("Category", "Overlay")]
public sealed class PreviewOverlayPainterTests
{
    private static (SeamsResult Seams, SeamPreviewRequest Request, CmykToDisplayTransform Transform) CreateTestContext(
        bool showCutLines = true,
        bool showGuideLines = true,
        bool showOverlapShading = true,
        bool isHorizontal = false)
    {
        IReadOnlyList<PanelPlacement> panels;

        if (!isHorizontal)
        {
            // Divisão vertical: Arte 2000 x 1000 mm, 2 painéis de 1000 mm cada com overlap de 50 mm
            panels =
            [
                new PanelPlacement(
                    Index: 1,
                    SourceXPositionMm: 0,
                    SourceYPositionMm: 0,
                    SourceWidthMm: 1000,
                    SourceHeightMm: 1000,
                    OutputWidthMm: 1050,
                    OutputHeightMm: 1000,
                    OverlapStartMm: 0,
                    OverlapEndMm: 50,
                    ShrinkageAllowanceMm: 0,
                    HasGuideLine: true),
                new PanelPlacement(
                    Index: 2,
                    SourceXPositionMm: 1000,
                    SourceYPositionMm: 0,
                    SourceWidthMm: 1000,
                    SourceHeightMm: 1000,
                    OutputWidthMm: 1050,
                    OutputHeightMm: 1000,
                    OverlapStartMm: 50,
                    OverlapEndMm: 0,
                    ShrinkageAllowanceMm: 0,
                    HasGuideLine: false)
            ];
        }
        else
        {
            // Divisão horizontal: Arte 1000 x 2000 mm, 2 painéis de 1000 mm de altura cada com overlap de 50 mm
            panels =
            [
                new PanelPlacement(
                    Index: 1,
                    SourceXPositionMm: 0,
                    SourceYPositionMm: 0,
                    SourceWidthMm: 1000,
                    SourceHeightMm: 1000,
                    OutputWidthMm: 1000,
                    OutputHeightMm: 1050,
                    OverlapStartMm: 0,
                    OverlapEndMm: 50,
                    ShrinkageAllowanceMm: 0,
                    HasGuideLine: true),
                new PanelPlacement(
                    Index: 2,
                    SourceXPositionMm: 0,
                    SourceYPositionMm: 1000,
                    SourceWidthMm: 1000,
                    SourceHeightMm: 1000,
                    OutputWidthMm: 1000,
                    OutputHeightMm: 1050,
                    OverlapStartMm: 50,
                    OverlapEndMm: 0,
                    ShrinkageAllowanceMm: 0,
                    HasGuideLine: false)
            ];
        }

        var seams = new SeamsResult(
            TotalPanels: 2,
            Panels: panels,
            TotalLinearLengthMeters: 2.1,
            TotalWasteAreaM2: 0.1,
            ShrinkageAppliedMm: 0,
            EffectiveRollWidthMm: 1600);

        var profiles = ColorProfileConfig.Default;
        var transform = new CmykToDisplayTransform(profiles);

        var request = new SeamPreviewRequest(
            imagePath: "dummy.jpg",
            seams: seams,
            mode: PreviewRenderMode.Performance,
            targetViewportWidthPx: 800,
            targetViewportHeightPx: 400,
            profiles: profiles,
            showCutLines: showCutLines,
            showGuideLines: showGuideLines,
            showOverlapShading: showOverlapShading);

        return (seams, request, transform);
    }

    [Fact]
    public void BR_052_PaintOverlays_AllEnabled_DrawsOverlaysWithoutThrowing()
    {
        var (seams, request, transform) = CreateTestContext();
        using var bitmap = new SKBitmap(800, 400);
        using var canvas = new SKCanvas(bitmap);
        canvas.Clear(SKColors.White);

        var act = () => PreviewOverlayPainter.PaintOverlays(canvas, seams, request, transform, 800, 400);
        act.Should().NotThrow();

        // O bitmap não deve ser totalmente branco após o desenho dos overlays
        var hasNonWhitePixels = false;
        for (var x = 0; x < 800; x += 10)
        {
            for (var y = 0; y < 400; y += 10)
            {
                var px = bitmap.GetPixel(x, y);
                if (px.Red != 255 || px.Green != 255 || px.Blue != 255)
                {
                    hasNonWhitePixels = true;
                    break;
                }
            }
            if (hasNonWhitePixels) break;
        }

        hasNonWhitePixels.Should().BeTrue();
    }

    [Fact]
    public void BR_052_PaintOverlays_ShowCutLines_DrawsMagentaLine()
    {
        var (seams, request, transform) = CreateTestContext(
            showCutLines: true,
            showGuideLines: false,
            showOverlapShading: false);

        using var bitmap = new SKBitmap(800, 400);
        using var canvas = new SKCanvas(bitmap);
        canvas.Clear(SKColors.White);

        PreviewOverlayPainter.PaintOverlays(canvas, seams, request, transform, 800, 400);

        // A linha de corte está exatamente em X = 1000 mm na arte de 2000 mm -> X = 400 px
        var cutPixel = bitmap.GetPixel(400, 200);

        // Deve ter traço de corte (magenta com Red > 200 e Blue > 100)
        cutPixel.Red.Should().BeGreaterThan(200);
        cutPixel.Blue.Should().BeGreaterThan(100);

        // Pixel distante da linha (ex: X = 100, Y = 200) permanece branco
        var bgPixel = bitmap.GetPixel(100, 200);
        bgPixel.Red.Should().Be(255);
        bgPixel.Green.Should().Be(255);
        bgPixel.Blue.Should().Be(255);
    }

    [Fact]
    public void BR_052_PaintOverlays_ShowOverlapShading_DrawsSemiTransparentZone()
    {
        var (seams, request, transform) = CreateTestContext(
            showCutLines: false,
            showGuideLines: false,
            showOverlapShading: true);

        using var bitmap = new SKBitmap(800, 400);
        using var canvas = new SKCanvas(bitmap);
        canvas.Clear(SKColors.White);

        PreviewOverlayPainter.PaintOverlays(canvas, seams, request, transform, 800, 400);

        // Faixa de sobreposição no final do painel 1: 950 mm a 1000 mm -> X entre 380 px e 400 px
        var insideOverlap = bitmap.GetPixel(390, 200);

        // Fundo com tinta de sobreposição (ciano/azul)
        insideOverlap.Red.Should().BeLessThan(255);

        // Fora da sobreposição permanece branco
        var outsideOverlap = bitmap.GetPixel(100, 200);
        outsideOverlap.Red.Should().Be(255);
    }

    [Fact]
    public void BR_052_PaintOverlays_ShowGuideLines_DrawsK40IccColorLine()
    {
        var (seams, request, transform) = CreateTestContext(
            showCutLines: false,
            showGuideLines: true,
            showOverlapShading: false);

        using var bitmap = new SKBitmap(800, 400);
        using var canvas = new SKCanvas(bitmap);
        canvas.Clear(SKColors.White);

        PreviewOverlayPainter.PaintOverlays(canvas, seams, request, transform, 800, 400);

        // A linha-guia está em X = 1000 mm (OutputWidth 1050 - OverlapEnd 50 = 1000 mm) -> X = 400 px
        var guidePixel = bitmap.GetPixel(400, 200);

        // A cor da linha-guia K40% adaptada via ICC é ~166 (#A6A6A6)
        guidePixel.Red.Should().BeInRange(150, 180);
        guidePixel.Green.Should().BeInRange(150, 180);
        guidePixel.Blue.Should().BeInRange(150, 180);
    }

    [Fact]
    public void BR_052_PaintOverlays_HorizontalSplit_DrawsHorizontalOverlays()
    {
        var (seams, request, transform) = CreateTestContext(
            showCutLines: true,
            showGuideLines: true,
            showOverlapShading: true,
            isHorizontal: true);

        using var bitmap = new SKBitmap(400, 800);
        using var canvas = new SKCanvas(bitmap);
        canvas.Clear(SKColors.White);

        var act = () => PreviewOverlayPainter.PaintOverlays(canvas, seams, request, transform, 400, 800);
        act.Should().NotThrow();

        // Linha de corte em Y = 1000 mm (400 px de 800 px)
        var cutPixel = bitmap.GetPixel(200, 400);
        cutPixel.Red.Should().BeGreaterThan(150);
    }

    [Fact]
    public void BR_052_PaintOverlays_InvalidInputs_HandledSafelyWithoutCrash()
    {
        var (seams, request, transform) = CreateTestContext();
        using var bitmap = new SKBitmap(100, 100);
        using var canvas = new SKCanvas(bitmap);

        var act1 = () => PreviewOverlayPainter.PaintOverlays(null!, seams, request, transform, 100, 100);
        act1.Should().NotThrow();

        var act2 = () => PreviewOverlayPainter.PaintOverlays(canvas, null!, request, transform, 100, 100);
        act2.Should().NotThrow();

        var act3 = () => PreviewOverlayPainter.PaintOverlays(canvas, seams, null!, transform, 100, 100);
        act3.Should().NotThrow();

        var act4 = () => PreviewOverlayPainter.PaintOverlays(canvas, seams, request, null!, 100, 100);
        act4.Should().NotThrow();

        var act5 = () => PreviewOverlayPainter.PaintOverlays(canvas, seams, request, transform, 0, 100);
        act5.Should().NotThrow();

        var act6 = () => PreviewOverlayPainter.PaintOverlays(canvas, seams, request, transform, 100, -50);
        act6.Should().NotThrow();
    }

    [Fact]
    public void BR_052_PreviewSeamGuideOverlay_DirectColorCheck_MatchesIccDisplayAdaptation()
    {
        var profiles = ColorProfileConfig.Default;
        using var transform = new CmykToDisplayTransform(profiles);

        var color = PreviewSeamGuideOverlay.GetGuideLineDisplayColor(transform, cyan: 0, magenta: 0, yellow: 0, black: 0.40);

        // K 40% em FOGRA39 display adaptation produz ~166 (#A6A6A6), não o 153 (#999999) do cálculo ingênuo
        color.Red.Should().Be(166);
        color.Green.Should().Be(166);
        color.Blue.Should().Be(166);
        color.Alpha.Should().Be(255);
    }
}
