namespace StepRepeatEngine.Geometry;

/// <summary>
/// Resultado da resolução de sangria em calha compartilhada entre dois itens da grade.
/// </summary>
public readonly record struct GutterBleedResult(
    double EffectiveBleedItemA,
    double EffectiveBleedItemB,
    bool WasTrimmed
);

/// <summary>
/// Resolvedor de conflitos de sangria em calhas estreitas entre artes adjacentes.
/// Aplica regras industriais de divisão simétrica e clipping proporcional.
/// </summary>
public static class GutterBleedResolver
{
    private const double Tolerance = 0.001; // 1 micrômetro em mm

    /// <summary>
    /// Resolve a sangria permitida para cada item em uma calha compartilhada.
    /// </summary>
    /// <param name="gutterWidthMm">Largura ou altura da calha em mm.</param>
    /// <param name="requestedBleedAMm">Sangria desejada pelo item A em mm.</param>
    /// <param name="requestedBleedBMm">Sangria desejada pelo item B em mm.</param>
    /// <returns>Resultado com a sangria efetiva para cada item.</returns>
    public static GutterBleedResult Resolve(
        double gutterWidthMm,
        double requestedBleedAMm,
        double requestedBleedBMm)
    {
        if (!double.IsFinite(gutterWidthMm) || gutterWidthMm < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(gutterWidthMm), "A largura da calha deve ser finita e não-negativa.");
        }

        if (!double.IsFinite(requestedBleedAMm) || requestedBleedAMm < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(requestedBleedAMm), "A sangria do item A deve ser finita e não-negativa.");
        }

        if (!double.IsFinite(requestedBleedBMm) || requestedBleedBMm < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(requestedBleedBMm), "A sangria do item B deve ser finita e não-negativa.");
        }

        double totalRequiredBleed = requestedBleedAMm + requestedBleedBMm;

        // Se a calha é ampla o suficiente, cada item recebe sua sangria total
        if (gutterWidthMm >= totalRequiredBleed - Tolerance)
        {
            return new GutterBleedResult(requestedBleedAMm, requestedBleedBMm, WasTrimmed: false);
        }

        // Se a calha for zerada (itens colados), a sangria na calha é 0
        if (gutterWidthMm <= Tolerance)
        {
            return new GutterBleedResult(0.0, 0.0, WasTrimmed: true);
        }

        // Divisão simétrica (50% do espaço da calha para cada item)
        double halfGutter = gutterWidthMm / 2.0;

        double effectiveA = Math.Min(requestedBleedAMm, halfGutter);
        double effectiveB = Math.Min(requestedBleedBMm, halfGutter);

        return new GutterBleedResult(effectiveA, effectiveB, WasTrimmed: true);
    }
}
