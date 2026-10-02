using Imposition.Core.Errors;

namespace Imposition.Core.Seams;

/// <summary>
/// Contrato imutável de definição de linha-guia visual de emenda (ADR-051, BR_053).
/// </summary>
/// <param name="TargetPanelIndex">Índice do painel de destino (1-based).</param>
/// <param name="XPositionMm">Coordenada X inicial da linha dentro do painel, em mm.</param>
/// <param name="YPositionMm">Coordenada Y inicial da linha dentro do painel, em mm.</param>
/// <param name="LengthMm">Comprimento total da linha, em mm.</param>
/// <param name="ThicknessPt">Espessura do traço em pontos PDF (padrão 1.0 pt).</param>
/// <param name="Cyan">Componente Ciano (0.0 a 1.0).</param>
/// <param name="Magenta">Componente Magenta (0.0 a 1.0).</param>
/// <param name="Yellow">Componente Amarelo (0.0 a 1.0).</param>
/// <param name="Black">Componente Preto/K (0.0 a 1.0, padrão 0.40 para K 40%).</param>
public sealed record GuideLineDefinition(
    int TargetPanelIndex,
    double XPositionMm,
    double YPositionMm,
    double LengthMm,
    double ThicknessPt,
    double Cyan,
    double Magenta,
    double Yellow,
    double Black)
{
    public int TargetPanelIndex { get; init; } = TargetPanelIndex >= 1
        ? TargetPanelIndex
        : throw new ImpositionException(
            ErrorCodes.InvalidGuideLine,
            $"Índice do painel alvo deve ser >= 1. Recebido: {TargetPanelIndex}");

    public double XPositionMm { get; init; } = double.IsFinite(XPositionMm) && XPositionMm >= 0.0
        ? XPositionMm
        : throw new ImpositionException(
            ErrorCodes.InvalidGuideLine,
            $"Posição X da linha-guia inválida: {XPositionMm}");

    public double YPositionMm { get; init; } = double.IsFinite(YPositionMm) && YPositionMm >= 0.0
        ? YPositionMm
        : throw new ImpositionException(
            ErrorCodes.InvalidGuideLine,
            $"Posição Y da linha-guia inválida: {YPositionMm}");

    public double LengthMm { get; init; } = double.IsFinite(LengthMm) && LengthMm > 0.0
        ? LengthMm
        : throw new ImpositionException(
            ErrorCodes.InvalidGuideLine,
            $"Comprimento da linha-guia deve ser finito e > 0. Recebido: {LengthMm}");

    public double ThicknessPt { get; init; } = double.IsFinite(ThicknessPt) && ThicknessPt > 0.0
        ? ThicknessPt
        : throw new ImpositionException(
            ErrorCodes.InvalidGuideLine,
            $"Espessura da linha-guia deve ser finita e > 0 pt. Recebido: {ThicknessPt}");

    public double Cyan { get; init; } = double.IsFinite(Cyan) && Cyan >= 0.0 && Cyan <= 1.0
        ? Cyan
        : throw new ImpositionException(
            ErrorCodes.InvalidGuideLine,
            $"Componente Cyan deve estar em [0.0, 1.0]. Recebido: {Cyan}");

    public double Magenta { get; init; } = double.IsFinite(Magenta) && Magenta >= 0.0 && Magenta <= 1.0
        ? Magenta
        : throw new ImpositionException(
            ErrorCodes.InvalidGuideLine,
            $"Componente Magenta deve estar em [0.0, 1.0]. Recebido: {Magenta}");

    public double Yellow { get; init; } = double.IsFinite(Yellow) && Yellow >= 0.0 && Yellow <= 1.0
        ? Yellow
        : throw new ImpositionException(
            ErrorCodes.InvalidGuideLine,
            $"Componente Yellow deve estar em [0.0, 1.0]. Recebido: {Yellow}");

    public double Black { get; init; } = double.IsFinite(Black) && Black >= 0.0 && Black <= 1.0
        ? Black
        : throw new ImpositionException(
            ErrorCodes.InvalidGuideLine,
            $"Componente Black deve estar em [0.0, 1.0]. Recebido: {Black}");

    /// <summary>
    /// Cria uma linha-guia padrão de emenda (1 pt, CMYK 0/0/0/0.40) conforme ADR-051 e BR_053.
    /// </summary>
    public static GuideLineDefinition CreateStandard(
        int panelIndex,
        double xMm,
        double yMm,
        double lengthMm)
    {
        return new GuideLineDefinition(
            TargetPanelIndex: panelIndex,
            XPositionMm: xMm,
            YPositionMm: yMm,
            LengthMm: lengthMm,
            ThicknessPt: 1.0,
            Cyan: 0.0,
            Magenta: 0.0,
            Yellow: 0.0,
            Black: 0.40);
    }
}
