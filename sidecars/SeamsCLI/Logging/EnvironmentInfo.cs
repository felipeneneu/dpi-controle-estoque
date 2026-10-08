using System.Runtime.InteropServices;

namespace SeamsCLI.Logging;

public sealed record EnvironmentInfo(
    string MachineName,
    string OsDescription,
    string FrameworkDescription,
    int ProcessorCount,
    double TotalMemoryGb,
    string CommandLine)
{
    public static EnvironmentInfo Capture(string[]? args = null)
    {
        var machine = Environment.MachineName;
        var os = RuntimeInformation.OSDescription;
        var framework = RuntimeInformation.FrameworkDescription;
        var cpus = Environment.ProcessorCount;

        double memoryGb = 0;
        try
        {
            var memBytes = GC.GetGCMemoryInfo().TotalAvailableMemoryBytes;
            memoryGb = memBytes / (1024.0 * 1024.0 * 1024.0);
        }
        catch
        {
            // Em ambientes restritos onde GC não reporta TotalAvailableMemoryBytes
            memoryGb = 0;
        }

        string cmdLine = args != null && args.Length > 0
            ? "SeamsCLI.exe " + string.Join(" ", args.Select(QuoteIfNeeded))
            : Environment.CommandLine;

        return new EnvironmentInfo(machine, os, framework, cpus, memoryGb, cmdLine);
    }

    private static string QuoteIfNeeded(string arg)
    {
        return arg.Contains(' ') || arg.Contains('\t') ? $"\"{arg}\"" : arg;
    }
}
