using System.Diagnostics;

namespace Imposition.Pdf;

public static class QpdfRunner
{
    private static string ResolveQpdfPath()
    {
        var local = Path.Combine(AppContext.BaseDirectory, "qpdf", "bin", "qpdf.exe");
        if (File.Exists(local)) return local;

        // 2. Fallback: PATH do sistema
        return "qpdf.exe";
    }

    public static string Run(string arguments, string? workingDir = null)
    {
        var psi = new ProcessStartInfo(ResolveQpdfPath(), arguments)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = workingDir ?? Directory.GetCurrentDirectory(),
        };
        using var process = Process.Start(psi)!;
        var stdout = process.StandardOutput.ReadToEnd();
        var err = process.StandardError.ReadToEnd();
        process.WaitForExit();
        if (process.ExitCode != 0 && process.ExitCode != 3)
            throw new InvalidOperationException($"qpdf falhou (exit {process.ExitCode}): {err}");
        return stdout;
    }

    public static void RunToFile(string arguments, string outputPath)
    {
        var output = Run(arguments);
        File.WriteAllText(outputPath, output, System.Text.Encoding.Latin1);
    }

    public static bool IsAvailable()
    {
        try { Run("--version"); return true; }
        catch { return false; }
    }
}
