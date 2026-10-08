using System.Diagnostics;
using Imposition.Core.Seams;
using Imposition.Pdf.Preflight;

namespace Imposition.Pdf.Seams;

/// <summary>
/// Orquestrador de exportação em lote de painéis no formato PDF/X-1a (ADR-054, BR-055).
/// Combina fatiamento vetorial (QdfPanelSplitter), injeção de OutputIntent (PdfxOutputIntentInjector)
/// e validação estrutural pós-exportação (PdfxValidator), com suporte a progresso e cancelamento (Regra R-019).
/// </summary>
public sealed class PdfxPanelExporter
{
    private readonly QdfPanelSplitter _splitter;

    public PdfxPanelExporter(QdfPanelSplitter? splitter = null)
    {
        _splitter = splitter ?? new QdfPanelSplitter();
    }

    /// <summary>
    /// Exporta os painéis da arte especificada como arquivos PDF/X-1a conformes.
    /// </summary>
    public async Task<PdfxExportResult> ExportAsync(
        string sourcePdfPath,
        SeamsResult seams,
        string outputDirectory,
        PdfxExportOptions options,
        IProgress<double>? progress = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(sourcePdfPath);
        ArgumentNullException.ThrowIfNull(seams);
        ArgumentException.ThrowIfNullOrWhiteSpace(outputDirectory);
        ArgumentNullException.ThrowIfNull(options);
        ArgumentNullException.ThrowIfNull(options.OutputIntent, nameof(options.OutputIntent));

        var stopwatch = Stopwatch.StartNew();
        progress?.Report(0.0);

        // 1. Fatiamento vetorial dos painéis com metadados estruturados (ADR-060)
        var metadata = await _splitter.SplitWithMetadataAsync(
            sourcePdfPath,
            seams,
            outputDirectory,
            options.NamingPattern,
            options.GuideLine,
            cancellationToken).ConfigureAwait(false);

        var splitFiles = metadata.GeneratedFiles;

        progress?.Report(0.5);

        // 2. Injeção de OutputIntent PDF/X-1a em cada painel
        double progressStep = splitFiles.Count > 0 ? 0.4 / splitFiles.Count : 0.0;
        double currentProgress = 0.5;

        for (int i = 0; i < splitFiles.Count; i++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            PdfxOutputIntentInjector.Inject(splitFiles[i], options.OutputIntent);
            currentProgress += progressStep;
            progress?.Report(Math.Min(0.9, currentProgress));
        }

        // 3. Validação estrutural de pré-impressão por painel (Regra R-019)
        var validationResults = new List<PdfxValidationResult>(splitFiles.Count);
        foreach (var file in splitFiles)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var valResult = PdfxValidator.Validate(file);
            validationResults.Add(valResult);
        }

        progress?.Report(1.0);
        stopwatch.Stop();

        // R-019: Campos de resultado derivados estritamente após a conclusão
        return new PdfxExportResult(
            splitFiles,
            validationResults,
            stopwatch.Elapsed,
            metadata);
    }
}
