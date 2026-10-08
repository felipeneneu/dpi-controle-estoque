using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Imposition.Core.Errors;
using Imposition.Core.Seams;

namespace Imposition.Pdf.Seams;

/// <summary>
/// Subdivide arquivos PDF em múltiplos painéis contíguos preservando 100% dos dados vetoriais, imagens e fontes
/// através de Form XObject (/FmOriginal) e atualização incremental ISO 32000 (ADR-060, BR-055, Regras R-022 e R-023).
/// </summary>
public sealed class QdfPanelSplitter
{
    private static readonly Encoding Latin1 = Encoding.GetEncoding(28591);
    private const double MmToPt = 72.0 / 25.4;
    private const long LargePanelThresholdBytes = 524_288_000; // 500 MB

    public Task<IReadOnlyList<string>> SplitAsync(
        string sourcePdfPath,
        SeamsResult seams,
        string outputDirectory,
        string namingPattern,
        CancellationToken cancellationToken = default)
    {
        return SplitAsync(sourcePdfPath, seams, outputDirectory, namingPattern, guideConfig: null, cancellationToken);
    }

    public async Task<IReadOnlyList<string>> SplitAsync(
        string sourcePdfPath,
        SeamsResult seams,
        string outputDirectory,
        string namingPattern,
        GuideLineConfig? guideConfig,
        CancellationToken cancellationToken = default)
    {
        var metadata = await SplitWithMetadataAsync(
            sourcePdfPath,
            seams,
            outputDirectory,
            namingPattern,
            guideConfig,
            cancellationToken).ConfigureAwait(false);

        return metadata.GeneratedFiles;
    }

    /// <summary>
    /// Fatiamento vetorial completo com retorno de metadados estruturados (ADR-060).
    /// Executa 3 estágios: 1. Pré-Vôo Estrito, 2. Resolução Estrutural e 3. Emissão Incremental.
    /// </summary>
    public async Task<PanelSplitMetadata> SplitWithMetadataAsync(
        string sourcePdfPath,
        SeamsResult seams,
        string outputDirectory,
        string namingPattern,
        GuideLineConfig? guideConfig = null,
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

        var fileInfo = new FileInfo(sourcePdfPath);
        long sourceLength = fileInfo.Length;

        // Leitura do conteúdo para parsing estrutural
        var fileBytes = await File.ReadAllBytesAsync(sourcePdfPath, cancellationToken).ConfigureAwait(false);
        var content = Latin1.GetString(fileBytes);

        // ==========================================
        // ESTÁGIO 1: Pré-Vôo e Validação Estrita (Fail-Fast)
        // ==========================================
        ExecuteStrictPreflight(content);

        // ==========================================
        // ESTÁGIO 2: Resolução de Estrutura e Encapsulamento
        // ==========================================
        int origSize = PdfStructureResolver.ResolveTrailerSize(content);
        long prevXrefOffset = PdfStructureResolver.ResolveLastStartXref(content);
        var objects = PdfStructureResolver.ParseObjects(content);
        var pageStruct = PdfStructureResolver.ResolveSinglePage(content, objects);

        double sourceWPt = pageStruct.MediaWidthPt;
        double sourceHPt = pageStruct.MediaHeightPt;
        int rotate = pageStruct.RotateDegrees;

        // Constrói o Form XObject (/FmOriginal) preservando streams verbatim e gerando wrappers se multi-stream
        var formDef = FormXObjectBuilder.BuildFormXObject(
            startNewObjId: origSize,
            sourceWidthPt: sourceWPt,
            sourceHeightPt: sourceHPt,
            resourcesText: pageStruct.ResourcesText,
            contentStreamObjNums: pageStruct.ContentStreamObjNums,
            objects: objects);

        var guidelines = GuideLineCalculator.Calculate(seams, guideConfig);
        var jobName = Path.GetFileNameWithoutExtension(sourcePdfPath);

        var generatedFiles = new List<string>(seams.Panels.Count);
        var fileSizes = new List<long>(seams.Panels.Count);
        var warnings = new List<string>();
        var tempFiles = new List<string>(seams.Panels.Count);

        if (rotate != 0)
        {
            warnings.Add($"PDF fonte possui rotação de {rotate}° herdada na hierarquia de páginas.");
        }

        // ==========================================
        // ESTÁGIO 3: Emissão Incremental por Painel
        // ==========================================
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

                var guide = guidelines.FirstOrDefault(g => g.TargetPanelIndex == panel.Index);

                // Monta os bytes da seção incremental do painel
                var incrementalSection = BuildIncrementalSection(
                    sourceLength,
                    origSize,
                    prevXrefOffset,
                    formDef,
                    panel,
                    panelWPt,
                    panelHPt,
                    cropXPt,
                    cropYPt,
                    rotate,
                    guide);

                // Grava arquivo: clone verbatim do source + append incremental
                await using (var fs = new FileStream(tempPath, FileMode.Create, FileAccess.Write, FileShare.None, 1024 * 1024, useAsync: true))
                {
                    await fs.WriteAsync(fileBytes, cancellationToken).ConfigureAwait(false);
                    var incBytes = Latin1.GetBytes(incrementalSection);
                    await fs.WriteAsync(incBytes, cancellationToken).ConfigureAwait(false);
                    await fs.FlushAsync(cancellationToken).ConfigureAwait(false);
                }

                // Escrita atômica (Decisão 9)
                File.Move(tempPath, finalPath, overwrite: true);
                tempFiles.Remove(tempPath);

                var outInfo = new FileInfo(finalPath);
                generatedFiles.Add(finalPath);
                fileSizes.Add(outInfo.Length);

                if (outInfo.Length > LargePanelThresholdBytes)
                {
                    warnings.Add($"Painel {panel.Index} ({fileName}) possui tamanho de {outInfo.Length / (1024.0 * 1024.0):N1} MB, excedendo o limiar de 500 MB.");
                }
            }

            return new PanelSplitMetadata(generatedFiles, fileSizes, warnings);
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

    private static void ExecuteStrictPreflight(string content)
    {
        // 1. Validação de OCG (Decisão 8 da ADR-060)
        if (content.Contains("/OCProperties") || content.Contains("/OCGs"))
        {
            throw new ImpositionException(
                ErrorCodes.SourceHasOcg,
                "PDF fonte possui camadas OCG (/OCProperties ou /OCGs), o que viola a especificação PDF/X-1a (ISO 15930-1). O arquivo deve ser achatado antes da exportação.");
        }

        // 2. Validação de RGB em 4 etapas (Regra R-020)
        ValidateNoRgb(content);

        // 3. Validação de Transparência Não-Achatada
        if (Regex.IsMatch(content, @"\/Group\s*<<[\s\S]*?\/S\s*\/Transparency"))
        {
            throw new ImpositionException(
                ErrorCodes.PdfTransparencyUnsupported,
                "PDF fonte possui transparência não-achatada (/Group << /S /Transparency ... >>), não suportada no PDF/X-1a (E_PDF_TRANSPARENCY_UNSUPPORTED). O arquivo deve ser achatado previamente.");
        }

        // 4. Validação de UserUnit
        var userUnitMatch = Regex.Match(content, @"\/UserUnit\s+([0-9]+(?:\.[0-9]+)?)");
        if (userUnitMatch.Success && double.TryParse(userUnitMatch.Groups[1].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var userUnit))
        {
            if (Math.Abs(userUnit - 1.0) > 1e-4)
            {
                throw new ImpositionException(
                    ErrorCodes.PdfUserUnitUnsupported,
                    $"PDF fonte utiliza escala /UserUnit personalizada ({userUnit}), não suportada no pipeline de emendas (E_PDF_USERUNIT_UNSUPPORTED).");
            }
        }
    }

    private static void ValidateNoRgb(string content)
    {
        if (Regex.IsMatch(content, @"\/ColorSpace[\s\S]*?\/DeviceRGB"))
        {
            throw new ImpositionException(
                ErrorCodes.ExportSourceNotCmyk,
                "Espaço de cor /DeviceRGB detectado nos recursos do PDF. A exportação PDF/X-1a exige CMYK estrito (Regra R-020).");
        }

        if (Regex.IsMatch(content, @"\/ICCBased[\s\S]*?\/N\s+3\b"))
        {
            throw new ImpositionException(
                ErrorCodes.ExportSourceNotCmyk,
                "Perfil ICC com 3 canais (RGB) detectado no PDF. A exportação PDF/X-1a exige CMYK estrito (Regra R-020).");
        }

        if (Regex.IsMatch(content, @"(?<![a-zA-Z0-9_\/])(?:(?:\d+(?:\.\d+)?\s+){3}(?:rg|RG))\b"))
        {
            throw new ImpositionException(
                ErrorCodes.ExportSourceNotCmyk,
                "Operadores de cor DeviceRGB (rg/RG) detectados no content stream do PDF (Regra R-020).");
        }

        if (Regex.IsMatch(content, @"\/Subtype\s*\/Image[\s\S]*?\/ColorSpace\s*\/DeviceRGB"))
        {
            throw new ImpositionException(
                ErrorCodes.ExportSourceNotCmyk,
                "Imagem raster embutida em espaço DeviceRGB detectada no PDF (Regra R-020).");
        }
    }

    private static string BuildIncrementalSection(
        long sourceLength,
        int origSize,
        long prevXrefOffset,
        FormXObjectDefinition formDef,
        PanelPlacement panel,
        double panelWPt,
        double panelHPt,
        double cropXPt,
        double cropYPt,
        int rotate,
        GuideLineDefinition? guide)
    {
        var sb = new StringBuilder();
        var newOffsets = new Dictionary<int, long>();

        long currentOffset = sourceLength;
        sb.Append("\n");
        currentOffset += Latin1.GetByteCount("\n");

        // 1. Sub-forms (se houver múltiplos streams no source)
        foreach (var sub in formDef.SubFormObjects)
        {
            newOffsets[sub.ObjNum] = currentOffset;
            sb.Append(sub.ObjectText);
            if (!sub.ObjectText.EndsWith('\n'))
                sb.Append("\n");
            currentOffset = sourceLength + Latin1.GetByteCount(sb.ToString());
        }

        // 2. Form XObject original (/FmOriginal)
        newOffsets[formDef.FormObjNum] = currentOffset;
        sb.Append(formDef.FormObjectText);
        if (!formDef.FormObjectText.EndsWith('\n'))
            sb.Append("\n");
        currentOffset = sourceLength + Latin1.GetByteCount(sb.ToString());

        // IDs dos novos objetos do painel
        int nextObjId = formDef.FormObjNum + 1;
        int panelContentObjId = nextObjId++;
        int panelPageObjId = nextObjId++;
        int panelPagesObjId = nextObjId++;
        int panelCatalogObjId = nextObjId++;

        // 3. Content stream da página do painel
        var pageOps = new StringBuilder();
        pageOps.AppendLine("q");
        // Translação: desloca arte para alinhar a janela deste painel na origem (0, 0)
        pageOps.AppendLine($"1 0 0 1 {N(-cropXPt)} {N(-cropYPt)} cm");
        pageOps.AppendLine("/Fm0 Do");
        pageOps.AppendLine("Q");

        if (panel.HasGuideLine && guide != null)
        {
            var guideOps = PdfSeamGuideInjector.GenerateContentStream(guide, 0, 0);
            if (!string.IsNullOrWhiteSpace(guideOps))
            {
                pageOps.Append(guideOps);
                if (!guideOps.EndsWith('\n'))
                    pageOps.AppendLine();
            }
        }

        string pageStream = pageOps.ToString();
        var contentObjSb = new StringBuilder();
        contentObjSb.AppendLine($"{panelContentObjId} 0 obj");
        contentObjSb.AppendLine("<<");
        contentObjSb.AppendLine($"  /Length {Latin1.GetByteCount(pageStream)}");
        contentObjSb.AppendLine(">>");
        contentObjSb.AppendLine("stream");
        contentObjSb.Append(pageStream);
        if (!pageStream.EndsWith('\n'))
            contentObjSb.AppendLine();
        contentObjSb.AppendLine("endstream");
        contentObjSb.AppendLine("endobj");

        newOffsets[panelContentObjId] = currentOffset;
        sb.Append(contentObjSb.ToString());
        currentOffset = sourceLength + Latin1.GetByteCount(sb.ToString());

        // 4. Nova página do painel
        var pageObjSb = new StringBuilder();
        pageObjSb.AppendLine($"{panelPageObjId} 0 obj");
        pageObjSb.AppendLine("<<");
        pageObjSb.AppendLine("  /Type /Page");
        pageObjSb.AppendLine($"  /Parent {panelPagesObjId} 0 R");
        pageObjSb.AppendLine($"  /MediaBox [0 0 {N(panelWPt)} {N(panelHPt)}]");
        pageObjSb.AppendLine($"  /CropBox [0 0 {N(panelWPt)} {N(panelHPt)}]");
        if (rotate != 0)
        {
            pageObjSb.AppendLine($"  /Rotate {rotate}");
        }
        pageObjSb.AppendLine($"  /Contents {panelContentObjId} 0 R");
        pageObjSb.AppendLine("  /Resources <<");
        pageObjSb.AppendLine("    /XObject <<");
        pageObjSb.AppendLine($"      /Fm0 {formDef.FormObjNum} 0 R");
        pageObjSb.AppendLine($"      /FmOriginal {formDef.FormObjNum} 0 R");
        pageObjSb.AppendLine("    >>");
        pageObjSb.AppendLine("  >>");
        pageObjSb.AppendLine(">>");
        pageObjSb.AppendLine("endobj");

        newOffsets[panelPageObjId] = currentOffset;
        sb.Append(pageObjSb.ToString());
        currentOffset = sourceLength + Latin1.GetByteCount(sb.ToString());

        // 5. Nova árvore de páginas
        var pagesObjSb = new StringBuilder();
        pagesObjSb.AppendLine($"{panelPagesObjId} 0 obj");
        pagesObjSb.AppendLine("<<");
        pagesObjSb.AppendLine("  /Type /Pages");
        pagesObjSb.AppendLine("  /Count 1");
        pagesObjSb.AppendLine($"  /Kids [ {panelPageObjId} 0 R ]");
        pagesObjSb.AppendLine(">>");
        pagesObjSb.AppendLine("endobj");

        newOffsets[panelPagesObjId] = currentOffset;
        sb.Append(pagesObjSb.ToString());
        currentOffset = sourceLength + Latin1.GetByteCount(sb.ToString());

        // 6. Novo Catálogo
        var catalogObjSb = new StringBuilder();
        catalogObjSb.AppendLine($"{panelCatalogObjId} 0 obj");
        catalogObjSb.AppendLine("<<");
        catalogObjSb.AppendLine("  /Type /Catalog");
        catalogObjSb.AppendLine($"  /Pages {panelPagesObjId} 0 R");
        catalogObjSb.AppendLine(">>");
        catalogObjSb.AppendLine("endobj");

        newOffsets[panelCatalogObjId] = currentOffset;
        sb.Append(catalogObjSb.ToString());
        currentOffset = sourceLength + Latin1.GetByteCount(sb.ToString());

        // 7. Tabela Xref Incremental
        long xrefOffset = currentOffset;
        sb.AppendLine("xref");

        var sortedIds = newOffsets.Keys.OrderBy(k => k).ToList();
        int firstId = sortedIds.First();
        int lastId = sortedIds.Last();
        int count = lastId - firstId + 1;

        sb.AppendLine($"{firstId} {count}");
        for (int id = firstId; id <= lastId; id++)
        {
            if (newOffsets.TryGetValue(id, out var off))
            {
                sb.AppendLine($"{off:D10} 00000 n ");
            }
            else
            {
                sb.AppendLine("0000000000 65535 f ");
            }
        }

        sb.AppendLine("trailer");
        sb.AppendLine("<<");
        sb.AppendLine($"  /Root {panelCatalogObjId} 0 R");
        sb.AppendLine($"  /Size {Math.Max(origSize, lastId + 1)}");
        if (prevXrefOffset > 0)
        {
            sb.AppendLine($"  /Prev {prevXrefOffset}");
        }
        sb.AppendLine(">>");
        sb.AppendLine("startxref");
        sb.AppendLine(xrefOffset.ToString(CultureInfo.InvariantCulture));
        sb.AppendLine("%%EOF");

        return sb.ToString();
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
