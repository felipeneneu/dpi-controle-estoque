using System.Diagnostics;
using Imposition.Core.Errors;
using Imposition.Core.Seams;

namespace Imposition.Render.Export;

/// <summary>
/// Contrato do exportador de painéis em JPEG CMYK puro (ADR-053 / BR-054).
/// </summary>
public interface IJpgPanelExporter
{
    /// <summary>
    /// Exporta cada painel a partir de um arquivo de imagem fonte CMYK em disco.
    /// </summary>
    Task<JpgExportResult> ExportPanelsAsync(
        string sourceImagePath,
        SeamsResult seamsResult,
        string outputDirectory,
        JpgExportOptions? options = null,
        IProgress<double>? progress = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Exporta cada painel a partir de um buffer de memória CMYK puro.
    /// </summary>
    Task<JpgExportResult> ExportPanelsFromBufferAsync(
        ReadOnlyMemory<byte> sourceCmyk,
        int srcWidthPx,
        int srcHeightPx,
        string jobName,
        SeamsResult seamsResult,
        string outputDirectory,
        JpgExportOptions? options = null,
        IProgress<double>? progress = null,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Exportador de painéis fatiados em formato JPEG CMYK puro com alta fidelidade (Regra R-020).
/// Suporta escrita atômica em disco (.tmp + rename), notificação de progresso e cancelamento assíncrono.
/// </summary>
public sealed class JpgPanelExporter : IJpgPanelExporter
{
    public static JpgPanelExporter Instance { get; } = new();

    /// <inheritdoc />
    public async Task<JpgExportResult> ExportPanelsAsync(
        string sourceImagePath,
        SeamsResult seamsResult,
        string outputDirectory,
        JpgExportOptions? options = null,
        IProgress<double>? progress = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(sourceImagePath, nameof(sourceImagePath));
        ArgumentNullException.ThrowIfNull(seamsResult, nameof(seamsResult));

        if (string.IsNullOrWhiteSpace(outputDirectory))
        {
            throw new ImpositionException(ErrorCodes.InvalidExportInput, "O diretório de saída não pode ser nulo ou vazio.");
        }

        if (!File.Exists(sourceImagePath))
        {
            throw new ImpositionException(ErrorCodes.PreviewInputNotFound, $"Arquivo de imagem fonte não encontrado: '{sourceImagePath}'.");
        }

        var (width, height, components) = RasterPanelSplitter.ReadJpegHeaderInfo(sourceImagePath);
        if (components != 4)
        {
            throw new ImpositionException(
                ErrorCodes.ExportSourceNotCmyk,
                $"O arquivo fonte '{Path.GetFileName(sourceImagePath)}' possui {components} canais. A exportação exige imagem CMYK (4 canais) estrita (Regra R-020).");
        }

        options ??= JpgExportOptions.Default;
        ValidateOptions(options);

        var jobName = Path.GetFileNameWithoutExtension(sourceImagePath);

        // Lê metadados de cabeçalho para obter o DPI nativo da imagem original
        var (_, _, sourceDpi, _) = JpegCmykEncoder.ReadImageInfo(sourceImagePath);
        var effectiveDpi = options.Dpi ?? sourceDpi;
        var resolvedOptions = options with { Dpi = effectiveDpi };

        // Decodifica buffer CMYK
        var cmykBuffer = JpegCmykEncoder.DecodeCmyk(sourceImagePath, out var decW, out var decH);

        return await ExportPanelsFromBufferAsync(
            cmykBuffer,
            decW,
            decH,
            jobName,
            seamsResult,
            outputDirectory,
            resolvedOptions,
            progress,
            cancellationToken).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task<JpgExportResult> ExportPanelsFromBufferAsync(
        ReadOnlyMemory<byte> sourceCmyk,
        int srcWidthPx,
        int srcHeightPx,
        string jobName,
        SeamsResult seamsResult,
        string outputDirectory,
        JpgExportOptions? options = null,
        IProgress<double>? progress = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(seamsResult, nameof(seamsResult));

        if (string.IsNullOrWhiteSpace(outputDirectory))
        {
            throw new ImpositionException(ErrorCodes.InvalidExportInput, "O diretório de saída não pode ser nulo ou vazio.");
        }

        if (string.IsNullOrWhiteSpace(jobName))
        {
            jobName = "job";
        }

        if (srcWidthPx <= 0 || srcHeightPx <= 0)
        {
            throw new ImpositionException(ErrorCodes.InvalidExportInput, "As dimensões da imagem fonte devem ser estritamente positivas.");
        }

        if (seamsResult.Panels == null || seamsResult.Panels.Count == 0)
        {
            throw new ImpositionException(ErrorCodes.InvalidExportInput, "O resultado de emenda não contém painéis para exportação.");
        }

        options ??= JpgExportOptions.Default;
        ValidateOptions(options);

        cancellationToken.ThrowIfCancellationRequested();

        Directory.CreateDirectory(outputDirectory);

        var effectiveDpi = options.Dpi ?? 300;
        var sw = Stopwatch.StartNew();
        var generatedFiles = new List<string>(seamsResult.Panels.Count);
        var totalPanels = seamsResult.Panels.Count;
        var completed = 0;

        for (var i = 0; i < totalPanels; i++)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var panel = seamsResult.Panels[i];
            var panelData = RasterPanelSplitter.SplitPanel(
                sourceCmyk.Span,
                srcWidthPx,
                srcHeightPx,
                panel,
                seamsResult,
                effectiveDpi,
                options.GuideLine);

            var fileName = FormatFileName(options.NamingPattern, jobName, panel.Index);
            var finalPath = Path.Combine(outputDirectory, fileName);
            var tempPath = Path.Combine(outputDirectory, $"{fileName}.tmp.{Guid.NewGuid():N}");

            try
            {
                byte[]? iccBytes = options.EmbedIccProfile ? JpegCmykEncoder.GetDefaultFogra39Profile() : null;

                // Escrita atômica em arquivo temporário com flush síncrono
                await using (var fs = new FileStream(tempPath, FileMode.Create, FileAccess.Write, FileShare.None, 65536, useAsync: true))
                {
                    JpegCmykEncoder.Encode(
                        panelData.CmykBuffer,
                        panelData.WidthPx,
                        panelData.HeightPx,
                        options.Quality,
                        (int)Math.Round(panelData.Dpi),
                        iccBytes,
                        fs);

                    await fs.FlushAsync(cancellationToken).ConfigureAwait(false);
                }

                // Move atômico substituindo arquivo final se já existir
                File.Move(tempPath, finalPath, overwrite: true);
                generatedFiles.Add(finalPath);
            }
            catch
            {
                // Limpeza segura em caso de erro ou cancelamento
                if (File.Exists(tempPath))
                {
                    try { File.Delete(tempPath); } catch { /* Ignore */ }
                }
                throw;
            }

            completed++;
            progress?.Report((double)completed / totalPanels);
        }

        sw.Stop();

        // R-019: Campos de desfecho calculados após todas as operações
        long totalBytes = 0;
        foreach (var file in generatedFiles)
        {
            if (File.Exists(file))
            {
                totalBytes += new FileInfo(file).Length;
            }
        }

        return new JpgExportResult(generatedFiles.AsReadOnly(), totalBytes, sw.Elapsed);
    }

    private static void ValidateOptions(JpgExportOptions options)
    {
        if (options.Quality < 1 || options.Quality > 100)
        {
            throw new ImpositionException(ErrorCodes.InvalidExportInput, $"Qualidade de compressão inválida ({options.Quality}). Deve estar entre 1 e 100.");
        }

        if (options.Dpi.HasValue && (!double.IsFinite(options.Dpi.Value) || options.Dpi.Value <= 0 || options.Dpi.Value > 4800))
        {
            throw new ImpositionException(ErrorCodes.InvalidExportInput, $"DPI de exportação inválido ({options.Dpi}). Deve ser finito e entre 1 e 4800.");
        }
    }

    private static string FormatFileName(string pattern, string jobName, int panelIndex)
    {
        if (string.IsNullOrWhiteSpace(pattern))
        {
            pattern = "{job}_painel_{index:D2}.jpg";
        }

        return pattern
            .Replace("{job}", jobName, StringComparison.OrdinalIgnoreCase)
            .Replace("{index:D2}", panelIndex.ToString("D2"), StringComparison.OrdinalIgnoreCase)
            .Replace("{index}", panelIndex.ToString(), StringComparison.OrdinalIgnoreCase);
    }
}
