using FluentAssertions;
using StepRepeatEngine.Geometry;
using Xunit;

namespace StepRepeatTests;

public class GutterBleedResolverTests
{
    [Fact]
    public void BR_GutterBleedResolver_ShouldAllowFullBleedWhenGutterIsWideEnough()
    {
        // Arrange: Calha de 10mm, sangria desejada de 3mm de cada lado (total 6mm < 10mm)
        var result = GutterBleedResolver.Resolve(gutterWidthMm: 10.0, requestedBleedAMm: 3.0, requestedBleedBMm: 3.0);

        // Assert
        result.EffectiveBleedItemA.Should().Be(3.0);
        result.EffectiveBleedItemB.Should().Be(3.0);
        result.WasTrimmed.Should().BeFalse();
    }

    [Fact]
    public void BR_GutterBleedResolver_ShouldSplitGutterEquallyWhenGutterIsNarrow()
    {
        // Arrange: Calha de 4mm, sangria desejada de 3mm de cada lado (total 6mm > 4mm)
        var result = GutterBleedResolver.Resolve(gutterWidthMm: 4.0, requestedBleedAMm: 3.0, requestedBleedBMm: 3.0);

        // Assert: Cada item recebe 2mm (50% de 4mm)
        result.EffectiveBleedItemA.Should().Be(2.0);
        result.EffectiveBleedItemB.Should().Be(2.0);
        result.WasTrimmed.Should().BeTrue();
    }

    [Fact]
    public void BR_GutterBleedResolver_ShouldReturnZeroBleedWhenGutterIsZero()
    {
        // Arrange: Itens colados (calha = 0mm)
        var result = GutterBleedResolver.Resolve(gutterWidthMm: 0.0, requestedBleedAMm: 3.0, requestedBleedBMm: 3.0);

        // Assert
        result.EffectiveBleedItemA.Should().Be(0.0);
        result.EffectiveBleedItemB.Should().Be(0.0);
        result.WasTrimmed.Should().BeTrue();
    }

    [Fact]
    public void BR_GutterBleedResolver_ShouldThrowOnInvalidInputs()
    {
        Action act = () => GutterBleedResolver.Resolve(-1.0, 3.0, 3.0);
        act.Should().Throw<ArgumentOutOfRangeException>();
    }
}
