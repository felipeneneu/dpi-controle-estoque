using System.Security.Cryptography;
using System.Text;
using Imposition.Core.Contracts;
using Imposition.Core.Errors;
using Imposition.Core.Geometry;
using Imposition.Core.Tolerance;

namespace Imposition.Core.Grid;

/// <summary>
/// Fonte única de verdade — IMPOSICAO-MOTOR.md §6.
/// Regra 3 do AGENTS.md: função pura.
/// Regra 8: sem IO.
/// Regra 9: falha com código explícito.
/// </summary>
public static class GridSearchEngine
{
    private sealed record Candidate(
        Orientation Orientation,
        int Cols,
        int Rows,
        int Total,
        double LengthMm,
        int Surplus,
        int Planned,
        double PieceWmm,
        double PieceHmm);

    public static ImpositionResult Plan(ImpositionInput input)
    {
        Validate(input);

        var tol       = Imposition.Core.Tolerance.Tolerance.Resolve(input.Substrate.ToleranceMm, input.Substrate.RegisterMm);
        var utilW     = input.Substrate.WidthMm
                      - input.Margin.LeftMm
                      - input.Margin.RightMm;
        var lengthLim = input.Substrate.Kind == SubstrateKind.Roll
            ? input.Substrate.MaxLengthMm ?? input.Substrate.InitialLengthMm
            : input.Substrate.InitialLengthMm;

        if (utilW <= 0)
            throw new ImpositionException(
                ErrorCodes.InvalidSubstrate,
                $"Largura útil não-positiva: {utilW}mm");

        var orientations = input.ForcedOrientation.HasValue
            ? new[] { input.ForcedOrientation.Value }
            : new[] { Orientation.Portrait, Orientation.Landscape };

        var candidates = new List<Candidate>();

        foreach (var rot in orientations)
        {
            var (pW, pH) = rot == Orientation.Portrait
                ? (input.Piece.WidthMm, input.Piece.HeightMm)
                : (input.Piece.HeightMm, input.Piece.WidthMm);

            // Regra 1 do AGENTS.md: tol aplicada ANTES do floor.
            var maxCols = (int)Math.Floor(
                (utilW + input.Gap.HorizontalMm + tol) / (pW + input.Gap.HorizontalMm));

            if (input.ForcedCols.HasValue)
                maxCols = Math.Min(maxCols, input.ForcedCols.Value);

            if (maxCols < 1) continue;

            for (var c = 1; c <= maxCols; c++)
            {
                var rowsFill = (int)Math.Ceiling((double)input.TargetCopies / c);

                var rowsAdv = (int)Math.Floor(
                    (lengthLim + input.Gap.VerticalMm + tol)
                    / (pH + input.Gap.VerticalMm));

                var rowOptions = input.SurplusPolicy switch
                {
                    SurplusPolicy.FillRow     => new[] { rowsFill },
                    SurplusPolicy.FillAdvance => new[] { rowsAdv },
                    _                         => new[] { rowsFill },
                };

                foreach (var rows in rowOptions)
                {
                    if (rows < 1) continue;

                    var total = c * rows;

                    // Regra 3: nunca transbordar silenciosamente.
                    if (total < input.TargetCopies) continue;

                    var length = rows * pH + (rows - 1) * input.Gap.VerticalMm;

                    var fits = input.Substrate.Kind == SubstrateKind.Roll
                        ? length <= (input.Substrate.MaxLengthMm ?? lengthLim)
                        : length <= input.Substrate.InitialLengthMm;

                    if (!fits) continue;

                    var planned = input.SurplusPolicy == SurplusPolicy.Truncate
                        ? input.TargetCopies
                        : total;

                    var surplus = input.SurplusPolicy == SurplusPolicy.Truncate
                        ? 0
                        : total - input.TargetCopies;

                    candidates.Add(new Candidate(
                        rot, c, rows, total, length, surplus, planned, pW, pH));
                }
            }
        }

        if (candidates.Count == 0)
            throw new ImpositionException(
                ErrorCodes.GridOverflow,
                $"Nenhuma grade cabe em {input.Substrate.WidthMm}×{input.Substrate.InitialLengthMm}mm "
              + $"para {input.TargetCopies} cópias de {input.Piece.WidthMm}×{input.Piece.HeightMm}mm.");

        var scored = candidates
            .Select(c => (Candidate: c, Score: Score(c, input, lengthLim)))
            .OrderBy(x => x.Score)
            .ToList();

        var winner = scored[0].Candidate;
        var alternatives = scored.Skip(1).Take(5)
            .Select(x => new AlternativeGrid(
                x.Candidate.Cols,
                x.Candidate.Rows,
                x.Candidate.Total,
                x.Candidate.Orientation,
                Math.Round(x.Candidate.LengthMm, 2),
                x.Candidate.Surplus,
                Math.Round(x.Score, 6)))
            .ToArray();

        return BuildResult(winner, alternatives, input, lengthLim);
    }

    // IMPOSICAO-MOTOR.md §6.3 — pesos wA=0.50, wL=0.30, wS=0.20.
    private static double Score(Candidate c, ImpositionInput input, double lengthLim)
    {
        var substrateArea = input.Substrate.WidthMm * lengthLim;
        var usedArea      = c.Total * c.PieceWmm * c.PieceHmm;
        var wasteRatio    = substrateArea > 0
            ? Math.Max(0, (substrateArea - usedArea) / substrateArea)
            : 1.0;

        var lengthPerCopyNorm = c.LengthMm / Math.Max(1, input.TargetCopies)
                              / Math.Max(1e-9, lengthLim);

        // ADR-026 (BR-024): em FillRow, surplus é o objetivo declarado
        // pelo operador. Zerar o peso evita escolher grade "exata" que
        // desperdiça a última linha.
        var surplusTerm = input.SurplusPolicy == SurplusPolicy.FillRow
            ? 0.0
            : 0.20 * (input.TargetCopies > 0
                ? (double)c.Surplus / input.TargetCopies
                : 0.0);

        return 0.50 * wasteRatio + 0.30 * lengthPerCopyNorm + surplusTerm;
    }

    private static ImpositionResult BuildResult(
        Candidate winner,
        IReadOnlyList<AlternativeGrid> alternatives,
        ImpositionInput input,
        double lengthLim)
    {
        var placements = new List<Placement>(winner.Planned);
        var x0 = input.Margin.LeftMm;
        var y0 = input.Margin.TopMm;

        for (var r = 0; r < winner.Rows; r++)
        for (var c = 0; c < winner.Cols; c++)
        {
            var idx = r * winner.Cols + c;
            if (input.SurplusPolicy == SurplusPolicy.Truncate
                && idx >= input.TargetCopies) break;

            var x = x0 + c * (winner.PieceWmm + input.Gap.HorizontalMm);
            var y = y0 + r * (winner.PieceHmm + input.Gap.VerticalMm);

            placements.Add(new Placement(
                idx, r, c,
                Math.Round(x, 2), Math.Round(y, 2),
                winner.PieceWmm, winner.PieceHmm,
                (int)winner.Orientation));
        }

        var substrateArea = input.Substrate.WidthMm * lengthLim;
        var usedArea = winner.Planned * winner.PieceWmm * winner.PieceHmm;

        var hashInput =
            $"{input.Substrate.WidthMm}|{lengthLim}|{input.Piece.WidthMm}|{input.Piece.HeightMm}"
          + $"|{input.Gap.HorizontalMm}|{input.Gap.VerticalMm}"
          + $"|{input.Margin.LeftMm}|{input.Margin.RightMm}|{input.Margin.TopMm}|{input.Margin.BottomMm}"
          + $"|{input.TargetCopies}|{input.SurplusPolicy}|{(int)winner.Orientation}"
          + $"|{winner.Cols}x{winner.Rows}";
        var gridHash = Convert.ToHexString(
            SHA256.HashData(Encoding.UTF8.GetBytes(hashInput))).ToLowerInvariant();

        var metrics = new Metrics(
            UtilizationPct: Math.Round(100.0 * usedArea / substrateArea, 2),
            LengthMeters:   Math.Round(winner.LengthMm / 1000.0, 3),
            RegisterWorstCaseMm: 0.0);

        return new ImpositionResult(
            SchemaVersion: "1.0",
            GridHash: gridHash,
            Cols: winner.Cols,
            Rows: winner.Rows,
            Total: winner.Total,
            Orientation: winner.Orientation,
            LengthMm: Math.Round(winner.LengthMm, 2),
            Surplus: winner.Surplus,
            PlannedUnits: winner.Planned,
            Placements: placements,
            Metrics: metrics,
            AlternativeGrids: alternatives);
    }

    private static void Validate(ImpositionInput input)
    {
        if (input.TargetCopies < 1)
            throw new ImpositionException(
                ErrorCodes.InvalidTarget, $"targetCopies deve ser ≥ 1: {input.TargetCopies}");
        if (input.Piece.WidthMm <= 0 || input.Piece.HeightMm <= 0)
            throw new ImpositionException(
                ErrorCodes.InvalidPiece,
                $"Peça inválida: {input.Piece.WidthMm}×{input.Piece.HeightMm}mm");
        if (input.Substrate.WidthMm <= 0 || input.Substrate.InitialLengthMm <= 0)
            throw new ImpositionException(
                ErrorCodes.InvalidSubstrate,
                $"Substrato inválido: {input.Substrate.WidthMm}×{input.Substrate.InitialLengthMm}mm");
        if (input.Substrate.Kind == SubstrateKind.Roll && input.Substrate.MaxLengthMm is null)
            throw new ImpositionException(
                ErrorCodes.InvalidSubstrate, "Rolo exige maxLengthMm.");

        // ADR-021 §Escopo OUT — cutInsetMm chega em P1 do roadmap §7.
        // Aceitamos o campo no schema, mas rejeitamos em runtime (Regra 9).
        if (input.Substrate.CutInsetMm != 0.0)
            throw new ImpositionException(
                ErrorCodes.NotImplemented,
                $"cutInsetMm não implementado em v1 (recebido: {input.Substrate.CutInsetMm}mm). "
              + "Ver roadmap P1 em docs/engineering/IMPOSICAO-MOTOR.md §7.");
    }
}
