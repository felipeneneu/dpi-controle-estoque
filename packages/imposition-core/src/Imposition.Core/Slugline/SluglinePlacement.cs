namespace Imposition.Core.Slugline;

/// <summary>
/// Resultado do cálculo da slugline (ADR-047, Decisão 1).
/// Coordenadas em milímetros, RELATIVAS à chapa, origem no canto
/// inferior-esquerdo. <see cref="BaselineYMm"/> é NEGATIVO: a baseline
/// fica abaixo da origem da chapa, na faixa de sangria (R-017).
/// </summary>
/// <param name="Text">Texto já formatado e normalizado para latin-1.</param>
/// <param name="AnchorXCenterMm">X do centro do texto, em mm.</param>
/// <param name="BaselineYMm">Y da baseline do texto, em mm (negativo = abaixo da chapa).</param>
/// <param name="FontSizeMm">Corpo da fonte, em mm.</param>
public sealed record SluglinePlacement(
    string Text,
    double AnchorXCenterMm,
    double BaselineYMm,
    double FontSizeMm);