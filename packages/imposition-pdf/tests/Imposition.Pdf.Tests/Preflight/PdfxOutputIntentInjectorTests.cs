using System;
using System.Buffers.Binary;
using System.IO;
using System.Text;
using FluentAssertions;
using Imposition.Core.Errors;
using Imposition.Pdf.Preflight;
using Imposition.Pdf.Tests.TestHelpers;
using Xunit;

namespace Imposition.Pdf.Tests.Preflight;

[Trait("Category", "Preflight")]
public class PdfxOutputIntentInjectorTests : IDisposable
{
    private readonly string _tempDir;
    private static readonly Encoding Latin1 = Encoding.GetEncoding(28591);

    public PdfxOutputIntentInjectorTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "PdfxOutputIntentTests_" + Guid.NewGuid().ToString("N"));
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
        // Signature "acsp" nos bytes 36-39
        bytes[36] = (byte)'a';
        bytes[37] = (byte)'c';
        bytes[38] = (byte)'s';
        bytes[39] = (byte)'p';
        return bytes;
    }

    [Fact]
    public void BR_055_Inject_WithoutOutputIntent_InjectsSuccessfully()
    {
        var pdfPath = Path.Combine(_tempDir, "sample.pdf");
        PdfInspector.CreateSampleQdfWithoutOcg(pdfPath);

        var icc = CreateValidSyntheticIcc(256);
        var intent = new PdfxOutputIntent("FOGRA39", "ISO Coated v2 (ECI)", icc);

        PdfxOutputIntentInjector.Inject(pdfPath, intent);

        var content = File.ReadAllText(pdfPath, Latin1);
        content.Should().Contain("/OutputIntents");
        content.Should().Contain("/GTS_PDFX");
        content.Should().Contain("/OutputConditionIdentifier (FOGRA39)");
        content.Should().Contain("/Info (ISO Coated v2 (ECI))");
        content.Should().Contain("/DestOutputProfile");
    }

    [Fact]
    public void BR_055_Inject_AlreadyHasOutputIntent_DoesNotDuplicate()
    {
        var pdfPath = Path.Combine(_tempDir, "idempotent.pdf");
        PdfInspector.CreateSampleQdfWithoutOcg(pdfPath);

        var icc = CreateValidSyntheticIcc();
        var intent = new PdfxOutputIntent("FOGRA39", "ISO Coated v2 (ECI)", icc);

        PdfxOutputIntentInjector.Inject(pdfPath, intent);
        var lengthAfterFirst = new FileInfo(pdfPath).Length;

        // Segunda injeção não deve duplicar o dicionário
        PdfxOutputIntentInjector.Inject(pdfPath, intent);
        var lengthAfterSecond = new FileInfo(pdfPath).Length;

        lengthAfterSecond.Should().Be(lengthAfterFirst);
    }

    [Fact]
    public void BR_055_Inject_EmptyOrNullIccBytes_ThrowsInvalidIccProfile()
    {
        var pdfPath = Path.Combine(_tempDir, "empty_icc.pdf");
        PdfInspector.CreateSampleQdfWithoutOcg(pdfPath);

        var intent = new PdfxOutputIntent("FOGRA39", "ISO Coated v2 (ECI)", Array.Empty<byte>());

        var act = () => PdfxOutputIntentInjector.Inject(pdfPath, intent);

        var ex = act.Should().Throw<ImpositionException>().Which;
        ex.Code.Should().Be(ErrorCodes.InvalidIccProfile);
    }

    [Fact]
    public void BR_055_Inject_IccLessThan128Bytes_ThrowsInvalidIccProfile()
    {
        var pdfPath = Path.Combine(_tempDir, "short_icc.pdf");
        PdfInspector.CreateSampleQdfWithoutOcg(pdfPath);

        var shortIcc = new byte[100];
        var intent = new PdfxOutputIntent("FOGRA39", "ISO Coated v2 (ECI)", shortIcc);

        var act = () => PdfxOutputIntentInjector.Inject(pdfPath, intent);

        var ex = act.Should().Throw<ImpositionException>().Which;
        ex.Code.Should().Be(ErrorCodes.InvalidIccProfile);
    }

    [Fact]
    public void BR_055_Inject_IccWithoutAcspSignature_ThrowsInvalidIccProfile()
    {
        var pdfPath = Path.Combine(_tempDir, "no_acsp_icc.pdf");
        PdfInspector.CreateSampleQdfWithoutOcg(pdfPath);

        var randomBytes = new byte[150];
        BinaryPrimitives.WriteUInt32BigEndian(randomBytes.AsSpan(0, 4), 150);
        // Sem assinatura "acsp" nos bytes 36-39
        var intent = new PdfxOutputIntent("FOGRA39", "ISO Coated v2 (ECI)", randomBytes);

        var act = () => PdfxOutputIntentInjector.Inject(pdfPath, intent);

        var ex = act.Should().Throw<ImpositionException>().Which;
        ex.Code.Should().Be(ErrorCodes.InvalidIccProfile);
    }

    [Fact]
    public void BR_055_Inject_TruncatedIccProfile_ThrowsInvalidIccProfile()
    {
        var pdfPath = Path.Combine(_tempDir, "truncated_icc.pdf");
        PdfInspector.CreateSampleQdfWithoutOcg(pdfPath);

        var bytes = new byte[128];
        // Declara 500 bytes de tamanho, mas o buffer só tem 128
        BinaryPrimitives.WriteUInt32BigEndian(bytes.AsSpan(0, 4), 500);
        bytes[36] = (byte)'a';
        bytes[37] = (byte)'c';
        bytes[38] = (byte)'s';
        bytes[39] = (byte)'p';

        var intent = new PdfxOutputIntent("FOGRA39", "ISO Coated v2 (ECI)", bytes);

        var act = () => PdfxOutputIntentInjector.Inject(pdfPath, intent);

        var ex = act.Should().Throw<ImpositionException>().Which;
        ex.Code.Should().Be(ErrorCodes.InvalidIccProfile);
    }

    [Fact]
    public void BR_055_Inject_NonExistentPdf_ThrowsFileNotFoundException()
    {
        var intent = new PdfxOutputIntent("FOGRA39", "ISO Coated v2 (ECI)", CreateValidSyntheticIcc());
        var act = () => PdfxOutputIntentInjector.Inject("non_existent_file.pdf", intent);

        act.Should().Throw<FileNotFoundException>();
    }
}
