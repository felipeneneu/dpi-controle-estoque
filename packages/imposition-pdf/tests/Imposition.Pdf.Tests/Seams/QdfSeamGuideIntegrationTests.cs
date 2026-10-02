using System.Text;
using System.Text.RegularExpressions;
using FluentAssertions;
using Imposition.Core.Seams;
using Imposition.Pdf.Contracts;
using Xunit;

namespace Imposition.Pdf.Tests.Seams;

public class QdfSeamGuideIntegrationTests : IDisposable
{
    private readonly string _tempDir;

    public QdfSeamGuideIntegrationTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "SeamGuideIntegration_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_tempDir);
    }

    public void Dispose()
    {
        try
        {
            if (Directory.Exists(_tempDir))
                Directory.Delete(_tempDir, true);
        }
        catch
        {
            // Ignora falhas de cleanup temporário
        }
    }

    private string CreateSampleQdfWithOcg(string fileName)
    {
        var path = Path.Combine(_tempDir, fileName);
        var qdfContent = """
            %%Comment: QDF 1.0
            1 0 obj
            <<
              /Type /Catalog
              /Pages 2 0 R
              /OCProperties <<
                /OCGs [ 6 0 R 7 0 R 8 0 R ]
              >>
            >>
            endobj
            2 0 obj
            <<
              /Type /Pages
              /Count 1
              /Kids [ 3 0 R ]
            >>
            endobj
            3 0 obj
            <<
              /Type /Page
              /Parent 2 0 R
              /MediaBox [ 0 0 100 100 ]
              /Contents 4 0 R
              /Resources <<
                /Properties <<
                  /OC1 6 0 R
                  /OC2 7 0 R
                  /OC3 8 0 R
                >>
              >>
            >>
            endobj
            4 0 obj
            <<
              /Length 60
            >>
            stream
            /OC /OC1 BDC
            q 1 0 0 1 10 10 cm 1 0 0 rg 0 0 80 80 re f Q
            EMC
            endstream
            endobj
            6 0 obj
            <<
              /Type /OCG
              /Name (Arte)
            >>
            endobj
            7 0 obj
            <<
              /Type /OCG
              /Name (Branco)
            >>
            endobj
            8 0 obj
            <<
              /Type /OCG
              /Name (Faca)
            >>
            endobj
            xref
            0 9
            0000000000 65535 f 
            0000000015 00000 n 
            trailer
            <<
              /Root 1 0 R
              /Size 9
            >>
            startxref
            1000
            %%EOF
            """;
        File.WriteAllText(path, qdfContent.Replace("\r\n", "\n"), Encoding.GetEncoding(28591));
        return path;
    }

    [Fact]
    [Trait("Category", "Seams")]
    public void BR_053_Integration_QdfPipeline_SeamsNull_NoGuideLinesDrawn()
    {
        var qdfPath = CreateSampleQdfWithOcg("seams_null.qdf");
        var options = new ImposeOptions(
            SheetWMm: 500,
            SheetHMm: 500,
            Cols: 1,
            Rows: 1,
            StartXMm: 0,
            StartYMm: 0,
            StepXMm: 0,
            StepYMm: 0,
            Rotate90: false,
            Marks: null,
            Slugline: null,
            Seams: null);

        var editedPath = QdfPipeline.ApplyNup(qdfPath, options);

        File.Exists(editedPath).Should().BeTrue();
        var editedContent = File.ReadAllText(editedPath, Encoding.GetEncoding(28591));

        // Sem operador de cor da linha-guia (0 0 0 0.40 k)
        editedContent.Should().NotContain("0 0 0 0.40 k");
    }

    [Fact]
    [Trait("Category", "Seams")]
    public void BR_053_Integration_QdfPipeline_WithNPanels_InjectsNMinus1GuideLines()
    {
        // Arrange: Seams com 3 painéis (N=3) -> deve injetar 2 linhas-guia
        var qdfPath = CreateSampleQdfWithOcg("seams_n3.qdf");

        var seamsInput = new SeamsInput(
            ArtworkWidthMm: 3000,
            ArtworkHeightMm: 1000,
            PrintableRollWidthMm: 1100,
            OverlapMm: 50,
            Direction: SeamDirection.LeftToRight,
            Orientation: SeamOrientation.Vertical,
            ApplyShrinkage: false);
        var seamsResult = PanelCalculator.Calculate(seamsInput);
        seamsResult.TotalPanels.Should().Be(3);

        var options = new ImposeOptions(
            SheetWMm: 3500,
            SheetHMm: 1100,
            Cols: 1,
            Rows: 1,
            StartXMm: 10,
            StartYMm: 10,
            StepXMm: 0,
            StepYMm: 0,
            Rotate90: false,
            Marks: null,
            Slugline: null,
            Seams: seamsResult);

        // Act
        var editedPath = QdfPipeline.ApplyNup(qdfPath, options);

        // Assert
        File.Exists(editedPath).Should().BeTrue();
        var editedContent = File.ReadAllText(editedPath, Encoding.GetEncoding(28591));

        // 1. Deve conter exatamente 2 linhas-guia (N-1) com operador K 40%
        var matches = Regex.Matches(editedContent, @"0\s+0\s+0\s+0\.40\s+k");
        matches.Count.Should().Be(2);

        // 2. Deve conter operadores de espessura de 1 pt
        var strokeMatches = Regex.Matches(editedContent, @"1\s+w");
        strokeMatches.Count.Should().BeGreaterThanOrEqualTo(2);

        // 3. OCG totalmente preservado (ADR-043 e ADR-051)
        editedContent.Should().Contain("/OCGs [ 6 0 R 7 0 R 8 0 R ]");
        editedContent.Should().Contain("/Name (Arte)");
        editedContent.Should().Contain("/Name (Branco)");
        editedContent.Should().Contain("/Name (Faca)");
    }

    [Fact]
    [Trait("Category", "Seams")]
    public void BR_053_Integration_QdfPipeline_SinglePanel_NoGuidesInjected()
    {
        var qdfPath = CreateSampleQdfWithOcg("seams_single.qdf");

        var seamsInput = new SeamsInput(
            ArtworkWidthMm: 800,
            ArtworkHeightMm: 1000,
            PrintableRollWidthMm: 1100,
            OverlapMm: 50,
            Direction: SeamDirection.LeftToRight,
            Orientation: SeamOrientation.Vertical,
            ApplyShrinkage: false);
        var seamsResult = PanelCalculator.Calculate(seamsInput);
        seamsResult.TotalPanels.Should().Be(1);

        var options = new ImposeOptions(
            SheetWMm: 1000,
            SheetHMm: 1200,
            Cols: 1,
            Rows: 1,
            StartXMm: 0,
            StartYMm: 0,
            StepXMm: 0,
            StepYMm: 0,
            Rotate90: false,
            Marks: null,
            Slugline: null,
            Seams: seamsResult);

        var editedPath = QdfPipeline.ApplyNup(qdfPath, options);

        var editedContent = File.ReadAllText(editedPath, Encoding.GetEncoding(28591));
        editedContent.Should().NotContain("0 0 0 0.40 k");
    }
}
