namespace Imposition.Core.Seams;

/// <summary>
/// Geometria e coordenadas de corte de um painel individual dentro da arte original (ADR-049).
/// </summary>
/// <param name="Index">Índice do painel (1-based).</param>
/// <param name="SourceXPositionMm">Posição X inicial de corte na arte fonte, em mm.</param>
/// <param name="SourceYPositionMm">Posição Y inicial de corte na arte fonte, em mm.</param>
/// <param name="SourceWidthMm">Largura original da fatia na arte fonte, em mm.</param>
/// <param name="SourceHeightMm">Altura original da fatia na arte fonte, em mm.</param>
/// <param name="OutputWidthMm">Largura final impressa do painel (inclui sobreposições), em mm.</param>
/// <param name="OutputHeightMm">Altura final impressa do painel (inclui acréscimo de encolhimento), em mm.</param>
/// <param name="OverlapStartMm">Largura de sobreposição na borda inicial (esquerda/topo), em mm.</param>
/// <param name="OverlapEndMm">Largura de sobreposição na borda final (direita/base), em mm.</param>
/// <param name="ShrinkageAllowanceMm">Acréscimo de encolhimento térmico adicionado na dimensão do comprimento, em mm.</param>
/// <param name="HasGuideLine">Indica se este painel recebe a linha-guia visual de solda/emenda (K 40%).</param>
public sealed record PanelPlacement(
    int Index,
    double SourceXPositionMm,
    double SourceYPositionMm,
    double SourceWidthMm,
    double SourceHeightMm,
    double OutputWidthMm,
    double OutputHeightMm,
    double OverlapStartMm,
    double OverlapEndMm,
    double ShrinkageAllowanceMm,
    bool HasGuideLine);
