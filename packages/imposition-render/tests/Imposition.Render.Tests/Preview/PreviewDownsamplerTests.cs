using System.Diagnostics;
using FluentAssertions;
using Imposition.Render.Preview;
using Xunit;

namespace Imposition.Render.Tests.Preview;

[Trait("Category", "Preview")]
public sealed class PreviewDownsamplerTests
{
    [Fact]
    public void BR_052_CalculateDimensions_PerformanceMode_FitsStrictlyInsideViewport()
    {
        // Arrange: Imagem 4000x2000, Viewport 800x600
        var (w, h) = PreviewDownsampler.CalculateDimensions(4000, 2000, 800, 600, PreviewRenderMode.Performance);

        // Assert: Redução na proporção 4:2 -> 800x400
        w.Should().Be(800);
        h.Should().Be(400);
        w.Should().BeLessThanOrEqualTo(800);
        h.Should().BeLessThanOrEqualTo(600);
    }

    [Fact]
    public void BR_052_CalculateDimensions_BalancedMode_CalculatesProportionalIntermediate()
    {
        // Arrange: Imagem 4000x2000, Viewport 800x600 -> scale = 800/4000 * 1.5 = 0.3
        var (w, h) = PreviewDownsampler.CalculateDimensions(4000, 2000, 800, 600, PreviewRenderMode.Balanced);

        // Assert: 4000 * 0.3 = 1200, 2000 * 0.3 = 600
        w.Should().Be(1200);
        h.Should().Be(600);
    }

    [Fact]
    public void BR_052_CalculateDimensions_QualityMode_PreservesHighResolution()
    {
        // Arrange: Imagem 2000x1000, Viewport 800x600
        var (w, h) = PreviewDownsampler.CalculateDimensions(2000, 1000, 800, 600, PreviewRenderMode.Quality);

        // Assert: Preserva 1:1
        w.Should().Be(2000);
        h.Should().Be(1000);
    }

    [Fact]
    public void BR_052_DownsampleCmyk_PreservesCmykChannelsAndAveragesCorrectly()
    {
        // Arrange: Imagem 2x2 pixels CMYK
        // Pixel (0,0): C=100, M=0, Y=0, K=0
        // Pixel (1,0): C=0, M=100, Y=0, K=0
        // Pixel (0,1): C=0, M=0, Y=100, K=0
        // Pixel (1,1): C=0, M=0, Y=0, K=100
        byte[] srcCmyk = [
            100, 0, 0, 0,     0, 100, 0, 0,
            0, 0, 100, 0,     0, 0, 0, 100
        ];

        // Act: Downsample 2x2 -> 1x1
        var (dstBuffer, dstW, dstH) = PreviewDownsampler.DownsampleCmyk(
            srcCmyk, 2, 2, 1, 1, PreviewRenderMode.Performance);

        // Assert: Cada canal médio = 100 / 4 = 25
        dstW.Should().Be(1);
        dstH.Should().Be(1);
        dstBuffer.Length.Should().Be(4);
        dstBuffer[0].Should().Be(25); // C
        dstBuffer[1].Should().Be(25); // M
        dstBuffer[2].Should().Be(25); // Y
        dstBuffer[3].Should().Be(25); // K
    }

    [Fact]
    public void BR_052_DownsampleCmyk_PerformanceBenchmark_ExecutesUnder100Ms()
    {
        // Arrange: Imagem de 1000x1000 (1 Megapixel CMYK = 4 MB) -> Downscale para 200x200
        var srcCmyk = new byte[1000 * 1000 * 4];
        Array.Fill(srcCmyk, (byte)50);

        var sw = Stopwatch.StartNew();

        // Act
        var (dst, w, h) = PreviewDownsampler.DownsampleCmyk(srcCmyk, 1000, 1000, 200, 200, PreviewRenderMode.Performance);

        sw.Stop();

        // Assert: Deve executar em tempo muito inferior a 100 ms
        w.Should().Be(200);
        h.Should().Be(200);
        sw.ElapsedMilliseconds.Should().BeLessThan(100);
    }
}
