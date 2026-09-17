using System;
using System.Text.Json;
using Imposition.Core.Contracts;
using Imposition.Core.Duplex;
using Imposition.Core.Errors;
using Imposition.Core.Geometry;
using Imposition.Core.Grid;
using Imposition.GridCli;

// Exit codes:
//   0 = sucesso (resultado em stdout)
//   1 = erro de uso (JSON inválido, campos faltando)
//   2 = erro de negócio (E_* do core)
//   3 = erro inesperado

try
{
    var stdin = Console.In.ReadToEnd();
    if (string.IsNullOrWhiteSpace(stdin))
    {
        Console.Error.WriteLine("Uso: imposition-grid < input.json");
        return 1;
    }

    using var doc = JsonDocument.Parse(stdin);
    var root = doc.RootElement;

    var hasDuplex = root.TryGetProperty("pairing", out var pairingProp);

    if (hasDuplex)
    {
        var pairing = Enum.Parse<DuplexPairing>(pairingProp.GetString()!, ignoreCase: true);
        var frontInput = DeserializeInput(root.GetProperty("frontInput"));
        var plan = DuplexPlanner.Plan(new DuplexRequest(frontInput, pairing));
        Console.Out.Write(JsonSerializer.Serialize(plan, JsonContext.Default.DuplexPlan));
    }
    else
    {
        var input = DeserializeInput(root);
        var result = GridSearchEngine.Plan(input);
        Console.Out.Write(JsonSerializer.Serialize(result, JsonContext.Default.ImpositionResult));
    }

    return 0;
}
catch (ImpositionException ex)
{
    var err = new ErrorResponse(new ErrorPayload(ex.Code, ex.Message));
    Console.Error.WriteLine(JsonSerializer.Serialize(err, JsonContext.Default.ErrorResponse));
    return 2;
}
catch (JsonException ex)
{
    var err = new ErrorResponse(new ErrorPayload("E_INVALID_JSON", ex.Message));
    Console.Error.WriteLine(JsonSerializer.Serialize(err, JsonContext.Default.ErrorResponse));
    return 1;
}
catch (Exception ex)
{
    var err = new ErrorResponse(new ErrorPayload("E_UNEXPECTED", ex.Message));
    Console.Error.WriteLine(JsonSerializer.Serialize(err, JsonContext.Default.ErrorResponse));
    return 3;
}

static ImpositionInput DeserializeInput(JsonElement r)
{
    var s = r.GetProperty("substrate");
    var p = r.GetProperty("piece");
    var g = r.GetProperty("gap");
    var m = r.GetProperty("margin");

    var kind = s.GetProperty("kind").GetString()! switch
    {
        "roll"  => SubstrateKind.Roll,
        "sheet" => SubstrateKind.Sheet,
        var x   => throw new JsonException($"kind inválido: {x}"),
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
            var x         => throw new JsonException($"surplusPolicy inválido: {x}"),
        },
        ScalePolicy: r.GetProperty("scalePolicy").GetString()! switch
        {
            "fit"    => ScalePolicy.Fit,
            "bleed"  => ScalePolicy.Bleed,
            "reject" => ScalePolicy.Reject,
            var x    => throw new JsonException($"scalePolicy inválido: {x}"),
        },
        ForcedOrientation: r.GetProperty("forcedOrientation").ValueKind == JsonValueKind.Null
            ? null : (Orientation)r.GetProperty("forcedOrientation").GetInt32(),
        ForcedCols: r.GetProperty("forcedCols").ValueKind == JsonValueKind.Null
            ? null : r.GetProperty("forcedCols").GetInt32(),
        SchemaVersion: r.GetProperty("schemaVersion").GetString()!);
}
