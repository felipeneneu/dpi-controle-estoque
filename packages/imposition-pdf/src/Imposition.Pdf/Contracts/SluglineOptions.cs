namespace Imposition.Pdf.Contracts;

/// <summary>
/// Opcoes da slugline (ADR-047, Decisao 5).
/// Decoracao de saida: nao altera a geometria da chapa, apenas escreve um
/// texto na faixa de sangria que as marcas ja reservaram.
/// </summary>
/// <param name="FileName">Nome do arquivo de trabalho (entra na linha tecnica).</param>
/// <param name="ImpositionTime">Data/hora da imposicao.</param>
/// <param name="Total">Quantidade total impressa.</param>
/// <param name="CustomText">
/// Texto personalizado; quando nao vazio (apos trim) substitui a linha tecnica.
/// null/whitespace delega para o formatador do core.
/// </param>
public sealed record SluglineOptions(
    string FileName,
    DateTimeOffset ImpositionTime,
    int Total,
    string? CustomText = null);
