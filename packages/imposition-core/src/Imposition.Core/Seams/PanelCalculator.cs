using System.Globalization;
using Imposition.Core.Errors;

namespace Imposition.Core.Seams;

/// <summary>
/// Motor de cálculo geométrico determinístico para divisão de lonas/banners em painéis de emenda (ADR-049, BR_050).
/// Cálculo puro, sem IO, thread-safe.
/// </summary>
public static class PanelCalculator
{
    public static SeamsResult Calculate(SeamsInput input)
    {
        SeamsValidator.Validate(input);

        var isVertical = input.Orientation == SeamOrientation.Vertical;
        var splitDim = isVertical ? input.ArtworkWidthMm : input.ArtworkHeightMm;
        var lengthDim = isVertical ? input.ArtworkHeightMm : input.ArtworkWidthMm;

        var maxPanelWidth = input.CustomPanelWidthMm > 0.0
            ? input.CustomPanelWidthMm
            : input.PrintableRollWidthMm;

        var shrinkageMm = input.ApplyShrinkage
            ? ShrinkageCalculator.CalculateAllowanceMm(lengthDim)
            : 0.0;

        var outputLengthMm = lengthDim + shrinkageMm;

        // Caso 1: A arte cabe inteira em 1 painel sem necessidade de emenda
        if (splitDim <= maxPanelWidth)
        {
            var singlePanel = new PanelPlacement(
                Index: 1,
                SourceXPositionMm: 0.0,
                SourceYPositionMm: 0.0,
                SourceWidthMm: isVertical ? splitDim : lengthDim,
                SourceHeightMm: isVertical ? lengthDim : splitDim,
                OutputWidthMm: isVertical ? splitDim : outputLengthMm,
                OutputHeightMm: isVertical ? outputLengthMm : splitDim,
                OverlapStartMm: 0.0,
                OverlapEndMm: 0.0,
                ShrinkageAllowanceMm: shrinkageMm,
                HasGuideLine: false);

            var singlePanels = new[] { singlePanel };
            var totalLinearMeters = (outputLengthMm) / 1000.0;
            var singleWasteM2 = Math.Max(0.0, ((input.PrintableRollWidthMm * outputLengthMm) - (input.ArtworkWidthMm * input.ArtworkHeightMm)) / 1_000_000.0);

            return new SeamsResult(
                TotalPanels: 1,
                Panels: singlePanels,
                TotalLinearLengthMeters: Math.Round(totalLinearMeters, 4),
                TotalWasteAreaM2: Math.Round(singleWasteM2, 4),
                ShrinkageAppliedMm: shrinkageMm,
                EffectiveRollWidthMm: input.PrintableRollWidthMm);
        }

        // Caso 2: Divisão em múltiplos painéis (N >= 2)
        if (input.OverlapMm >= maxPanelWidth)
        {
            throw new ImpositionException(
                ErrorCodes.SeamsOverlapExceedsRoll,
                $"Sobreposição ({Describe(input.OverlapMm)} mm) não pode ser maior ou igual à largura útil ({Describe(maxPanelWidth)} mm)");
        }

        // Estimativa inicial do número de painéis
        var numPanels = (int)Math.Ceiling(splitDim / (maxPanelWidth - input.OverlapMm));
        if (numPanels < 2)
            numPanels = 2;

        // Garante que nenhum painel intermediário (que tem 2x overlap) exceda maxPanelWidth
        while (true)
        {
            var testSlice = splitDim / numPanels;
            var maxOverlapForCount = numPanels > 2 ? 2.0 * input.OverlapMm : input.OverlapMm;
            if (testSlice + maxOverlapForCount <= maxPanelWidth + 0.0001)
                break;

            numPanels++;
            if (numPanels > 1000)
            {
                throw new ImpositionException(
                    ErrorCodes.SeamsArtworkExceedsMaxPanels,
                    "A divisão da arte excedeu o limite seguro de 1000 painéis.");
            }
        }

        var sliceDim = splitDim / numPanels;
        var panels = new List<PanelPlacement>(numPanels);

        for (var i = 0; i < numPanels; i++)
        {
            double sliceOffset;
            double overlapStart;
            double overlapEnd;
            bool hasGuideLine;

            if (input.Direction == SeamDirection.LeftToRight)
            {
                sliceOffset = i * sliceDim;
                overlapStart = i == 0 ? 0.0 : input.OverlapMm;
                overlapEnd = i == numPanels - 1 ? 0.0 : input.OverlapMm;
                hasGuideLine = i < numPanels - 1; // Painel inferior na emenda com o próximo
            }
            else // RightToLeft
            {
                sliceOffset = (numPanels - 1 - i) * sliceDim;
                overlapStart = i == numPanels - 1 ? 0.0 : input.OverlapMm;
                overlapEnd = i == 0 ? 0.0 : input.OverlapMm;
                hasGuideLine = i < numPanels - 1;
            }

            var outputSplitDim = sliceDim + overlapStart + overlapEnd;

            var placement = new PanelPlacement(
                Index: i + 1,
                SourceXPositionMm: isVertical ? sliceOffset : 0.0,
                SourceYPositionMm: isVertical ? 0.0 : sliceOffset,
                SourceWidthMm: isVertical ? sliceDim : lengthDim,
                SourceHeightMm: isVertical ? lengthDim : sliceDim,
                OutputWidthMm: isVertical ? outputSplitDim : outputLengthMm,
                OutputHeightMm: isVertical ? outputLengthMm : outputSplitDim,
                OverlapStartMm: overlapStart,
                OverlapEndMm: overlapEnd,
                ShrinkageAllowanceMm: shrinkageMm,
                HasGuideLine: hasGuideLine);

            panels.Add(placement);
        }

        var linearLengthMeters = (numPanels * outputLengthMm) / 1000.0;
        var totalSubstrateMm2 = numPanels * input.PrintableRollWidthMm * outputLengthMm;
        var artworkMm2 = input.ArtworkWidthMm * input.ArtworkHeightMm;
        var wasteM2 = Math.Max(0.0, (totalSubstrateMm2 - artworkMm2) / 1_000_000.0);

        return new SeamsResult(
            TotalPanels: numPanels,
            Panels: panels,
            TotalLinearLengthMeters: Math.Round(linearLengthMeters, 4),
            TotalWasteAreaM2: Math.Round(wasteM2, 4),
            ShrinkageAppliedMm: shrinkageMm,
            EffectiveRollWidthMm: input.PrintableRollWidthMm);
    }

    private static string Describe(double value) => value.ToString(CultureInfo.InvariantCulture);
}
