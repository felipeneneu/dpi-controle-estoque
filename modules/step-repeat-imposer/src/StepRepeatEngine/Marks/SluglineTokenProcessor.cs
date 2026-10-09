namespace StepRepeatEngine.Marks;

public record SluglineContext(
    string JobName,
    string CustomerName,
    int UpCount,
    double SheetWidthMm,
    double SheetHeightMm,
    string Side,
    string ColorName,
    DateTime Timestamp
);

/// <summary>
/// Processador de interpolação de tokens dinâmicos para Sluglines de Step & Repeat.
/// </summary>
public static class SluglineTokenProcessor
{
    public static string Process(string pattern, SluglineContext ctx)
    {
        if (string.IsNullOrWhiteSpace(pattern))
        {
            return string.Empty;
        }

        string dateStr = ctx.Timestamp.ToString("yyyy-MM-dd");
        string timeStr = ctx.Timestamp.ToString("HH:mm:ss");
        string sheetSizeStr = $"{Math.Round(ctx.SheetWidthMm, 1)}x{Math.Round(ctx.SheetHeightMm, 1)}mm";

        return pattern
            .Replace("$job", ctx.JobName, StringComparison.OrdinalIgnoreCase)
            .Replace("$customer", ctx.CustomerName, StringComparison.OrdinalIgnoreCase)
            .Replace("$upCount", $"{ctx.UpCount}-UP", StringComparison.OrdinalIgnoreCase)
            .Replace("$sheetSize", sheetSizeStr, StringComparison.OrdinalIgnoreCase)
            .Replace("$side", ctx.Side, StringComparison.OrdinalIgnoreCase)
            .Replace("$color", ctx.ColorName, StringComparison.OrdinalIgnoreCase)
            .Replace("$date", dateStr, StringComparison.OrdinalIgnoreCase)
            .Replace("$time", timeStr, StringComparison.OrdinalIgnoreCase);
    }
}
