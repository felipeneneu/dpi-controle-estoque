namespace Imposition.Pdf.Seams;

/// <summary>
/// Metadados estruturados retornados pelo fatiador de painéis PDF (ADR-060).
/// Mantém informações sobre caminhos gerados, tamanhos em bytes e eventuais avisos operacionais.
/// </summary>
public sealed record PanelSplitMetadata(
    IReadOnlyList<string> GeneratedFiles,
    IReadOnlyList<long> FileSizesBytes,
    IReadOnlyList<string> Warnings);
