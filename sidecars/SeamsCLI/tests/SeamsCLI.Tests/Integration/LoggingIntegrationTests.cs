using System;
using System.IO;
using System.Threading.Tasks;
using FluentAssertions;
using SeamsCLI;
using SeamsCLI.CommandLine;
using SeamsCLI.Execution;
using SeamsCLI.Logging;
using Xunit;

namespace SeamsCLI.Tests.Integration;

public class LoggingIntegrationTests : IDisposable
{
    private readonly string _tempDir;
    private readonly string _logDir;
    private readonly string _dummyPdf;

    public LoggingIntegrationTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "seams_log_int_" + Guid.NewGuid().ToString("N")[..8]);
        _logDir = Path.Combine(_tempDir, "logs");
        Directory.CreateDirectory(_tempDir);
        Directory.CreateDirectory(_logDir);

        _dummyPdf = Path.Combine(_tempDir, "input.pdf");
        var pdfContent =
            "%PDF-1.3\n" +
            "%%Comment: QDF 1.0\n" +
            "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n" +
            "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n" +
            "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 5669.29 2834.65] /Contents 4 0 R >> endobj\n" + // ~2000x1000 mm
            "4 0 obj << /Length 20 >> stream\n0 0 0 1 k 0 0 m S\nendstream endobj\n" +
            "xref\n0 5\n0000000000 65535 f \n0000000030 00000 n \n0000000080 00000 n \n0000000140 00000 n \n0000000250 00000 n \n" +
            "trailer << /Size 5 /Root 1 0 R >>\nstartxref\n320\n%%EOF\n";
        File.WriteAllText(_dummyPdf, pdfContent);
    }

    public void Dispose()
    {
        try
        {
            if (Directory.Exists(_tempDir))
            {
                Directory.Delete(_tempDir, true);
            }
        }
        catch
        {
            // Ignorar falhas de cleanup
        }
    }

    [Fact]
    public async Task Program_SuccessfulRun_CreatesLogWithPipelineMilestones()
    {
        string[] args = [
            _dummyPdf,
            "--roll", "1520",
            "--margin", "15",
            "--overlap", "10",
            "--line-color", "magenta",
            "--line-thickness", "1.5",
            "--log-dir", _logDir,
            "--outdir", _tempDir
        ];

        var exitCode = await Program.Main(args);

        exitCode.Should().Be(0);

        var logFiles = Directory.GetFiles(_logDir, "*.log");
        logFiles.Should().HaveCount(1);

        var logContent = await File.ReadAllTextAsync(logFiles[0]);
        logContent.Should().Contain("SeamsCLI v0.1.0");
        logContent.Should().Contain("Parâmetros do Trabalho");
        logContent.Should().Contain("Linha-guia: Ativa (Cor: magenta, Espessura: 1.5 pt)");
        logContent.Should().Contain("Análise do Arquivo de Entrada");
        logContent.Should().Contain("Cálculo Geométrico de Painéis");
        logContent.Should().Contain("Exportação (PDF)");
        logContent.Should().Contain("Painel exportado:");
        logContent.Should().Contain("Execução CONCLUÍDA COM SUCESSO");
    }

    [Fact]
    public async Task Program_WithNoLogFlag_DoesNotCreateLogFile()
    {
        string[] args = [
            _dummyPdf,
            "--roll", "1520",
            "--no-log",
            "--log-dir", _logDir,
            "--outdir", _tempDir
        ];

        var exitCode = await Program.Main(args);

        exitCode.Should().Be(0);

        var logFiles = Directory.GetFiles(_logDir, "*.log");
        logFiles.Should().BeEmpty();
    }

    [Fact]
    public async Task Program_InvalidArguments_LogsFailure()
    {
        string[] args = [
            _dummyPdf,
            "--line-color", "cor_invalida_xyz",
            "--log-dir", _logDir
        ];

        var exitCode = await Program.Main(args);

        exitCode.Should().Be(1);

        var logFiles = Directory.GetFiles(_logDir, "*.log");
        logFiles.Should().HaveCount(1);

        var logContent = await File.ReadAllTextAsync(logFiles[0]);
        logContent.Should().Contain("[ERROR] Falha ao validar argumentos:");
    }
}
