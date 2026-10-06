using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using FluentAssertions;
using Imposition.Core.Errors;
using Imposition.Render.Native;
using SeamsCLI.CommandLine;
using SeamsCLI.Execution;
using Xunit;

namespace SeamsCLI.Tests.Execution;

public class SeamsWorkflowExecutorTests
{
    private readonly string _tempDir;

    public SeamsWorkflowExecutorTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "seams_exec_test_" + Guid.NewGuid().ToString("N")[..8]);
        Directory.CreateDirectory(_tempDir);
    }

    [Fact]
    public async Task ExecuteAsync_SourceFileNotFound_ReturnsInputNotFound()
    {
        var options = new SeamsCliOptions(
            SourcePath: Path.Combine(_tempDir, "nao_existe.jpg"),
            OutputDir: _tempDir);

        var executor = new SeamsWorkflowExecutor();
        var result = await executor.ExecuteAsync(options);

        result.Success.Should().BeFalse();
        result.ErrorCode.Should().Be(ErrorCodes.InputNotFound);
    }

    [Fact]
    public async Task ExecuteAsync_ValidPdf_ExportsPanelsSuccessfully()
    {
        var pdfPath = Path.Combine(_tempDir, "banner_test.pdf");
        var pdfContent =
            "%PDF-1.3\n" +
            "%%Comment: QDF 1.0\n" +
            "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n" +
            "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n" +
            "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 5669.29 2834.65] /Contents 4 0 R >> endobj\n" + // ~2000x1000 mm
            "4 0 obj << /Length 20 >> stream\n0 0 0 1 k 0 0 m S\nendstream endobj\n" +
            "xref\n0 5\n0000000000 65535 f \n0000000030 00000 n \n0000000080 00000 n \n0000000140 00000 n \n0000000250 00000 n \n" +
            "trailer << /Size 5 /Root 1 0 R >>\nstartxref\n320\n%%EOF\n";
        await File.WriteAllTextAsync(pdfPath, pdfContent);

        var options = new SeamsCliOptions(
            SourcePath: pdfPath,
            RollWidthMm: 1520.0,
            MarginMm: 15.0,
            OverlapMm: 10.0,
            Format: "pdf",
            OutputDir: _tempDir);

        var executor = new SeamsWorkflowExecutor();
        var result = await executor.ExecuteAsync(options);

        result.Success.Should().BeTrue();
        result.PanelCount.Should().BeGreaterThan(0);
        result.GeneratedFiles.Should().NotBeEmpty();
        result.TotalLinearLengthMeters.Should().BeGreaterThan(0);
        File.Exists(result.GeneratedFiles[0]).Should().BeTrue();
    }

    [Fact]
    public async Task ExecuteAsync_PdfWithOcg_AbortsWithSourceHasOcg()
    {
        var pdfPath = Path.Combine(_tempDir, "banner_ocg.pdf");
        var pdfContent =
            "%PDF-1.3\n" +
            "1 0 obj << /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [] >> >> endobj\n" +
            "2 0 obj << /Type /Pages /Kids [] /Count 0 /MediaBox [0 0 1000 1000] >> endobj\n" +
            "trailer << /Root 1 0 R >>\n%%EOF";
        await File.WriteAllTextAsync(pdfPath, pdfContent);

        var options = new SeamsCliOptions(
            SourcePath: pdfPath,
            Format: "pdf",
            OutputDir: _tempDir);

        var executor = new SeamsWorkflowExecutor();
        var result = await executor.ExecuteAsync(options);

        result.Success.Should().BeFalse();
        result.ErrorCode.Should().Be(ErrorCodes.SourceHasOcg);
    }

    [Fact]
    public async Task ExecuteAsync_CancellationRequested_AbortsWithOperationCanceled()
    {
        var pdfPath = Path.Combine(_tempDir, "banner_cancel.pdf");
        await File.WriteAllTextAsync(pdfPath, "%PDF-1.3\n/MediaBox [0 0 1000 1000]\n%%EOF");

        using var cts = new CancellationTokenSource();
        cts.Cancel(); // Pré-cancelado

        var options = new SeamsCliOptions(
            SourcePath: pdfPath,
            Format: "pdf",
            OutputDir: _tempDir);

        var executor = new SeamsWorkflowExecutor();
        var result = await executor.ExecuteAsync(options, cancellationToken: cts.Token);

        result.Success.Should().BeFalse();
        result.ErrorCode.Should().Be(ErrorCodes.OperationCanceled);
    }

    [Fact]
    public async Task ExecuteAsync_DimensionOverride_RegistersWarning()
    {
        var pdfPath = Path.Combine(_tempDir, "banner_override.pdf");
        var pdfContent =
            "%PDF-1.3\n" +
            "%%Comment: QDF 1.0\n" +
            "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n" +
            "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n" +
            "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 2834.65 2834.65] /Contents 4 0 R >> endobj\n" +
            "4 0 obj << /Length 12 >> stream\n0 0 0 1 k S\nendstream endobj\n" +
            "trailer << /Root 1 0 R >>\n%%EOF\n";
        await File.WriteAllTextAsync(pdfPath, pdfContent);

        var options = new SeamsCliOptions(
            SourcePath: pdfPath,
            WidthMm: 3000.0,
            HeightMm: 1000.0,
            Format: "pdf",
            OutputDir: _tempDir);

        var executor = new SeamsWorkflowExecutor();
        var result = await executor.ExecuteAsync(options);

        result.Success.Should().BeTrue();
        result.Warnings.Should().Contain(w => w.Contains("sobrescrit"));
    }
}
