using System.Globalization;
using Imposition.Core.Errors;

namespace Imposition.Core.Rolls;

/// <summary>
/// Especificação física e dimensões operacionais de um rolo de substrato (ADR-050, BR_051).
/// </summary>
/// <param name="Id">Identificador único do rolo (ex: "roll-1520").</param>
/// <param name="Name">Nome amigável de exibição (ex: "Lona 1,52m").</param>
/// <param name="PhysicalWidthMm">Largura física nominal total do rolo em mm.</param>
/// <param name="MarginLeftMm">Margem de segurança lateral esquerda em mm.</param>
/// <param name="MarginRightMm">Margem de segurança lateral direita em mm.</param>
/// <param name="UsableWidthMm">Largura útil real imprimível em mm (Physical - Left - Right).</param>
public sealed record RollSpecification(
    string Id,
    string Name,
    double PhysicalWidthMm,
    double MarginLeftMm,
    double MarginRightMm,
    double UsableWidthMm)
{
    /// <summary>
    /// Cria uma especificação de rolo validando estritamente as dimensões físicas (Regra R-013).
    /// </summary>
    public static RollSpecification Create(
        string id,
        string name,
        double physicalWidthMm,
        double marginSideMm = 15.0)
    {
        return Create(id, name, physicalWidthMm, marginSideMm, marginSideMm);
    }

    /// <summary>
    /// Cria uma especificação de rolo com margens assimétricas opcionais.
    /// </summary>
    public static RollSpecification Create(
        string id,
        string name,
        double physicalWidthMm,
        double marginLeftMm,
        double marginRightMm)
    {
        if (string.IsNullOrWhiteSpace(id))
            throw new ImpositionException(ErrorCodes.InvalidRoll, "Id do rolo não pode ser vazio.");

        if (string.IsNullOrWhiteSpace(name))
            throw new ImpositionException(ErrorCodes.InvalidRoll, "Nome do rolo não pode ser vazio.");

        if (!double.IsFinite(physicalWidthMm) || physicalWidthMm <= 0.0)
        {
            throw new ImpositionException(
                ErrorCodes.InvalidRoll,
                $"Largura física do rolo deve ser finita e > 0; recebido: {physicalWidthMm.ToString(CultureInfo.InvariantCulture)}");
        }

        if (!double.IsFinite(marginLeftMm) || marginLeftMm < 0.0)
        {
            throw new ImpositionException(
                ErrorCodes.InvalidRoll,
                $"Margem esquerda deve ser finita e >= 0; recebido: {marginLeftMm.ToString(CultureInfo.InvariantCulture)}");
        }

        if (!double.IsFinite(marginRightMm) || marginRightMm < 0.0)
        {
            throw new ImpositionException(
                ErrorCodes.InvalidRoll,
                $"Margem direita deve ser finita e >= 0; recebido: {marginRightMm.ToString(CultureInfo.InvariantCulture)}");
        }

        var usable = physicalWidthMm - marginLeftMm - marginRightMm;
        if (!double.IsFinite(usable) || usable <= 0.0)
        {
            throw new ImpositionException(
                ErrorCodes.RollUsableWidthInvalid,
                $"Largura útil do rolo ({usable.ToString(CultureInfo.InvariantCulture)} mm) deve ser > 0. Margens ({marginLeftMm} + {marginRightMm}) excedem ou igualam a largura física ({physicalWidthMm} mm).");
        }

        return new RollSpecification(id, name, physicalWidthMm, marginLeftMm, marginRightMm, usable);
    }
}
