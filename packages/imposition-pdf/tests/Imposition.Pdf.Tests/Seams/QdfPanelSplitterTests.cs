using System;
using System.IO;
using System.Text;
using FluentAssertions;
using Imposition.Core.Errors;
using Imposition.Core.Seams;
using Imposition.Pdf.Seams;
using Imposition.Pdf.Tests.TestHelpers;
using Xunit;

namespace Imposition.Pdf.Tests.Seams;

[Trait("Category", "Splitter")]
public class QdfPanelSplitterTests : IDisposable
{
    private readonly string _tempDir;
    private static readonly Encoding Latin1 = Encoding.GetEncoding(28591);

    public QdfPanelSplitterTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "QdfPanelSplitterTests_" + Guid.NewGuid().ToString("N"));
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
    public async Task BR_055_SplitAsync_3VerticalPanels_Generates3PdfsWithCorrectBoxes()
    {
        var pdfPath = Path.Combine(_tempDir, "banner_cmyk.pdf");
        PdfInspector.CreateSampleQdfWithoutOcg(pdfPath);

        var seams = CreateSampleSeamsResult();
        var splitter = new QdfPanelSplitter();

        var outputFiles = await splitter.SplitAsync(
            pdfPath,
            seams,
            _tempDir,
            "{job}_painel_{index:D2}.pdf");

        outputFiles.Should().HaveCount(seams.TotalPanels);
        foreach (var file in outputFiles)
        {
            File.Exists(file).Should().BeTrue();
            var content = File.ReadAllText(file, Latin1);
            content.Should().Contain("/MediaBox");
            content.Should().Contain("/CropBox");
            content.Should().NotContain(".tmp");
        }
    }

    [Fact]
    public async Task BR_055_SplitAsync_WithGuideLines_InjectsGuideLineOperators()
    {
        var pdfPath = Path.Combine(_tempDir, "banner_guidelines.pdf");
        PdfInspector.CreateSampleQdfWithoutOcg(pdfPath);

        var seams = CreateSampleSeamsResult();
        var splitter = new QdfPanelSplitter();

        var outputFiles = await splitter.SplitAsync(
            pdfPath,
            seams,
            _tempDir,
            "{job}_painel_{index:D2}.pdf");

        // Painel com HasGuideLine == true deve conter operador de cor CMYK 0 0 0 0.40 k
        bool foundGuideLine = false;
        for (int i = 0; i < seams.Panels.Count; i++)
        {
            if (seams.Panels[i].HasGuideLine)
            {
                var content = File.ReadAllText(outputFiles[i], Latin1);
                content.Should().Contain("0 0 0 0.40 k");
                foundGuideLine = true;
            }
        }
        foundGuideLine.Should().BeTrue();
    }

    [Fact]
    public async Task BR_055_SplitAsync_SourceWithOcg_ThrowsSourceHasOcg()
    {
        var pdfPath = Path.Combine(_tempDir, "banner_ocg.pdf");
        PdfInspector.CreateSampleQdfWithOcg(pdfPath); // Contém /OCProperties

        var seams = CreateSampleSeamsResult();
        var splitter = new QdfPanelSplitter();

        var act = async () => await splitter.SplitAsync(
            pdfPath,
            seams,
            _tempDir,
            "{job}_painel_{index:D2}.pdf");

        var ex = (await act.Should().ThrowAsync<ImpositionException>()).Which;
        ex.Code.Should().Be(ErrorCodes.SourceHasOcg);
    }

    [Fact]
    public async Task BR_055_SplitAsync_SourceWithRgb_ThrowsExportSourceNotCmyk()
    {
        var pdfPath = Path.Combine(_tempDir, "banner_rgb.pdf");
        var rgbContent = """
            %%Comment: QDF 1.0
            1 0 obj
            << /Type /Catalog /Pages 2 0 R >>
            endobj
            2 0 obj
            << /Type /Pages /Count 1 /Kids [ 3 0 R ] >>
            endobj
            3 0 obj
            << /Type /Page /Parent 2 0 R /MediaBox [ 0 0 100 100 ] /Contents 4 0 R >>
            endobj
            4 0 obj
            << /Length 30 >>
            stream
            1 0 0 rg 0 0 50 50 re f
            endstream
            endobj
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
        var splitter = new QdfPanelSplitter();

        var act = async () => await splitter.SplitAsync(
            pdfPath,
            seams,
            _tempDir,
            "{job}_painel_{index:D2}.pdf");

        var ex = (await act.Should().ThrowAsync<ImpositionException>()).Which;
        ex.Code.Should().Be(ErrorCodes.ExportSourceNotCmyk);
    }

    [Fact]
    public async Task BR_055_SplitAsync_CancellationToken_CleansUpTempFilesAndCancels()
    {
        var pdfPath = Path.Combine(_tempDir, "banner_cancel.pdf");
        PdfInspector.CreateSampleQdfWithoutOcg(pdfPath);

        var seams = CreateSampleSeamsResult();
        var splitter = new QdfPanelSplitter();
        using var cts = new CancellationTokenSource();
        cts.Cancel(); // Cancela antes de iniciar

        var act = async () => await splitter.SplitAsync(
            pdfPath,
            seams,
            _tempDir,
            "{job}_painel_{index:D2}.pdf",
            cts.Token);

        await act.Should().ThrowAsync<OperationCanceledException>();

        // Diretório não deve conter resquícios de arquivos .tmp
        Directory.GetFiles(_tempDir, "*.tmp").Should().BeEmpty();
    }
}
