using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Imposition.Core.Errors;
using Imposition.Core.Seams;

namespace Imposition.Pdf.Seams;

/// <summary>
/// Subdivide arquivos PDF em múltiplos painéis contíguos preservando 100% dos dados vetoriais (ADR-054, BR-055).
/// Valida ausência de camadas OCG (E_SOURCE_HAS_OCG) e ausência de RGB (E_EXPORT_SOURCE_NOT_CMYK).
/// </summary>
public sealed class QdfPanelSplitter
{
    private static readonly Encoding Latin1 = Encoding.GetEncoding(28591);
    private const double MmToPt = 72.0 / 25.4;

    private sealed record PdfObj(int Num, string Dict, string? Stream);

    public async Task<IReadOnlyList<string>> SplitAsync(
        string sourcePdfPath,
        SeamsResult seams,
        string outputDirectory,
        string namingPattern,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(sourcePdfPath);
        ArgumentNullException.ThrowIfNull(seams);
        ArgumentException.ThrowIfNullOrWhiteSpace(outputDirectory);

        if (!File.Exists(sourcePdfPath))
            throw new FileNotFoundException("PDF fonte não encontrado.", sourcePdfPath);

        if (seams.Panels == null || seams.Panels.Count == 0)
            throw new ImpositionException(ErrorCodes.InvalidSeamsInput, "O resultado de emendas não contém painéis.");

        Directory.CreateDirectory(outputDirectory);

        var fileBytes = await File.ReadAllBytesAsync(sourcePdfPath, cancellationToken).ConfigureAwait(false);
        var content = Latin1.GetString(fileBytes);

        // 1. Validação de OCG (Decisão 4 da ADR-054)
        if (content.Contains("/OCProperties"))
        {
            throw new ImpositionException(
                ErrorCodes.SourceHasOcg,
                "PDF fonte possui camadas OCG (/OCProperties), o que viola a especificação PDF/X-1a (ISO 15930-1). O arquivo deve ser achatado antes da exportação.");
        }

        // 2. Validação de RGB em 4 etapas (Decisão 6 da ADR-054 / Regra R-020)
        ValidateNoRgb(content);

        // 3. Parser dos objetos do PDF fonte
        var objs = ParseObjects(content);
        var pageObj = objs.FirstOrDefault(o => Regex.IsMatch(o.Dict, @"\/Type\s*\/Page\b"))
            ?? throw new InvalidOperationException("Nenhuma página encontrada no PDF fonte.");

        var (srcMediaW, srcMediaH) = GetBoxDimensions(pageObj.Dict, "/MediaBox");
        var resourcesText = ExtractResources(pageObj.Dict);
        var srcContents = ConcatContents(pageObj, objs);

        var guidelines = GuideLineCalculator.Calculate(seams);
        var jobName = Path.GetFileNameWithoutExtension(sourcePdfPath);
        var generatedFiles = new List<string>();
        var tempFiles = new List<string>();

        try
        {
            foreach (var panel in seams.Panels)
            {
                cancellationToken.ThrowIfCancellationRequested();

                // Validação R-013 de geometria do painel
                if (!double.IsFinite(panel.OutputWidthMm) || panel.OutputWidthMm <= 0 ||
                    !double.IsFinite(panel.OutputHeightMm) || panel.OutputHeightMm <= 0)
                {
                    throw new ImpositionException(
                        ErrorCodes.InvalidPiece,
                        $"Dimensões inválidas para o painel {panel.Index}: {panel.OutputWidthMm}x{panel.OutputHeightMm} mm.");
                }

                double panelWPt = panel.OutputWidthMm * MmToPt;
                double panelHPt = panel.OutputHeightMm * MmToPt;
                double cropXPt = panel.SourceXPositionMm * MmToPt;
                double cropYPt = panel.SourceYPositionMm * MmToPt;

                var fileName = FormatFileName(namingPattern, jobName, panel.Index);
                var tempPath = Path.Combine(outputDirectory, fileName + ".tmp");
                var finalPath = Path.Combine(outputDirectory, fileName);
                tempFiles.Add(tempPath);

                // Monta novo PDF para este painel
                var panelPdfContent = BuildPanelPdf(
                    srcMediaW,
                    srcMediaH,
                    resourcesText,
                    srcContents,
                    panel,
                    panelWPt,
                    panelHPt,
                    cropXPt,
                    cropYPt,
                    guidelines.FirstOrDefault(g => g.TargetPanelIndex == panel.Index));

                await File.WriteAllTextAsync(tempPath, panelPdfContent, Latin1, cancellationToken).ConfigureAwait(false);

                // Escrita atômica (Decisão 9)
                File.Move(tempPath, finalPath, overwrite: true);
                tempFiles.Remove(tempPath);
                generatedFiles.Add(finalPath);
            }

            return generatedFiles;
        }
        catch
        {
            // Limpa arquivos temporários parciais em caso de falha ou cancelamento
            foreach (var temp in tempFiles)
            {
                try { if (File.Exists(temp)) File.Delete(temp); } catch { }
            }
            throw;
        }
    }

    private static void ValidateNoRgb(string content)
    {
        // Passo 1: /DeviceRGB literal em /ColorSpace
        if (Regex.IsMatch(content, @"\/ColorSpace[\s\S]*?\/DeviceRGB"))
        {
            throw new ImpositionException(
                ErrorCodes.ExportSourceNotCmyk,
                "Espaço de cor /DeviceRGB detectado nos recursos do PDF. A exportação PDF/X-1a exige CMYK estrito (Regra R-020).");
        }

        // Passo 2: /ICCBased com /N 3 (3 canais = RGB)
        if (Regex.IsMatch(content, @"\/ICCBased[\s\S]*?\/N\s+3\b"))
        {
            throw new ImpositionException(
                ErrorCodes.ExportSourceNotCmyk,
                "Perfil ICC com 3 canais (RGB) detectado no PDF. A exportação PDF/X-1a exige CMYK estrito (Regra R-020).");
        }

        // Passo 3: Operadores de cor RGB (rg / RG) nos content streams
        // Procura padrão de 3 números seguidos por rg ou RG: "r g b rg" ou "r g b RG"
        if (Regex.IsMatch(content, @"(?<![a-zA-Z0-9_\/])(?:(?:\d+(?:\.\d+)?\s+){3}(?:rg|RG))\b"))
        {
            throw new ImpositionException(
                ErrorCodes.ExportSourceNotCmyk,
                "Operadores de cor DeviceRGB (rg/RG) detectados no content stream do PDF (Regra R-020).");
        }

        // Passo 4: Imagens raster com espaço de cor DeviceRGB
        if (Regex.IsMatch(content, @"\/Subtype\s*\/Image[\s\S]*?\/ColorSpace\s*\/DeviceRGB"))
        {
            throw new ImpositionException(
                ErrorCodes.ExportSourceNotCmyk,
                "Imagem raster embutida em espaço DeviceRGB detectada no PDF (Regra R-020).");
        }
    }

    private static string BuildPanelPdf(
        double srcMediaW,
        double srcMediaH,
        string resourcesText,
        string srcContents,
        PanelPlacement panel,
        double panelWPt,
        double panelHPt,
        double cropXPt,
        double cropYPt,
        GuideLineDefinition? guide)
    {
        var sb = new StringBuilder();
        sb.AppendLine("%PDF-1.3");
        sb.AppendLine("%%Comment: QDF 1.0");

        // Objeto 1: Catálogo
        sb.AppendLine("1 0 obj\n<<\n  /Type /Catalog\n  /Pages 2 0 R\n>>\nendobj");

        // Objeto 2: Árvore de Páginas
        sb.AppendLine("2 0 obj\n<<\n  /Type /Pages\n  /Count 1\n  /Kids [ 3 0 R ]\n>>\nendobj");

        // Objeto 5: Form XObject da arte original
        string formStream = srcContents.TrimEnd() + "\n";
        sb.AppendLine("5 0 obj");
        sb.AppendLine("<<");
        sb.AppendLine($"  /BBox [0 0 {N(srcMediaW)} {N(srcMediaH)}]");
        sb.AppendLine($"  /Length {Latin1.GetByteCount(formStream)}");
        sb.AppendLine($"  /Resources {resourcesText}");
        sb.AppendLine("  /Subtype /Form");
        sb.AppendLine("  /Type /XObject");
        sb.AppendLine(">>");
        sb.AppendLine("stream");
        sb.Append(formStream);
        sb.AppendLine("endstream");
        sb.AppendLine("endobj");

        // Objeto 4: Content Stream da página do painel
        var pageOps = new StringBuilder();
        pageOps.AppendLine("q");
        // Desloca arte para alinhar janela do painel na origem (0, 0)
        pageOps.AppendLine($"1 0 0 1 {N(-cropXPt)} {N(-cropYPt)} cm");
        pageOps.AppendLine("/Fm0 Do");
        pageOps.AppendLine("Q");

        // Injeta linha-guia se aplicável
        if (panel.HasGuideLine && guide != null)
        {
            var guideOps = PdfSeamGuideInjector.GenerateContentStream(guide, 0, 0);
            if (!string.IsNullOrWhiteSpace(guideOps))
            {
                pageOps.Append(guideOps);
            }
        }

        string pageStream = pageOps.ToString();
        sb.AppendLine("4 0 obj");
        sb.AppendLine("<<");
        sb.AppendLine($"  /Length {Latin1.GetByteCount(pageStream)}");
        sb.AppendLine(">>");
        sb.AppendLine("stream");
        sb.Append(pageStream);
        sb.AppendLine("endstream");
        sb.AppendLine("endobj");

        // Objeto 3: Página do Painel
        sb.AppendLine("3 0 obj");
        sb.AppendLine("<<");
        sb.AppendLine("  /Type /Page");
        sb.AppendLine("  /Parent 2 0 R");
        sb.AppendLine($"  /MediaBox [0 0 {N(panelWPt)} {N(panelHPt)}]");
        sb.AppendLine($"  /CropBox [0 0 {N(panelWPt)} {N(panelHPt)}]");
        sb.AppendLine("  /Contents 4 0 R");
        sb.AppendLine("  /Resources <<");
        sb.AppendLine("    /XObject <<");
        sb.AppendLine("      /Fm0 5 0 R");
        sb.AppendLine("    >>");
        sb.AppendLine("  >>");
        sb.AppendLine(">>");
        sb.AppendLine("endobj");

        // Tabela Xref simples
        sb.AppendLine("xref");
        sb.AppendLine("0 6");
        sb.AppendLine("0000000000 65535 f ");
        sb.AppendLine("0000000019 00000 n ");
        sb.AppendLine("0000000078 00000 n ");
        sb.AppendLine("0000000140 00000 n ");
        sb.AppendLine("0000000350 00000 n ");
        sb.AppendLine("0000000550 00000 n ");
        sb.AppendLine("trailer");
        sb.AppendLine("<<");
        sb.AppendLine("  /Root 1 0 R");
        sb.AppendLine("  /Size 6");
        sb.AppendLine(">>");
        sb.AppendLine("startxref");
        sb.AppendLine("800");
        sb.AppendLine("%%EOF");

        return sb.ToString();
    }

    private static (double Width, double Height) GetBoxDimensions(string dict, string boxName)
    {
        var match = Regex.Match(dict, $@"{boxName}\s*\[([^\]]+)\]");
        if (!match.Success)
            return (1000, 1000);

        var tokens = match.Groups[1].Value
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Select(s => double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var v) ? v : 0.0)
            .ToArray();

        if (tokens.Length >= 4)
        {
            return (Math.Abs(tokens[2] - tokens[0]), Math.Abs(tokens[3] - tokens[1]));
        }

        return (1000, 1000);
    }

    private static string ExtractResources(string pageDict)
    {
        var match = Regex.Match(pageDict, @"\/Resources\s*(<<[\s\S]*?>>)");
        if (match.Success)
            return match.Groups[1].Value;

        return "<< >>";
    }

    private static string ConcatContents(PdfObj page, List<PdfObj> allObjs)
    {
        var contentsMatch = Regex.Match(page.Dict, @"\/Contents\s+(\d+)\s+0\s+R");
        if (contentsMatch.Success && int.TryParse(contentsMatch.Groups[1].Value, out var contentsObjId))
        {
            var contentObj = allObjs.FirstOrDefault(o => o.Num == contentsObjId);
            if (contentObj?.Stream != null)
                return contentObj.Stream;
        }

        return string.Empty;
    }

    private static List<PdfObj> ParseObjects(string content)
    {
        var list = new List<PdfObj>();
        var matches = Regex.Matches(content, @"(\d+)\s+0\s+obj\b([\s\S]*?)endobj");

        foreach (Match m in matches)
        {
            int num = int.Parse(m.Groups[1].Value);
            string body = m.Groups[2].Value;

            string dict = string.Empty;
            string? stream = null;

            var streamIdx = body.IndexOf("stream");
            if (streamIdx >= 0)
            {
                dict = body.Substring(0, streamIdx).Trim();
                var endStreamIdx = body.IndexOf("endstream");
                if (endStreamIdx > streamIdx)
                {
                    stream = body.Substring(streamIdx + 6, endStreamIdx - (streamIdx + 6)).Trim('\r', '\n');
                }
            }
            else
            {
                dict = body.Trim();
            }

            list.Add(new PdfObj(num, dict, stream));
        }

        return list;
    }

    private static string FormatFileName(string pattern, string jobName, int index)
    {
        if (string.IsNullOrWhiteSpace(pattern))
            pattern = "{job}_painel_{index:D2}.pdf";

        return pattern
            .Replace("{job}", jobName)
            .Replace("{index:D2}", index.ToString("D2"))
            .Replace("{index}", index.ToString());
    }

    private static string N(double d)
    {
        if (Math.Abs(d) < 1e-6) return "0";
        var s = d.ToString(CultureInfo.InvariantCulture);
        if (s.Contains('E') || s.Contains('e'))
            return d.ToString("0.################", CultureInfo.InvariantCulture);
        return s;
    }
}
