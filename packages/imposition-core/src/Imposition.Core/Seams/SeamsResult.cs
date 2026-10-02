namespace Imposition.Core.Seams;

/// <summary>
/// Resultado consolidado da divisão geométrica em painéis (ADR-049).
/// </summary>
/// <param name="TotalPanels">Número total de painéis gerados.</param>
/// <param name="Panels">Lista detalhada dos painéis e suas coordenadas de corte/saída.</param>
/// <param name="TotalLinearLengthMeters">Consumo total de mídia em metros lineares de rolo.</param>
/// <param name="TotalWasteAreaM2">Área total desperdiçada de substrato em m².</param>
/// <param name="ShrinkageAppliedMm">Acréscimo total de encolhimento térmico aplicado por painel, em mm.</param>
/// <param name="EffectiveRollWidthMm">Largura útil do rolo utilizada no cálculo, em mm.</param>
public sealed record SeamsResult(
    int TotalPanels,
    IReadOnlyList<PanelPlacement> Panels,
    double TotalLinearLengthMeters,
    double TotalWasteAreaM2,
    double ShrinkageAppliedMm,
    double EffectiveRollWidthMm);
