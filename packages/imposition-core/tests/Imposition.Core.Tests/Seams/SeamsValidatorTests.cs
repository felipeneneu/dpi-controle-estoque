using Imposition.Core.Errors;
using Imposition.Core.Seams;
using Xunit;

namespace Imposition.Core.Tests.Seams;

[Trait("Category", "Seams")]
[Trait("Category", "Validation")]
public sealed class SeamsValidatorTests
{
    [Fact]
    public void BR_050_a_ValidInput_PassesValidation()
    {
        var input = new SeamsInput(
            ArtworkWidthMm: 3000.0,
            ArtworkHeightMm: 1000.0,
            PrintableRollWidthMm: 1520.0,
            OverlapMm: 10.0,
            ApplyShrinkage: true);

        // Deve passar sem lançar exceção
        SeamsValidator.Validate(input);
    }

    [Theory]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    [InlineData(double.NegativeInfinity)]
    [InlineData(0.0)]
    [InlineData(-100.0)]
    public void BR_050_a_InvalidArtworkWidth_ThrowsInvalidSeamsInput(double width)
    {
        var input = new SeamsInput(
            ArtworkWidthMm: width,
            ArtworkHeightMm: 1000.0,
            PrintableRollWidthMm: 1520.0);

        var ex = Assert.Throws<ImpositionException>(() => SeamsValidator.Validate(input));
        Assert.Equal(ErrorCodes.InvalidSeamsInput, ex.Code);
    }

    [Theory]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    [InlineData(double.NegativeInfinity)]
    [InlineData(0.0)]
    [InlineData(-100.0)]
    public void BR_050_a_InvalidArtworkHeight_ThrowsInvalidSeamsInput(double height)
    {
        var input = new SeamsInput(
            ArtworkWidthMm: 3000.0,
            ArtworkHeightMm: height,
            PrintableRollWidthMm: 1520.0);

        var ex = Assert.Throws<ImpositionException>(() => SeamsValidator.Validate(input));
        Assert.Equal(ErrorCodes.InvalidSeamsInput, ex.Code);
    }

    [Theory]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    [InlineData(double.NegativeInfinity)]
    [InlineData(0.0)]
    [InlineData(-1520.0)]
    public void BR_050_a_InvalidPrintableRollWidth_ThrowsInvalidSeamsInput(double rollWidth)
    {
        var input = new SeamsInput(
            ArtworkWidthMm: 3000.0,
            ArtworkHeightMm: 1000.0,
            PrintableRollWidthMm: rollWidth);

        var ex = Assert.Throws<ImpositionException>(() => SeamsValidator.Validate(input));
        Assert.Equal(ErrorCodes.InvalidSeamsInput, ex.Code);
    }

    [Theory]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    [InlineData(-10.0)]
    public void BR_050_a_InvalidOverlap_ThrowsInvalidSeamsInput(double overlap)
    {
        var input = new SeamsInput(
            ArtworkWidthMm: 3000.0,
            ArtworkHeightMm: 1000.0,
            PrintableRollWidthMm: 1520.0,
            OverlapMm: overlap);

        var ex = Assert.Throws<ImpositionException>(() => SeamsValidator.Validate(input));
        Assert.Equal(ErrorCodes.InvalidSeamsInput, ex.Code);
    }

    [Fact]
    public void BR_050_a_OverlapEqualOrGreaterThanRollWidth_ThrowsSeamsOverlapExceedsRoll()
    {
        var input = new SeamsInput(
            ArtworkWidthMm: 3000.0,
            ArtworkHeightMm: 1000.0,
            PrintableRollWidthMm: 1520.0,
            OverlapMm: 1520.0);

        var ex = Assert.Throws<ImpositionException>(() => SeamsValidator.Validate(input));
        Assert.Equal(ErrorCodes.SeamsOverlapExceedsRoll, ex.Code);
    }

    [Fact]
    public void BR_050_a_CustomPanelWidthExceedsRollWidth_ThrowsInvalidSeamsInput()
    {
        var input = new SeamsInput(
            ArtworkWidthMm: 3000.0,
            ArtworkHeightMm: 1000.0,
            PrintableRollWidthMm: 1520.0,
            CustomPanelWidthMm: 1600.0);

        var ex = Assert.Throws<ImpositionException>(() => SeamsValidator.Validate(input));
        Assert.Equal(ErrorCodes.InvalidSeamsInput, ex.Code);
    }

    [Fact]
    public void BR_050_a_OverlapEqualOrGreaterThanCustomPanelWidth_ThrowsSeamsOverlapExceedsRoll()
    {
        var input = new SeamsInput(
            ArtworkWidthMm: 3000.0,
            ArtworkHeightMm: 1000.0,
            PrintableRollWidthMm: 1520.0,
            OverlapMm: 500.0,
            CustomPanelWidthMm: 500.0);

        var ex = Assert.Throws<ImpositionException>(() => SeamsValidator.Validate(input));
        Assert.Equal(ErrorCodes.SeamsOverlapExceedsRoll, ex.Code);
    }
}
