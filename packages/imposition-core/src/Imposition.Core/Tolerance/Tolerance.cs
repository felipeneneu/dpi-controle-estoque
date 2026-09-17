using Imposition.Core.Errors;

namespace Imposition.Core.Tolerance;

/// <summary>
/// Regra 1 do AGENTS.md. Tolerância é problema de FABRICAÇÃO
/// (lâmina ~0,1mm), não de precisão decimal.
/// NUNCA usar decimal/Big.js. NUNCA usar epsilon mágico tipo +0.000001.
/// </summary>
public static class Tolerance
{
    /// <summary>Piso físico da lâmina.</summary>
    public const double FactoryFloorMm = 0.1;

    /// <summary>
    /// Fórmula canônica do AGENTS.md:
    /// <c>tol = max(toleranceMm, registerMm, 0.1)</c>.
    /// Aplicada ANTES de qualquer floor/% na resolução de grade.
    /// </summary>
    public static double Resolve(double toleranceMm, double registerMm)
    {
        if (toleranceMm < 0)
            throw new ImpositionException(
                ErrorCodes.InvalidTolerance,
                $"toleranceMm não pode ser negativo: {toleranceMm}");
        if (registerMm < 0)
            throw new ImpositionException(
                ErrorCodes.InvalidTolerance,
                $"registerMm não pode ser negativo: {registerMm}");

        return Math.Max(Math.Max(toleranceMm, registerMm), FactoryFloorMm);
    }
}
