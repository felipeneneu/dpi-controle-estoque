using System.Globalization;
using System.Text.RegularExpressions;
using Imposition.Core.Errors;

namespace Imposition.Pdf.Seams;

public sealed record PdfParsedObject(int Num, string Dict, string? Stream, string RawBody);

public sealed record ResolvedPageStructure(
    int PageObjNum,
    string PageDict,
    string ResourcesText,
    double MediaXPt,
    double MediaYPt,
    double MediaWidthPt,
    double MediaHeightPt,
    double CropXPt,
    double CropYPt,
    double CropWidthPt,
    double CropHeightPt,
    int RotateDegrees,
    IReadOnlyList<int> ContentStreamObjNums);

/// <summary>
/// Resolve estrutura, objetos, trailer e herança hierárquica (/Parent chain) de documentos PDF (ADR-060, R-023).
/// </summary>
public static class PdfStructureResolver
{
    private static readonly Regex ObjRegex = new(@"(\d+)\s+0\s+obj\b([\s\S]*?)endobj", RegexOptions.Compiled);
    private static readonly Regex TrailerSizeRegex = new(@"\/Size\s+(\d+)", RegexOptions.Compiled);
    private static readonly Regex StartXrefRegex = new(@"startxref\s+(\d+)", RegexOptions.Compiled | RegexOptions.RightToLeft);
    private static readonly Regex ParentRegex = new(@"\/Parent\s+(\d+)\s+0\s+R", RegexOptions.Compiled);
    private static readonly Regex RotateRegex = new(@"\/Rotate\s*(-?\d+)", RegexOptions.Compiled);
    private static readonly Regex ContentsArrayRegex = new(@"\/Contents\s*\[([^\]]+)\]", RegexOptions.Compiled);
    private static readonly Regex ContentsSingleRegex = new(@"\/Contents\s+(\d+)\s+0\s+R", RegexOptions.Compiled);
    private static readonly Regex ObjRefRegex = new(@"(\d+)\s+0\s+R", RegexOptions.Compiled);

    /// <summary>
    /// Extrai o /Size do trailer final do documento (ISO 32000-1 §7.5.5).
    /// Em arquivos com atualizações incrementais, o último trailer contém o /Size consolidado.
    /// </summary>
    public static int ResolveTrailerSize(string pdfContent)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(pdfContent);

        // Localiza os trailers a partir do final do arquivo
        var trailerMatches = Regex.Matches(pdfContent, @"trailer\s*<<([\s\S]*?)>>", RegexOptions.RightToLeft);
        if (trailerMatches.Count > 0)
        {
            foreach (Match tm in trailerMatches)
            {
                var sizeMatch = TrailerSizeRegex.Match(tm.Groups[1].Value);
                if (sizeMatch.Success && int.TryParse(sizeMatch.Groups[1].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var size))
                {
                    return size;
                }
            }
        }

        // Tenta buscar /Size próximo ao último startxref
        var lastStartXref = StartXrefRegex.Match(pdfContent);
        if (lastStartXref.Success)
        {
            var preXref = pdfContent.Substring(0, lastStartXref.Index);
            var sizeMatch = Regex.Match(preXref, @"\/Size\s+(\d+)", RegexOptions.RightToLeft);
            if (sizeMatch.Success && int.TryParse(sizeMatch.Groups[1].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var size))
            {
                return size;
            }
        }

        throw new ImpositionException(
            ErrorCodes.PdfInvalidTrailer,
            "Trailer do PDF não contém /Size válido (E_PDF_INVALID_TRAILER).");
    }

    /// <summary>
    /// Localiza o offset numérico do último startxref no PDF.
    /// </summary>
    public static long ResolveLastStartXref(string pdfContent)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(pdfContent);

        var match = StartXrefRegex.Match(pdfContent);
        if (match.Success && long.TryParse(match.Groups[1].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var offset))
        {
            return offset;
        }

        return 0;
    }

    /// <summary>
    /// Decompõe todos os objetos indiretos presentes no conteúdo textual/QDF do PDF.
    /// </summary>
    public static Dictionary<int, PdfParsedObject> ParseObjects(string pdfContent)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(pdfContent);

        var dict = new Dictionary<int, PdfParsedObject>();
        var matches = ObjRegex.Matches(pdfContent);

        foreach (Match m in matches)
        {
            if (!int.TryParse(m.Groups[1].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var num))
                continue;

            string body = m.Groups[2].Value;
            string objDict = string.Empty;
            string? stream = null;

            int streamIdx = body.IndexOf("stream", StringComparison.Ordinal);
            if (streamIdx >= 0)
            {
                objDict = body.Substring(0, streamIdx).Trim();
                int streamStart = streamIdx + 6;

                // Salta o marcador de fim de linha obrigatório após a palavra 'stream'
                if (streamStart + 1 < body.Length && body[streamStart] == '\r' && body[streamStart + 1] == '\n')
                {
                    streamStart += 2;
                }
                else if (streamStart < body.Length && (body[streamStart] == '\n' || body[streamStart] == '\r'))
                {
                    streamStart += 1;
                }

                int endStreamIdx = body.LastIndexOf("endstream", StringComparison.Ordinal);
                if (endStreamIdx >= streamStart)
                {
                    int streamEnd = endStreamIdx;
                    // Salta o marcador de fim de linha anterior a 'endstream'
                    if (streamEnd >= streamStart + 2 && body[streamEnd - 2] == '\r' && body[streamEnd - 1] == '\n')
                    {
                        streamEnd -= 2;
                    }
                    else if (streamEnd >= streamStart + 1 && (body[streamEnd - 1] == '\n' || body[streamEnd - 1] == '\r'))
                    {
                        streamEnd -= 1;
                    }

                    stream = body.Substring(streamStart, streamEnd - streamStart);
                }
            }
            else
            {
                objDict = body.Trim();
            }

            dict[num] = new PdfParsedObject(num, objDict, stream, body);
        }

        return dict;
    }

    /// <summary>
    /// Extrai um dicionário PDF balanceado "<< ... >>" a partir do índice especificado.
    /// Suporta dicionários aninhados rastreando balanceamento de '<<' e '>>'.
    /// </summary>
    public static string? ExtractBalancedDictionary(string text, int startIndex)
    {
        if (string.IsNullOrEmpty(text) || startIndex < 0 || startIndex >= text.Length)
            return null;

        int firstOpen = text.IndexOf("<<", startIndex, StringComparison.Ordinal);
        if (firstOpen < 0)
            return null;

        int depth = 0;
        int i = firstOpen;
        bool inString = false;
        int stringParenDepth = 0;

        while (i < text.Length)
        {
            // Trata comentários PDF iniciados por '%'
            if (!inString && text[i] == '%')
            {
                i++;
                while (i < text.Length && text[i] != '\r' && text[i] != '\n')
                {
                    i++;
                }
                continue;
            }

            // Trata strings literais PDF ( ... ) com suporte a parênteses aninhados e escape
            if (!inString && text[i] == '(')
            {
                inString = true;
                stringParenDepth = 1;
                i++;
                continue;
            }
            else if (inString)
            {
                if (text[i] == '\\')
                {
                    i += 2;
                    continue;
                }
                if (text[i] == '(')
                {
                    stringParenDepth++;
                }
                else if (text[i] == ')')
                {
                    stringParenDepth--;
                    if (stringParenDepth == 0)
                    {
                        inString = false;
                    }
                }
                i++;
                continue;
            }

            // Trata strings hexadecimais PDF < ... >
            if (!inString && text[i] == '<')
            {
                if (i + 1 < text.Length && text[i + 1] == '<')
                {
                    depth++;
                    i += 2;
                    continue;
                }
                else
                {
                    i++;
                    while (i < text.Length && text[i] != '>')
                    {
                        i++;
                    }
                    if (i < text.Length && text[i] == '>')
                    {
                        i++;
                    }
                    continue;
                }
            }

            // Delimitador de fechamento de dicionário
            if (i + 1 < text.Length && text[i] == '>' && text[i + 1] == '>')
            {
                depth--;
                i += 2;
                if (depth == 0)
                {
                    return text.Substring(firstOpen, i - firstOpen);
                }
                continue;
            }

            i++;
        }

        return null;
    }

    /// <summary>
    /// Extrai a string de recursos (/Resources) subindo recursivamente a hierarquia /Parent (R-023).
    /// Retorna ou a referência indireta "N 0 R" ou o dicionário "<< ... >>".
    /// </summary>
    public static string ResolveResources(
        PdfParsedObject pageObj,
        IReadOnlyDictionary<int, PdfParsedObject> objects)
    {
        ArgumentNullException.ThrowIfNull(pageObj);
        ArgumentNullException.ThrowIfNull(objects);

        var current = pageObj;
        var visited = new HashSet<int>();

        while (current != null && visited.Add(current.Num))
        {
            // 1. Recursos indiretos (ex.: /Resources 5 0 R)
            var indirectMatch = Regex.Match(current.Dict, @"\/Resources\s+(\d+\s+0\s+R)");
            if (indirectMatch.Success)
            {
                return indirectMatch.Groups[1].Value;
            }

            // 2. Recursos inline com dicionários aninhados (ex.: /Resources << /XObject << ... >> >>)
            var inlineMatch = Regex.Match(current.Dict, @"\/Resources\s*<<");
            if (inlineMatch.Success)
            {
                int openIdx = current.Dict.IndexOf("<<", inlineMatch.Index, StringComparison.Ordinal);
                if (openIdx >= 0)
                {
                    var dictStr = ExtractBalancedDictionary(current.Dict, openIdx);
                    if (dictStr != null)
                    {
                        return dictStr;
                    }
                }
            }

            // 3. Sobe a cadeia /Parent (Regra R-023)
            var parentMatch = ParentRegex.Match(current.Dict);
            if (parentMatch.Success && int.TryParse(parentMatch.Groups[1].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parentId)
                && objects.TryGetValue(parentId, out var parentObj))
            {
                current = parentObj;
            }
            else
            {
                break;
            }
        }

        return "<< >>";
    }

    /// <summary>
    /// Extrai o ângulo de rotação (/Rotate) em graus subindo a hierarquia /Parent (R-023).
    /// </summary>
    public static int ResolveRotate(
        PdfParsedObject pageObj,
        IReadOnlyDictionary<int, PdfParsedObject> objects)
    {
        ArgumentNullException.ThrowIfNull(pageObj);
        ArgumentNullException.ThrowIfNull(objects);

        var current = pageObj;
        var visited = new HashSet<int>();

        while (current != null && visited.Add(current.Num))
        {
            var match = RotateRegex.Match(current.Dict);
            if (match.Success && int.TryParse(match.Groups[1].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var rot))
            {
                return ((rot % 360) + 360) % 360;
            }

            var parentMatch = ParentRegex.Match(current.Dict);
            if (parentMatch.Success && int.TryParse(parentMatch.Groups[1].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parentId)
                && objects.TryGetValue(parentId, out var parentObj))
            {
                current = parentObj;
            }
            else
            {
                break;
            }
        }

        return 0;
    }

    /// <summary>
    /// Resolve dimensões de caixa delimitadora (/MediaBox, /CropBox) com resolução de herança /Parent (R-023).
    /// </summary>
    public static (double X, double Y, double Width, double Height) ResolveBox(
        PdfParsedObject pageObj,
        string boxName,
        IReadOnlyDictionary<int, PdfParsedObject> objects)
    {
        ArgumentNullException.ThrowIfNull(pageObj);
        ArgumentException.ThrowIfNullOrWhiteSpace(boxName);
        ArgumentNullException.ThrowIfNull(objects);

        var current = pageObj;
        var visited = new HashSet<int>();

        while (current != null && visited.Add(current.Num))
        {
            var match = Regex.Match(current.Dict, $@"{boxName}\s*\[([^\]]+)\]");
            if (match.Success)
            {
                var tokens = match.Groups[1].Value
                    .Split(' ', StringSplitOptions.RemoveEmptyEntries)
                    .Select(s => double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var v) ? v : 0.0)
                    .ToArray();

                if (tokens.Length >= 4)
                {
                    double x0 = tokens[0];
                    double y0 = tokens[1];
                    double x1 = tokens[2];
                    double y1 = tokens[3];

                    return (Math.Min(x0, x1), Math.Min(y0, y1), Math.Abs(x1 - x0), Math.Abs(y1 - y0));
                }
            }

            var parentMatch = ParentRegex.Match(current.Dict);
            if (parentMatch.Success && int.TryParse(parentMatch.Groups[1].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parentId)
                && objects.TryGetValue(parentId, out var parentObj))
            {
                current = parentObj;
            }
            else
            {
                break;
            }
        }

        // Se CropBox não foi encontrado em nenhum nó ancestral, faz fallback para MediaBox
        if (boxName.Equals("/CropBox", StringComparison.OrdinalIgnoreCase))
        {
            return ResolveBox(pageObj, "/MediaBox", objects);
        }

        return (0, 0, 1000, 1000);
    }

    /// <summary>
    /// Valida que o PDF é single-page e extrai sua estrutura completa com herança resolvida.
    /// Lança E_PDF_MULTI_PAGE_UNSUPPORTED se houver mais de uma página.
    /// </summary>
    public static ResolvedPageStructure ResolveSinglePage(
        string pdfContent,
        IReadOnlyDictionary<int, PdfParsedObject> objects)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(pdfContent);
        ArgumentNullException.ThrowIfNull(objects);

        // Validação de contagem total em nós /Pages
        var pagesNodes = objects.Values.Where(o => Regex.IsMatch(o.Dict, @"\/Type\s*\/Pages\b")).ToList();
        foreach (var pNode in pagesNodes)
        {
            var countMatch = Regex.Match(pNode.Dict, @"\/Count\s+(\d+)");
            if (countMatch.Success && int.TryParse(countMatch.Groups[1].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var count) && count > 1)
            {
                throw new ImpositionException(
                    ErrorCodes.PdfMultiPageUnsupported,
                    $"PDF multipágina não suportado no MVP (E_PDF_MULTI_PAGE_UNSUPPORTED): /Pages declara {count} páginas.");
            }
        }

        var pageObjects = objects.Values.Where(o => Regex.IsMatch(o.Dict, @"\/Type\s*\/Page\b")).ToList();
        if (pageObjects.Count > 1)
        {
            throw new ImpositionException(
                ErrorCodes.PdfMultiPageUnsupported,
                $"PDF multipágina não suportado no MVP (E_PDF_MULTI_PAGE_UNSUPPORTED): encontrados {pageObjects.Count} objetos /Page.");
        }

        if (pageObjects.Count == 0)
        {
            throw new InvalidOperationException("Nenhuma página encontrada no PDF fonte.");
        }

        var pageObj = pageObjects[0];

        var mediaBox = ResolveBox(pageObj, "/MediaBox", objects);
        var cropBox = ResolveBox(pageObj, "/CropBox", objects);
        int rotate = ResolveRotate(pageObj, objects);
        string resourcesText = ResolveResources(pageObj, objects);

        // Extrai streams de conteúdo
        var contentStreamObjNums = new List<int>();
        var contentsArrayMatch = ContentsArrayRegex.Match(pageObj.Dict);
        if (contentsArrayMatch.Success)
        {
            var refs = ObjRefRegex.Matches(contentsArrayMatch.Groups[1].Value);
            foreach (Match rm in refs)
            {
                if (int.TryParse(rm.Groups[1].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var id))
                {
                    contentStreamObjNums.Add(id);
                }
            }
        }
        else
        {
            var contentsSingleMatch = ContentsSingleRegex.Match(pageObj.Dict);
            if (contentsSingleMatch.Success && int.TryParse(contentsSingleMatch.Groups[1].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var id))
            {
                contentStreamObjNums.Add(id);
            }
        }

        return new ResolvedPageStructure(
            PageObjNum: pageObj.Num,
            PageDict: pageObj.Dict,
            ResourcesText: resourcesText,
            MediaXPt: mediaBox.X,
            MediaYPt: mediaBox.Y,
            MediaWidthPt: mediaBox.Width,
            MediaHeightPt: mediaBox.Height,
            CropXPt: cropBox.X,
            CropYPt: cropBox.Y,
            CropWidthPt: cropBox.Width,
            CropHeightPt: cropBox.Height,
            RotateDegrees: rotate,
            ContentStreamObjNums: contentStreamObjNums);
    }
}
