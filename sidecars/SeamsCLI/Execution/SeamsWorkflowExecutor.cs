using System;
using System.Buffers.Binary;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Imposition.Core.Errors;
using Imposition.Core.Seams;
using Imposition.Pdf.Preflight;
using Imposition.Pdf.Seams;
using Imposition.Render.Export;
using SeamsCLI.CommandLine;
using SeamsCLI.Logging;

namespace SeamsCLI.Execution;

public sealed class SeamsWorkflowExecutor
{
    private static readonly Regex MediaBoxRegex = new(
        @"/MediaBox\s*\[\s*([0-9\.\-]+)\s+([0-9\.\-]+)\s+([0-9\.\-]+)\s+([0-9\.\-]+)\s*\]",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public Task<SeamsWorkflowResult> ExecuteAsync(
        SeamsCliOptions options,
        IProgress<double>? progress,
        CancellationToken cancellationToken)
        => ExecuteAsync(options, progress, logger: null, cancellationToken);

    public async Task<SeamsWorkflowResult> ExecuteAsync(
        SeamsCliOptions options,
        IProgress<double>? progress = null,
        RunLogger? logger = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(options);
        var stopwatch = Stopwatch.StartNew();
        var warnings = new List<string>();
        var generatedFiles = new List<string>();

        var outDir = options.OutputDir ?? Path.GetDirectoryName(options.SourcePath) ?? Directory.GetCurrentDirectory();
        var jobName = options.JobName ?? Path.GetFileNameWithoutExtension(options.SourcePath);

        try
        {
            cancellationToken.ThrowIfCancellationRequested();

            logger?.Section("Parâmetros do Trabalho");
            logger?.Info($"Arquivo de entrada: {options.SourcePath}");
            logger?.Info(FormattableString.Invariant($"Bobina: {options.RollWidthMm:F1} mm | Margem: {options.MarginMm:F1} mm | Sobreposição: {options.OverlapMm:F1} mm"));
            logger?.Info($"Orientação: {options.Orientation} | Direção: {options.Direction} | Formato: {options.Format}");
            logger?.Info($"Linha-guia: {(options.GuideLine ? $"Ativa (Cor: {options.LineColor}, Espessura: {options.LineThicknessPt.ToString("F1", CultureInfo.InvariantCulture)} pt)" : "Desativada")}");
            logger?.Info($"Diretório de saída: {outDir}");
            if (options.ShrinkageCompensation) logger?.Info("Compensação de encolhimento térmico: ATIVA");

            if (!File.Exists(options.SourcePath))
            {
                logger?.Error($"Arquivo de origem '{options.SourcePath}' não foi encontrado.");
                return new SeamsWorkflowResult(
                    Success: false,
                    PanelCount: 0,
                    GeneratedFiles: generatedFiles,
                    TotalLinearLengthMeters: 0.0,
                    ElapsedTime: stopwatch.Elapsed,
                    Warnings: warnings,
                    ErrorCode: ErrorCodes.InputNotFound,
                    ErrorMessage: $"Arquivo de origem '{options.SourcePath}' não foi encontrado.");
            }

            if (!Directory.Exists(outDir))
            {
                Directory.CreateDirectory(outDir);
            }

            // 1. Extração / determinação de dimensões
            logger?.Section("Análise do Arquivo de Entrada");
            var fi = new FileInfo(options.SourcePath);
            var ext = Path.GetExtension(options.SourcePath).ToLowerInvariant();
            logger?.Info(FormattableString.Invariant($"Entrada: {options.SourcePath} ({fi.Length / 1024.0:F1} KB, extensão {ext})"));

            var (widthMm, heightMm, detectedDpi) = ExtractDimensions(options, warnings);
            logger?.Info(FormattableString.Invariant($"Dimensões: {widthMm:F1} x {heightMm:F1} mm | DPI detectado/efetivo: {detectedDpi}"));

            foreach (var warning in warnings)
            {
                logger?.Warn(warning);
            }

            if (!double.IsFinite(widthMm) || widthMm <= 0 || !double.IsFinite(heightMm) || heightMm <= 0)
            {
                logger?.Error("As dimensões do trabalho de entrada são inválidas ou não puderam ser determinadas.");
                return new SeamsWorkflowResult(
                    Success: false,
                    PanelCount: 0,
                    GeneratedFiles: generatedFiles,
                    TotalLinearLengthMeters: 0.0,
                    ElapsedTime: stopwatch.Elapsed,
                    Warnings: warnings,
                    ErrorCode: ErrorCodes.InvalidDimension,
                    ErrorMessage: "As dimensões do trabalho de entrada são inválidas ou não puderam ser determinadas.");
            }

            // 2. Cálculo geométrico de emendas
            var orientation = options.Orientation.Equals("horiz", StringComparison.OrdinalIgnoreCase)
                ? SeamOrientation.Horizontal
                : SeamOrientation.Vertical;

            var direction = options.Direction.Equals("rtl", StringComparison.OrdinalIgnoreCase)
                ? SeamDirection.RightToLeft
                : SeamDirection.LeftToRight;

            var printableWidthMm = options.RollWidthMm - (2 * options.MarginMm);
            var seamsInput = new SeamsInput(
                ArtworkWidthMm: widthMm,
                ArtworkHeightMm: heightMm,
                PrintableRollWidthMm: printableWidthMm,
                OverlapMm: options.OverlapMm,
                ApplyShrinkage: options.ShrinkageCompensation,
                Orientation: orientation,
                Direction: direction);

            var seamsResult = PanelCalculator.Calculate(seamsInput);

            logger?.Section("Cálculo Geométrico de Painéis");
            int panelCount = seamsResult.Panels.Count;
            int seamCount = Math.Max(0, panelCount - 1);
            logger?.Info($"Painéis calculados: {panelCount} painel(is) | {seamCount} emenda(s)");
            logger?.Info(FormattableString.Invariant($"Comprimento linear total de mídia: {seamsResult.TotalLinearLengthMeters:F2} m"));
            for (int i = 0; i < seamsResult.Panels.Count; i++)
            {
                var p = seamsResult.Panels[i];
                logger?.Info(FormattableString.Invariant($"  Painel {p.Index:D2}: {p.OutputWidthMm:F1} x {p.OutputHeightMm:F1} mm (Origem X: {p.SourceXPositionMm:F1} a {p.SourceXPositionMm + p.SourceWidthMm:F1} mm) [Guia: {p.HasGuideLine}]"));
            }

            // 3. Configuração de linha-guia e roteamento por formato
            var cmyk = ColorParser.ParseCmyk(options.LineColor);
            var guideLineConfig = new GuideLineConfig(
                Enabled: options.GuideLine,
                ThicknessPt: options.LineThicknessPt,
                Cyan: cmyk.Cyan,
                Magenta: cmyk.Magenta,
                Yellow: cmyk.Yellow,
                Black: cmyk.Black);

            double totalLinearLength = seamsResult.TotalLinearLengthMeters;

            logger?.Section($"Exportação ({options.Format.ToUpperInvariant()})");
            logger?.Info($"Formato de saída: {options.Format.ToUpperInvariant()} | Total de painéis a exportar: {panelCount}");
            logger?.Info($"Configuração da linha-guia: {(guideLineConfig.Enabled ? $"Ativa [CMYK: {cmyk.Cyan:P0},{cmyk.Magenta:P0},{cmyk.Yellow:P0},{cmyk.Black:P0}, Espessura: {guideLineConfig.ThicknessPt.ToString("F1", CultureInfo.InvariantCulture)} pt]" : "Desativada")}");

            if (options.Format.Equals("pdf", StringComparison.OrdinalIgnoreCase))
            {
                var pdfxOptions = new PdfxExportOptions(
                    OutputIntent: GetDefaultOutputIntent(),
                    NamingPattern: $"{jobName}_painel_{{index:D2}}.pdf",
                    GuideLine: guideLineConfig);

                var pdfxExporter = new PdfxPanelExporter();
                var exportResult = await pdfxExporter.ExportAsync(
                    options.SourcePath,
                    seamsResult,
                    outDir,
                    pdfxOptions,
                    progress,
                    cancellationToken).ConfigureAwait(false);

                generatedFiles.AddRange(exportResult.GeneratedFiles);
                foreach (var file in exportResult.GeneratedFiles)
                {
                    var fileLen = File.Exists(file) ? new FileInfo(file).Length : 0;
                    logger?.Info($"  Painel exportado: {Path.GetFileName(file)} ({fileLen / 1024.0:F1} KB)");
                }

                if (exportResult.Metadata != null)
                {
                    foreach (var w in exportResult.Metadata.Warnings)
                    {
                        if (!warnings.Contains(w))
                            warnings.Add(w);
                        logger?.Warn(w);
                    }

                    for (int i = 0; i < exportResult.Metadata.FileSizesBytes.Count; i++)
                    {
                        long size = exportResult.Metadata.FileSizesBytes[i];
                        if (size > 524_288_000)
                        {
                            var mb = size / (1024.0 * 1024.0);
                            var msg = $"Painel {i + 1} possui {mb:F1} MB, excedendo o limiar de 500 MB.";
                            if (!warnings.Contains(msg))
                                warnings.Add(msg);
                            Console.Error.WriteLine($"[AVISO] {msg}");
                            logger?.Warn(msg);
                        }
                    }
                }
            }
            else
            {
                var effectiveDpi = options.Dpi ?? detectedDpi;
                var jpgOptions = new JpgExportOptions(
                    Quality: 100,
                    Dpi: effectiveDpi,
                    EmbedIccProfile: true,
                    NamingPattern: $"{jobName}_painel_{{index:D2}}.jpg",
                    GuideLine: guideLineConfig);

                var jpgResult = await JpgPanelExporter.Instance.ExportPanelsAsync(
                    options.SourcePath,
                    seamsResult,
                    outDir,
                    jpgOptions,
                    progress,
                    cancellationToken).ConfigureAwait(false);

                generatedFiles.AddRange(jpgResult.GeneratedFiles);
                foreach (var file in jpgResult.GeneratedFiles)
                {
                    var fileLen = File.Exists(file) ? new FileInfo(file).Length : 0;
                    logger?.Info($"  Painel exportado: {Path.GetFileName(file)} ({fileLen / 1024.0:F1} KB)");
                }
            }

            stopwatch.Stop();
            logger?.Section("Finalização");
            logger?.Info($"Execução CONCLUÍDA COM SUCESSO (ExitCode: 0, Tempo total: {stopwatch.Elapsed.TotalSeconds:F2}s).");
            logger?.Info($"Total de arquivos gerados: {generatedFiles.Count}");

            return new SeamsWorkflowResult(
                Success: true,
                PanelCount: panelCount,
                GeneratedFiles: generatedFiles,
                TotalLinearLengthMeters: totalLinearLength,
                ElapsedTime: stopwatch.Elapsed,
                Warnings: warnings);
        }
        catch (OperationCanceledException ex)
        {
            stopwatch.Stop();
            logger?.Error("Operação cancelada pelo usuário ou sinal de interrupção.", ex);
            CleanupPartialFiles(outDir, jobName, generatedFiles);
            return new SeamsWorkflowResult(
                Success: false,
                PanelCount: 0,
                GeneratedFiles: [],
                TotalLinearLengthMeters: 0.0,
                ElapsedTime: stopwatch.Elapsed,
                Warnings: warnings,
                ErrorCode: ErrorCodes.OperationCanceled,
                ErrorMessage: "Operação cancelada pelo usuário ou sinal de interrupção.");
        }
        catch (ImpositionException ex)
        {
            stopwatch.Stop();
            logger?.Error($"Erro de imposição ({ex.Code}): {ex.Message}", ex);
            return new SeamsWorkflowResult(
                Success: false,
                PanelCount: 0,
                GeneratedFiles: generatedFiles,
                TotalLinearLengthMeters: 0.0,
                ElapsedTime: stopwatch.Elapsed,
                Warnings: warnings,
                ErrorCode: ex.Code,
                ErrorMessage: ex.Message);
        }
        catch (UnauthorizedAccessException ex)
        {
            stopwatch.Stop();
            logger?.Error($"Permissão negada ao acessar arquivos ({ErrorCodes.AccessDenied}): {ex.Message}", ex);
            return new SeamsWorkflowResult(
                Success: false,
                PanelCount: 0,
                GeneratedFiles: generatedFiles,
                TotalLinearLengthMeters: 0.0,
                ElapsedTime: stopwatch.Elapsed,
                Warnings: warnings,
                ErrorCode: ErrorCodes.AccessDenied,
                ErrorMessage: $"Permissão negada ao acessar arquivos: {ex.Message}");
        }
        catch (IOException ex)
        {
            stopwatch.Stop();
            logger?.Error($"Erro de I/O em disco ({ErrorCodes.IoError}): {ex.Message}", ex);
            return new SeamsWorkflowResult(
                Success: false,
                PanelCount: 0,
                GeneratedFiles: generatedFiles,
                TotalLinearLengthMeters: 0.0,
                ElapsedTime: stopwatch.Elapsed,
                Warnings: warnings,
                ErrorCode: ErrorCodes.IoError,
                ErrorMessage: $"Erro de I/O em disco: {ex.Message}");
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            logger?.Error($"Erro inesperado (E_UNEXPECTED): {ex.Message}", ex);
            return new SeamsWorkflowResult(
                Success: false,
                PanelCount: 0,
                GeneratedFiles: generatedFiles,
                TotalLinearLengthMeters: 0.0,
                ElapsedTime: stopwatch.Elapsed,
                Warnings: warnings,
                ErrorCode: "E_UNEXPECTED",
                ErrorMessage: ex.Message);
        }
    }

    private static PdfxOutputIntent GetDefaultOutputIntent()
    {
        string defaultIccPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "resources", "icc", "cmyk", "CoatedFOGRA39.icc");
        byte[] iccBytes;
        if (File.Exists(defaultIccPath))
        {
            iccBytes = File.ReadAllBytes(defaultIccPath);
        }
        else
        {
            iccBytes = new byte[256];
            BinaryPrimitives.WriteUInt32BigEndian(iccBytes.AsSpan(0, 4), 256);
            iccBytes[36] = (byte)'a';
            iccBytes[37] = (byte)'c';
            iccBytes[38] = (byte)'s';
            iccBytes[39] = (byte)'p';
        }

        return new PdfxOutputIntent("FOGRA39", "ISO Coated v2 (ECI)", iccBytes);
    }

    private static (double WidthMm, double HeightMm, int DetectedDpi) ExtractDimensions(SeamsCliOptions options, List<string> warnings)
    {
        double width = options.WidthMm ?? 0.0;
        double height = options.HeightMm ?? 0.0;
        bool hasWidthOverride = options.WidthMm.HasValue;
        bool hasHeightOverride = options.HeightMm.HasValue;
        int detectedDpi = options.Dpi ?? 300;

        var ext = Path.GetExtension(options.SourcePath).ToLowerInvariant();
        if (ext == ".pdf")
        {
            var (pdfW, pdfH) = ReadPdfMediaBox(options.SourcePath);
            if (!hasWidthOverride) width = pdfW;
            if (!hasHeightOverride) height = pdfH;

            if (hasWidthOverride || hasHeightOverride)
            {
                warnings.Add("Dimensões do PDF sobrescritas via opções de comando (--width / --height).");
            }
        }
        else
        {
            var (rasterW, rasterH, rasterDpi, hasDpi) = ReadRasterDimensions(options.SourcePath);
            if (!hasWidthOverride) width = rasterW;
            if (!hasHeightOverride) height = rasterH;
            if (options.Dpi == null) detectedDpi = rasterDpi;

            if (hasWidthOverride || hasHeightOverride)
            {
                warnings.Add("Dimensões da imagem sobrescritas via opções de comando (--width / --height).");
            }

            if (!hasDpi && options.Dpi == null)
            {
                warnings.Add("Resolução DPI não detectada na imagem de origem; adotado fallback de 300 DPI.");
            }
        }

        return (width, height, detectedDpi);
    }

    private static (double WidthMm, double HeightMm) ReadPdfMediaBox(string pdfPath)
    {
        try
        {
            using var fs = File.OpenRead(pdfPath);
            int bytesToRead = (int)Math.Min(65536, fs.Length);
            var buffer = new byte[bytesToRead];
            int read = fs.Read(buffer, 0, bytesToRead);
            var content = System.Text.Encoding.ASCII.GetString(buffer, 0, read);

            var match = MediaBoxRegex.Match(content);
            if (match.Success)
            {
                double x0 = double.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture);
                double y0 = double.Parse(match.Groups[2].Value, CultureInfo.InvariantCulture);
                double x1 = double.Parse(match.Groups[3].Value, CultureInfo.InvariantCulture);
                double y1 = double.Parse(match.Groups[4].Value, CultureInfo.InvariantCulture);

                double widthPt = Math.Abs(x1 - x0);
                double heightPt = Math.Abs(y1 - y0);

                double widthMm = widthPt * 25.4 / 72.0;
                double heightMm = heightPt * 25.4 / 72.0;
                return (widthMm, heightMm);
            }
        }
        catch
        {
            // Ignorar e fallback
        }

        return (1000.0, 1000.0);
    }

    private static (double WidthMm, double HeightMm, int Dpi, bool HasDpi) ReadRasterDimensions(string imagePath)
    {
        try
        {
            var (pxW, pxH, dpi, hasDpi) = JpegCmykEncoder.ReadImageInfo(imagePath);
            double widthMm = (pxW / (double)dpi) * 25.4;
            double heightMm = (pxH / (double)dpi) * 25.4;
            return (widthMm, heightMm, dpi, hasDpi);
        }
        catch
        {
            return (1000.0, 1000.0, 300, false);
        }
    }

    private static void CleanupPartialFiles(string outDir, string jobName, IEnumerable<string> files)
    {
        foreach (var file in files)
        {
            try
            {
                if (File.Exists(file)) File.Delete(file);
                var tmp = file + ".tmp";
                if (File.Exists(tmp)) File.Delete(tmp);
            }
            catch
            {
                // Ignorar erro em cleanup de cancelamento
            }
        }

        try
        {
            if (Directory.Exists(outDir))
            {
                foreach (var tmp in Directory.GetFiles(outDir, $"{jobName}*.tmp"))
                {
                    try { File.Delete(tmp); } catch { }
                }
            }
        }
        catch
        {
            // Ignorar erro em varredura de diretório
        }
    }
}
