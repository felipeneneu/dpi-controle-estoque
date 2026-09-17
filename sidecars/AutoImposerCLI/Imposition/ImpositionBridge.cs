using Imposition.Core.Contracts;
using Imposition.Core.Geometry;
using Imposition.Core.Grid;
using CorePlan = Imposition.Core.Contracts.ImpositionResult;

namespace AutoImposerCLI.Imposition;

/// <summary>
/// Ponte entre o AutoImposerCLI (Motor 1) e o imposition-core (fonte única de
/// verdade da grade — ADR-021 Decisão 6). Elimina a decisão de orientação por
/// área de Program.cs:153.
/// </summary>
public static class ImpositionBridge
{
    public static ImpositionInput BuildInput(
        double sheetWidthMm,
        double sheetHeightMm,
        double gapMm,
        double marginTopMm,
        double marginRightMm,
        double marginBottomMm,
        double marginLeftMm,
        double pieceWidthMm,
        double pieceHeightMm,
        int targetCopies,
        Orientation? forcedOrientation = null)
    {
        return new ImpositionInput(
            Substrate: new SubstrateSpec(
                Kind: SubstrateKind.Sheet,
                WidthMm: sheetWidthMm,
                InitialLengthMm: sheetHeightMm,
                MaxLengthMm: null,
                ToleranceMm: 0.1,
                RegisterMm: 0.1),
            Piece: new PieceSpec(pieceWidthMm, pieceHeightMm),
            Gap: new GapSpec(gapMm, gapMm),
            Margin: new MarginSpec(marginLeftMm, marginRightMm, marginTopMm, marginBottomMm),
            TargetCopies: targetCopies,
            SurplusPolicy: SurplusPolicy.Truncate,
            ScalePolicy: ScalePolicy.Fit,
            ForcedOrientation: forcedOrientation,
            ForcedCols: null);
    }

    public static CorePlan Plan(ImpositionInput input)
        => GridSearchEngine.Plan(input);
}