using System;
using System.IO;
using System.Linq;
using System.Text;
using FluentAssertions;
using Imposition.Pdf;
using Imposition.Pdf.Contracts;
using Imposition.Pdf.Marks;
using Imposition.Pdf.Tests.TestHelpers;
using Xunit;

namespace Imposition.Pdf.Tests;

public class PdfImposerTests : IDisposable
{
    private readonly string _tempDir;
    private static readonly Encoding Latin1 = Encoding.GetEncoding(28591);

    public PdfImposerTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "PdfImposerTests_" + Guid.NewGuid().ToString("N"));
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
            // Limpeza de diretório temporário
        }
    }

    [Fact]
    public void BR_043_a_ImposePreservesOcg()
    {
        var inputQdf = Path.Combine(_tempDir, "input_3layers.qdf");
        PdfInspector.CreateSampleQdfWithOcg(inputQdf);

        var output = Path.Combine(_tempDir, "test-impose.qdf");
        var options = new ImposeOptions(700, 1000, 2, 2, 0, 0, 50, 50, false);

        var resultFile = PdfInspector.ImposeQdf(inputQdf, output, options);

        File.Exists(resultFile).Should().BeTrue();

        var outputOcg = PdfInspector.Inspect(output);
        outputOcg.HasOcg.Should().BeTrue();
        outputOcg.Layers.Should().HaveCount(3);
        outputOcg.Layers.Select(l => l.Name).Should().Contain(new[] { "Arte", "Branco", "Faca" });
    }

    [Fact]
    public void BR_043_c_NoOcgThrowsException()
    {
        var inputNoOcg = Path.Combine(_tempDir, "no-ocg.qdf");
        PdfInspector.CreateSampleQdfWithoutOcg(inputNoOcg);

        var options = new ImposeOptions(700, 1000, 2, 2, 0, 0, 50, 50, false);
        var act = () => PdfInspector.ImposeQdf(inputNoOcg, Path.Combine(_tempDir, "out.qdf"), options);

        act.Should().Throw<InvalidOperationException>()
           .WithMessage("*OCG*");
    }

    [Fact]
    public void BR_043_d_TempFilePathIsValid()
    {
        var originalTmp = Environment.GetEnvironmentVariable("TMP");
        try
        {
            Environment.SetEnvironmentVariable("TMP", "S");
            var inputQdf = Path.Combine(_tempDir, "input_temp_path.qdf");
            PdfInspector.CreateSampleQdfWithOcg(inputQdf);

            var output = Path.Combine(_tempDir, "test-impose-temp.qdf");
            var options = new ImposeOptions(700, 1000, 2, 2, 0, 0, 50, 50, false);

            var resultFile = PdfInspector.ImposeQdf(inputQdf, output, options);

            File.Exists(resultFile).Should().BeTrue();
            var outputOcg = PdfInspector.Inspect(output);
            outputOcg.HasOcg.Should().BeTrue();
        }
        finally
        {
            Environment.SetEnvironmentVariable("TMP", originalTmp);
        }
    }

    [Fact]
    public void BR_044_a_CropMarksDrawn()
    {
        var inputQdf = Path.Combine(_tempDir, "input_crop.qdf");
        PdfInspector.CreateSampleQdfWithOcg(inputQdf);

        var output = Path.Combine(_tempDir, "marks-crop.qdf");
        var options = new ImposeOptions(700, 1000, 2, 2, 0, 0, 50, 50, false, new MarksOptions(MarkType.Crop));

        PdfInspector.ImposeQdf(inputQdf, output, options);

        var qdfContent = File.ReadAllText(output, Latin1);
        qdfContent.Should().Contain("0 0 0 1 K");
        qdfContent.Should().MatchRegex(@"S\r?\nQ");
    }

    [Fact]
    public void BR_044_b_MimakiTipo1MarksDrawn()
    {
        var inputQdf = Path.Combine(_tempDir, "input_mimaki.qdf");
        PdfInspector.CreateSampleQdfWithOcg(inputQdf);

        var output = Path.Combine(_tempDir, "marks-mimaki.qdf");
        var options = new ImposeOptions(700, 1000, 2, 2, 0, 0, 50, 50, false, new MarksOptions(MarkType.MimakiTipo1Plain, SizeMm: 25.0));

        PdfInspector.ImposeQdf(inputQdf, output, options);

        var qdfContent = File.ReadAllText(output, Latin1);
        qdfContent.Should().Contain("0 0 0 1 K");
        qdfContent.Should().MatchRegex(@"S\r?\nQ");
    }
}
