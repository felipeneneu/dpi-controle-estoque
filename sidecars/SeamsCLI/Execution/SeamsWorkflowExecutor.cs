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

namespace SeamsCLI.Execution;

public sealed class SeamsWorkflowExecutor
{
    private static readonly Regex MediaBoxRegex = new(
        @"/MediaBox\s*\[\s*([0-9\.\-]+)\s+([0-9\.\-]+)\s+([0-9\.\-]+)\s+([0-9\.\-]+)\s*\]",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public async Task<SeamsWorkflowResult> ExecuteAsync(
        SeamsCliOptions options,
        IProgress<double>? progress = null,
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

            if (!File.Exists(options.SourcePath))
            {
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
            var (widthMm, heightMm) = ExtractDimensions(options, warnings);

            if (!double.IsFinite(widthMm) || widthMm <= 0 || !double.IsFinite(heightMm) || heightMm <= 0)
            {
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

            // 3. Roteamento por formato
            int panelCount = seamsResult.Panels.Count;
            double totalLinearLength = seamsResult.TotalLinearLengthMeters;

            if (options.Format.Equals("pdf", StringComparison.OrdinalIgnoreCase))
            {
                var pdfxOptions = new PdfxExportOptions(
                    OutputIntent: GetDefaultOutputIntent(),
                    NamingPattern: $"{jobName}_painel_{{index:D2}}.pdf");

                var pdfxExporter = new PdfxPanelExporter();
                var exportResult = await pdfxExporter.ExportAsync(
                    options.SourcePath,
                    seamsResult,
                    outDir,
                    pdfxOptions,
                    progress,
                    cancellationToken).ConfigureAwait(false);

                generatedFiles.AddRange(exportResult.GeneratedFiles);
            }
            else
            {
                var jpgOptions = new JpgExportOptions(
                    Quality: 100,
                    Dpi: 150,
                    EmbedIccProfile: true,
                    NamingPattern: $"{jobName}_painel_{{index:D2}}.jpg");

                var jpgResult = await JpgPanelExporter.Instance.ExportPanelsAsync(
                    options.SourcePath,
                    seamsResult,
                    outDir,
                    jpgOptions,
                    progress,
                    cancellationToken).ConfigureAwait(false);

                generatedFiles.AddRange(jpgResult.GeneratedFiles);
            }

            stopwatch.Stop();
            return new SeamsWorkflowResult(
                Success: true,
                PanelCount: panelCount,
                GeneratedFiles: generatedFiles,
                TotalLinearLengthMeters: totalLinearLength,
                ElapsedTime: stopwatch.Elapsed,
                Warnings: warnings);
        }
        catch (OperationCanceledException)
        {
            stopwatch.Stop();
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

    private static (double WidthMm, double HeightMm) ExtractDimensions(SeamsCliOptions options, List<string> warnings)
    {
        double width = options.WidthMm ?? 0.0;
        double height = options.HeightMm ?? 0.0;
        bool hasWidthOverride = options.WidthMm.HasValue;
        bool hasHeightOverride = options.HeightMm.HasValue;

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
            if (!hasWidthOverride || !hasHeightOverride)
            {
                var (rasterW, rasterH, hasDpi) = ReadRasterDimensions(options.SourcePath);
                if (!hasWidthOverride) width = rasterW;
                if (!hasHeightOverride) height = rasterH;

                if (!hasDpi)
                {
                    warnings.Add("Resolução DPI não detectada na imagem de origem; adotado fallback de 300 DPI.");
                }
            }
        }

        return (width, height);
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

    private static (double WidthMm, double HeightMm, bool HasDpi) ReadRasterDimensions(string imagePath)
    {
        try
        {
            var bytes = File.ReadAllBytes(imagePath);
            int dpi = 300;
            bool foundDpi = false;

            for (int i = 0; i < bytes.Length - 14; i++)
            {
                if (bytes[i] == 0xFF && bytes[i + 1] == 0xE0)
                {
                    if (bytes[i + 4] == 'J' && bytes[i + 5] == 'F' && bytes[i + 6] == 'I' && bytes[i + 7] == 'F')
                    {
                        byte units = bytes[i + 11];
                        int xDensity = (bytes[i + 12] << 8) | bytes[i + 13];
                        if (units == 1 && xDensity > 0)
                        {
                            dpi = xDensity;
                            foundDpi = true;
                        }
                        else if (units == 2 && xDensity > 0)
                        {
                            dpi = (int)Math.Round(xDensity * 2.54);
                            foundDpi = true;
                        }
                        break;
                    }
                }
            }

            JpegCmykEncoder.DecodeCmyk(imagePath, out int pxW, out int pxH);
            double widthMm = (pxW / (double)dpi) * 25.4;
            double heightMm = (pxH / (double)dpi) * 25.4;
            return (widthMm, heightMm, foundDpi);
        }
        catch
        {
            return (1000.0, 1000.0, false);
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
