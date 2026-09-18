using Imposition.Core.Contracts;
using Imposition.Core.Geometry;
using Imposition.Core.Grid;
using Imposition.Core.Tolerance;
using CorePlan = Imposition.Core.Contracts.ImpositionResult;

namespace AutoImposerCLI.Imposition;

/// <summary>
/// Ponte entre o AutoImposerCLI (Motor 1) e o imposition-core (fonte única de
/// verdade da grade — ADR-021 Decisão 6). Elimina a decisão de orientação por
/// área de Program.cs:153.
/// </summary>
public static class ImpositionBridge
{
    public const double DefaultToleranceMm = 0.1;
    public const double DefaultRegisterMm = 0.1;

    /// <summary>
    /// Capacidade máxima da chapa em cópias (default do modo legado quando o
    /// operador não informa tiragem). Regra 1 do AGENTS.md: tol aplicada ANTES
    /// do floor, nas DUAS orientações — a vencedora é a de maior capacidade.
    /// </summary>
    public static int MaxCapacity(
        double sheetWidthMm,
        double sheetHeightMm,
        double gapMm,
        double marginTopMm,
        double marginRightMm,
        double marginBottomMm,
        double marginLeftMm,
        double pieceWidthMm,
        double pieceHeightMm)
    {
        var tol  = Tolerance.Resolve(DefaultToleranceMm, DefaultRegisterMm);
        var utilW = sheetWidthMm - marginLeftMm - marginRightMm;
        var utilH = sheetHeightMm - marginTopMm - marginBottomMm;

        var direta   = Math.Floor((utilW + gapMm + tol) / (pieceWidthMm + gapMm))
                     * Math.Floor((utilH + gapMm + tol) / (pieceHeightMm + gapMm));
        var rotaciona = Math.Floor((utilW + gapMm + tol) / (pieceHeightMm + gapMm))
                     * Math.Floor((utilH + gapMm + tol) / (pieceWidthMm + gapMm));
        return (int)Math.Max(direta, rotaciona);
    }
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
                ToleranceMm: DefaultToleranceMm,
                RegisterMm: DefaultRegisterMm),
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