namespace Imposition.Core.Seams;

/// <summary>
/// Parâmetros de entrada para o cálculo determinístico de divisão de emendas (ADR-049).
/// </summary>
/// <param name="ArtworkWidthMm">Largura total da arte original em mm.</param>
/// <param name="ArtworkHeightMm">Altura total da arte original em mm.</param>
/// <param name="PrintableRollWidthMm">Largura física útil imprimível do rolo em mm.</param>
/// <param name="OverlapMm">Largura da faixa de sobreposição/emenda em mm (default 10.0 mm).</param>
/// <param name="ApplyShrinkage">Indica se a compensação de encolhimento térmico deve ser aplicada.</param>
/// <param name="Orientation">Orientação do fatiamento (Vertical ou Horizontal).</param>
/// <param name="Direction">Direção e ordenação dos painéis gerados.</param>
/// <param name="CustomPanelWidthMm">Largura customizada de painel (0 = automático pela largura útil do rolo).</param>
public sealed record SeamsInput(
    double ArtworkWidthMm,
    double ArtworkHeightMm,
    double PrintableRollWidthMm,
    double OverlapMm = 10.0,
    bool ApplyShrinkage = true,
    SeamOrientation Orientation = SeamOrientation.Vertical,
    SeamDirection Direction = SeamDirection.LeftToRight,
    double CustomPanelWidthMm = 0.0);
