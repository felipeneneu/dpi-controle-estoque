using System;
using System.IO;
using System.Text;
using FluentAssertions;
using Imposition.Core.Errors;
using Imposition.Core.Seams;
using Imposition.Pdf.Seams;
using Xunit;

namespace Imposition.Pdf.Tests.Seams;

[Trait("Category", "PreflightValidation")]
public class QdfPanelSplitterValidationTests : IDisposable
{
    private readonly string _tempDir;
    private static readonly Encoding Latin1 = Encoding.GetEncoding(28591);

    public QdfPanelSplitterValidationTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "QdfValidationTests_" + Guid.NewGuid().ToString("N"));
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

    private static SeamsResult CreateSampleSeamsResult()
    {
        var input = new SeamsInput(
            ArtworkWidthMm: 1000,
            ArtworkHeightMm: 500,
            PrintableRollWidthMm: 600,
            OverlapMm: 50,
            ApplyShrinkage: false);
        return PanelCalculator.Calculate(input);
    }

    [Fact]
    public async Task Check1_SourceHasOcg_ThrowsSourceHasOcg()
    {
        var pdfPath = Path.Combine(_tempDir, "ocg.pdf");
        var pdf = """
            %PDF-1.3
            1 0 obj
            << /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [ 5 0 R ] >> >>
            endobj
            2 0 obj
            << /Type /Pages /Count 1 /Kids [ 3 0 R ] >>
            endobj
            3 0 obj
            << /Type /Page /Parent 2 0 R /MediaBox [ 0 0 100 100 ] /Contents 4 0 R >>
            endobj
            4 0 obj
            << /Length 10 >>
            stream
            0 0 0 1 k
            endstream
            endobj
            trailer
            << /Size 6 >>
            startxref
            100
            %%EOF
            """;
        File.WriteAllText(pdfPath, pdf, Latin1);

        var splitter = new QdfPanelSplitter();
        var act = () => splitter.SplitAsync(pdfPath, CreateSampleSeamsResult(), _tempDir, "p_{index}.pdf");

        await act.Should().ThrowAsync<ImpositionException>()
            .Where(e => e.Code == ErrorCodes.SourceHasOcg);
    }

    [Fact]
    public async Task Check2_DeviceRGB_ThrowsExportSourceNotCmyk()
    {
        var pdfPath = Path.Combine(_tempDir, "rgb.pdf");
        var pdf = """
            %PDF-1.3
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
            << /Length 15 >>
            stream
            1.0 0.0 0.0 rg
            endstream
            endobj
            trailer
            << /Size 5 >>
            startxref
            100
            %%EOF
            """;
        File.WriteAllText(pdfPath, pdf, Latin1);

        var splitter = new QdfPanelSplitter();
        var act = () => splitter.SplitAsync(pdfPath, CreateSampleSeamsResult(), _tempDir, "p_{index}.pdf");

        await act.Should().ThrowAsync<ImpositionException>()
            .Where(e => e.Code == ErrorCodes.ExportSourceNotCmyk);
    }

    [Fact]
    public async Task Check3_MultiPage_ThrowsPdfMultiPageUnsupported()
    {
        var pdfPath = Path.Combine(_tempDir, "multipage.pdf");
        var pdf = """
            %PDF-1.3
            1 0 obj
            << /Type /Catalog /Pages 2 0 R >>
            endobj
            2 0 obj
            << /Type /Pages /Count 2 /Kids [ 3 0 R 5 0 R ] >>
            endobj
            3 0 obj
            << /Type /Page /Parent 2 0 R /MediaBox [ 0 0 100 100 ] /Contents 4 0 R >>
            endobj
            4 0 obj
            << /Length 10 >> stream 0 0 0 1 k endstream endobj
            5 0 obj
            << /Type /Page /Parent 2 0 R /MediaBox [ 0 0 100 100 ] /Contents 6 0 R >>
            endobj
            6 0 obj
            << /Length 10 >> stream 0 0 0 1 k endstream endobj
            trailer
            << /Size 7 >>
            startxref
            200
            %%EOF
            """;
        File.WriteAllText(pdfPath, pdf, Latin1);

        var splitter = new QdfPanelSplitter();
        var act = () => splitter.SplitAsync(pdfPath, CreateSampleSeamsResult(), _tempDir, "p_{index}.pdf");

        await act.Should().ThrowAsync<ImpositionException>()
            .Where(e => e.Code == ErrorCodes.PdfMultiPageUnsupported);
    }

    [Fact]
    public async Task Check4_Transparency_ThrowsPdfTransparencyUnsupported()
    {
        var pdfPath = Path.Combine(_tempDir, "transparency.pdf");
        var pdf = """
            %PDF-1.3
            1 0 obj
            << /Type /Catalog /Pages 2 0 R >>
            endobj
            2 0 obj
            << /Type /Pages /Count 1 /Kids [ 3 0 R ] >>
            endobj
            3 0 obj
            <<
              /Type /Page
              /Parent 2 0 R
              /MediaBox [ 0 0 100 100 ]
              /Group << /Type /Group /S /Transparency /CS /DeviceCMYK >>
              /Contents 4 0 R
            >>
            endobj
            4 0 obj
            << /Length 10 >> stream 0 0 0 1 k endstream endobj
            trailer
            << /Size 5 >>
            startxref
            100
            %%EOF
            """;
        File.WriteAllText(pdfPath, pdf, Latin1);

        var splitter = new QdfPanelSplitter();
        var act = () => splitter.SplitAsync(pdfPath, CreateSampleSeamsResult(), _tempDir, "p_{index}.pdf");

        await act.Should().ThrowAsync<ImpositionException>()
            .Where(e => e.Code == ErrorCodes.PdfTransparencyUnsupported);
    }

    [Fact]
    public async Task Check5_UserUnit_ThrowsPdfUserUnitUnsupported()
    {
        var pdfPath = Path.Combine(_tempDir, "userunit.pdf");
        var pdf = """
            %PDF-1.3
            1 0 obj
            << /Type /Catalog /Pages 2 0 R >>
            endobj
            2 0 obj
            << /Type /Pages /Count 1 /Kids [ 3 0 R ] >>
            endobj
            3 0 obj
            <<
              /Type /Page
              /Parent 2 0 R
              /MediaBox [ 0 0 100 100 ]
              /UserUnit 2.5
              /Contents 4 0 R
            >>
            endobj
            4 0 obj
            << /Length 10 >> stream 0 0 0 1 k endstream endobj
            trailer
            << /Size 5 >>
            startxref
            100
            %%EOF
            """;
        File.WriteAllText(pdfPath, pdf, Latin1);

        var splitter = new QdfPanelSplitter();
        var act = () => splitter.SplitAsync(pdfPath, CreateSampleSeamsResult(), _tempDir, "p_{index}.pdf");

        await act.Should().ThrowAsync<ImpositionException>()
            .Where(e => e.Code == ErrorCodes.PdfUserUnitUnsupported);
    }

    [Fact]
    public async Task Check6_InvalidTrailer_ThrowsPdfInvalidTrailer()
    {
        var pdfPath = Path.Combine(_tempDir, "invalid_trailer.pdf");
        var pdf = """
            %PDF-1.3
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
            << /Length 10 >> stream 0 0 0 1 k endstream endobj
            trailer
            << /Root 1 0 R >>
            startxref
            100
            %%EOF
            """;
        File.WriteAllText(pdfPath, pdf, Latin1);

        var splitter = new QdfPanelSplitter();
        var act = () => splitter.SplitAsync(pdfPath, CreateSampleSeamsResult(), _tempDir, "p_{index}.pdf");

        await act.Should().ThrowAsync<ImpositionException>()
            .Where(e => e.Code == ErrorCodes.PdfInvalidTrailer);
    }
}
