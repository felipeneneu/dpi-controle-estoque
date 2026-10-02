namespace Imposition.Core.Rolls;

/// <summary>
/// Sugestão de rolo ótimo para um banner/arte específico (ADR-050, BR_051).
/// </summary>
/// <param name="SelectedRoll">Rolo eleito como melhor candidato.</param>
/// <param name="PanelCount">Quantidade de painéis gerados para esta configuração.</param>
/// <param name="TotalWasteM2">Área total desperdiçada de substrato em m².</param>
/// <param name="WastePercentage">Percentual de desperdício em relação à área total de substrato consumida.</param>
/// <param name="RequiresRotation">Indica se a arte deve ser rotacionada 90° para obter esta otimização.</param>
public sealed record RollSuggestion(
    RollSpecification SelectedRoll,
    int PanelCount,
    double TotalWasteM2,
    double WastePercentage,
    bool RequiresRotation = false);
