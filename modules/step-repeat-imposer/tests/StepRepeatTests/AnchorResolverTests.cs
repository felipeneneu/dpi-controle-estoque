using FluentAssertions;
using StepRepeatEngine.Geometry;
using Xunit;

namespace StepRepeatTests;

public class AnchorResolverTests
{
    [Fact]
    public void BR_AnchorResolver_ShouldPositionSluglineAtTopLeftOfPressSheet()
    {
        // Arrange: Chapa de 740 x 520 mm
        var sheetRect = new Rect2D(0, 0, 740, 520);
        double markWidth = 200;
        double markHeight = 15;

        // Act: Ancorar o canto superior esquerdo da marca no canto superior esquerdo da chapa com offset (10, -5) mm
        var result = AnchorResolver.Resolve(
            targetRect: sheetRect,
            markWidth: markWidth,
            markHeight: markHeight,
            targetAnchor: AnchorPoint.TopLeft,
            markAnchor: AnchorPoint.TopLeft,
            offsetX: 10.0,
            offsetY: -5.0
        );

        // Assert
        result.X.Should().Be(10.0);
        result.Y.Should().Be(500.0); // 520 - 15 - 5 = 500
        result.Width.Should().Be(200.0);
        result.Height.Should().Be(15.0);
    }

    [Fact]
    public void BR_AnchorResolver_ShouldCenterColorBarAtTopMarginOfPressSheet()
    {
        // Arrange: Chapa de 740 x 520 mm
        var sheetRect = new Rect2D(0, 0, 740, 520);
        double markWidth = 500;
        double markHeight = 10;

        // Act: Ancorar o centro superior da marca no centro superior da chapa com offset (0, -2) mm
        var result = AnchorResolver.Resolve(
            targetRect: sheetRect,
            markWidth: markWidth,
            markHeight: markHeight,
            targetAnchor: AnchorPoint.TopCenter,
            markAnchor: AnchorPoint.TopCenter,
            offsetX: 0.0,
            offsetY: -2.0
        );

        // Assert
        result.X.Should().Be(120.0); // (740/2) - (500/2) = 370 - 250 = 120
        result.Y.Should().Be(508.0); // 520 - 10 - 2 = 508
    }

    [Fact]
    public void BR_AnchorResolver_ShouldThrowOnInvalidDimensions()
    {
        var sheetRect = new Rect2D(0, 0, 740, 520);

        Action actNaN = () => AnchorResolver.Resolve(sheetRect, double.NaN, 10, AnchorPoint.Center, AnchorPoint.Center);
        Action actNegative = () => AnchorResolver.Resolve(sheetRect, 100, -5, AnchorPoint.Center, AnchorPoint.Center);

        actNaN.Should().Throw<ArgumentOutOfRangeException>();
        actNegative.Should().Throw<ArgumentOutOfRangeException>();
    }
}
