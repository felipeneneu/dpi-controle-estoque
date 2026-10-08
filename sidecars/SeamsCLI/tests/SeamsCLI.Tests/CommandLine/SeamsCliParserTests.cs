using System.IO;
using FluentAssertions;
using SeamsCLI.CommandLine;
using Xunit;

namespace SeamsCLI.Tests.CommandLine;

public class SeamsCliParserTests
{
    private readonly string _dummyJpg;
    private readonly string _dummyPdf;

    public SeamsCliParserTests()
    {
        _dummyJpg = Path.Combine(Path.GetTempPath(), "seams_test_dummy.jpg");
        _dummyPdf = Path.Combine(Path.GetTempPath(), "seams_test_dummy.pdf");
        if (!File.Exists(_dummyJpg)) File.WriteAllBytes(_dummyJpg, [0xFF, 0xD8, 0xFF, 0xD9]);
        if (!File.Exists(_dummyPdf)) File.WriteAllText(_dummyPdf, "%PDF-1.3\n%%EOF");
    }

    [Fact]
    public void Parse_ValidArgumentsWithDefaults_SucceedsWithExpectedDefaults()
    {
        string[] args = [_dummyJpg];

        var result = SeamsCliParser.Parse(args);

        result.Success.Should().BeTrue();
        result.Options.Should().NotBeNull();
        result.Options!.SourcePath.Should().Be(_dummyJpg);
        result.Options.RollWidthMm.Should().Be(1520.0);
        result.Options.MarginMm.Should().Be(15.0);
        result.Options.OverlapMm.Should().Be(10.0);
        result.Options.Orientation.Should().Be("vert");
        result.Options.Direction.Should().Be("ltr");
        result.Options.Format.Should().Be("jpg");
        result.Options.ShrinkageCompensation.Should().BeFalse();
        result.Options.JsonOutput.Should().BeFalse();
        result.Options.Verbose.Should().BeFalse();
    }

    [Fact]
    public void Parse_PdfFile_InfersPdfFormatDefault()
    {
        string[] args = [_dummyPdf];

        var result = SeamsCliParser.Parse(args);

        result.Success.Should().BeTrue();
        result.Options!.Format.Should().Be("pdf");
    }

    [Fact]
    public void Parse_MissingSourceFile_FailsWithExit1()
    {
        string[] args = [];

        var result = SeamsCliParser.Parse(args);

        result.Success.Should().BeFalse();
        result.ExitCode.Should().Be(1);
        result.ErrorCode.Should().Be("E_INVALID_ARGUMENT");
        result.ErrorMessage.Should().Contain("origem");
    }

    [Fact]
    public void Parse_SourceFileDoesNotExist_FailsWithInputNotFound()
    {
        string[] args = ["C:\\caminho\\inexistente\\arquivo_inexistente.jpg"];

        var result = SeamsCliParser.Parse(args);

        result.Success.Should().BeFalse();
        result.ExitCode.Should().Be(1);
        result.ErrorCode.Should().Be("E_INPUT_NOT_FOUND");
    }

    [Theory]
    [InlineData("-r", "NaN")]
    [InlineData("-r", "-100")]
    [InlineData("-m", "Infinity")]
    [InlineData("-o", "-5")]
    public void Parse_NonFiniteOrNegativeValues_FailsWithInvalidArgument(string flag, string val)
    {
        string[] args = [_dummyJpg, flag, val];

        var result = SeamsCliParser.Parse(args);

        result.Success.Should().BeFalse();
        result.ExitCode.Should().Be(1);
        result.ErrorCode.Should().Be("E_INVALID_ARGUMENT");
    }

    [Fact]
    public void Parse_RollNarrowerThanTwoMargins_Fails()
    {
        string[] args = [_dummyJpg, "-r", "25", "-m", "15"];

        var result = SeamsCliParser.Parse(args);

        result.Success.Should().BeFalse();
        result.ExitCode.Should().Be(1);
        result.ErrorCode.Should().Be("E_INVALID_ARGUMENT");
        result.ErrorMessage.Should().Contain("margem");
    }

    [Fact]
    public void Parse_OverlapGreaterThanOrEqualToRoll_Fails()
    {
        string[] args = [_dummyJpg, "-r", "1520", "-o", "2000"];

        var result = SeamsCliParser.Parse(args);

        result.Success.Should().BeFalse();
        result.ExitCode.Should().Be(1);
        result.ErrorCode.Should().Be("E_INVALID_OVERLAP");
    }

    [Fact]
    public void Parse_FormatMismatch_JpgWithPdfFlag_FailsWithFormatMismatch()
    {
        string[] args = [_dummyJpg, "--format", "pdf"];

        var result = SeamsCliParser.Parse(args);

        result.Success.Should().BeFalse();
        result.ExitCode.Should().Be(1);
        result.ErrorCode.Should().Be("E_FORMAT_MISMATCH");
    }

    [Fact]
    public void Parse_WidthAndHeightOverrides_ParsedCorrectly()
    {
        string[] args = [_dummyJpg, "-w", "3000", "--height", "1000", "-j", "meu_job"];

        var result = SeamsCliParser.Parse(args);

        result.Success.Should().BeTrue();
        result.Options!.WidthMm.Should().Be(3000.0);
        result.Options.HeightMm.Should().Be(1000.0);
        result.Options.JobName.Should().Be("meu_job");
    }

    [Theory]
    [InlineData("--help")]
    [InlineData("-h")]
    public void Parse_HelpFlag_ReturnsSuccessZero(string flag)
    {
        string[] args = [flag];

        var result = SeamsCliParser.Parse(args);

        result.Success.Should().BeTrue();
        result.ExitCode.Should().Be(0);
        result.Options.Should().BeNull();
    }

    [Fact]
    public void Parse_VersionFlag_ReturnsSuccessZero()
    {
        string[] args = ["--version"];

        var result = SeamsCliParser.Parse(args);

        result.Success.Should().BeTrue();
        result.ExitCode.Should().Be(0);
        result.Options.Should().BeNull();
    }

    [Fact]
    public void Parse_GuideLineAndLogging_DefaultValues()
    {
        string[] args = [_dummyJpg];

        var result = SeamsCliParser.Parse(args);

        result.Success.Should().BeTrue();
        result.Options!.GuideLine.Should().BeTrue();
        result.Options.LineColor.Should().Be("k40");
        result.Options.LineThicknessPt.Should().Be(1.0);
        result.Options.NoLog.Should().BeFalse();
        result.Options.LogDir.Should().BeNull();
    }

    [Fact]
    public void Parse_NoGuideLineFlag_DisablesGuideLine()
    {
        string[] args = [_dummyJpg, "--no-guide-line"];

        var result = SeamsCliParser.Parse(args);

        result.Success.Should().BeTrue();
        result.Options!.GuideLine.Should().BeFalse();
    }

    [Theory]
    [InlineData("magenta")]
    [InlineData("cyan")]
    [InlineData("k100")]
    [InlineData("0,100,50,0")]
    public void Parse_ValidLineColor_Accepted(string color)
    {
        string[] args = [_dummyJpg, "--line-color", color];

        var result = SeamsCliParser.Parse(args);

        result.Success.Should().BeTrue();
        result.Options!.LineColor.Should().Be(color);
    }

    [Fact]
    public void Parse_InvalidLineColor_FailsWithInvalidArgument()
    {
        string[] args = [_dummyJpg, "--line-color", "cor_inexistente_xyz"];

        var result = SeamsCliParser.Parse(args);

        result.Success.Should().BeFalse();
        result.ExitCode.Should().Be(1);
        result.ErrorCode.Should().Be("E_INVALID_ARGUMENT");
    }

    [Theory]
    [InlineData("0.5")]
    [InlineData("2.0")]
    public void Parse_ValidLineThickness_Accepted(string thickness)
    {
        string[] args = [_dummyJpg, "--line-thickness", thickness];

        var result = SeamsCliParser.Parse(args);

        result.Success.Should().BeTrue();
        result.Options!.LineThicknessPt.Should().Be(double.Parse(thickness, System.Globalization.CultureInfo.InvariantCulture));
    }

    [Theory]
    [InlineData("-1.0")]
    [InlineData("0")]
    [InlineData("NaN")]
    public void Parse_InvalidLineThickness_FailsWithInvalidArgument(string thickness)
    {
        string[] args = [_dummyJpg, "--line-thickness", thickness];

        var result = SeamsCliParser.Parse(args);

        result.Success.Should().BeFalse();
        result.ExitCode.Should().Be(1);
        result.ErrorCode.Should().Be("E_INVALID_ARGUMENT");
    }

    [Fact]
    public void Parse_LoggingFlags_Accepted()
    {
        string[] args = [_dummyJpg, "--no-log", "--log-dir", "C:\\custom\\logs"];

        var result = SeamsCliParser.Parse(args);

        result.Success.Should().BeTrue();
        result.Options!.NoLog.Should().BeTrue();
        result.Options.LogDir.Should().Be("C:\\custom\\logs");
    }
}
