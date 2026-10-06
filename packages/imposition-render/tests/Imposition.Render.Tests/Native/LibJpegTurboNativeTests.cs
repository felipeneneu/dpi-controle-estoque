using System.Buffers.Binary;
using FluentAssertions;
using Imposition.Render.Native;
using Xunit;

namespace Imposition.Render.Tests.Native;

[Trait("Category", "Native")]
public sealed class LibJpegTurboNativeTests
{
    [Fact]
    public void BR_054_EncodeCmyk_CreatesValidJpegWithCmykHeaderAnd4Components()
    {
        // Arrange: Buffer 10x10 CMYK (100 pixels * 4 = 400 bytes)
        const int width = 10;
        const int height = 10;
        var cmykBuffer = new byte[width * height * 4];
        for (var i = 0; i < cmykBuffer.Length; i += 4)
        {
            cmykBuffer[i] = 100;    // C
            cmykBuffer[i + 1] = 50; // M
            cmykBuffer[i + 2] = 0;  // Y
            cmykBuffer[i + 3] = 40; // K
        }

        using var ms = new MemoryStream();

        // Act
        LibJpegTurboNative.EncodeCmyk(cmykBuffer, width, height, quality: 100, ms, dpi: 150);
        var bytes = ms.ToArray();

        // Assert
        bytes.Length.Should().BeGreaterThan(50);

        // SOI (0xFF, 0xD8)
        bytes[0].Should().Be(0xFF);
        bytes[1].Should().Be(0xD8);

        // EOI (0xFF, 0xD9)
        bytes[^2].Should().Be(0xFF);
        bytes[^1].Should().Be(0xD9);

        // Verifica marcador SOF0 (0xFF, 0xC0) com 4 componentes (CMYK)
        var sof0Index = -1;
        for (var i = 0; i < bytes.Length - 10; i++)
        {
            if (bytes[i] == 0xFF && bytes[i + 1] == 0xC0)
            {
                sof0Index = i;
                break;
            }
        }

        sof0Index.Should().BeGreaterThan(0, "Marcador SOF0 deve existir no JPEG.");
        var numComponents = bytes[sof0Index + 9];
        numComponents.Should().Be(4, "O JPEG gerado deve possuir exatamente 4 componentes (CMYK puro).");
    }

    [Fact]
    public void BR_054_EncodeCmyk_InsufficientBuffer_ThrowsArgumentException()
    {
        var smallBuffer = new byte[10];
        using var ms = new MemoryStream();

        var act = () => LibJpegTurboNative.EncodeCmyk(smallBuffer, 10, 10, 100, ms);
        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void BR_054_EncodeCmyk_Quality100_EncodesSuccessfully()
    {
        var buffer = new byte[20 * 20 * 4];
        using var ms = new MemoryStream();

        var act = () => LibJpegTurboNative.EncodeCmyk(buffer, 20, 20, quality: 100, ms);
        act.Should().NotThrow();
        ms.Length.Should().BeGreaterThan(0);
    }

    [Fact]
    public void BR_054_EncodeCmyk_Quality80_EncodesSuccessfully()
    {
        var buffer = new byte[20 * 20 * 4];
        using var ms = new MemoryStream();

        var act = () => LibJpegTurboNative.EncodeCmyk(buffer, 20, 20, quality: 80, ms);
        act.Should().NotThrow();
        ms.Length.Should().BeGreaterThan(0);
    }

    [Fact]
    public void BR_054_EncodeCmyk_ClosedStream_ThrowsArgumentException()
    {
        var buffer = new byte[10 * 10 * 4];
        var ms = new MemoryStream();
        ms.Dispose(); // Fecha o stream

        var act = () => LibJpegTurboNative.EncodeCmyk(buffer, 10, 10, 100, ms);
        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void BR_054_EncodeCmyk_Dpi150_WritesCorrectDpiInJfifHeader()
    {
        const int dpi = 150;
        var buffer = new byte[8 * 8 * 4];
        using var ms = new MemoryStream();

        LibJpegTurboNative.EncodeCmyk(buffer, 8, 8, quality: 90, ms, dpi: dpi);
        var bytes = ms.ToArray();

        // Localiza marcador APP0 (0xFF, 0xE0)
        var app0Index = -1;
        for (var i = 0; i < bytes.Length - 16; i++)
        {
            if (bytes[i] == 0xFF && bytes[i + 1] == 0xE0)
            {
                app0Index = i;
                break;
            }
        }

        app0Index.Should().BeGreaterThanOrEqualTo(2, "Marcador APP0 JFIF deve existir.");

        // Unidade (1 = dots/inch)
        bytes[app0Index + 11].Should().Be(1);

        // Densidade X e Y
        var xDensity = BinaryPrimitives.ReadUInt16BigEndian(bytes.AsSpan(app0Index + 12, 2));
        var yDensity = BinaryPrimitives.ReadUInt16BigEndian(bytes.AsSpan(app0Index + 14, 2));

        xDensity.Should().Be(dpi);
        yDensity.Should().Be(dpi);
    }
}
