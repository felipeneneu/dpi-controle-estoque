using FluentAssertions;
using Imposition.Core.Seams;
using Imposition.Pdf.Seams;
using Xunit;

namespace Imposition.Pdf.Tests.Seams;

public class PdfSeamGuideTests
{
    [Fact]
    [Trait("Category", "Seams")]
    public void BR_053_VerticalGuide_GeneratesExpectedPdfOperators()
    {
        // Guide vertical no painel 1: X = 1000 mm, Y = 0 mm, Comprimento = 2000 mm
        var guide = GuideLineDefinition.CreateStandard(1, 1000.0, 0.0, 2000.0);

        var stream = PdfSeamGuideInjector.GenerateContentStream(guide, pageLeftPt: 0.0, pageBottomPt: 0.0);

        stream.Should().NotBeNullOrWhiteSpace();
        stream.Should().Contain("q");
        stream.Should().Contain("0 0 0 0.40 k");
        stream.Should().Contain("1 w");
        stream.Should().Contain("m");
        stream.Should().Contain("l");
        stream.Should().Contain("S");
        stream.Should().Contain("Q");

        // Coordenadas calculadas: 1000 mm * 72 / 25.4 = 2834.645669...
        // Linha vertical deve ter mesmo X inicial e final
        var lines = stream.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
        var moveLine = lines.First(l => l.EndsWith("m"));
        var drawLine = lines.First(l => l.EndsWith("l"));

        var moveParts = moveLine.Split(' ');
        var drawParts = drawLine.Split(' ');

        // X do m e X do l devem ser idênticos
        moveParts[0].Should().Be(drawParts[0]);
        // Y do m deve ser 0
        moveParts[1].Should().Be("0");
        // Y do l deve ser > 0
        double.Parse(drawParts[1], System.Globalization.CultureInfo.InvariantCulture).Should().BeGreaterThan(0);
    }

    [Fact]
    [Trait("Category", "Seams")]
    public void BR_053_HorizontalGuide_GeneratesExpectedPdfOperators()
    {
        // Guide horizontal no painel 1: X = 0 mm, Y = 1000 mm, Comprimento = 3000 mm
        var guide = GuideLineDefinition.CreateStandard(1, 0.0, 1000.0, 3000.0);

        var stream = PdfSeamGuideInjector.GenerateContentStream(guide, pageLeftPt: 0.0, pageBottomPt: 0.0);

        stream.Should().NotBeNullOrWhiteSpace();
        stream.Should().Contain("0 0 0 0.40 k");
        stream.Should().Contain("1 w");

        var lines = stream.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
        var moveLine = lines.First(l => l.EndsWith("m"));
        var drawLine = lines.First(l => l.EndsWith("l"));

        var moveParts = moveLine.Split(' ');
        var drawParts = drawLine.Split(' ');

        // Y do m e Y do l devem ser idênticos
        moveParts[1].Should().Be(drawParts[1]);
        // X do m deve ser 0
        moveParts[0].Should().Be("0");
        // X do l deve ser > 0
        double.Parse(drawParts[0], System.Globalization.CultureInfo.InvariantCulture).Should().BeGreaterThan(0);
    }

    [Fact]
    [Trait("Category", "Seams")]
    public void BR_053_NullGuide_ReturnsEmptyString()
    {
        var stream = PdfSeamGuideInjector.GenerateContentStream(null, pageLeftPt: 0.0, pageBottomPt: 0.0);
        stream.Should().BeEmpty();
    }

    [Fact]
    [Trait("Category", "Seams")]
    public void BR_053_WithPageOffset_ShiftsCoordinatesCorrectly()
    {
        var guide = GuideLineDefinition.CreateStandard(1, 100.0, 0.0, 500.0);
        double pageLeftPt = 50.0;
        double pageBottomPt = 75.0;

        var stream = PdfSeamGuideInjector.GenerateContentStream(guide, pageLeftPt, pageBottomPt);

        var lines = stream.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
        var moveLine = lines.First(l => l.EndsWith("m"));
        var moveParts = moveLine.Split(' ');

        double expectedX = pageLeftPt + (100.0 * 72.0 / 25.4);
        double actualX = double.Parse(moveParts[0], System.Globalization.CultureInfo.InvariantCulture);
        actualX.Should().BeApproximately(expectedX, 0.001);

        double actualY = double.Parse(moveParts[1], System.Globalization.CultureInfo.InvariantCulture);
        actualY.Should().Be(pageBottomPt);
    }
}
