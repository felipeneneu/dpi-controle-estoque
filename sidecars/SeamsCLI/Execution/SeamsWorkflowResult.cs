namespace SeamsCLI.Execution;

public sealed record SeamsWorkflowResult(
    bool Success,
    int PanelCount,
    IReadOnlyList<string> GeneratedFiles,
    double TotalLinearLengthMeters,
    TimeSpan ElapsedTime,
    IReadOnlyList<string> Warnings,
    string? ErrorCode = null,
    string? ErrorMessage = null)
{
    public int SeamCount => Math.Max(0, PanelCount - 1);
}
