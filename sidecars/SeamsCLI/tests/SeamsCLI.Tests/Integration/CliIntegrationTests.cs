using System;
using System.IO;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using FluentAssertions;
using Imposition.Core.Errors;
using SeamsCLI.CommandLine;
using SeamsCLI.Execution;
using SeamsCLI.Tests.Fixtures;
using Xunit;

namespace SeamsCLI.Tests.Integration;

[Trait("Category", "Integration")]
public class CliIntegrationTests : IDisposable
{
    private readonly string _tempDir;

    public CliIntegrationTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "SeamsCliE2E_" + Guid.NewGuid().ToString("N")[..8]);
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

    [Fact]
    public async Task SmokeE2E_JpgCmykExport_SucceedsWithExitCode0()
    {
        var sourceJpg = Path.Combine(_tempDir, "banner_cmyk.jpg");
        RuntimeFixtures.CreateJpgCmyk(sourceJpg, widthPx: 400, heightPx: 200);

        var originalOut = Console.Out;
        var originalErr = Console.Error;
        using var swOut = new StringWriter();
        using var swErr = new StringWriter();
        Console.SetOut(swOut);
        Console.SetError(swErr);

        try
        {
            string[] args = [sourceJpg, "--outdir", _tempDir, "--roll", "1520", "--overlap", "10"];
            int exitCode = await Program.Main(args);

            exitCode.Should().Be(0);
            swOut.ToString().Should().Contain("Sucesso");
        }
        finally
        {
            Console.SetOut(originalOut);
            Console.SetError(originalErr);
        }
    }

    [Fact]
    public async Task SmokeE2E_PdfCmykExport_SucceedsWithExitCode0()
    {
        var sourcePdf = Path.Combine(_tempDir, "banner_cmyk.pdf");
        RuntimeFixtures.CreatePdfCmyk(sourcePdf, widthPt: 5669.29, heightPt: 2834.65); // 2000x1000 mm

        var originalOut = Console.Out;
        var originalErr = Console.Error;
        using var swOut = new StringWriter();
        using var swErr = new StringWriter();
        Console.SetOut(swOut);
        Console.SetError(swErr);

        try
        {
            string[] args = [sourcePdf, "--format", "pdf", "--outdir", _tempDir];
            int exitCode = await Program.Main(args);

            exitCode.Should().Be(0);
            swOut.ToString().Should().Contain("Sucesso");

            // Verifica se os arquivos de painel foram gerados
            var files = Directory.GetFiles(_tempDir, "*_painel_*.pdf");
            files.Should().NotBeEmpty();
        }
        finally
        {
            Console.SetOut(originalOut);
            Console.SetError(originalErr);
        }
    }

    [Fact]
    public async Task SmokeE2E_JsonMode_EmitsStrictSingleLineJsonInStdout()
    {
        var sourcePdf = Path.Combine(_tempDir, "banner_json.pdf");
        RuntimeFixtures.CreatePdfCmyk(sourcePdf);

        var originalOut = Console.Out;
        var originalErr = Console.Error;
        using var swOut = new StringWriter();
        using var swErr = new StringWriter();
        Console.SetOut(swOut);
        Console.SetError(swErr);

        try
        {
            string[] args = [sourcePdf, "--format", "pdf", "--outdir", _tempDir, "--json"];
            int exitCode = await Program.Main(args);

            exitCode.Should().Be(0);

            var stdout = swOut.ToString().Trim();
            stdout.Should().NotContain("\n");
            stdout.Should().StartWith("{\"schemaVersion\":\"1.0\"");

            using var doc = JsonDocument.Parse(stdout);
            var root = doc.RootElement;
            root.GetProperty("success").GetBoolean().Should().BeTrue();
            root.GetProperty("panelCount").GetInt32().Should().BeGreaterThan(0);
            root.GetProperty("generatedFiles").GetArrayLength().Should().BeGreaterThan(0);
        }
        finally
        {
            Console.SetOut(originalOut);
            Console.SetError(originalErr);
        }
    }

    [Fact]
    public async Task SmokeE2E_InvalidArgumentWithJson_ReturnsExitCode1AndJsonError()
    {
        var sourcePdf = Path.Combine(_tempDir, "banner_invalid.pdf");
        RuntimeFixtures.CreatePdfCmyk(sourcePdf);

        var originalOut = Console.Out;
        var originalErr = Console.Error;
        using var swOut = new StringWriter();
        using var swErr = new StringWriter();
        Console.SetOut(swOut);
        Console.SetError(swErr);

        try
        {
            string[] args = [sourcePdf, "--roll", "-100", "--json"];
            int exitCode = await Program.Main(args);

            exitCode.Should().Be(1);

            var stdout = swOut.ToString().Trim();
            using var doc = JsonDocument.Parse(stdout);
            var root = doc.RootElement;
            root.GetProperty("success").GetBoolean().Should().BeFalse();
            root.GetProperty("errorCode").GetString().Should().Be(ErrorCodes.InvalidArgument);
        }
        finally
        {
            Console.SetOut(originalOut);
            Console.SetError(originalErr);
        }
    }

    [Fact]
    public async Task SmokeE2E_FormatMismatch_ReturnsExitCode1AndFormatMismatchError()
    {
        var sourceJpg = Path.Combine(_tempDir, "banner_mismatch.jpg");
        RuntimeFixtures.CreateJpgCmyk(sourceJpg);

        var originalOut = Console.Out;
        var originalErr = Console.Error;
        using var swOut = new StringWriter();
        using var swErr = new StringWriter();
        Console.SetOut(swOut);
        Console.SetError(swErr);

        try
        {
            string[] args = [sourceJpg, "--format", "pdf", "--json"];
            int exitCode = await Program.Main(args);

            exitCode.Should().Be(1);

            var stdout = swOut.ToString().Trim();
            using var doc = JsonDocument.Parse(stdout);
            var root = doc.RootElement;
            root.GetProperty("success").GetBoolean().Should().BeFalse();
            root.GetProperty("errorCode").GetString().Should().Be(ErrorCodes.FormatMismatch);
        }
        finally
        {
            Console.SetOut(originalOut);
            Console.SetError(originalErr);
        }
    }

    [Fact]
    public void SmokeE2E_ExitCodeMapping_MapsAllCategoriesAccurately()
    {
        // Exit 0
        Program.MapExitCode(new SeamsWorkflowResult(true, 1, [], 1.0, TimeSpan.Zero, [])).Should().Be(0);

        // Exit 1
        Program.MapExitCode(new SeamsWorkflowResult(false, 0, [], 0, TimeSpan.Zero, [], ErrorCodes.InvalidArgument)).Should().Be(1);
        Program.MapExitCode(new SeamsWorkflowResult(false, 0, [], 0, TimeSpan.Zero, [], ErrorCodes.FormatMismatch)).Should().Be(1);
        Program.MapExitCode(new SeamsWorkflowResult(false, 0, [], 0, TimeSpan.Zero, [], ErrorCodes.InputNotFound)).Should().Be(1);

        // Exit 2
        Program.MapExitCode(new SeamsWorkflowResult(false, 0, [], 0, TimeSpan.Zero, [], ErrorCodes.RollTooNarrow)).Should().Be(2);

        // Exit 3
        Program.MapExitCode(new SeamsWorkflowResult(false, 0, [], 0, TimeSpan.Zero, [], ErrorCodes.ExportSourceNotCmyk)).Should().Be(3);
        Program.MapExitCode(new SeamsWorkflowResult(false, 0, [], 0, TimeSpan.Zero, [], ErrorCodes.SourceHasOcg)).Should().Be(3);

        // Exit 4
        Program.MapExitCode(new SeamsWorkflowResult(false, 0, [], 0, TimeSpan.Zero, [], ErrorCodes.IoError)).Should().Be(4);

        // Exit 130
        Program.MapExitCode(new SeamsWorkflowResult(false, 0, [], 0, TimeSpan.Zero, [], ErrorCodes.OperationCanceled)).Should().Be(130);
    }

    [Fact]
    public async Task SmokeE2E_Cancellation_ReturnsExitCode130AndCleansTmpFiles()
    {
        var sourcePdf = Path.Combine(_tempDir, "banner_cancel_e2e.pdf");
        RuntimeFixtures.CreatePdfCmyk(sourcePdf);

        // Cria um arquivo temporário artificial simulando fatiamento interrompido
        var leftoverTmp = Path.Combine(_tempDir, "banner_cancel_e2e_painel_01.pdf.tmp");
        await File.WriteAllTextAsync(leftoverTmp, "tmp data");

        using var cts = new CancellationTokenSource();
        cts.Cancel(); // Simula sinal de interrupção imediato

        var executor = new SeamsWorkflowExecutor();
        var options = new SeamsCliOptions(
            SourcePath: sourcePdf,
            Format: "pdf",
            OutputDir: _tempDir);

        var result = await executor.ExecuteAsync(options, cancellationToken: cts.Token);
        int exitCode = Program.MapExitCode(result);

        exitCode.Should().Be(130);
        result.ErrorCode.Should().Be(ErrorCodes.OperationCanceled);

        // Valida que nenhum .tmp residual existe no diretório
        var remainingTmps = Directory.GetFiles(_tempDir, "*.tmp");
        remainingTmps.Should().BeEmpty();
    }
}
