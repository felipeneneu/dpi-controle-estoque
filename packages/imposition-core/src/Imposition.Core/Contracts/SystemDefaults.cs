using Imposition.Core.Geometry;

namespace Imposition.Core.Contracts;

/// <summary>
/// Camada 4 do resolver — ADR-021 §Decisão 4.
/// System defaults do core. Muda por release do pacote, não por job.
/// Nenhum caller deve depender do conteúdo — só da existência.
/// </summary>
public static class SystemDefaults
{
    public static readonly ImpositionInput Value = new(
        Substrate: new SubstrateSpec(
            Kind: SubstrateKind.Sheet,
            WidthMm: 665, InitialLengthMm: 986,
            MaxLengthMm: null,
            ToleranceMm: 0.1, RegisterMm: 0.1,
            BleedMm: 0.0, CutInsetMm: 0.0),
        Piece: new PieceSpec(1, 1),
        Gap: new GapSpec(0, 0),
        Margin: new MarginSpec(0, 0, 0, 0),
        TargetCopies: 1,
        SurplusPolicy: SurplusPolicy.Truncate,
        ScalePolicy: ScalePolicy.Reject,
        ForcedOrientation: null,
        ForcedCols: null);
}
