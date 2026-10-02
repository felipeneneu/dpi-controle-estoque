using System.Globalization;
using System.Text;
using FluentAssertions;
using Imposition.Pdf.Contracts;
using Imposition.Pdf.Marks;
using Xunit;

namespace Imposition.Pdf.Tests;

/// <summary>
/// N4-8: Teste de integração QDF real para a slugline (ADR-047).
/// Executa o QdfPipeline diretamente com QDF sintético em disco, SEM depender do binário externo qpdf.exe (R-023).
/// Verifica presença de operadores de texto BT /F1 ... Tj ET, omissão correta quando sem marcas, e preservação de OCG.
/// </summary>
public class SluglineRendererIntegrationTests : IDisposable
{
    private readonly string _tempDir;

    public SluglineRendererIntegrationTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "SluglineIntegration_" + Guid.NewGuid().ToString("N"));
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
            600
            %%EOF
            """;

        File.WriteAllText(path, qdfContent, Encoding.GetEncoding(28591));
        return path;
    }

    [Fact]
    public void BR_047_Integration_QdfPipeline_ComSluglineEMarks_GeraTextoEFontNoQdfPreservandoOcg()
    {
        // Arrange
        var qdfPath = CreateSampleQdfWithOcg("sample_slugline.qdf");
        var marks = new MarksOptions(MarkType.Crop, SizeMm: 20.0, OffsetMm: 3.0);
        var slugline = new SluglineOptions(
            FileName: "etiqueta_adesiva.pdf",
            ImpositionTime: new DateTimeOffset(2026, 9, 30, 15, 0, 0, TimeSpan.Zero),
            Total: 4,
            CustomText: "PRODUCAO GRAFICA");

        var options = new ImposeOptions(
            SheetWMm: 200,
            SheetHMm: 300,
            Cols: 2,
            Rows: 2,
            StartXMm: 10,
            StartYMm: 10,
            StepXMm: 80,
            StepYMm: 80,
            Rotate90: false,
            Marks: marks,
            Slugline: slugline);

        // Act
        var editedPath = QdfPipeline.ApplyNup(qdfPath, options);

        // Assert
        File.Exists(editedPath).Should().BeTrue();
        var editedContent = File.ReadAllText(editedPath, Encoding.GetEncoding(28591));

        // 1. Fonte declarada nos recursos da página
        editedContent.Should().Contain("/Font <<");
        editedContent.Should().Contain("/F1 ");

        // 2. Objeto de fonte Helvetica WinAnsiEncoding presente
        editedContent.Should().Contain("/BaseFont /Helvetica");
        editedContent.Should().Contain("/Encoding /WinAnsiEncoding");

        // 3. Content stream contém texto da slugline com BT ... Tj ... ET
        editedContent.Should().Contain("BT");
        editedContent.Should().Contain("/F1 ");
        editedContent.Should().Contain("Tf");
        editedContent.Should().Contain("(PRODUCAO GRAFICA) Tj");
        editedContent.Should().Contain("ET");

        // 4. OCG preservado (objetos de camadas originais continuam presentes)
        editedContent.Should().Contain("/OCGs [ 6 0 R 7 0 R 8 0 R ]");
        editedContent.Should().Contain("/Name (Arte)");
        editedContent.Should().Contain("/Name (Branco)");
        editedContent.Should().Contain("/Name (Faca)");
    }

    [Fact]
    public void BR_047_Integration_QdfPipeline_SemMarks_OmiteSlugline()
    {
        // Arrange: Slugline informada, mas Marks = null (sem faixa de sangria)
        var qdfPath = CreateSampleQdfWithOcg("sample_no_marks.qdf");
        var slugline = new SluglineOptions(
            FileName: "etiqueta.pdf",
            ImpositionTime: DateTimeOffset.Now,
            Total: 4,
            CustomText: "RODAPE");

        var options = new ImposeOptions(
            SheetWMm: 200,
            SheetHMm: 300,
            Cols: 2,
            Rows: 2,
            StartXMm: 10,
            StartYMm: 10,
            StepXMm: 80,
            StepYMm: 80,
            Rotate90: false,
            Marks: null, // Sem marcas -> sangria = 0 -> placement = null
            Slugline: slugline);

        // Act
        var editedPath = QdfPipeline.ApplyNup(qdfPath, options);

        // Assert: sem marcas, a slugline não deve desenhar nenhum Tj com o texto
        var editedContent = File.ReadAllText(editedPath, Encoding.GetEncoding(28591));
        editedContent.Should().NotContain("(RODAPE) Tj");
    }

    [Fact]
    public void BR_047_Integration_QdfPipeline_SluglineNull_NaoGeraFontNemTj()
    {
        // Arrange: Slugline = null
        var qdfPath = CreateSampleQdfWithOcg("sample_null_slugline.qdf");
        var marks = new MarksOptions(MarkType.Crop);

        var options = new ImposeOptions(
            SheetWMm: 200,
            SheetHMm: 300,
            Cols: 2,
            Rows: 2,
            StartXMm: 10,
            StartYMm: 10,
            StepXMm: 80,
            StepYMm: 80,
            Rotate90: false,
            Marks: marks,
            Slugline: null);

        // Act
        var editedPath = QdfPipeline.ApplyNup(qdfPath, options);

        // Assert
        var editedContent = File.ReadAllText(editedPath, Encoding.GetEncoding(28591));
        editedContent.Should().NotContain("/BaseFont /Helvetica");
        editedContent.Should().NotContain("/Encoding /WinAnsiEncoding");
        editedContent.Should().NotContain("Tj");
    }
}
