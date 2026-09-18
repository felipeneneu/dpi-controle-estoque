using FluentAssertions;
using Imposition.Core.Contracts;
using Imposition.Core.Grid;
using AutoImposerCLI.Imposition;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using Xunit;
using Imposition.Core.Geometry;

namespace AutoImposerCLI.Tests.GoldenMaster;

public class CrossMotorGoldenTests
{
    private static readonly JsonSerializerOptions Opts = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
    };

    [Fact]
    public void Canonical_Case_Matches_Core_And_Bridge()
    {
        var basePath = Path.Combine("GoldenMaster", "cases", "000-canonical");
        var inputPath = Path.Combine(basePath, "input.json");
        var expectedPath = Path.Combine(basePath, "expected.json");

        var inputJson = File.ReadAllText(inputPath);
        var expectedJson = File.ReadAllText(expectedPath);

        var coreInput = DeserializeInput(inputJson);
        var expected = JsonSerializer.Deserialize<ExpectedOutput>(expectedJson, Opts)!;

        // Construir input usando a ponte, garantindo que a conversão preserva os dados
        var input = ImpositionBridge.BuildInput(
            sheetWidthMm: coreInput.Substrate.WidthMm,
            sheetHeightMm: coreInput.Substrate.InitialLengthMm,
            pieceWidthMm: coreInput.Piece.WidthMm,
            pieceHeightMm: coreInput.Piece.HeightMm,
            targetCopies: coreInput.TargetCopies,
            marginLeftMm: coreInput.Margin.LeftMm,
            marginRightMm: coreInput.Margin.RightMm,
            marginTopMm: coreInput.Margin.TopMm,
            marginBottomMm: coreInput.Margin.BottomMm,
            gapMm: coreInput.Gap.HorizontalMm,
            forcedOrientation: coreInput.ForcedOrientation
        );

        // Validar via Bridge
        var cliResult = ImpositionBridge.Plan(input);

        // Validar via Core direto
        var coreResult = GridSearchEngine.Plan(input);

        cliResult.Cols.Should().Be(expected.Cols);
        cliResult.Rows.Should().Be(expected.Rows);
        cliResult.PlannedUnits.Should().Be(expected.PlannedUnits);
        cliResult.Orientation.Should().Be((Orientation)expected.Orientation);

        cliResult.GridHash.Should().Be(coreResult.GridHash);
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
            var x   => throw new System.InvalidOperationException($"kind inválido: {x}"),
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
                var x         => throw new System.InvalidOperationException($"surplusPolicy inválido: {x}"),
            },
            ScalePolicy: r.GetProperty("scalePolicy").GetString()! switch
            {
                "fit"    => ScalePolicy.Fit,
                "bleed"  => ScalePolicy.Bleed,
                "reject" => ScalePolicy.Reject,
                var x    => throw new System.InvalidOperationException($"scalePolicy inválido: {x}"),
            },
            ForcedOrientation: r.GetProperty("forcedOrientation").ValueKind == JsonValueKind.Null
                ? null : (Orientation)r.GetProperty("forcedOrientation").GetInt32(),
            ForcedCols: r.GetProperty("forcedCols").ValueKind == JsonValueKind.Null
                ? null : r.GetProperty("forcedCols").GetInt32(),
            SchemaVersion: r.GetProperty("schemaVersion").GetString()!);
    }

    private class ExpectedOutput
    {
        public int Cols { get; set; }
        public int Rows { get; set; }
        public int Total { get; set; }
        public int Orientation { get; set; }
        public double LengthMm { get; set; }
        public int Surplus { get; set; }
        public int PlannedUnits { get; set; }
    }
}
