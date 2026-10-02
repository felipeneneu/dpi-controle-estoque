using System.Globalization;
using Imposition.Core.Errors;
using Imposition.Core.Seams;
using Xunit;

namespace Imposition.Core.Tests.Seams;

[Trait("Category", "Shrinkage")]
[Trait("Category", "Seams")]
public sealed class ShrinkageCalculatorTests
{
    [Theory]
    [InlineData(1000.0, 20.0)]  // 1,0 m -> 10 + (1 * 10) = 20 mm (total 102 cm)
    [InlineData(2100.0, 40.0)]  // 2,1 m -> 10 + (3 * 10) = 40 mm (total 214 cm)
    [InlineData(3000.0, 40.0)]  // 3,0 m -> 10 + (3 * 10) = 40 mm (total 304 cm)
    [InlineData(5000.0, 60.0)]  // 5,0 m -> 10 + (5 * 10) = 60 mm (total 506 cm)
    [InlineData(0.0, 10.0)]     // 0,0 m -> 10 mm (apenas parcela fixa)
    public void BR_050_b_CalculateAllowanceMm_ValidLengths_ReturnsExpectedAllowance(double lengthMm, double expectedAllowanceMm)
    {
        // Act
        var allowance = ShrinkageCalculator.CalculateAllowanceMm(lengthMm);

        // Assert
        Assert.Equal(expectedAllowanceMm, allowance, precision: 3);
    }

    [Fact]
    public void BR_050_b_CalculateAllowanceMm_NaN_ThrowsInvalidSeamsInput()
    {
        // Act & Assert (R-013)
        var ex = Assert.Throws<ImpositionException>(() => ShrinkageCalculator.CalculateAllowanceMm(double.NaN));
        Assert.Equal(ErrorCodes.InvalidSeamsInput, ex.Code);
    }

    [Fact]
    public void BR_050_b_CalculateAllowanceMm_PositiveInfinity_ThrowsInvalidSeamsInput()
    {
        // Act & Assert (R-013)
        var ex = Assert.Throws<ImpositionException>(() => ShrinkageCalculator.CalculateAllowanceMm(double.PositiveInfinity));
        Assert.Equal(ErrorCodes.InvalidSeamsInput, ex.Code);
    }

    [Fact]
    public void BR_050_b_CalculateAllowanceMm_NegativeInfinity_ThrowsInvalidSeamsInput()
    {
        // Act & Assert (R-013)
        var ex = Assert.Throws<ImpositionException>(() => ShrinkageCalculator.CalculateAllowanceMm(double.NegativeInfinity));
        Assert.Equal(ErrorCodes.InvalidSeamsInput, ex.Code);
    }

    [Fact]
    public void BR_050_b_CalculateAllowanceMm_NegativeLength_ThrowsInvalidSeamsInput()
    {
        // Act & Assert (R-013)
        var ex = Assert.Throws<ImpositionException>(() => ShrinkageCalculator.CalculateAllowanceMm(-100.0));
        Assert.Equal(ErrorCodes.InvalidSeamsInput, ex.Code);
    }
}
