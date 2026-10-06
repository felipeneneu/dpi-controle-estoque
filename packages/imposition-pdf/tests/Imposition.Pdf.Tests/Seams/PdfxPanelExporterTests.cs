using System;
using System.Buffers.Binary;
using System.IO;
using System.Text;
using FluentAssertions;
using Imposition.Core.Errors;
using Imposition.Core.Seams;
using Imposition.Pdf.Preflight;
using Imposition.Pdf.Seams;
using Imposition.Pdf.Tests.TestHelpers;
using Xunit;

namespace Imposition.Pdf.Tests.Seams;

[Trait("Category", "ExporterTests")]
public class PdfxPanelExporterTests : IDisposable
{
    private readonly string _tempDir;
    private static readonly Encoding Latin1 = Encoding.GetEncoding(28591);

    public PdfxPanelExporterTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "PdfxPanelExporterTests_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_tempDir);
    }

    public void Dispose()
    {
        try
        {
            if (Directory.Exists(_tempDir))
                Directory.Delete(_tempDir, true);
        }
        catch { }
    }

    private static byte[] CreateValidSyntheticIcc(int size = 128)
    {
        var bytes = new byte[size];
        BinaryPrimitives.WriteUInt32BigEndian(bytes.AsSpan(0, 4), (uint)size);
        bytes[36] = (byte)'a';
        bytes[37] = (byte)'c';
        bytes[38] = (byte)'s';
        bytes[39] = (byte)'p';
        return bytes;
    }

    private static SeamsResult CreateSampleSeamsResult(double artworkWidthMm = 3000, double artworkHeightMm = 1000)
    {
        var input = new SeamsInput(
            ArtworkWidthMm: artworkWidthMm,
            ArtworkHeightMm: artworkHeightMm,
            PrintableRollWidthMm: 1100,
            OverlapMm: 50,
            ApplyShrinkage: false);
        return PanelCalculator.Calculate(input);
    }

    [Fact]
    public async Task BR_055_ExportAsync_3Panels_ExportsAndValidatesSuccessfully()
    {
        var pdfPath = Path.Combine(_tempDir, "source.pdf");
        PdfInspector.CreateSampleQdfWithoutOcg(pdfPath);

        var seams = CreateSampleSeamsResult();
        var icc = CreateValidSyntheticIcc(256);
        var options = new PdfxExportOptions(new PdfxOutputIntent("FOGRA39", "ISO Coated v2 (ECI)", icc));

        var exporter = new PdfxPanelExporter();
        var result = await exporter.ExportAsync(pdfPath, seams, _tempDir, options);

        result.GeneratedFiles.Should().HaveCount(3);
        result.PerPanelResults.Should().HaveCount(3);
        result.AllCompliant.Should().BeTrue();
        result.ElapsedTime.Should().BeGreaterThan(TimeSpan.Zero);

        foreach (var file in result.GeneratedFiles)
        {
            File.Exists(file).Should().BeTrue();
            var content = File.ReadAllText(file, Latin1);
            content.Should().Contain("/OutputIntents");
            content.Should().Contain("/GTS_PDFX");
        }
    }

    [Fact]
    public async Task BR_055_ExportAsync_NullOutputIntent_ThrowsArgumentNullException()
    {
        var pdfPath = Path.Combine(_tempDir, "source.pdf");
        PdfInspector.CreateSampleQdfWithoutOcg(pdfPath);

        var seams = CreateSampleSeamsResult();
        var options = new PdfxExportOptions(null!);

        var exporter = new PdfxPanelExporter();
        var act = async () => await exporter.ExportAsync(pdfPath, seams, _tempDir, options);

        await act.Should().ThrowAsync<ArgumentNullException>();
    }

    [Fact]
    public async Task BR_055_ExportAsync_WithProgress_ReportsGranularProgress()
    {
        var pdfPath = Path.Combine(_tempDir, "source_progress.pdf");
        PdfInspector.CreateSampleQdfWithoutOcg(pdfPath);

        var seams = CreateSampleSeamsResult();
        var icc = CreateValidSyntheticIcc();
        var options = new PdfxExportOptions(new PdfxOutputIntent("FOGRA39", "ISO Coated v2 (ECI)", icc));

        var progressValues = new List<double>();
        var progress = new Progress<double>(v => progressValues.Add(v));

        var exporter = new PdfxPanelExporter();
        var result = await exporter.ExportAsync(pdfPath, seams, _tempDir, options, progress);

        result.AllCompliant.Should().BeTrue();
        progressValues.Should().Contain(0.0);
        progressValues.Should().Contain(1.0);
    }

    [Fact]
    public async Task BR_055_ExportAsync_SourceWithRgb_ThrowsExportSourceNotCmyk()
    {
        var pdfPath = Path.Combine(_tempDir, "source_rgb.pdf");
        var rgbContent = """
            %%Comment: QDF 1.0
            1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
            2 0 obj << /Type /Pages /Count 1 /Kids [ 3 0 R ] >> endobj
            3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [ 0 0 100 100 ] /Contents 4 0 R >> endobj
            4 0 obj << /Length 30 >> stream
            1 0 0 rg 0 0 50 50 re f
            endstream endobj
            xref
            0 5
            0000000000 65535 f
            0000000015 00000 n
            trailer << /Root 1 0 R /Size 5 >>
            startxref
            300
            %%EOF
            """;
        File.WriteAllText(pdfPath, rgbContent, Latin1);

        var seams = CreateSampleSeamsResult();
        var icc = CreateValidSyntheticIcc();
        var options = new PdfxExportOptions(new PdfxOutputIntent("FOGRA39", "ISO Coated v2 (ECI)", icc));

        var exporter = new PdfxPanelExporter();
        var act = async () => await exporter.ExportAsync(pdfPath, seams, _tempDir, options);

        var ex = (await act.Should().ThrowAsync<ImpositionException>()).Which;
        ex.Code.Should().Be(ErrorCodes.ExportSourceNotCmyk);
    }
}
