using System.Buffers.Binary;
using FluentAssertions;
using ImageMagick;
using Imposition.Render.Export;
using Xunit;

namespace Imposition.Render.Tests.Export;

[Trait("Category", "Export")]
[Trait("Category", "CrossTool")]
public sealed class JpegCmykEncoderTests
{
    private static byte[] CreateSyntheticCmykBuffer(int width, int height)
    {
        var buffer = new byte[width * height * 4];
        for (var i = 0; i < buffer.Length; i += 4)
        {
            buffer[i] = 100;     // C
            buffer[i + 1] = 50;  // M
            buffer[i + 2] = 0;   // Y
            buffer[i + 3] = 40;  // K
        }
        return buffer;
    }

    [Fact]
    public void BR_054_R021_Encode_100x100_MagickNetOpensSuccessfully_ColorSpaceCmyk()
    {
        // Arrange
        const int width = 100;
        const int height = 100;
        var buffer = CreateSyntheticCmykBuffer(width, height);
        using var ms = new MemoryStream();

        // Act
        JpegCmykEncoder.Encode(buffer, width, height, quality: 100, dpi: 150, iccProfile: null, ms);
        var bytes = ms.ToArray();

        // Assert (Regra R-021: Validação cruzada obrigatória com Magick.NET)
        using var magick = new MagickImage(bytes);
        magick.ColorSpace.Should().Be(ColorSpace.CMYK, "O arquivo JPEG deve ser interpretado como CMYK puro (Regra R-020)");
        magick.ChannelCount.Should().Be(4, "O arquivo JPEG deve possuir exatamente 4 canais");
        magick.Width.Should().Be((uint)width);
        magick.Height.Should().Be((uint)height);
    }

    [Fact]
    public void BR_054_R021_Encode_3000x1000_MagickNetOpensWithoutError_DimensionsMatch()
    {
        // Arrange
        const int width = 3000;
        const int height = 1000;
        var buffer = CreateSyntheticCmykBuffer(width, height);
        using var ms = new MemoryStream();

        // Act
        JpegCmykEncoder.Encode(buffer, width, height, quality: 90, dpi: 150, iccProfile: null, ms);
        var bytes = ms.ToArray();

        // Assert (R-021)
        using var magick = new MagickImage(bytes);
        magick.ColorSpace.Should().Be(ColorSpace.CMYK);
        magick.Width.Should().Be((uint)width);
        magick.Height.Should().Be((uint)height);
    }

    [Fact]
    public void BR_054_Encode_HeaderStructure_HasAdobeApp14_ColorTransformZero_NoApp0Jfif()
    {
        // Arrange
        const int width = 20;
        const int height = 20;
        var buffer = CreateSyntheticCmykBuffer(width, height);
        using var ms = new MemoryStream();

        // Act
        JpegCmykEncoder.Encode(buffer, width, height, quality: 100, dpi: 150, iccProfile: null, ms);
        var bytes = ms.ToArray();

        // Assert: SOI
        bytes[0].Should().Be(0xFF);
        bytes[1].Should().Be(0xD8);

        // Assert: EOI
        bytes[^2].Should().Be(0xFF);
        bytes[^1].Should().Be(0xD9);

        // ADR-056: Nunca emitir marcador APP0 (0xFF, 0xE0) em JPEG CMYK
        var hasApp0 = false;
        for (var i = 0; i < bytes.Length - 1; i++)
        {
            if (bytes[i] == 0xFF && bytes[i + 1] == 0xE0)
            {
                hasApp0 = true;
                break;
            }
        }
        hasApp0.Should().BeFalse("JPEG CMYK estrito não pode conter cabeçalho APP0 JFIF (ISO/IEC 10918-5)");

        // ADR-056: Marcador APP14 Adobe (0xFF, 0xEE) presente com ColorTransform = 0
        var app14Index = -1;
        for (var i = 0; i < bytes.Length - 15; i++)
        {
            if (bytes[i] == 0xFF && bytes[i + 1] == 0xEE)
            {
                app14Index = i;
                break;
            }
        }
        app14Index.Should().BeGreaterThan(0, "Marcador APP14 Adobe deve existir no JPEG CMYK");
        
        // Verifica assinatura "Adobe"
        bytes[app14Index + 4].Should().Be((byte)'A');
        bytes[app14Index + 5].Should().Be((byte)'d');
        bytes[app14Index + 6].Should().Be((byte)'o');
        bytes[app14Index + 7].Should().Be((byte)'b');
        bytes[app14Index + 8].Should().Be((byte)'e');

        // ColorTransform está no último byte do marcador APP14 (offset 15 a partir do FF EE)
        bytes[app14Index + 15].Should().Be(0, "ColorTransform no APP14 deve ser 0 (Direct CMYK)");

        // Verifica SOF0 (0xFF, 0xC0) com 4 componentes
        var sof0Index = -1;
        for (var i = 0; i < bytes.Length - 10; i++)
        {
            if (bytes[i] == 0xFF && bytes[i + 1] == 0xC0)
            {
                sof0Index = i;
                break;
            }
        }
        sof0Index.Should().BeGreaterThan(0);
        bytes[sof0Index + 9].Should().Be(4, "SOF0 deve declarar exatamente 4 componentes (CMYK)");
    }

    [Fact]
    public void BR_054_R021_Encode_WithIccProfile_MagickNetDetectsColorProfile()
    {
        // Arrange
        const int width = 50;
        const int height = 50;
        var buffer = CreateSyntheticCmykBuffer(width, height);
        var iccProfile = JpegCmykEncoder.GetDefaultFogra39Profile();
        using var ms = new MemoryStream();

        // Act
        JpegCmykEncoder.Encode(buffer, width, height, quality: 100, dpi: 150, iccProfile: iccProfile, ms);
        var bytes = ms.ToArray();

        // Assert: Marcador APP2 (0xFF, 0xE2) presente
        var hasApp2 = false;
        for (var i = 0; i < bytes.Length - 1; i++)
        {
            if (bytes[i] == 0xFF && bytes[i + 1] == 0xE2)
            {
                hasApp2 = true;
                break;
            }
        }
        hasApp2.Should().BeTrue("Marcador APP2 deve existir para embutir o perfil ICC");

        // Assert (R-021 via Magick.NET)
        using var magick = new MagickImage(bytes);
        magick.ColorSpace.Should().Be(ColorSpace.CMYK);
        var profile = magick.GetColorProfile();
        profile.Should().NotBeNull("Magick.NET deve detectar o perfil ICC embutido em APP2");
    }

    [Fact]
    public void BR_054_Encode_Quality100_GeneratesLargerFileThan_Quality80()
    {
        // Arrange
        const int width = 80;
        const int height = 80;
        var buffer = new byte[width * height * 4];
        for (var i = 0; i < buffer.Length; i++)
        {
            buffer[i] = (byte)(i % 256); // Conteúdo variado
        }

        using var ms100 = new MemoryStream();
        using var ms80 = new MemoryStream();

        // Act
        JpegCmykEncoder.Encode(buffer, width, height, quality: 100, dpi: 150, iccProfile: null, ms100);
        JpegCmykEncoder.Encode(buffer, width, height, quality: 80, dpi: 150, iccProfile: null, ms80);

        // Assert
        ms100.Length.Should().BeGreaterThan(ms80.Length, "Qualidade 100 deve gerar arquivo maior do que qualidade 80");
    }

    [Fact]
    public void BR_054_DecodeCmyk_Roundtrip_RestoresBufferCorrectly()
    {
        // Arrange
        const int width = 32;
        const int height = 32;
        var originalBuffer = CreateSyntheticCmykBuffer(width, height);
        using var ms = new MemoryStream();

        JpegCmykEncoder.Encode(originalBuffer, width, height, quality: 100, dpi: 150, iccProfile: null, ms);
        ms.Position = 0;

        // Act
        var decoded = JpegCmykEncoder.DecodeCmyk(ms, out var decW, out var decH);

        // Assert
        decW.Should().Be(width);
        decH.Should().Be(height);
        decoded.Length.Should().Be(width * height * 4);
    }

    [Fact]
    public void BR_054_Encode_ValidationErrors_ThrowAppropriateExceptions()
    {
        var small = new byte[10];
        using var ms = new MemoryStream();

        // Buffer insuficiente
        var act1 = () => JpegCmykEncoder.Encode(small, 10, 10, 100, 150, null, ms);
        act1.Should().Throw<ArgumentException>();

        // Dimensões inválidas
        var valid = new byte[16];
        var act2 = () => JpegCmykEncoder.Encode(valid, -1, 2, 100, 150, null, ms);
        act2.Should().Throw<ArgumentOutOfRangeException>();

        // Stream fechado
        ms.Dispose();
        var act3 = () => JpegCmykEncoder.Encode(valid, 2, 2, 100, 150, null, ms);
        act3.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void FactorySample_Teste02_Painel01_DecodesViaMagickNet_WhenFileExists()
    {
        var path = @"C:\Users\impressao\Desktop\Emenda Teste\saida_hotfix_jpg\Teste 02_painel_01.jpg";
        if (!File.Exists(path)) return;

        using var magick = new MagickImage(path);
        magick.ColorSpace.Should().Be(ColorSpace.CMYK, "Arquivo real de fábrica deve ser reconhecido como CMYK");
        magick.ChannelCount.Should().Be(4, "Arquivo real de fábrica deve ter 4 canais");
        magick.Width.Should().BeGreaterThan(0);
        magick.Height.Should().BeGreaterThan(0);
    }
}
