using System;
using System.IO;
using System.Text.Json;
using Imposition.Core.Contracts;
using Imposition.Core.Errors;
using Imposition.Core.Grid;
using Imposition.Core.Geometry;
using ImpositorKonica.Models;

namespace ImpositorKonica.Preview
{
    /// <summary>
    /// Modo --preview (ADR-025): lê ImpositionInput, calcula via
    /// imposition-core in-process, renderiza grade read-only.
    /// </summary>
    internal static class PreviewMode
    {
        private record PreviewRequest(ImpositionInput Input, string? SourcePath, int Dpi);

        public static int Run(string inputJsonPath)
        {
            try
            {
                var json = File.ReadAllText(inputJsonPath);
                var request = ParsePayload(json);
                var result = GridSearchEngine.Plan(request.Input);

                var renderer = request.SourcePath is not null
                    ? new PdfPageRenderer(request.SourcePath, request.Dpi)
                    : null;

                try
                {
                    var thumbnail = renderer?.GetPieceThumbnail();
                    PreviewBridge.ShowReadOnlyWindow(request.Input, result, thumbnail);
                }
                finally
                {
                    renderer?.Dispose();
                }

                return 0;
            }
            catch (ImpositionException ex)
            {
                Console.Error.WriteLine($"[{ex.Code}] {ex.Message}");
                return 2;
            }
            catch (JsonException ex)
            {
                Console.Error.WriteLine($"[E_INVALID_JSON] {ex.Message}");
                return 1;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[E_UNEXPECTED] {ex.Message}");
                return 3;
            }
        }

        private static PreviewRequest ParsePayload(string json)
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            if (root.TryGetProperty("input", out var inputEl))
            {
                var input = DeserializeInput(inputEl);
                var sourcePath = root.TryGetProperty("sourcePath", out var sp) && sp.ValueKind == JsonValueKind.String
                    ? sp.GetString() : null;
                var dpi = root.TryGetProperty("dpi", out var d) && d.ValueKind == JsonValueKind.Number
                    ? d.GetInt32() : 150;
                return new PreviewRequest(input, sourcePath, dpi);
            }

            // Backwards compat: payload sem wrapper
            var legacy = DeserializeInput(root);
            return new PreviewRequest(legacy, null, 150);
        }

        private static ImpositionInput DeserializeInput(JsonElement r)
        {
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
    }
}
