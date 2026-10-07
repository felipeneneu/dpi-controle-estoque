using System;
using System.Collections.Generic;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SeamsCLI.Execution;

public static class JsonResultEmitter
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never
    };

    private sealed record ResultDto(
        string SchemaVersion,
        bool Success,
        int PanelCount,
        int SeamCount,
        IReadOnlyList<string> GeneratedFiles,
        double TotalLinearLengthMeters,
        long ElapsedMs,
        IReadOnlyList<string> Warnings,
        string? ErrorCode,
        string? ErrorMessage);

    public static string Emit(SeamsWorkflowResult result)
    {
        ArgumentNullException.ThrowIfNull(result);

        var dto = new ResultDto(
            SchemaVersion: "1.0",
            Success: result.Success,
            PanelCount: result.PanelCount,
            SeamCount: result.SeamCount,
            GeneratedFiles: result.GeneratedFiles ?? [],
            TotalLinearLengthMeters: Math.Round(result.TotalLinearLengthMeters, 2),
            ElapsedMs: (long)result.ElapsedTime.TotalMilliseconds,
            Warnings: result.Warnings ?? [],
            ErrorCode: result.ErrorCode,
            ErrorMessage: result.ErrorMessage);

        return JsonSerializer.Serialize(dto, JsonOptions);
    }
}
