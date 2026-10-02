using System.Globalization;
using Imposition.Core.Errors;

namespace Imposition.Core.Seams;

/// <summary>
/// Cálculo determinístico da compensação de encolhimento térmico para lonas e banners (ADR-049, BR_050.b).
/// Cálculo puro, zero IO, thread-safe.
/// </summary>
public static class ShrinkageCalculator
{
    /// <summary>Parcela fixa em mm para compensar fixação mecânica/garras no início do avanço.</summary>
    public const double FixedAllowanceMm = 10.0;

    /// <summary>Taxa de encolhimento térmico em mm por metro linear de cura térmica.</summary>
    public const double RatePerMeterMm = 10.0;

    /// <summary>
    /// Calcula o acréscimo total de comprimento em mm decorrente do encolhimento térmico.
    /// Fórmula de fábrica (ADR-049): 10 mm fixo + (ceil(L_m) * 10 mm).
    /// </summary>
    /// <param name="lengthMm">Comprimento original do painel ou arte em mm.</param>
    /// <returns>Acréscimo a ser somado ao comprimento final de corte/impressão em mm.</returns>
    /// <exception cref="ImpositionException">Lançada quando lengthMm for não-finito (NaN/Infinity) ou negativo.</exception>
    public static double CalculateAllowanceMm(double lengthMm)
    {
        if (!double.IsFinite(lengthMm) || lengthMm < 0)
        {
            throw new ImpositionException(
                ErrorCodes.InvalidSeamsInput,
                $"Comprimento para cálculo de encolhimento deve ser finito e >= 0; recebido: {lengthMm.ToString(CultureInfo.InvariantCulture)}");
        }

        var meters = lengthMm / 1000.0;
        var roundedMeters = Math.Ceiling(meters);

        return FixedAllowanceMm + (roundedMeters * RatePerMeterMm);
    }
}
