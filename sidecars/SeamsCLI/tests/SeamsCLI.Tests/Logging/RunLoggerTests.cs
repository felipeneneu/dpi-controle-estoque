using System.IO;
using FluentAssertions;
using SeamsCLI.Logging;
using Xunit;

namespace SeamsCLI.Tests.Logging;

public class RunLoggerTests : IDisposable
{
    private readonly string _tempLogDir;

    public RunLoggerTests()
    {
        _tempLogDir = Path.Combine(Path.GetTempPath(), "seams_test_logs_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_tempLogDir);
    }

    public void Dispose()
    {
        try
        {
            if (Directory.Exists(_tempLogDir))
            {
                Directory.Delete(_tempLogDir, true);
            }
        }
        catch
        {
            // Ignora falhas de cleanup em temporários
        }
    }

    [Fact]
    public void Start_CreatesFileOnDisk_WithHeaderAndTemplates()
    {
        string[] args = ["banner.pdf", "--roll", "1520"];
        string logPath;
        using (var logger = RunLogger.Start(_tempLogDir, "banner_job", args))
        {
            logger.LogFilePath.Should().NotBeNullOrEmpty();
            File.Exists(logger.LogFilePath).Should().BeTrue();
            logPath = logger.LogFilePath;
        }

        var content = File.ReadAllText(logPath);
        content.Should().Contain("SeamsCLI v0.1.0");
        content.Should().Contain("Host:");
        content.Should().Contain("CPU:");
        content.Should().Contain("banner.pdf");

        // Verifica criação dos templates
        File.Exists(Path.Combine(_tempLogDir, "README.txt")).Should().BeTrue();
        File.Exists(Path.Combine(_tempLogDir, "feedback.txt")).Should().BeTrue();
    }

    [Fact]
    public void InfoWarnError_WriteExpectedPrefixes()
    {
        string logPath;
        using (var logger = RunLogger.Start(_tempLogDir, "job1", null))
        {
            logPath = logger.LogFilePath;
            logger.Info("Mensagem informativa de teste");
            logger.Warn("Aviso de teste");
            logger.Error("Erro reportado");
        }

        var lines = File.ReadAllLines(logPath);
        lines.Should().Contain(l => l.Contains("[INFO] Mensagem informativa de teste"));
        lines.Should().Contain(l => l.Contains("[WARN] Aviso de teste"));
        lines.Should().Contain(l => l.Contains("[ERROR] Erro reportado"));
    }

    [Fact]
    public void Error_WithException_WritesFullStackTrace()
    {
        string logPath;
        using (var logger = RunLogger.Start(_tempLogDir, "job_ex", null))
        {
            logPath = logger.LogFilePath;
            try
            {
                throw new InvalidOperationException("Falha simulada de split");
            }
            catch (Exception ex)
            {
                logger.Error("Ocorreu uma exceção não esperada", ex);
            }
        }

        var content = File.ReadAllText(logPath);
        content.Should().Contain("[ERROR] Ocorreu uma exceção não esperada");
        content.Should().Contain("InvalidOperationException: Falha simulada de split");
        content.Should().Contain("RunLoggerTests");
    }

    [Fact]
    public void Section_WritesDelimiters()
    {
        string logPath;
        using (var logger = RunLogger.Start(_tempLogDir, "job_sec", null))
        {
            logPath = logger.LogFilePath;
            logger.Section("Exportação de Painéis");
        }

        var content = File.ReadAllText(logPath);
        content.Should().Contain("=== [");
        content.Should().Contain("Exportação de Painéis ===");
    }

    [Fact]
    public void Start_WithInvalidPath_FailsGracefullyWithoutThrowing()
    {
        // Passa um caminho inválido de diretório
        var invalidDir = Path.Combine(_tempLogDir, "invalido\0caractere");
        using var logger = RunLogger.Start(invalidDir, "job_fail", null);

        logger.LogFilePath.Should().BeEmpty();
        // Não deve estourar exceção nas chamadas de log
        logger.Info("Tentativa no-op");
        logger.Warn("Aviso no-op");
        logger.Error("Erro no-op");
        logger.Section("Secao no-op");
    }

    [Fact]
    public void Start_SanitizesSpecialCharactersInJobName()
    {
        var complexJobName = "banner:teste/2026*final?.jpg";
        using var logger = RunLogger.Start(_tempLogDir, complexJobName, null);

        logger.LogFilePath.Should().NotBeNullOrEmpty();
        File.Exists(logger.LogFilePath).Should().BeTrue();
        Path.GetFileName(logger.LogFilePath).Should().NotContain(":");
        Path.GetFileName(logger.LogFilePath).Should().NotContain("*");
        Path.GetFileName(logger.LogFilePath).Should().NotContain("?");
    }
}
