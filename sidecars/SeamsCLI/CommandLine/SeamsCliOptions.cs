namespace SeamsCLI.CommandLine;

public sealed record SeamsCliOptions(
    string SourcePath,
    double RollWidthMm = 1520.0,
    double MarginMm = 15.0,
    double OverlapMm = 10.0,
    bool ShrinkageCompensation = false,
    double? WidthMm = null,
    double? HeightMm = null,
    string? JobName = null,
    string Orientation = "vert",
    string Direction = "ltr",
    string Format = "jpg",
    string? OutputDir = null,
    int? Dpi = null,
    bool JsonOutput = false,
    bool Verbose = false);

public sealed record CliParseResult(
    bool Success,
    SeamsCliOptions? Options,
    int ExitCode = 0,
    string? ErrorCode = null,
    string? ErrorMessage = null);
