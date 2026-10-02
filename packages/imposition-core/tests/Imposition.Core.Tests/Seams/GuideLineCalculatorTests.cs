using FluentAssertions;
using Imposition.Core.Errors;
using Imposition.Core.Seams;
using Xunit;

namespace Imposition.Core.Tests.Seams;

public class GuideLineCalculatorTests
{
    [Fact]
    [Trait("Category", "Guide")]
    public void BR_053_Vertical_LeftToRight_N3_Produces2VerticalLines()
    {
        // Cenário: Arte 3000x1000mm, Rolo 1100mm, Overlap 50mm -> 3 painéis
        var input = new SeamsInput(
            ArtworkWidthMm: 3000,
            ArtworkHeightMm: 1000,
            PrintableRollWidthMm: 1100,
            OverlapMm: 50,
            Direction: SeamDirection.LeftToRight,
            Orientation: SeamOrientation.Vertical,
            ApplyShrinkage: false);

        var result = PanelCalculator.Calculate(input);
        result.TotalPanels.Should().Be(3);

        var guides = GuideLineCalculator.Calculate(result);

        guides.Should().HaveCount(2);

        // Painel 1 (TargetPanelIndex = 1):
        // OutputWidth = 1050, OverlapEnd = 50 -> X = 1000.0, Y = 0.0, Length = 1000.0
        var guide1 = guides[0];
        guide1.TargetPanelIndex.Should().Be(1);
        guide1.XPositionMm.Should().Be(1000.0);
        guide1.YPositionMm.Should().Be(0.0);
        guide1.LengthMm.Should().Be(1000.0);
        guide1.ThicknessPt.Should().Be(1.0);
        guide1.Black.Should().Be(0.40);

        // Painel 2 (TargetPanelIndex = 2):
        // OutputWidth = 1100, OverlapEnd = 50 -> X = 1050.0, Y = 0.0, Length = 1000.0
        var guide2 = guides[1];
        guide2.TargetPanelIndex.Should().Be(2);
        guide2.XPositionMm.Should().Be(1050.0);
        guide2.YPositionMm.Should().Be(0.0);
        guide2.LengthMm.Should().Be(1000.0);
        guide2.ThicknessPt.Should().Be(1.0);
        guide2.Black.Should().Be(0.40);
    }

    [Fact]
    [Trait("Category", "Guide")]
    public void BR_053_Vertical_RightToLeft_N3_Produces2VerticalLinesWithInvertedEdge()
    {
        var input = new SeamsInput(
            ArtworkWidthMm: 3000,
            ArtworkHeightMm: 1000,
            PrintableRollWidthMm: 1100,
            OverlapMm: 50,
            Direction: SeamDirection.RightToLeft,
            Orientation: SeamOrientation.Vertical,
            ApplyShrinkage: false);

        var result = PanelCalculator.Calculate(input);
        result.TotalPanels.Should().Be(3);

        var guides = GuideLineCalculator.Calculate(result);

        guides.Should().HaveCount(2);

        // Painel 1 (extremo direito da arte, coberto na borda esquerda):
        // OverlapStart = 50 -> X = 50.0, Y = 0.0, Length = 1000.0
        var guide1 = guides[0];
        guide1.TargetPanelIndex.Should().Be(1);
        guide1.XPositionMm.Should().Be(50.0);
        guide1.YPositionMm.Should().Be(0.0);
        guide1.LengthMm.Should().Be(1000.0);

        // Painel 2 (painel central, coberto na borda esquerda):
        // OverlapStart = 50 -> X = 50.0, Y = 0.0, Length = 1000.0
        var guide2 = guides[1];
        guide2.TargetPanelIndex.Should().Be(2);
        guide2.XPositionMm.Should().Be(50.0);
        guide2.YPositionMm.Should().Be(0.0);
        guide2.LengthMm.Should().Be(1000.0);
    }

    [Fact]
    [Trait("Category", "Guide")]
    public void BR_053_Horizontal_LeftToRight_N4_Produces3HorizontalLines()
    {
        // Divisão horizontal: Altura 4000 fatiada em 4 painéis
        var input = new SeamsInput(
            ArtworkWidthMm: 1000,
            ArtworkHeightMm: 4000,
            PrintableRollWidthMm: 1100,
            OverlapMm: 40,
            Direction: SeamDirection.LeftToRight,
            Orientation: SeamOrientation.Horizontal,
            ApplyShrinkage: false);

        var result = PanelCalculator.Calculate(input);
        result.TotalPanels.Should().Be(4);

        var guides = GuideLineCalculator.Calculate(result);

        guides.Should().HaveCount(3);
        foreach (var guide in guides)
        {
            guide.XPositionMm.Should().Be(0.0);
            guide.LengthMm.Should().Be(1000.0); // OutputWidthMm da arte
            guide.ThicknessPt.Should().Be(1.0);
            guide.Black.Should().Be(0.40);
        }

        // Painel 1: OutputHeight = 1040, OverlapEnd = 40 -> Y = 1000.0
        guides[0].TargetPanelIndex.Should().Be(1);
        guides[0].YPositionMm.Should().Be(1000.0);

        // Painel 2: OutputHeight = 1080, OverlapEnd = 40 -> Y = 1040.0
        guides[1].TargetPanelIndex.Should().Be(2);
        guides[1].YPositionMm.Should().Be(1040.0);

        // Painel 3: OutputHeight = 1080, OverlapEnd = 40 -> Y = 1040.0
        guides[2].TargetPanelIndex.Should().Be(3);
        guides[2].YPositionMm.Should().Be(1040.0);
    }

    [Fact]
    [Trait("Category", "Guide")]
    public void BR_053_N1_NoSeams_Produces0Lines()
    {
        var input = new SeamsInput(
            ArtworkWidthMm: 1000,
            ArtworkHeightMm: 2000,
            PrintableRollWidthMm: 1200,
            OverlapMm: 40,
            Direction: SeamDirection.LeftToRight,
            Orientation: SeamOrientation.Vertical,
            ApplyShrinkage: false);

        var result = PanelCalculator.Calculate(input);
        result.TotalPanels.Should().Be(1);

        var guides = GuideLineCalculator.Calculate(result);

        guides.Should().BeEmpty();
    }

    [Fact]
    [Trait("Category", "Guide")]
    public void BR_053_N5Plus_ProducesNMinus1Lines()
    {
        // Arte 6000mm / Rolo 1100mm -> 6 painéis
        var input = new SeamsInput(
            ArtworkWidthMm: 6000,
            ArtworkHeightMm: 1000,
            PrintableRollWidthMm: 1100,
            OverlapMm: 50,
            Direction: SeamDirection.LeftToRight,
            Orientation: SeamOrientation.Vertical,
            ApplyShrinkage: false);

        var result = PanelCalculator.Calculate(input);
        result.TotalPanels.Should().Be(6);

        var guides = GuideLineCalculator.Calculate(result);

        guides.Should().HaveCount(5);
        guides.Select(g => g.TargetPanelIndex).Should().BeEquivalentTo(new[] { 1, 2, 3, 4, 5 });
    }

    [Fact]
    [Trait("Category", "Guide")]
    public void BR_053_EmptyPanels_Produces0LinesWithoutCrashing()
    {
        var emptyResult = new SeamsResult(
            TotalPanels: 0,
            Panels: Array.Empty<PanelPlacement>(),
            TotalLinearLengthMeters: 0,
            TotalWasteAreaM2: 0,
            ShrinkageAppliedMm: 0,
            EffectiveRollWidthMm: 1000);

        var guides = GuideLineCalculator.Calculate(emptyResult);

        guides.Should().BeEmpty();
    }

    [Fact]
    [Trait("Category", "Guide")]
    public void BR_053_AllHasGuideLineFalse_Produces0Lines()
    {
        var panel1 = new PanelPlacement(1, 0, 0, 500, 1000, 550, 1000, 0, 50, 0, HasGuideLine: false);
        var panel2 = new PanelPlacement(2, 500, 0, 500, 1000, 550, 1000, 50, 0, 0, HasGuideLine: false);

        var result = new SeamsResult(
            TotalPanels: 2,
            Panels: new[] { panel1, panel2 },
            TotalLinearLengthMeters: 2,
            TotalWasteAreaM2: 0,
            ShrinkageAppliedMm: 0,
            EffectiveRollWidthMm: 1000);

        var guides = GuideLineCalculator.Calculate(result);

        guides.Should().BeEmpty();
    }

    [Theory]
    [Trait("Category", "Guide")]
    [InlineData(0, 10, 10, 100, 1.0, 0, 0, 0, 0.4)] // Index < 1
    [InlineData(1, double.NaN, 10, 100, 1.0, 0, 0, 0, 0.4)] // NaN X
    [InlineData(1, -5, 10, 100, 1.0, 0, 0, 0, 0.4)] // Negative X
    [InlineData(1, 10, double.PositiveInfinity, 100, 1.0, 0, 0, 0, 0.4)] // Infinity Y
    [InlineData(1, 10, 10, 0, 1.0, 0, 0, 0, 0.4)] // Length <= 0
    [InlineData(1, 10, 10, 100, 0, 0, 0, 0, 0.4)] // Thickness <= 0
    [InlineData(1, 10, 10, 100, 1.0, 1.5, 0, 0, 0.4)] // Cyan > 1.0
    [InlineData(1, 10, 10, 100, 1.0, 0, 0, 0, double.NaN)] // Black NaN
    public void BR_053_InvalidDefinition_ThrowsImpositionException(
        int index, double x, double y, double length, double thick, double c, double m, double ycol, double k)
    {
        var act = () => new GuideLineDefinition(index, x, y, length, thick, c, m, ycol, k);

        act.Should().Throw<ImpositionException>()
           .Where(e => e.Code == ErrorCodes.InvalidGuideLine);
    }
}
