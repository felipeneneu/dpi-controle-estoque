using System;
using System.IO;
using System.Linq;
using FluentAssertions;
using Imposition.Pdf;
using Imposition.Pdf.Contracts;
using Imposition.Pdf.Marks;
using Xunit;

namespace Imposition.Pdf.Tests;

public class PdfImposerTests
{
    [Fact]
    public void BR_043_a_ImposePreservesOcg()
    {
        var input = "Fixtures/3-layers.pdf";
        var outputDir = "Output";
        Directory.CreateDirectory(outputDir);
        var output = Path.Combine(outputDir, "test-impose.pdf");

        var files = PdfImposer.Impose(input, output, new ImposeOptions(700, 1000, 2, 2, 0, 0, 50, 50, false));

        files.Should().ContainSingle();

        var outputOcg = PdfImposer.Inspect(output);
        outputOcg.HasOcg.Should().BeTrue();
        outputOcg.Layers.Should().HaveCount(3);
        outputOcg.Layers.Select(l => l.Name).Should().Contain(new[] { "Arte", "Branco", "Faca" });
    }

    [Fact]
    public void BR_043_c_NoOcgThrowsException()
    {
        var input = "Fixtures/no-ocg.pdf";
        var act = () => PdfImposer.Impose(
            input, "Output/x.pdf", new ImposeOptions(700, 1000, 2, 2, 0, 0, 50, 50, false));

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
            var input = "Fixtures/3-layers.pdf";
            var outputDir = "Output";
            Directory.CreateDirectory(outputDir);
            var output = Path.Combine(outputDir, "test-impose-temp.pdf");

            // Se o bug existir, PdfImposer.Impose lança DirectoryNotFoundException
            // (ou falha no motor). Com o fix, deve rodar com sucesso.
            var files = PdfImposer.Impose(input, output, new ImposeOptions(700, 1000, 2, 2, 0, 0, 50, 50, false));

            files.Should().ContainSingle();
            var outputOcg = PdfImposer.Inspect(output);
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
        var input = "Fixtures/3-layers.pdf";
        var output = "Output/marks-crop.pdf";

        var options = new ImposeOptions(700, 1000, 2, 2, 0, 0, 50, 50, false, new MarksOptions(MarkType.Crop));
        PdfImposer.Impose(input, output, options);

        var qdf = QpdfRunner.Run($"--qdf \"{output}\" -");
        qdf.Should().Contain("0 0 0 RG");
        qdf.Should().Contain("S\nQ");
    }

    [Fact]
    public void BR_044_b_MimakiTipo1MarksDrawn()
    {
        var input = "Fixtures/3-layers.pdf";
        var output = "Output/marks-mimaki.pdf";

        var options = new ImposeOptions(700, 1000, 2, 2, 0, 0, 50, 50, false, new MarksOptions(MarkType.MimakiTipo1Plain, SizeMm: 25.0));
        PdfImposer.Impose(input, output, options);

        var qdf = QpdfRunner.Run($"--qdf \"{output}\" -");
        qdf.Should().Contain("0 0 0 RG");
        qdf.Should().Contain("S\nQ");
    }
}

