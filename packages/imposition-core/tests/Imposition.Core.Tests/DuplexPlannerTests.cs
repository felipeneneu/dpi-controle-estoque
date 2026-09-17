using FluentAssertions;
using Imposition.Core.Contracts;
using Imposition.Core.Duplex;
using Imposition.Core.Geometry;
using Imposition.Core.Grid;
using Xunit;

namespace Imposition.Core.Tests;

public class DuplexPlannerTests
{
    private static ImpositionInput CanonicalInput()
        => new(
            Substrate: new SubstrateSpec(
                Kind: SubstrateKind.Sheet,
                WidthMm: 665, InitialLengthMm: 986,
                MaxLengthMm: null,
                ToleranceMm: 0.1, RegisterMm: 0.1),
            Piece: new PieceSpec(19, 34),
            Gap:   new GapSpec(0, 0),
            Margin: new MarginSpec(0, 0, 0, 0),
            TargetCopies: 1015,
            SurplusPolicy: SurplusPolicy.Truncate,
            ScalePolicy: ScalePolicy.Reject,
            ForcedOrientation: null,
            ForcedCols: null);

    [Fact] // Head-to-Head: posição preservada.
    public void BR_010_x_HeadToHead_PreservesPlacement()
    {
        var plan = DuplexPlanner.Plan(new DuplexRequest(
            CanonicalInput(), DuplexPairing.HeadToHead));

        plan.Front.Placements.Should().HaveCount(plan.Back.Placements.Count);
        for (int i = 0; i < plan.Front.Placements.Count; i++)
        {
            plan.Back.Placements[i].XmM().Should().Be(plan.Front.Placements[i].XmM());
            plan.Back.Placements[i].YmM().Should().Be(plan.Front.Placements[i].YmM());
            plan.Back.Placements[i].RotationDegrees
                .Should().Be(plan.Front.Placements[i].RotationDegrees);
        }
    }

    [Fact] // Head-to-Foot: Y invertido, X preservado.
    public void BR_010_y_HeadToFoot_MirrorsYOnly()
    {
        var input = CanonicalInput();
        var plan = DuplexPlanner.Plan(new DuplexRequest(input, DuplexPairing.HeadToFoot));
        var substrateH = input.Substrate.InitialLengthMm;

        for (int i = 0; i < plan.Front.Placements.Count; i++)
        {
            var f = plan.Front.Placements[i];
            var b = plan.Back.Placements[i];

            b.XmM().Should().Be(f.XmM());
            b.YmM().Should().Be(substrateH - f.YmM() - f.HeightMm);
            b.RotationDegrees.Should().Be(f.RotationDegrees);
        }
    }

    [Fact] // GridHash do plano duplex difere do single-sided.
    public void BR_010_z_DuplexGridHash_DiffersFromSingleSided()
    {
        var input = CanonicalInput();
        var single = GridSearchEngine.Plan(input);
        var duplex = DuplexPlanner.Plan(new DuplexRequest(input, DuplexPairing.HeadToHead));

        duplex.GridHash.Should().NotBe(single.GridHash);
    }

    [Fact] // Determinismo: mesmo input → mesmo hash.
    public void BR_010_aa_DuplexGridHash_IsDeterministic()
    {
        var a = DuplexPlanner.Plan(new DuplexRequest(CanonicalInput(), DuplexPairing.HeadToFoot));
        var b = DuplexPlanner.Plan(new DuplexRequest(CanonicalInput(), DuplexPairing.HeadToFoot));
        a.GridHash.Should().Be(b.GridHash);
    }
}

internal static class PlacementExtensions
{
    public static double XmM(this Placement p) => p.XMm;
    public static double YmM(this Placement p) => p.YMm;
}
