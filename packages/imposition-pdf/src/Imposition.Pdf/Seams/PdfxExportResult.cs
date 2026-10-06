using Imposition.Pdf.Preflight;

namespace Imposition.Pdf.Seams;

/// <summary>
/// Desfecho da exportação de painéis contendo resultados individuais de conformidade por painel (Regra R-019).
/// </summary>
/// <param name="GeneratedFiles">Lista de caminhos completos dos arquivos PDF finais gerados em disco.</param>
/// <param name="PerPanelResults">Relatório estrutural individual de validação de cada painel gerado.</param>
/// <param name="ElapsedTime">Tempo total decorrido durante o processamento do lote.</param>
public sealed record PdfxExportResult(
    IReadOnlyList<string> GeneratedFiles,
    IReadOnlyList<PdfxValidationResult> PerPanelResults,
    TimeSpan ElapsedTime)
{
    /// <summary>
    /// Retorna verdadeiro se todos os painéis gerados foram validados como conformes com PDF/X-1a.
    /// </summary>
    public bool AllCompliant => PerPanelResults.Count > 0 && PerPanelResults.All(r => r.IsCompliant);
}
