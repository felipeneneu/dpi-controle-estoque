using Imposition.Core.Errors;

namespace Imposition.Core.Seams;

/// <summary>
/// Configuração de estilo e presença da linha-guia visual de sobreposição de emenda (ADR-059, BR_059).
/// </summary>
/// <param name="Enabled">Indica se a linha-guia deve ser desenhada nos painéis elegíveis.</param>
/// <param name="ThicknessPt">Espessura do traço em pontos PDF (padrão 1.0 pt).</param>
/// <param name="Cyan">Componente Ciano da cor CMYK (0.0 a 1.0).</param>
/// <param name="Magenta">Componente Magenta da cor CMYK (0.0 a 1.0).</param>
/// <param name="Yellow">Componente Amarelo da cor CMYK (0.0 a 1.0).</param>
/// <param name="Black">Componente Preto/K da cor CMYK (0.0 a 1.0, padrão 0.40 para K 40%).</param>
public sealed record GuideLineConfig(
    bool Enabled = true,
    double ThicknessPt = 1.0,
    double Cyan = 0.0,
    double Magenta = 0.0,
    double Yellow = 0.0,
    double Black = 0.40)
{
    public double ThicknessPt { get; init; } = double.IsFinite(ThicknessPt) && ThicknessPt > 0.0
        ? ThicknessPt
        : throw new ImpositionException(
            ErrorCodes.InvalidGuideLine,
            $"Espessura da linha-guia deve ser finita e > 0 pt. Recebido: {ThicknessPt}");

    public double Cyan { get; init; } = double.IsFinite(Cyan) && Cyan >= 0.0 && Cyan <= 1.0
        ? Cyan
        : throw new ImpositionException(
            ErrorCodes.InvalidGuideLine,
            $"Componente Cyan da linha-guia deve estar entre 0.0 e 1.0. Recebido: {Cyan}");

    public double Magenta { get; init; } = double.IsFinite(Magenta) && Magenta >= 0.0 && Magenta <= 1.0
        ? Magenta
        : throw new ImpositionException(
            ErrorCodes.InvalidGuideLine,
            $"Componente Magenta da linha-guia deve estar entre 0.0 e 1.0. Recebido: {Magenta}");

    public double Yellow { get; init; } = double.IsFinite(Yellow) && Yellow >= 0.0 && Yellow <= 1.0
        ? Yellow
        : throw new ImpositionException(
            ErrorCodes.InvalidGuideLine,
            $"Componente Yellow da linha-guia deve estar entre 0.0 e 1.0. Recebido: {Yellow}");

    public double Black { get; init; } = double.IsFinite(Black) && Black >= 0.0 && Black <= 1.0
        ? Black
        : throw new ImpositionException(
            ErrorCodes.InvalidGuideLine,
            $"Componente Black da linha-guia deve estar entre 0.0 e 1.0. Recebido: {Black}");

    /// <summary>Instância padrão pré-configurada conforme ADR-051 (1.0 pt, K 40%).</summary>
    public static GuideLineConfig Default { get; } = new();

    /// <summary>Instância pré-configurada com a linha-guia desativada.</summary>
    public static GuideLineConfig Disabled { get; } = new(Enabled: false);
}
