using System;
using System.Buffers.Binary;
using System.IO;
using System.Text;
using FluentAssertions;
using Imposition.Pdf.Preflight;
using Imposition.Pdf.Tests.TestHelpers;
using Xunit;

namespace Imposition.Pdf.Tests.Preflight;

[Trait("Category", "Validator")]
public class PdfxValidatorTests : IDisposable
{
    private readonly string _tempDir;
    private static readonly Encoding Latin1 = Encoding.GetEncoding(28591);

    public PdfxValidatorTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "PdfxValidatorTests_" + Guid.NewGuid().ToString("N"));
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

    private static byte[] CreateValidSyntheticIcc()
    {
        var bytes = new byte[128];
        BinaryPrimitives.WriteUInt32BigEndian(bytes.AsSpan(0, 4), 128);
        bytes[36] = (byte)'a';
        bytes[37] = (byte)'c';
        bytes[38] = (byte)'s';
        bytes[39] = (byte)'p';
        return bytes;
    }

    private string CreateValidPdfx1aFile(string fileName)
    {
        var path = Path.Combine(_tempDir, fileName);
        PdfInspector.CreateSampleQdfWithoutOcg(path);

        var intent = new PdfxOutputIntent("FOGRA39", "ISO Coated v2 (ECI)", CreateValidSyntheticIcc());
        PdfxOutputIntentInjector.Inject(path, intent);
        return path;
    }

    [Fact]
    public void BR_055_Validate_ValidPdfx1a_ReturnsIsCompliantTrueAndNoIssues()
    {
        var path = CreateValidPdfx1aFile("valid.pdf");

        var result = PdfxValidator.Validate(path);

        result.IsCompliant.Should().BeTrue();
        result.Issues.Should().BeEmpty();
    }

    [Fact]
    public void BR_055_Validate_MissingOutputIntent_ReturnsIsCompliantFalseAndReportsIssue()
    {
        var path = Path.Combine(_tempDir, "no_intent.pdf");
        PdfInspector.CreateSampleQdfWithoutOcg(path); // Sem injeção de OutputIntent

        var result = PdfxValidator.Validate(path);

        result.IsCompliant.Should().BeFalse();
        result.Issues.Should().Contain(i => i.Contains("OutputIntents"));
    }

    [Fact]
    public void BR_055_Validate_WithOcg_ReturnsIsCompliantFalseAndReportsIssue()
    {
        var path = Path.Combine(_tempDir, "with_ocg.pdf");
        PdfInspector.CreateSampleQdfWithOcg(path); // Contém /OCProperties

        var result = PdfxValidator.Validate(path);

        result.IsCompliant.Should().BeFalse();
        result.Issues.Should().Contain(i => i.Contains("OCProperties"));
    }

    [Fact]
    public void BR_055_Validate_WithTransparencyGroup_ReturnsIsCompliantFalseAndReportsIssue()
    {
        var path = CreateValidPdfx1aFile("with_transparency.pdf");
        // Anexa grupo de transparência
        File.AppendAllText(path, "\n15 0 obj\n<< /Type /Page /Group << /S /Transparency >> >>\nendobj\n", Latin1);

        var result = PdfxValidator.Validate(path);

        result.IsCompliant.Should().BeFalse();
        result.Issues.Should().Contain(i => i.Contains("transparência"));
    }

    [Fact]
    public void BR_055_Validate_WithDeviceRgb_ReturnsIsCompliantFalseAndReportsIssue()
    {
        var path = CreateValidPdfx1aFile("with_rgb.pdf");
        // Anexa operador de cor RGB literal
        File.AppendAllText(path, "\n16 0 obj\nstream\n0 1 0 rg\nendstream\nendobj\n", Latin1);

        var result = PdfxValidator.Validate(path);

        result.IsCompliant.Should().BeFalse();
        result.Issues.Should().Contain(i => i.Contains("DeviceRGB"));
    }

    [Fact]
    public void BR_055_Validate_OlderPdfVersion_ReturnsIsCompliantFalseAndReportsIssue()
    {
        var path = Path.Combine(_tempDir, "old_version.pdf");
        var content = """
            %PDF-1.2
            %%Comment: QDF 1.0
            1 0 obj << /Type /Catalog /Pages 2 0 R /OutputIntents [ 3 0 R ] >> endobj
            2 0 obj << /Type /Pages /Count 1 /Kids [ ] >> endobj
            3 0 obj << /Type /OutputIntent /S /GTS_PDFX /DestOutputProfile 4 0 R >> endobj
            4 0 obj << /Length 0 >> stream endstream endobj
            xref
            0 5
            0000000000 65535 f
            trailer << /Root 1 0 R /Size 5 >>
            startxref
            200
            %%EOF
            """;
        File.WriteAllText(path, content, Latin1);

        var result = PdfxValidator.Validate(path);

        result.IsCompliant.Should().BeFalse();
        result.Issues.Should().Contain(i => i.Contains("1.2") || i.Contains("inferior"));
    }

    [Fact]
    public void BR_055_Validate_NonExistentFile_ReturnsIsCompliantFalse()
    {
        var result = PdfxValidator.Validate("arquivo_inexistente_123.pdf");

        result.IsCompliant.Should().BeFalse();
        result.Issues.Should().Contain(i => i.Contains("não encontrado"));
    }
}
