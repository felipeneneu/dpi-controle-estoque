using FluentAssertions;
using Imposition.Render.Preview;
using Xunit;

namespace Imposition.Render.Tests.Preview;

[Trait("Category", "Transform")]
public sealed class CmykToDisplayTransformTests
{
    [Fact]
    public void BR_052_Transform_Cmyk40PercentBlack_ProducesConsistentGrayAroundA6()
    {
        // Arrange: CMYK (0, 0, 0, 40%) -> 40% de 255 = 102
        using var transform = new CmykToDisplayTransform(ColorProfileConfig.Default);
        byte[] cmyk = [0, 0, 0, 102];
        byte[] rgb = new byte[3];

        // Act
        transform.Transform(cmyk, rgb, 1);

        // Assert: Esperado ~#A6A6A6 (166 ± 3 => [163..169])
        rgb[0].Should().BeInRange(163, 169);
        rgb[1].Should().BeInRange(163, 169);
        rgb[2].Should().BeInRange(163, 169);
    }

    [Fact]
    public void BR_052_Transform_Cmyk100PercentBlack_ProducesPureBlack()
    {
        // Arrange: CMYK (0, 0, 0, 100%) -> K = 255
        using var transform = new CmykToDisplayTransform(ColorProfileConfig.Default);
        byte[] cmyk = [0, 0, 0, 255];
        byte[] rgb = new byte[3];

        // Act
        transform.Transform(cmyk, rgb, 1);

        // Assert: Esperado ~#000000 (<= 5)
        rgb[0].Should().BeInRange(0, 5);
        rgb[1].Should().BeInRange(0, 5);
        rgb[2].Should().BeInRange(0, 5);
    }

    [Fact]
    public void BR_052_Transform_Cmyk100PercentCyan_ProducesVisibleCyan()
    {
        // Arrange: CMYK (100%, 0, 0, 0) -> C = 255
        using var transform = new CmykToDisplayTransform(ColorProfileConfig.Default);
        byte[] cmyk = [255, 0, 0, 0];
        byte[] rgb = new byte[3];

        // Act
        transform.Transform(cmyk, rgb, 1);

        // Assert: Esperado ~#00AEEF (R: 0±10, G: 174±10, B: 239±10)
        rgb[0].Should().BeInRange(0, 10);
        rgb[1].Should().BeInRange(164, 184);
        rgb[2].Should().BeInRange(229, 249);
    }

    [Fact]
    public void BR_052_Transform_EmptyBuffer_DoesNotThrow()
    {
        using var transform = new CmykToDisplayTransform(ColorProfileConfig.Default);
        byte[] emptyCmyk = [];
        byte[] emptyRgb = [];

        // Act & Assert (Spans não podem ser capturados por lambdas)
        transform.Transform(emptyCmyk, emptyRgb, 0);
    }

    [Fact]
    public void BR_052_Dispose_CalledTwice_IsIdempotentAndDoesNotThrow()
    {
        var transform = new CmykToDisplayTransform(ColorProfileConfig.Default);

        var action = () =>
        {
            transform.Dispose();
            transform.Dispose();
        };

        action.Should().NotThrow();
    }
}
