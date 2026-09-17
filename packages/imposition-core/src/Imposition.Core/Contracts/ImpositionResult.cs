using Imposition.Core.Geometry;

namespace Imposition.Core.Contracts;

public sealed record ImpositionResult(
    string SchemaVersion,
    string GridHash,
    int Cols,
    int Rows,
    int Total,
    Orientation Orientation,
    double LengthMm,
    int Surplus,
    int PlannedUnits,
    IReadOnlyList<Placement> Placements,
    Metrics Metrics,
    IReadOnlyList<AlternativeGrid> AlternativeGrids);

public sealed record Placement(
    int Index,
    int Row,
    int Col,
    double XMm,
    double YMm,
    double WidthMm,
    double HeightMm,
    int RotationDegrees);

public sealed record Metrics(
    double UtilizationPct,
    double LengthMeters,
    double RegisterWorstCaseMm);

public sealed record AlternativeGrid(
    int Cols,
    int Rows,
    int Total,
    Orientation Orientation,
    double LengthMm,
    int Surplus,
    double Score);
