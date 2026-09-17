using System.Text.Json;
using FluentAssertions;
using Imposition.Core.Contracts;
using Imposition.Core.Geometry;
using Imposition.Core.Grid;
using Xunit;

namespace Imposition.Core.Tests.GoldenMaster;

public class CaseCanonicalTests
{
    private sealed record Expected(
        int Cols, int Rows, int Total, int Orientation,
        double LengthMm, int Surplus, int PlannedUnits);

    [Fact]
    public void BR_010_n_GoldenMasterCaseCanonical_1015Copies()
    {
        var root = Path.Combine(AppContext.BaseDirectory, "GoldenMaster", "cases", "000-canonical");
        var inputJson    = File.ReadAllText(Path.Combine(root, "input.json"));
        var expectedJson = File.ReadAllText(Path.Combine(root, "expected.json"));

        var input    = DeserializeInput(inputJson);
        var expected = JsonSerializer.Deserialize<Expected>(expectedJson,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;

        var result = GridSearchEngine.Plan(input);

        result.Cols.Should().Be(expected.Cols);
        result.Rows.Should().Be(expected.Rows);
        result.Total.Should().Be(expected.Total);
        ((int)result.Orientation).Should().Be(expected.Orientation);
        result.LengthMm.Should().Be(expected.LengthMm);
        result.Surplus.Should().Be(expected.Surplus);
        result.PlannedUnits.Should().Be(expected.PlannedUnits);
    }

    private static ImpositionInput DeserializeInput(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var r = doc.RootElement;
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

        return new ImpositionInput(
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
    }
}
