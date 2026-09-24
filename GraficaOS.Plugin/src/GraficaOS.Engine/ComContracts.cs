using System.Text.Json;
using System.Text.Json.Serialization;

namespace GraficaOS.Engine;

/// <summary>Opções globais de serialização JSON para toda a comunicação COM.</summary>
public static class JsonDefaults
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = false,
    };
}

// ── Request DTOs ──────────────────────────────────────────────────────

public sealed record MarginsDto(
    double Top = 0,
    double Right = 0,
    double Bottom = 0,
    double Left = 0);

public sealed record MarksDto(
    bool Enabled = true,
    string Type = "mimaki-fcrm",
    double SizeMm = 20,
    double OffsetMm = 3);

public sealed record ImposeRequestDto(
    string SchemaVersion,
    string RequestId,
    string? InputPath,
    string? OutputDir,
    double SheetWMm,
    double SheetHMm,
    double ArtWMm,
    double ArtHMm,
    double GapMm,
    MarginsDto? Margins,
    int TargetCopies,
    string? ForceRotation,
    string SurplusPolicy,
    string SubstrateKind,
    double? MaxLengthMm,
    MarksDto? Marks);

// ── Response DTOs ─────────────────────────────────────────────────────

public sealed record PlacementDto(
    int Index,
    int Col,
    int Row,
    double XMm,
    double YMm,
    double WidthMm,
    double HeightMm,
    bool Rotated);

public sealed record SheetDto(double WidthMm, double HeightMm);

public sealed record GridDto(
    int Cols,
    int Rows,
    int PlannedUnits,
    int RequestedUnits,
    int SurplusUnits,
    int RotationDeg);

public sealed record OverflowOptionDto(
    string Id,
    string Label,
    int Sheets,
    int TotalUnits);

public sealed record ImposeResponseDto(
    string SchemaVersion,
    string RequestId,
    bool Success,
    string? ErrorCode,
    string? Message,
    long ExecutionTimeMs,
    SheetDto? Sheet,
    GridDto? Grid,
    IReadOnlyList<string>? OutputFiles,
    IReadOnlyList<PlacementDto>? Placements,
    IReadOnlyList<OverflowOptionDto>? Options);

// ── Telemetria ────────────────────────────────────────────────────────

public sealed record TelemetryEventDto(
    string EventName,
    string? TenantId,
    string? MachineId,
    DateTimeOffset Timestamp,
    Dictionary<string, object>? Properties);

public sealed record FlushResultDto(
    bool Success,
    int SentCount,
    string? ErrorCode,
    string? Message);
