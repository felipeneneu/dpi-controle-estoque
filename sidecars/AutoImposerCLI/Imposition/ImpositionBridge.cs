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
    /// Se <paramref name="forcedOrientation"/> for informado, respeita a
    /// orientação (ignora a outra).
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
        double pieceHeightMm,
        Orientation? forcedOrientation = null)
    {
        var tol  = Tolerance.Resolve(DefaultToleranceMm, DefaultRegisterMm);
        var utilW = sheetWidthMm - marginLeftMm - marginRightMm;
        var utilH = sheetHeightMm - marginTopMm - marginBottomMm;

        int Cap(double pW, double pH) =>
            (int)(Math.Floor((utilW + gapMm + tol) / (pW + gapMm))
                * Math.Floor((utilH + gapMm + tol) / (pH + gapMm)));

        return forcedOrientation switch
        {
            Orientation.Portrait  => Cap(pieceWidthMm, pieceHeightMm),
            Orientation.Landscape => Cap(pieceHeightMm, pieceWidthMm),
            null                  => Math.Max(
                                      Cap(pieceWidthMm, pieceHeightMm),
                                      Cap(pieceHeightMm, pieceWidthMm)),
            _ => throw new ArgumentOutOfRangeException(
                     nameof(forcedOrientation), forcedOrientation,
                     "Orientação inválida (valores válidos: Portrait, Landscape)."),
        };
    }

    /// <summary>
    /// Capacidade máxima de um rolo/bobina (auto-estende até
    /// <paramref name="maxLengthMm"/>). Mesma fórmula da Regra 1, aplicada
    /// nas DUAS orientações.
    /// </summary>
    public static int MaxCapacityRoll(
        double rollWidthMm,
        double maxLengthMm,
        double gapMm,
        double marginTopMm,
        double marginRightMm,
        double marginBottomMm,
        double marginLeftMm,
        double pieceWidthMm,
        double pieceHeightMm)
    {
        var tol  = Tolerance.Resolve(DefaultToleranceMm, DefaultRegisterMm);
        var utilW = rollWidthMm - marginLeftMm - marginRightMm;
        var utilH = maxLengthMm - marginTopMm - marginBottomMm;

        int Cap(double pW, double pH) =>
            (int)(Math.Floor((utilW + gapMm + tol) / (pW + gapMm))
                * Math.Floor((utilH + gapMm + tol) / (pH + gapMm)));

        return Math.Max(Cap(pieceWidthMm, pieceHeightMm),
                        Cap(pieceHeightMm, pieceWidthMm));
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
        Orientation? forcedOrientation = null,
        SurplusPolicy surplusPolicy = SurplusPolicy.FillRow,
        SubstrateKind kind = SubstrateKind.Sheet,
        double? maxLengthMm = null)
    {
        if (kind == SubstrateKind.Roll && maxLengthMm is null)
            throw new ArgumentException(
                "Rolo requer maxLengthMm.", nameof(maxLengthMm));

        return new ImpositionInput(
            Substrate: new SubstrateSpec(
                Kind: kind,
                WidthMm: sheetWidthMm,
                InitialLengthMm: sheetHeightMm,
                MaxLengthMm: kind == SubstrateKind.Roll ? maxLengthMm : null,
                ToleranceMm: DefaultToleranceMm,
                RegisterMm: DefaultRegisterMm),
            Piece: new PieceSpec(pieceWidthMm, pieceHeightMm),
            Gap: new GapSpec(gapMm, gapMm),
            Margin: new MarginSpec(marginLeftMm, marginRightMm, marginTopMm, marginBottomMm),
            TargetCopies: targetCopies,
            SurplusPolicy: surplusPolicy,
            ScalePolicy: ScalePolicy.Reject,
            ForcedOrientation: forcedOrientation,
            ForcedCols: null);
    }

    public static CorePlan Plan(ImpositionInput input)
        => GridSearchEngine.Plan(input);
}