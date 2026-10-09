using FluentAssertions;
using StepRepeatEngine.Geometry;
using Xunit;

namespace StepRepeatTests;

public class GridCalculatorTests
{
    [Fact]
    public void BR_GridCalculator_ShouldCalculate24UpForBusinessCardsOn330x483Sheet()
    {
        // Arrange: Folha 330x483mm, cartão 90x50mm, calha 4mm, sangria 3mm, margens 15mm
        var result = StepAndRepeatGridCalculator.Calculate(
            sheetWidthMm: 330,
            sheetHeightMm: 483,
            itemWidthMm: 90,
            itemHeightMm: 50,
            gutterXMm: 4,
            gutterYMm: 4,
            bleedMm: 3,
            gripperMarginMm: 15,
            sideGuideMarginMm: 15
        );

        // Assert: 3 colunas x 8 linhas = 24-up
        result.Columns.Should().Be(3);
        result.Rows.Should().Be(8);
        result.TotalUp.Should().Be(24);
        result.Cells.Should().HaveCount(24);
    }

    [Fact]
    public void BR_GridCalculator_ShouldApplyGutterBleedResolutionOnInternalCells()
    {
        // Arrange: Calha de 4mm com sangria de 3mm cada. A calha só permite 2mm para cada lado.
        var result = StepAndRepeatGridCalculator.Calculate(
            sheetWidthMm: 330,
            sheetHeightMm: 483,
            itemWidthMm: 90,
            itemHeightMm: 50,
            gutterXMm: 4,
            gutterYMm: 4,
            bleedMm: 3
        );

        var firstCell = result.Cells[0]; // (col 0, row 0)
        firstCell.BleedLeft.Should().Be(3.0); // Borda externa da folha recebe sangria total
        firstCell.BleedRight.Should().Be(2.0); // Borda interna na calha de 4mm recebe 2mm
    }
}
