using System.Globalization;
using System.Text;

namespace SeamsCLI.Logging;

/// <summary>
/// Logger de diagnóstico por execução do SeamsCLI (ADR-058).
/// Grava contexto de hardware, SO, parâmetros, passos do pipeline e stack traces em arquivo único.
/// Fail-safe: falhas de gravação em disco nunca abortam a execução da CLI.
/// </summary>
public sealed class RunLogger : IDisposable
{
    private readonly object _lock = new();
    private StreamWriter? _writer;
    private bool _disposed;

    public string LogFilePath { get; }

    private RunLogger(string logFilePath, StreamWriter? writer)
    {
        LogFilePath = logFilePath;
        _writer = writer;
    }

    public static RunLogger Start(string? logDirectory, string? jobName, string[]? commandLineArgs)
    {
        try
        {
            var targetDir = string.IsNullOrWhiteSpace(logDirectory)
                ? Path.Combine(AppContext.BaseDirectory, "logs")
                : Path.GetFullPath(logDirectory);

            if (!Directory.Exists(targetDir))
            {
                Directory.CreateDirectory(targetDir);
            }

            // Garante README.txt e feedback.txt no diretório de logs
            LogTemplates.EnsureTemplatesExist(targetDir);

            var safeJobName = SanitizeFileName(string.IsNullOrWhiteSpace(jobName) ? "job" : jobName);
            var timestamp = DateTime.Now.ToString("yyyy-MM-dd_HH-mm-ss", CultureInfo.InvariantCulture);
            var fileName = $"{timestamp}_{safeJobName}.log";
            var fullPath = Path.Combine(targetDir, fileName);

            var fs = new FileStream(fullPath, FileMode.Create, FileAccess.Write, FileShare.ReadWrite);
            var writer = new StreamWriter(fs, Encoding.UTF8) { AutoFlush = true };

            var logger = new RunLogger(fullPath, writer);
            logger.WriteHeader(commandLineArgs);
            return logger;
        }
        catch (Exception ex)
        {
            // Fail-safe: emite aviso em stderr mas não quebra a execução
            try
            {
                Console.Error.WriteLine($"[AVISO] Falha ao iniciar logging em arquivo ({ex.Message}). A execução continuará normalmente.");
            }
            catch
            {
                // Silencioso se stderr indisponível
            }

            return new RunLogger(string.Empty, null);
        }
    }

    public void Info(string message) => WriteEntry(LogLevel.Info, message);

    public void Warn(string message) => WriteEntry(LogLevel.Warn, message);

    public void Error(string message, Exception? ex = null)
    {
        WriteEntry(LogLevel.Error, message);
        if (ex != null)
        {
            WriteRaw($"[{GetTimestamp()}] [ERROR] Exception details:\n{ex}\n");
        }
    }

    public void Section(string title)
    {
        lock (_lock)
        {
            if (_writer == null || _disposed) return;
            try
            {
                _writer.WriteLine();
                _writer.WriteLine($"=== [{GetTimestamp()}] {title} ===");
                _writer.Flush();
            }
            catch
            {
                // Fail-safe
            }
        }
    }

    private void WriteHeader(string[]? commandLineArgs)
    {
        var env = EnvironmentInfo.Capture(commandLineArgs);
        var nowStr = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff", CultureInfo.InvariantCulture);

        var header =
$@"============================================================
SeamsCLI v0.1.0
Run: {nowStr}
Host: {env.MachineName} | {env.OsDescription} | {env.FrameworkDescription}
CPU: {env.ProcessorCount} cores | RAM: {env.TotalMemoryGb:F1} GB
Command: {env.CommandLine}
Log: {LogFilePath}
============================================================";

        WriteRaw(header + Environment.NewLine);
    }

    private void WriteEntry(LogLevel level, string message)
    {
        var line = $"[{GetTimestamp()}] [{level.ToString().ToUpperInvariant()}] {message}";
        WriteRaw(line + Environment.NewLine);
    }

    private void WriteRaw(string text)
    {
        lock (_lock)
        {
            if (_writer == null || _disposed) return;
            try
            {
                _writer.Write(text);
                _writer.Flush();
            }
            catch
            {
                // Fail-safe
            }
        }
    }

    private static string GetTimestamp() =>
        DateTime.Now.ToString("HH:mm:ss.fff", CultureInfo.InvariantCulture);

    private static string SanitizeFileName(string name)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var sb = new StringBuilder(name.Length);
        foreach (var ch in name)
        {
            sb.Append(invalid.Contains(ch) ? '_' : ch);
        }
        return sb.ToString();
    }

    public void Dispose()
    {
        lock (_lock)
        {
            if (_disposed) return;
            _disposed = true;
            try
            {
                _writer?.Flush();
                _writer?.Dispose();
            }
            catch
            {
                // Ignora falhas no dispose
            }
            finally
            {
                _writer = null;
            }
        }
    }
}
