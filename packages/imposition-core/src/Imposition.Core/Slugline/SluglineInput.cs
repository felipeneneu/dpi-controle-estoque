namespace Imposition.Core.Slugline;

/// <summary>
/// Entrada do cálculo da slugline (ADR-047, Decisão 1).
/// A slugline é decoração de saída — nunca vira campo de ImpositionInput.
/// </summary>
/// <param name="FileName">Nome do arquivo de trabalho (usado na linha técnica).</param>
/// <param name="ImpositionTime">Data/hora da imposição.</param>
/// <param name="SheetWidthMm">Largura da chapa imposta, em mm.</param>
/// <param name="SheetHeightMm">Altura da chapa imposta, em mm.</param>
/// <param name="Cols">Colunas da grade.</param>
/// <param name="Rows">Linhas da grade.</param>
/// <param name="Total">Quantidade total impressa.</param>
/// <param name="BleedStripeMm">
/// Altura da faixa de sangria disponível (expansão vertical calculada pelo
/// MarksRenderer do imposition-pdf; = 0 quando Marks == null).
/// </param>
/// <param name="CustomText">
/// Texto personalizado da slugline; quando não vazio (após trim) vence a linha
/// técnica. null/whitespace delega para FormatTechnicalLine.
/// </param>
public sealed record SluglineInput(
    string FileName,
    DateTimeOffset ImpositionTime,
    double SheetWidthMm,
    double SheetHeightMm,
    int Cols,
    int Rows,
    int Total,
    double BleedStripeMm,
    string? CustomText = null);