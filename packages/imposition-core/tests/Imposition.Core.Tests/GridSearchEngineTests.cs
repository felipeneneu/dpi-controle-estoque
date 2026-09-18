using FluentAssertions;
using Imposition.Core.Contracts;
using Imposition.Core.Errors;
using Imposition.Core.Geometry;
using Imposition.Core.Grid;
using Xunit;

namespace Imposition.Core.Tests;

public class GridSearchEngineTests
{
    private static ImpositionInput Canonical(
        SubstrateKind kind = SubstrateKind.Sheet,
        SurplusPolicy surplus = SurplusPolicy.Truncate,
        MarginSpec? margin = null,
        Orientation? forced = null,
        int? forcedCols = null,
        double? maxRollLength = null)
        => new(
            Substrate: new SubstrateSpec(
                Kind: kind,
                WidthMm: 665, InitialLengthMm: 986,
                MaxLengthMm: maxRollLength,
                ToleranceMm: 0.1, RegisterMm: 0.1),
            Piece: new PieceSpec(19, 34),
            Gap:   new GapSpec(0, 0),
            Margin: margin ?? new MarginSpec(0, 0, 0, 0),
            TargetCopies: 1015,
            SurplusPolicy: surplus,
            ScalePolicy: ScalePolicy.Reject,
            ForcedOrientation: forced,
            ForcedCols: forcedCols);

    [Fact]
    public void BR_010_a_ToleranceAppliedBeforeFloor_CaseCanonical()
    {
        var r = GridSearchEngine.Plan(Canonical());
        r.Cols.Should().Be(35);
    }

    [Fact] // Margens per-side — 20mm à esquerda reduz utilW de 665 para 645.
    public void BR_010_b_MarginsPerSide_ReduceUsableWidth()
    {
        // utilW = 665 - 20 - 0 = 645 → maxCols = floor((645 + 0.1)/19) = 33.
        // Alvo 950 (não 1015) porque com Left=20 e alvo 1015 não existe grid
        // válido dentro de 986mm — o core corretamente lançaria E_GRID_OVERFLOW
        // (Regra 3: nunca transbordar silenciosamente).
        //   33 cols × 29 rows = 957 ≥ 950 ✓
        //   length = 29 × 34 = 986mm ≤ 986mm ✓
        var input = Canonical(
            margin: new MarginSpec(LeftMm: 20, RightMm: 0, TopMm: 0, BottomMm: 0))
            with { TargetCopies = 950 };

        var r = GridSearchEngine.Plan(input);

        r.Cols.Should().Be(33);
        r.Rows.Should().Be(29);
    }

    [Fact]
    public void BR_010_c_RollAutoExtendsUpToMaxLength()
    {
        var r = GridSearchEngine.Plan(Canonical(
            kind: SubstrateKind.Roll, maxRollLength: 2000));
        r.Orientation.Should().Be(Orientation.Portrait);
        r.Total.Should().BeGreaterThanOrEqualTo(1015);
    }

    [Fact]
    public void BR_010_d_SheetRejectsWhenDoesNotFit()
    {
        var input = Canonical() with
        {
            Substrate = new SubstrateSpec(
                SubstrateKind.Sheet, WidthMm: 50, InitialLengthMm: 50,
                MaxLengthMm: null, ToleranceMm: 0.1, RegisterMm: 0.1),
        };
        var act = () => GridSearchEngine.Plan(input);
        act.Should().Throw<ImpositionException>()
           .Which.Code.Should().Be(ErrorCodes.GridOverflow);
    }

    [Fact]
    public void BR_010_e_SurplusTruncate_ZeroSurplusAndPlannedEqualsTarget()
    {
        var r = GridSearchEngine.Plan(Canonical(surplus: SurplusPolicy.Truncate));
        r.Surplus.Should().Be(0);
        r.PlannedUnits.Should().Be(1015);
        r.Placements.Should().HaveCount(1015);
    }

    [Fact]
    public void BR_010_f_SurplusFillRow_DrawnEqualsGridTotal()
    {
        var input = Canonical(surplus: SurplusPolicy.FillRow) with { TargetCopies = 1013 };
        var r = GridSearchEngine.Plan(input);
        r.Total.Should().Be(1015);
        r.Surplus.Should().Be(2);
        r.PlannedUnits.Should().Be(1015);
    }

    [Fact]
    public void BR_010_g_SurplusFillAdvance_UsesAllAvailableRows()
    {
        var r = GridSearchEngine.Plan(Canonical(surplus: SurplusPolicy.FillAdvance));
        r.Total.Should().Be(1015);
    }

    [Fact]
    public void BR_010_h_OrientationChosenByCost_NotByAreaOrCols()
    {
        var r = GridSearchEngine.Plan(Canonical(forced: null));
        r.Orientation.Should().Be(Orientation.Portrait);
    }

    [Fact]
    public void BR_010_i_ForcedOrientationIsRespected()
    {
        var r = GridSearchEngine.Plan(Canonical(forced: Orientation.Portrait));
        r.Orientation.Should().Be(Orientation.Portrait);
    }

    [Fact]
    public void BR_010_j_GridHashIsDeterministic()
    {
        var a = GridSearchEngine.Plan(Canonical());
        var b = GridSearchEngine.Plan(Canonical());
        a.GridHash.Should().Be(b.GridHash);
    }

    [Fact]
    public void BR_010_cutInset_RejectedWithNotImplemented()
    {
        var input = Canonical() with
        {
            Substrate = Canonical().Substrate with { CutInsetMm = 2.0 },
        };
        var act = () => GridSearchEngine.Plan(input);
        act.Should().Throw<ImpositionException>()
           .Which.Code.Should().Be(ErrorCodes.NotImplemented);
    }

    [Fact] // BR-024 / ADR-026: fill_row garante sobra quando alvo não fecha
    public void BR_010_aj_FillRow_GaranteSurplus()
    {
        // Peça 34×19 em chapa 700×1000, margem 10, gap 2.
        // Alvo 200 com fill_row: deve escolher grade com surplus > 0,
        // não uma grade "exata" que desperdiça a última linha.
        var input = new ImpositionInput(
            Substrate: new SubstrateSpec(
                Kind: SubstrateKind.Sheet,
                WidthMm: 700, InitialLengthMm: 1000,
                MaxLengthMm: null,
                ToleranceMm: 0.1, RegisterMm: 0.1),
            Piece: new PieceSpec(34, 19),
            Gap: new GapSpec(2, 2),
            Margin: new MarginSpec(10, 10, 10, 10),
            TargetCopies: 200,
            SurplusPolicy: SurplusPolicy.FillRow,
            ScalePolicy: ScalePolicy.Reject,
            ForcedOrientation: null,
            ForcedCols: null);

        var result = GridSearchEngine.Plan(input);

        result.PlannedUnits.Should().BeGreaterThanOrEqualTo(200);
        result.Surplus.Should().BeGreaterThan(0,
            "fill_row deve produzir sobra (BR-024 / ADR-026)");
    }
}
