using System.Buffers.Binary;
using FluentAssertions;
using ImageMagick;
using Imposition.Core.Errors;
using Imposition.Core.Seams;
using Imposition.Render.Export;
using Xunit;

namespace Imposition.Render.Tests.Export;

[Trait("Category", "Export")]
public sealed class JpgPanelExporterTests : IDisposable
{
    private readonly string _testDir;

    public JpgPanelExporterTests()
    {
        _testDir = Path.Combine(Path.GetTempPath(), $"exporter_test_{Guid.NewGuid():N}");
        Directory.CreateDirectory(_testDir);
    }

    public void Dispose()
    {
        if (Directory.Exists(_testDir))
        {
            try { Directory.Delete(_testDir, recursive: true); } catch { /* Ignore */ }
        }
    }

    private static SeamsResult CreateTwoPanelSeamsResult()
    {
        var input = new SeamsInput(
            ArtworkWidthMm: 2000.0,
            ArtworkHeightMm: 1000.0,
            PrintableRollWidthMm: 1200.0,
            OverlapMm: 20.0,
            ApplyShrinkage: false);

        return PanelCalculator.Calculate(input);
    }

    private static byte[] CreateSyntheticCmykBuffer(int width, int height)
    {
        var buffer = new byte[width * height * 4];
        for (var i = 0; i < buffer.Length; i += 4)
        {
            buffer[i] = 255;     // Cyan 100%
            buffer[i + 1] = 0;   // Magenta 0%
            buffer[i + 2] = 0;   // Yellow 0%
            buffer[i + 3] = 50;  // Black 20%
        }
        return buffer;
    }

    [Fact]
    public async Task BR_054_ExportPanelsFromBufferAsync_GeneratesCorrectFilesAndNaming()
    {
        // Arrange
        var seamsResult = CreateTwoPanelSeamsResult();
        var dpi = 150;
        var srcW = (int)Math.Round(2000.0 * dpi / 25.4);
        var srcH = (int)Math.Round(1000.0 * dpi / 25.4);
        var buffer = CreateSyntheticCmykBuffer(srcW, srcH);

        var exporter = new JpgPanelExporter();
        var options = new JpgExportOptions(Quality: 100, Dpi: 150, NamingPattern: "{job}_painel_{index:D2}.jpg");

        // Act
        var result = await exporter.ExportPanelsFromBufferAsync(
            buffer,
            srcW,
            srcH,
            "banner_natal",
            seamsResult,
            _testDir,
            options);

        // Assert (R-019: Campos de desfecho validados)
        result.Should().NotBeNull();
        result.GeneratedFiles.Should().HaveCount(2);
        result.TotalBytes.Should().BeGreaterThan(0);
        result.ElapsedTime.Should().BeGreaterThan(TimeSpan.Zero);

        var file1 = Path.Combine(_testDir, "banner_natal_painel_01.jpg");
        var file2 = Path.Combine(_testDir, "banner_natal_painel_02.jpg");

        File.Exists(file1).Should().BeTrue();
        File.Exists(file2).Should().BeTrue();

        result.GeneratedFiles[0].Should().Be(file1);
        result.GeneratedFiles[1].Should().Be(file2);

        // Verifica que não ficaram arquivos .tmp residuais
        Directory.GetFiles(_testDir, "*.tmp*").Should().BeEmpty();

        // Valida que os arquivos gerados são JPEG CMYK válidos com 4 componentes
        var header1 = RasterPanelSplitter.ReadJpegHeaderInfo(file1);
        header1.Components.Should().Be(4, "O arquivo exportado deve ter 4 canais CMYK (Regra R-020)");

        var header2 = RasterPanelSplitter.ReadJpegHeaderInfo(file2);
        header2.Components.Should().Be(4, "O arquivo exportado deve ter 4 canais CMYK (Regra R-020)");

        // Regra R-021: Validação cruzada com decodificador externo (Magick.NET)
        using var magick1 = new MagickImage(file1);
        magick1.ColorSpace.Should().Be(ColorSpace.CMYK, "Painel 1 deve ser reconhecido como CMYK por biblioteca externa");
        magick1.ChannelCount.Should().Be(4, "Painel 1 deve ter 4 canais");

        using var magick2 = new MagickImage(file2);
        magick2.ColorSpace.Should().Be(ColorSpace.CMYK, "Painel 2 deve ser reconhecido como CMYK por biblioteca externa");
        magick2.ChannelCount.Should().Be(4, "Painel 2 deve ter 4 canais");
    }

    [Fact]
    public async Task BR_054_ExportPanelsAsync_ReportsProgressCorrectly()
    {
        // Arrange
        var seamsResult = CreateTwoPanelSeamsResult();
        var dpi = 150;
        var srcW = (int)Math.Round(2000.0 * dpi / 25.4);
        var srcH = (int)Math.Round(1000.0 * dpi / 25.4);
        var buffer = CreateSyntheticCmykBuffer(srcW, srcH);

        var progressValues = new List<double>();
        var progress = new Progress<double>(v => progressValues.Add(v));

        var exporter = new JpgPanelExporter();

        // Act
        await exporter.ExportPanelsFromBufferAsync(
            buffer,
            srcW,
            srcH,
            "job_progresso",
            seamsResult,
            _testDir,
            progress: progress);

        // Assert
        progressValues.Should().NotBeEmpty();
        progressValues.Last().Should().Be(1.0);
    }

    [Fact]
    public async Task BR_054_ExportPanelsAsync_Cancellation_CleansUpTempFiles()
    {
        // Arrange
        var seamsResult = CreateTwoPanelSeamsResult();
        var buffer = CreateSyntheticCmykBuffer(100, 100);
        var exporter = new JpgPanelExporter();

        using var cts = new CancellationTokenSource();
        cts.Cancel(); // Pré-cancelado

        // Act & Assert
        var act = () => exporter.ExportPanelsFromBufferAsync(
            buffer,
            100,
            100,
            "job_cancelado",
            seamsResult,
            _testDir,
            cancellationToken: cts.Token);

        await act.Should().ThrowAsync<OperationCanceledException>();

        // Nenhum .tmp deve sobrar no diretório
        Directory.GetFiles(_testDir, "*.tmp*").Should().BeEmpty();
    }

    [Fact]
    public async Task BR_054_ExportPanelsAsync_ThrowsExportSourceNotCmyk_OnRgbFile()
    {
        // Arrange: Gera arquivo JPEG RGB (3 componentes)
        var rgbFile = Path.Combine(_testDir, "source_rgb.jpg");
        using (var fs = File.Create(rgbFile))
        {
            fs.WriteByte(0xFF);
            fs.WriteByte(0xD8);

            Span<byte> sof0 = stackalloc byte[17];
            sof0[0] = 0xFF;
            sof0[1] = 0xC0;
            BinaryPrimitives.WriteUInt16BigEndian(sof0[2..4], 15);
            sof0[4] = 8;
            BinaryPrimitives.WriteUInt16BigEndian(sof0[5..7], 100);
            BinaryPrimitives.WriteUInt16BigEndian(sof0[7..9], 100);
            sof0[9] = 3; // 3 canais = RGB!
            fs.Write(sof0);

            fs.WriteByte(0xFF);
            fs.WriteByte(0xD9);
        }

        var seamsResult = CreateTwoPanelSeamsResult();
        var exporter = new JpgPanelExporter();

        // Act & Assert
        var act = () => exporter.ExportPanelsAsync(rgbFile, seamsResult, _testDir);
        await act.Should().ThrowAsync<ImpositionException>()
            .Where(ex => ex.Code == ErrorCodes.ExportSourceNotCmyk);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(101)]
    [InlineData(-5)]
    public async Task BR_054_ExportPanelsAsync_InvalidQuality_ThrowsInvalidExportInput(int invalidQuality)
    {
        var seamsResult = CreateTwoPanelSeamsResult();
        var buffer = CreateSyntheticCmykBuffer(100, 100);
        var exporter = new JpgPanelExporter();
        var options = new JpgExportOptions(Quality: invalidQuality);

        var act = () => exporter.ExportPanelsFromBufferAsync(
            buffer,
            100,
            100,
            "job_test",
            seamsResult,
            _testDir,
            options);

        await act.Should().ThrowAsync<ImpositionException>()
            .Where(ex => ex.Code == ErrorCodes.InvalidExportInput);
    }
}
