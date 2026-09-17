using System.Text.Json;
using FluentAssertions;
using Imposition.Core.Contracts;
using Imposition.Core.Duplex;
using Imposition.Core.Geometry;
using Imposition.Core.Grid;
using Xunit;

namespace Imposition.Core.Tests.GoldenMaster;

public class DuplexGoldenTests
{
    private sealed record PlacementDto(double XMm, double YMm);

    private sealed record Expected(
        string Pairing,
        int FrontTotal,
        int BackTotal,
        PlacementDto FrontFirstPlacement,
        PlacementDto BackFirstPlacement,
        PlacementDto BackLastPlacement);

    [Fact]
    public void BR_010_ac_DuplexGoldenHeadToHead()
    {
        var root = Path.Combine(AppContext.BaseDirectory, "GoldenMaster", "cases", "001-duplex-headToHead");
        var inputJson    = File.ReadAllText(Path.Combine(root, "input.json"));
        var expectedJson = File.ReadAllText(Path.Combine(root, "expected.json"));

        var (input, pairing) = DeserializeDuplexRequest(inputJson);
        var expected = JsonSerializer.Deserialize<Expected>(expectedJson,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;

        var plan = DuplexPlanner.Plan(new DuplexRequest(input, pairing));

        plan.Front.Total.Should().Be(expected.FrontTotal);
        plan.Back.Total.Should().Be(expected.BackTotal);

        plan.Front.Placements[0].XMm.Should().Be(expected.FrontFirstPlacement.XMm);
        plan.Front.Placements[0].YMm.Should().Be(expected.FrontFirstPlacement.YMm);

        plan.Back.Placements[0].XMm.Should().Be(expected.BackFirstPlacement.XMm);
        plan.Back.Placements[0].YMm.Should().Be(expected.BackFirstPlacement.YMm);

        plan.Back.Placements[^1].XMm.Should().Be(expected.BackLastPlacement.XMm);
        plan.Back.Placements[^1].YMm.Should().Be(expected.BackLastPlacement.YMm);
    }

    [Fact]
    public void BR_010_ad_DuplexGoldenHeadToFoot()
    {
        var root = Path.Combine(AppContext.BaseDirectory, "GoldenMaster", "cases", "002-duplex-headToFoot");
        var inputJson    = File.ReadAllText(Path.Combine(root, "input.json"));
        var expectedJson = File.ReadAllText(Path.Combine(root, "expected.json"));

        var (input, pairing) = DeserializeDuplexRequest(inputJson);
        var expected = JsonSerializer.Deserialize<Expected>(expectedJson,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;

        var plan = DuplexPlanner.Plan(new DuplexRequest(input, pairing));

        plan.Front.Total.Should().Be(expected.FrontTotal);
        plan.Back.Total.Should().Be(expected.BackTotal);

        plan.Front.Placements[0].XMm.Should().Be(expected.FrontFirstPlacement.XMm);
        plan.Front.Placements[0].YMm.Should().Be(expected.FrontFirstPlacement.YMm);

        plan.Back.Placements[0].XMm.Should().Be(expected.BackFirstPlacement.XMm);
        plan.Back.Placements[0].YMm.Should().Be(expected.BackFirstPlacement.YMm);

        plan.Back.Placements[^1].XMm.Should().Be(expected.BackLastPlacement.XMm);
        plan.Back.Placements[^1].YMm.Should().Be(expected.BackLastPlacement.YMm);
    }

    private static (ImpositionInput Input, DuplexPairing Pairing) DeserializeDuplexRequest(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        
        var pairing = Enum.Parse<DuplexPairing>(root.GetProperty("pairing").GetString()!, ignoreCase: true);
        
        var r = root.GetProperty("frontInput");
        var s = r.GetProperty("substrate");
        var p = r.GetProperty("piece");
        var g = r.GetProperty("gap");
        var m = r.GetProperty("margin");

        var kind = s.GetProperty("kind").GetString()! switch
        {
            "roll"  => SubstrateKind.Roll,
            "sheet" => SubstrateKind.Sheet,
            var x   => throw new InvalidOperationException($"kind inválido: {x}"),
        };

        var input = new ImpositionInput(
            Substrate: new SubstrateSpec(
                Kind: kind,
                WidthMm: s.GetProperty("widthMm").GetDouble(),
                InitialLengthMm: s.GetProperty("initialLengthMm").GetDouble(),
                MaxLengthMm: s.GetProperty("maxLengthMm").ValueKind == JsonValueKind.Null
                    ? null : s.GetProperty("maxLengthMm").GetDouble(),
                ToleranceMm: s.GetProperty("toleranceMm").GetDouble(),
                RegisterMm:  s.GetProperty("registerMm").GetDouble(),
                BleedMm:     s.GetProperty("bleedMm").GetDouble(),
                CutInsetMm:  s.GetProperty("cutInsetMm").GetDouble()),
            Piece:  new PieceSpec(p.GetProperty("widthMm").GetDouble(),
                                  p.GetProperty("heightMm").GetDouble()),
            Gap:    new GapSpec(g.GetProperty("horizontalMm").GetDouble(),
                                g.GetProperty("verticalMm").GetDouble()),
            Margin: new MarginSpec(m.GetProperty("leftMm").GetDouble(),
                                   m.GetProperty("rightMm").GetDouble(),
                                   m.GetProperty("topMm").GetDouble(),
                                   m.GetProperty("bottomMm").GetDouble()),
            TargetCopies: r.GetProperty("targetCopies").GetInt32(),
            SurplusPolicy: r.GetProperty("surplusPolicy").GetString()! switch
            {
                "truncate"    => SurplusPolicy.Truncate,
                "fill_row"    => SurplusPolicy.FillRow,
                "fill_advance"=> SurplusPolicy.FillAdvance,
                var x         => throw new InvalidOperationException($"surplusPolicy inválido: {x}"),
            },
            ScalePolicy: r.GetProperty("scalePolicy").GetString()! switch
            {
                "fit"    => ScalePolicy.Fit,
                "bleed"  => ScalePolicy.Bleed,
                "reject" => ScalePolicy.Reject,
                var x    => throw new InvalidOperationException($"scalePolicy inválido: {x}"),
            },
            ForcedOrientation: r.GetProperty("forcedOrientation").ValueKind == JsonValueKind.Null
                ? null : (Orientation)r.GetProperty("forcedOrientation").GetInt32(),
            ForcedCols: r.GetProperty("forcedCols").ValueKind == JsonValueKind.Null
                ? null : r.GetProperty("forcedCols").GetInt32(),
            SchemaVersion: r.GetProperty("schemaVersion").GetString()!);
            
        return (input, pairing);
    }
}
