using FluentAssertions;
using Imposition.Core.Seams;
using Imposition.Render.Seams;
using SkiaSharp;
using Xunit;

namespace Imposition.Render.Tests.Seams;

public class RasterSeamGuidePainterTests
{
    [Fact]
    public void BR_053_CmykToRgb_ConvertsK40Correctly()
    {
        // ADR-051 Decisão 5: 255 * (1 - 0.40) = 153 (#999999)
        var color = RasterSeamGuidePainter.CmykToRgb(0.0, 0.0, 0.0, 0.40);

        color.Red.Should().Be(153);
        color.Green.Should().Be(153);
        color.Blue.Should().Be(153);
        color.Alpha.Should().Be(255);
    }

    [Fact]
    public void BR_053_CmykToRgb_ExtremeValues()
    {
        var white = RasterSeamGuidePainter.CmykToRgb(0.0, 0.0, 0.0, 0.0);
        white.Red.Should().Be(255);
        white.Green.Should().Be(255);
        white.Blue.Should().Be(255);

        var black = RasterSeamGuidePainter.CmykToRgb(0.0, 0.0, 0.0, 1.0);
        black.Red.Should().Be(0);
        black.Green.Should().Be(0);
        black.Blue.Should().Be(0);

        var cyan = RasterSeamGuidePainter.CmykToRgb(1.0, 0.0, 0.0, 0.0);
        cyan.Red.Should().Be(0);
        cyan.Green.Should().Be(255);
        cyan.Blue.Should().Be(255);
    }

    [Fact]
    public void BR_053_Paint_SingleGuide_DrawsDarkGreyLine()
    {
        // Canvas de 200x200 px (fundo branco)
        // Resolução: 2 pixels por mm.
        // Guide em X = 50 mm (100 px), Y = 0 mm, Comprimento = 100 mm (200 px).
        const int width = 200;
        const int height = 200;
        const double pixelsPerMm = 2.0;

        using var bitmap = new SKBitmap(width, height);
        using var canvas = new SKCanvas(bitmap);
        canvas.Clear(SKColors.White);

        var guide = GuideLineDefinition.CreateStandard(1, xMm: 50.0, yMm: 0.0, lengthMm: 100.0);

        RasterSeamGuidePainter.Paint(canvas, guide, pixelsPerMm);

        // O pixel sobre a linha (X = 100, Y = 100) deve ser cinza K40% (#999999 -> 153)
        var centerPixel = bitmap.GetPixel(100, 100);
        centerPixel.Red.Should().Be(153);
        centerPixel.Green.Should().Be(153);
        centerPixel.Blue.Should().Be(153);

        // Um pixel distante da linha (X = 20, Y = 100) deve permanecer branco
        var backgroundPixel = bitmap.GetPixel(20, 100);
        backgroundPixel.Red.Should().Be(255);
        backgroundPixel.Green.Should().Be(255);
        backgroundPixel.Blue.Should().Be(255);
    }

    [Fact]
    public void BR_053_Paint_MultipleGuides_DrawsAllExpectedLines()
    {
        const int width = 400;
        const int height = 200;
        const double pixelsPerMm = 1.0;

        using var bitmap = new SKBitmap(width, height);
        using var canvas = new SKCanvas(bitmap);
        canvas.Clear(SKColors.White);

        var guide1 = GuideLineDefinition.CreateStandard(1, xMm: 100.0, yMm: 0.0, lengthMm: 200.0);
        var guide2 = GuideLineDefinition.CreateStandard(2, xMm: 200.0, yMm: 0.0, lengthMm: 200.0);

        RasterSeamGuidePainter.Paint(canvas, guide1, pixelsPerMm);
        RasterSeamGuidePainter.Paint(canvas, guide2, pixelsPerMm);

        // Ambas as linhas devem existir nos pixels X=100 e X=200
        var px1 = bitmap.GetPixel(100, 100);
        px1.Red.Should().Be(153);

        var px2 = bitmap.GetPixel(200, 100);
        px2.Red.Should().Be(153);

        // Ponto intermediário (X=150) deve permanecer branco
        var midPx = bitmap.GetPixel(150, 100);
        midPx.Red.Should().Be(255);
    }

    [Fact]
    public void BR_053_Paint_HorizontalGuide_DrawsHorizontalLine()
    {
        const int width = 200;
        const int height = 200;
        const double pixelsPerMm = 1.0;

        using var bitmap = new SKBitmap(width, height);
        using var canvas = new SKCanvas(bitmap);
        canvas.Clear(SKColors.White);

        // Linha horizontal em Y = 80 mm (80 px), X = 0, Comprimento = 200 mm
        var guide = GuideLineDefinition.CreateStandard(1, xMm: 0.0, yMm: 80.0, lengthMm: 200.0);

        RasterSeamGuidePainter.Paint(canvas, guide, pixelsPerMm);

        var onLine = bitmap.GetPixel(100, 80);
        onLine.Red.Should().Be(153);

        var offLine = bitmap.GetPixel(100, 20);
        offLine.Red.Should().Be(255);
    }

    [Theory]
    [InlineData(0.0)]
    [InlineData(-1.5)]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    public void BR_053_Paint_InvalidPixelsPerMm_DoesNotCrash(double invalidPixelsPerMm)
    {
        using var bitmap = new SKBitmap(100, 100);
        using var canvas = new SKCanvas(bitmap);
        var guide = GuideLineDefinition.CreateStandard(1, 50.0, 0.0, 100.0);

        var act = () => RasterSeamGuidePainter.Paint(canvas, guide, invalidPixelsPerMm);
        act.Should().NotThrow();
    }

    [Fact]
    public void BR_053_Paint_NullArguments_DoesNotCrash()
    {
        using var bitmap = new SKBitmap(100, 100);
        using var canvas = new SKCanvas(bitmap);
        var guide = GuideLineDefinition.CreateStandard(1, 50.0, 0.0, 100.0);

        var act1 = () => RasterSeamGuidePainter.Paint(null!, guide, 1.0);
        act1.Should().NotThrow();

        var act2 = () => RasterSeamGuidePainter.Paint(canvas, null!, 1.0);
        act2.Should().NotThrow();
    }
}
