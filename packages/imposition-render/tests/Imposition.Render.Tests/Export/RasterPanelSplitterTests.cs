using System.Buffers.Binary;
using FluentAssertions;
using Imposition.Core.Errors;
using Imposition.Core.Seams;
using Imposition.Render.Export;
using Xunit;

namespace Imposition.Render.Tests.Export;

[Trait("Category", "Splitter")]
public sealed class RasterPanelSplitterTests
{
    private static SeamsResult CreateTwoPanelSeamsResult(
        double artworkWidthMm = 2000.0,
        double artworkHeightMm = 1000.0,
        double rollWidthMm = 1200.0,
        double overlapMm = 20.0)
    {
        var input = new SeamsInput(
            artworkWidthMm,
            artworkHeightMm,
            rollWidthMm,
            overlapMm,
            ApplyShrinkage: false);

        return PanelCalculator.Calculate(input);
    }

    [Fact]
    public void BR_054_Split_TwoPanelsVertical_ExtractsExactDimensionsAndPixels()
    {
        // Arrange: Banner 2000x1000mm em rolo 1200mm -> 2 painéis verticais
        var seamsResult = CreateTwoPanelSeamsResult(2000.0, 1000.0, 1200.0, 20.0);
        var dpi = 150;

        var expectedW1Px = (int)Math.Round(seamsResult.Panels[0].OutputWidthMm * dpi / 25.4);
        var expectedH1Px = (int)Math.Round(seamsResult.Panels[0].OutputHeightMm * dpi / 25.4);

        var srcWidthPx = (int)Math.Round(2000.0 * dpi / 25.4);
        var srcHeightPx = (int)Math.Round(1000.0 * dpi / 25.4);

        // Preenche metade esquerda com Ciano 100% e direita com Magenta 100%
        var srcBuffer = new byte[srcWidthPx * srcHeightPx * 4];
        for (var y = 0; y < srcHeightPx; y++)
        {
            for (var x = 0; x < srcWidthPx; x++)
            {
                var offset = (y * srcWidthPx + x) * 4;
                if (x < srcWidthPx / 2)
                {
                    srcBuffer[offset] = 255; // Cyan
                }
                else
                {
                    srcBuffer[offset + 1] = 255; // Magenta
                }
            }
        }

        // Act
        var panels = RasterPanelSplitter.Split(srcBuffer, srcWidthPx, srcHeightPx, seamsResult, dpi);

        // Assert
        panels.Should().HaveCount(2);

        var p1 = panels[0];
        p1.PanelIndex.Should().Be(1);
        p1.WidthPx.Should().Be(expectedW1Px);
        p1.HeightPx.Should().Be(expectedH1Px);
        p1.Dpi.Should().Be(150);
        p1.CmykBuffer.Length.Should().Be(expectedW1Px * expectedH1Px * 4);

        // Primeiro pixel do painel 1 é ciano puro
        p1.CmykBuffer[0].Should().Be(255); // C
        p1.CmykBuffer[1].Should().Be(0);   // M

        var p2 = panels[1];
        p2.PanelIndex.Should().Be(2);
        p2.CmykBuffer.Length.Should().Be(p2.WidthPx * p2.HeightPx * 4);
    }

    [Fact]
    public void BR_054_SplitPanel_WithGuideLine_PaintsK40LineInOverlap()
    {
        // Arrange
        var seamsResult = CreateTwoPanelSeamsResult(2000.0, 1000.0, 1200.0, 20.0);
        var dpi = 150;

        var srcWidthPx = (int)Math.Round(2000.0 * dpi / 25.4);
        var srcHeightPx = (int)Math.Round(1000.0 * dpi / 25.4);
        var srcBuffer = new byte[srcWidthPx * srcHeightPx * 4]; // Fundo branco/zerado

        // Identifica painel com linha guia
        var panelWithGuide = seamsResult.Panels.FirstOrDefault(p => p.HasGuideLine);
        panelWithGuide.Should().NotBeNull();

        // Act
        var panelData = RasterPanelSplitter.SplitPanel(
            srcBuffer,
            srcWidthPx,
            srcHeightPx,
            panelWithGuide!,
            seamsResult,
            dpi);

        // Assert: Procura a linha K40% (K = 102) desenhada no buffer
        var foundK40Pixel = false;
        for (var i = 0; i < panelData.CmykBuffer.Length; i += 4)
        {
            var k = panelData.CmykBuffer[i + 3];
            if (k == 102) // 40% de 255 = 102
            {
                foundK40Pixel = true;
                panelData.CmykBuffer[i].Should().Be(0);     // C = 0
                panelData.CmykBuffer[i + 1].Should().Be(0); // M = 0
                panelData.CmykBuffer[i + 2].Should().Be(0); // Y = 0
                break;
            }
        }

        foundK40Pixel.Should().BeTrue("A linha-guia K40% deve ser desenhada no buffer CMYK do painel elegível.");
    }

    [Fact]
    public void BR_054_SplitFromFile_ThrowsExportSourceNotCmyk_WhenImageIsNot4Channels()
    {
        // Arrange: Cria JPEG simulado de 3 componentes (RGB)
        var tempFile = Path.Combine(Path.GetTempPath(), $"test_rgb_{Guid.NewGuid():N}.jpg");
        try
        {
            using (var fs = File.Create(tempFile))
            {
                // SOI
                fs.WriteByte(0xFF);
                fs.WriteByte(0xD8);

                // SOF0 com 3 componentes (RGB)
                Span<byte> sof0 = stackalloc byte[17];
                sof0[0] = 0xFF;
                sof0[1] = 0xC0;
                BinaryPrimitives.WriteUInt16BigEndian(sof0[2..4], 15);
                sof0[4] = 8;
                BinaryPrimitives.WriteUInt16BigEndian(sof0[5..7], 100);
                BinaryPrimitives.WriteUInt16BigEndian(sof0[7..9], 100);
                sof0[9] = 3; // 3 componentes! (RGB)
                fs.Write(sof0);

                // EOI
                fs.WriteByte(0xFF);
                fs.WriteByte(0xD9);
            }

            var seamsResult = CreateTwoPanelSeamsResult();

            // Act & Assert
            var act = () => RasterPanelSplitter.SplitFromFile(tempFile, seamsResult);
            act.Should().Throw<ImpositionException>()
                .Where(ex => ex.Code == ErrorCodes.ExportSourceNotCmyk);
        }
        finally
        {
            if (File.Exists(tempFile))
            {
                File.Delete(tempFile);
            }
        }
    }

    [Theory]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    [InlineData(-150.0)]
    [InlineData(0.0)]
    public void BR_054_Split_InvalidDpi_ThrowsInvalidExportInput_R013(double invalidDpi)
    {
        var seamsResult = CreateTwoPanelSeamsResult();
        var buffer = new byte[100 * 100 * 4];

        var act = () => RasterPanelSplitter.Split(buffer, 100, 100, seamsResult, invalidDpi);
        act.Should().Throw<ImpositionException>()
            .Where(ex => ex.Code == ErrorCodes.InvalidExportInput);
    }
}
