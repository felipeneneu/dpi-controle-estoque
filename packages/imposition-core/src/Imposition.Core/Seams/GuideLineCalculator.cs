namespace Imposition.Core.Seams;

/// <summary>
/// Motor geométrico para cálculo de posicionamento determinístico de linhas-guia de emenda (ADR-051, BR_053).
/// Puro, sem IO, thread-safe.
/// </summary>
public static class GuideLineCalculator
{
    /// <summary>
    /// Calcula as definições de linha-guia para todos os painéis elegíveis (HasGuideLine == true) no resultado de emenda.
    /// </summary>
    public static IReadOnlyList<GuideLineDefinition> Calculate(SeamsResult result)
    {
        return Calculate(result, config: null);
    }

    /// <summary>
    /// Calcula as definições de linha-guia para todos os painéis elegíveis conforme a configuração especificada (ADR-059).
    /// </summary>
    public static IReadOnlyList<GuideLineDefinition> Calculate(SeamsResult result, GuideLineConfig? config)
    {
        var cfg = config ?? GuideLineConfig.Default;
        if (!cfg.Enabled)
        {
            return Array.Empty<GuideLineDefinition>();
        }

        if (result == null || result.Panels == null || result.Panels.Count <= 1)
        {
            return Array.Empty<GuideLineDefinition>();
        }

        // Determina se a divisão é vertical ou horizontal a partir da variação das coordenadas de corte da arte
        var isHorizontal = result.Panels.Count >= 2 &&
                           result.Panels[1].SourceYPositionMm != result.Panels[0].SourceYPositionMm;

        // Determina se a direção é invertida (RightToLeft para vertical, BottomToTop para horizontal)
        var isReversed = isHorizontal
            ? (result.Panels[1].SourceYPositionMm < result.Panels[0].SourceYPositionMm)
            : (result.Panels[1].SourceXPositionMm < result.Panels[0].SourceXPositionMm);

        var list = new List<GuideLineDefinition>();

        foreach (var panel in result.Panels)
        {
            if (!panel.HasGuideLine)
                continue;

            double xMm;
            double yMm;
            double lengthMm;

            if (!isHorizontal)
            {
                // Divisão vertical: linha vertical de comprimento = OutputHeightMm
                lengthMm = panel.OutputHeightMm;
                yMm = 0.0;
                xMm = isReversed
                    ? panel.OverlapStartMm
                    : panel.OutputWidthMm - panel.OverlapEndMm;
            }
            else
            {
                // Divisão horizontal: linha horizontal de comprimento = OutputWidthMm
                lengthMm = panel.OutputWidthMm;
                xMm = 0.0;
                yMm = isReversed
                    ? panel.OverlapStartMm
                    : panel.OutputHeightMm - panel.OverlapEndMm;
            }

            list.Add(new GuideLineDefinition(
                TargetPanelIndex: panel.Index,
                XPositionMm: xMm,
                YPositionMm: yMm,
                LengthMm: lengthMm,
                ThicknessPt: cfg.ThicknessPt,
                Cyan: cfg.Cyan,
                Magenta: cfg.Magenta,
                Yellow: cfg.Yellow,
                Black: cfg.Black));
        }

        return list;
    }
}
