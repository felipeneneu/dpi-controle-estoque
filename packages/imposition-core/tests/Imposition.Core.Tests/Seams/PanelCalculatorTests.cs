using Imposition.Core.Errors;
using Imposition.Core.Seams;
using Xunit;

namespace Imposition.Core.Tests.Seams;

[Trait("Category", "Panels")]
[Trait("Category", "Seams")]
public sealed class PanelCalculatorTests
{
    [Fact]
    public void BR_050_c_Banner6000x1000_Roll1520_Overlap10_GeneratesPanelsWithinRollWidth()
    {
        // Arrange: 6000 x 1000 mm, rolo 1520 mm, overlap 10 mm
        var input = new SeamsInput(
            ArtworkWidthMm: 6000.0,
            ArtworkHeightMm: 1000.0,
            PrintableRollWidthMm: 1520.0,
            OverlapMm: 10.0,
            ApplyShrinkage: true);

        // Act
        var result = PanelCalculator.Calculate(input);

        // Assert
        Assert.True(result.TotalPanels >= 4, $"Esperado >= 4 painéis, obtido {result.TotalPanels}");
        Assert.Equal(result.TotalPanels, result.Panels.Count);

        foreach (var panel in result.Panels)
        {
            Assert.True(
                panel.OutputWidthMm <= input.PrintableRollWidthMm + 0.001,
                $"Painel {panel.Index} largura {panel.OutputWidthMm} excede rolo {input.PrintableRollWidthMm}");
        }

        // Primeiro painel tem overlap só no fim; intermediários em ambos; último só no início
        Assert.Equal(0.0, result.Panels[0].OverlapStartMm);
        Assert.Equal(10.0, result.Panels[0].OverlapEndMm);
        Assert.True(result.Panels[0].HasGuideLine);

        var last = result.Panels[^1];
        Assert.Equal(10.0, last.OverlapStartMm);
        Assert.Equal(0.0, last.OverlapEndMm);
        Assert.False(last.HasGuideLine);
    }

    [Fact]
    public void BR_050_SinglePanel_WhenArtworkFitsRoll_NoGuideLine()
    {
        // Arrange: 1200 x 800 mm em rolo 1520 mm (cabe inteiro)
        var input = new SeamsInput(
            ArtworkWidthMm: 1200.0,
            ArtworkHeightMm: 800.0,
            PrintableRollWidthMm: 1520.0,
            OverlapMm: 10.0,
            ApplyShrinkage: true);

        // Act
        var result = PanelCalculator.Calculate(input);

        // Assert
        Assert.Equal(1, result.TotalPanels);
        var panel = result.Panels[0];
        Assert.Equal(1, panel.Index);
        Assert.Equal(1200.0, panel.OutputWidthMm);
        Assert.Equal(0.0, panel.OverlapStartMm);
        Assert.Equal(0.0, panel.OverlapEndMm);
        Assert.False(panel.HasGuideLine);
    }

    [Fact]
    public void BR_050_OverlapExceedsRoll_ThrowsSeamsOverlapExceedsRoll()
    {
        // Arrange: overlap 60 mm em rolo de 50 mm
        var input = new SeamsInput(
            ArtworkWidthMm: 1000.0,
            ArtworkHeightMm: 1000.0,
            PrintableRollWidthMm: 50.0,
            OverlapMm: 60.0);

        // Act & Assert
        var ex = Assert.Throws<ImpositionException>(() => PanelCalculator.Calculate(input));
        Assert.Equal(ErrorCodes.SeamsOverlapExceedsRoll, ex.Code);
    }

    [Fact]
    public void BR_050_a_NaN_Width_ThrowsInvalidSeamsInput()
    {
        // Arrange (R-013)
        var input = new SeamsInput(
            ArtworkWidthMm: double.NaN,
            ArtworkHeightMm: 1000.0,
            PrintableRollWidthMm: 1520.0);

        // Act & Assert
        var ex = Assert.Throws<ImpositionException>(() => PanelCalculator.Calculate(input));
        Assert.Equal(ErrorCodes.InvalidSeamsInput, ex.Code);
    }

    [Fact]
    public void BR_050_HorizontalOrientation_SplitsByHeight()
    {
        // Arrange: 1000 x 4000 mm fatiado horizontalmente
        var input = new SeamsInput(
            ArtworkWidthMm: 1000.0,
            ArtworkHeightMm: 4000.0,
            PrintableRollWidthMm: 1520.0,
            OverlapMm: 10.0,
            Orientation: SeamOrientation.Horizontal);

        // Act
        var result = PanelCalculator.Calculate(input);

        // Assert
        Assert.True(result.TotalPanels >= 3);
        foreach (var panel in result.Panels)
        {
            Assert.True(panel.OutputHeightMm <= input.PrintableRollWidthMm + 0.001);
        }
    }

    [Fact]
    public void BR_050_RightToLeft_Direction_OrdersPanelsFromRight()
    {
        // Arrange: 3000 x 1000 mm RightToLeft
        var input = new SeamsInput(
            ArtworkWidthMm: 3000.0,
            ArtworkHeightMm: 1000.0,
            PrintableRollWidthMm: 1520.0,
            OverlapMm: 10.0,
            Direction: SeamDirection.RightToLeft);

        // Act
        var result = PanelCalculator.Calculate(input);

        // Assert
        Assert.Equal(2, result.TotalPanels);
        Assert.True(result.Panels[0].SourceXPositionMm > result.Panels[1].SourceXPositionMm);
        Assert.True(result.Panels[0].HasGuideLine);
        Assert.False(result.Panels[1].HasGuideLine);
    }

    [Fact]
    public void BR_050_b_ApplyShrinkage_AppliesThermalAllowanceToLength()
    {
        // Arrange: 3000 x 1000 mm -> comprimento no rolo é 1000 mm -> encolhimento de 10 + 1*10 = 20 mm
        var input = new SeamsInput(
            ArtworkWidthMm: 3000.0,
            ArtworkHeightMm: 1000.0,
            PrintableRollWidthMm: 1520.0,
            OverlapMm: 10.0,
            ApplyShrinkage: true);

        // Act
        var result = PanelCalculator.Calculate(input);

        // Assert
        // Altura de 1000 mm sofre +20 mm de encolhimento = 1020 mm
        Assert.Equal(20.0, result.ShrinkageAppliedMm);
        foreach (var p in result.Panels)
        {
            Assert.Equal(1020.0, p.OutputHeightMm);
            Assert.Equal(20.0, p.ShrinkageAllowanceMm);
        }
    }

    [Fact]
    public void BR_050_CustomPanelWidth_RespectsConfiguredWidth()
    {
        // Arrange: arte 3000 x 1000 mm, rolo 1520 mm, mas custom panel width = 800 mm
        var input = new SeamsInput(
            ArtworkWidthMm: 3000.0,
            ArtworkHeightMm: 1000.0,
            PrintableRollWidthMm: 1520.0,
            OverlapMm: 10.0,
            CustomPanelWidthMm: 800.0);

        // Act
        var result = PanelCalculator.Calculate(input);

        // Assert
        foreach (var panel in result.Panels)
        {
            Assert.True(panel.OutputWidthMm <= 800.0 + 0.001);
        }
    }
}
