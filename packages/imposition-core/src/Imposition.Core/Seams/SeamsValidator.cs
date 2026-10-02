using System.Globalization;
using Imposition.Core.Errors;

namespace Imposition.Core.Seams;

/// <summary>
/// Validação estrita de contratos de entrada para o cálculo de emendas (ADR-049, BR_050.a, Regra R-013).
/// Validação pura, sem IO, thread-safe.
/// </summary>
public static class SeamsValidator
{
    /// <summary>
    /// Valida o registro de entrada SeamsInput. Lança ImpositionException com código apropriado em caso de inconsistência.
    /// </summary>
    /// <param name="input">Entrada a ser validada.</param>
    /// <exception cref="ImpositionException">Lançada se alguma dimensão for não-finita, menor/igual a zero ou se violar limites de rolo.</exception>
    public static void Validate(SeamsInput input)
    {
        if (input == null)
            throw new ImpositionException(ErrorCodes.InvalidSeamsInput, "SeamsInput não pode ser nulo.");

        if (!double.IsFinite(input.ArtworkWidthMm) || input.ArtworkWidthMm <= 0.0)
        {
            throw new ImpositionException(
                ErrorCodes.InvalidSeamsInput,
                $"ArtworkWidthMm deve ser finito e > 0; recebido: {Describe(input.ArtworkWidthMm)}");
        }

        if (!double.IsFinite(input.ArtworkHeightMm) || input.ArtworkHeightMm <= 0.0)
        {
            throw new ImpositionException(
                ErrorCodes.InvalidSeamsInput,
                $"ArtworkHeightMm deve ser finito e > 0; recebido: {Describe(input.ArtworkHeightMm)}");
        }

        if (!double.IsFinite(input.PrintableRollWidthMm) || input.PrintableRollWidthMm <= 0.0)
        {
            throw new ImpositionException(
                ErrorCodes.InvalidSeamsInput,
                $"PrintableRollWidthMm deve ser finito e > 0; recebido: {Describe(input.PrintableRollWidthMm)}");
        }

        if (!double.IsFinite(input.OverlapMm) || input.OverlapMm < 0.0)
        {
            throw new ImpositionException(
                ErrorCodes.InvalidSeamsInput,
                $"OverlapMm deve ser finito e >= 0; recebido: {Describe(input.OverlapMm)}");
        }

        if (input.OverlapMm >= input.PrintableRollWidthMm)
        {
            throw new ImpositionException(
                ErrorCodes.SeamsOverlapExceedsRoll,
                $"OverlapMm ({Describe(input.OverlapMm)}) deve ser menor que PrintableRollWidthMm ({Describe(input.PrintableRollWidthMm)})");
        }

        if (!double.IsFinite(input.CustomPanelWidthMm) || input.CustomPanelWidthMm < 0.0)
        {
            throw new ImpositionException(
                ErrorCodes.InvalidSeamsInput,
                $"CustomPanelWidthMm deve ser finito e >= 0; recebido: {Describe(input.CustomPanelWidthMm)}");
        }

        if (input.CustomPanelWidthMm > 0.0 && input.CustomPanelWidthMm > input.PrintableRollWidthMm)
        {
            throw new ImpositionException(
                ErrorCodes.InvalidSeamsInput,
                $"CustomPanelWidthMm ({Describe(input.CustomPanelWidthMm)}) não pode ser maior que PrintableRollWidthMm ({Describe(input.PrintableRollWidthMm)})");
        }

        if (input.CustomPanelWidthMm > 0.0 && input.OverlapMm >= input.CustomPanelWidthMm)
        {
            throw new ImpositionException(
                ErrorCodes.SeamsOverlapExceedsRoll,
                $"OverlapMm ({Describe(input.OverlapMm)}) deve ser menor que CustomPanelWidthMm ({Describe(input.CustomPanelWidthMm)})");
        }
    }

    private static string Describe(double value) => value.ToString(CultureInfo.InvariantCulture);
}
