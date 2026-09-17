using Imposition.Core.Geometry;

namespace Imposition.Core.Contracts;

/// <summary>
/// Contrato de entrada — IMPOSICAO-MOTOR.md §6.1.
/// Mudança aqui exige ADR (Regra 6 do AGENTS.md).
/// </summary>
public sealed record ImpositionInput(
    SubstrateSpec Substrate,
    PieceSpec Piece,
    GapSpec Gap,
    MarginSpec Margin,
    int TargetCopies,
    SurplusPolicy SurplusPolicy,
    ScalePolicy ScalePolicy,
    Orientation? ForcedOrientation,
    int? ForcedCols,
    string SchemaVersion = "1.0");

public sealed record SubstrateSpec(
    SubstrateKind Kind,
    double WidthMm,
    double InitialLengthMm,
    double? MaxLengthMm,
    double ToleranceMm,
    double RegisterMm,
    double BleedMm = 0.0,
    double CutInsetMm = 0.0);

public sealed record PieceSpec(double WidthMm, double HeightMm);

public sealed record GapSpec(double HorizontalMm, double VerticalMm);

public sealed record MarginSpec(
    double LeftMm, double RightMm, double TopMm, double BottomMm);
