using System.Globalization;
using Imposition.Core.Errors;
using Imposition.Core.Seams;

namespace Imposition.Core.Rolls;

/// <summary>
/// Algoritmo de sugestão de rolo ótimo para desperdício mínimo e menor número de emendas (ADR-050, BR_051).
/// Cálculo puro, sem IO, thread-safe.
/// </summary>
public static class RollSuggester
{
    /// <summary>
    /// Elege a melhor opção de rolo dentre os candidatos fornecidos para as dimensões da arte.
    /// Critério: menor número de painéis (emendas), seguido de menor área de desperdício em m².
    /// </summary>
    /// <param name="artworkWidthMm">Largura total da arte original em mm.</param>
    /// <param name="artworkHeightMm">Altura total da arte original em mm.</param>
    /// <param name="overlapMm">Sobreposição de emenda em mm.</param>
    /// <param name="candidates">Lista de rolos disponíveis.</param>
    /// <returns>Sugestão contendo o rolo selecionado e métricas de aproveitamento.</returns>
    /// <exception cref="ImpositionException">Se a entrada for inválida (R-013) ou se nenhum candidato for viável.</exception>
    public static RollSuggestion Suggest(
        double artworkWidthMm,
        double artworkHeightMm,
        double overlapMm,
        IReadOnlyList<RollSpecification> candidates)
    {
        if (!double.IsFinite(artworkWidthMm) || artworkWidthMm <= 0.0)
        {
            throw new ImpositionException(
                ErrorCodes.InvalidSeamsInput,
                $"ArtworkWidthMm deve ser finito e > 0; recebido: {artworkWidthMm.ToString(CultureInfo.InvariantCulture)}");
        }

        if (!double.IsFinite(artworkHeightMm) || artworkHeightMm <= 0.0)
        {
            throw new ImpositionException(
                ErrorCodes.InvalidSeamsInput,
                $"ArtworkHeightMm deve ser finito e > 0; recebido: {artworkHeightMm.ToString(CultureInfo.InvariantCulture)}");
        }

        if (!double.IsFinite(overlapMm) || overlapMm < 0.0)
        {
            throw new ImpositionException(
                ErrorCodes.InvalidSeamsInput,
                $"OverlapMm deve ser finito e >= 0; recebido: {overlapMm.ToString(CultureInfo.InvariantCulture)}");
        }

        if (candidates == null || candidates.Count == 0)
        {
            throw new ImpositionException(
                ErrorCodes.RollNotFound,
                "Nenhum rolo candidato foi fornecido para o cálculo de sugestão.");
        }

        var evaluated = new List<RollSuggestion>();

        foreach (var roll in candidates)
        {
            if (roll == null)
                continue;

            // Descartar rolo se overlap exceder a largura útil
            if (overlapMm >= roll.UsableWidthMm)
                continue;

            try
            {
                var input = new SeamsInput(
                    ArtworkWidthMm: artworkWidthMm,
                    ArtworkHeightMm: artworkHeightMm,
                    PrintableRollWidthMm: roll.UsableWidthMm,
                    OverlapMm: overlapMm,
                    ApplyShrinkage: true);

                var seamsResult = PanelCalculator.Calculate(input);

                var outputLengthMm = seamsResult.Panels.Count > 0
                    ? seamsResult.Panels[0].OutputHeightMm
                    : artworkHeightMm;

                var totalSubstrateM2 = (seamsResult.TotalPanels * roll.PhysicalWidthMm * outputLengthMm) / 1_000_000.0;
                var artworkAreaM2 = (artworkWidthMm * artworkHeightMm) / 1_000_000.0;
                var wasteM2 = Math.Max(0.0, totalSubstrateM2 - artworkAreaM2);
                var wastePercentage = totalSubstrateM2 > 0.0
                    ? (wasteM2 / totalSubstrateM2) * 100.0
                    : 0.0;

                evaluated.Add(new RollSuggestion(
                    SelectedRoll: roll,
                    PanelCount: seamsResult.TotalPanels,
                    TotalWasteM2: Math.Round(wasteM2, 4),
                    WastePercentage: Math.Round(wastePercentage, 2),
                    RequiresRotation: false));
            }
            catch (ImpositionException)
            {
                // Candidato não viável geometricamente, continua avaliando os demais
            }
        }

        if (evaluated.Count == 0)
        {
            throw new ImpositionException(
                ErrorCodes.RollNotFound,
                "Nenhum dos rolos candidatos é viável para as dimensões especificadas.");
        }

        // Ordenação: 1º menor número de painéis (menos emendas), 2º menor refugo m², 3º maior largura útil
        var best = evaluated
            .OrderBy(s => s.PanelCount)
            .ThenBy(s => s.TotalWasteM2)
            .ThenByDescending(s => s.SelectedRoll.UsableWidthMm)
            .First();

        return best;
    }
}
