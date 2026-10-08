using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace Imposition.Pdf.Seams;

public sealed record FormXObjectDefinition(
    int FormObjNum,
    string FormObjectText,
    IReadOnlyList<(int ObjNum, string ObjectText)> SubFormObjects);

/// <summary>
/// Construtor de Form XObjects (/FmOriginal) para encapsulamento de arte PDF original (ADR-060, R-022).
/// Suporta streams individuais com preservação verbatim de filtros e multi-stream wrappers unificadores.
/// </summary>
public static class FormXObjectBuilder
{
    private static readonly Encoding Latin1 = Encoding.GetEncoding(28591);

    public static FormXObjectDefinition BuildFormXObject(
        int startNewObjId,
        double sourceWidthPt,
        double sourceHeightPt,
        string resourcesText,
        IReadOnlyList<int> contentStreamObjNums,
        IReadOnlyDictionary<int, PdfParsedObject> objects)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(startNewObjId);
        ArgumentNullException.ThrowIfNull(resourcesText);
        ArgumentNullException.ThrowIfNull(contentStreamObjNums);
        ArgumentNullException.ThrowIfNull(objects);

        string bboxStr = $"[0 0 {N(sourceWidthPt)} {N(sourceHeightPt)}]";

        // Caso 1: Array vazio de conteúdo (página em branco)
        if (contentStreamObjNums.Count == 0)
        {
            var emptyForm = $"{startNewObjId} 0 obj\n<<\n  /Type /XObject\n  /Subtype /Form\n  /BBox {bboxStr}\n  /Resources {resourcesText}\n  /Length 0\n>>\nstream\n\nendstream\nendobj\n";
            return new FormXObjectDefinition(startNewObjId, emptyForm, Array.Empty<(int, string)>());
        }

        // Caso 2: Stream único (Photoshop, CorelDRAW, banners típicos)
        if (contentStreamObjNums.Count == 1)
        {
            int streamId = contentStreamObjNums[0];
            objects.TryGetValue(streamId, out var streamObj);

            string streamData = streamObj?.Stream ?? string.Empty;
            string streamDict = streamObj?.Dict ?? string.Empty;

            var extraDictEntries = ExtractFilterAndDecodeParms(streamDict);

            var sb = new StringBuilder();
            sb.AppendLine($"{startNewObjId} 0 obj");
            sb.AppendLine("<<");
            sb.AppendLine("  /Type /XObject");
            sb.AppendLine("  /Subtype /Form");
            sb.AppendLine($"  /BBox {bboxStr}");
            sb.AppendLine($"  /Resources {resourcesText}");
            if (!string.IsNullOrWhiteSpace(extraDictEntries))
            {
                sb.AppendLine(extraDictEntries);
            }
            sb.AppendLine($"  /Length {Latin1.GetByteCount(streamData)}");
            sb.AppendLine(">>");
            sb.AppendLine("stream");
            sb.Append(streamData);
            if (!streamData.EndsWith('\n'))
                sb.AppendLine();
            sb.AppendLine("endstream");
            sb.AppendLine("endobj");

            return new FormXObjectDefinition(startNewObjId, sb.ToString(), Array.Empty<(int, string)>());
        }

        // Caso 3: Múltiplos streams de conteúdo (InDesign, Illustrator)
        // Cada stream torna-se um sub-form e o /FmOriginal atua como container
        var subForms = new List<(int ObjNum, string ObjectText)>();
        var containerOps = new StringBuilder();
        var xobjectDictEntries = new StringBuilder();

        for (int i = 0; i < contentStreamObjNums.Count; i++)
        {
            int subFormObjNum = startNewObjId + i;
            string subFormName = $"/SubFm{i + 1}";
            int streamId = contentStreamObjNums[i];
            objects.TryGetValue(streamId, out var streamObj);

            string streamData = streamObj?.Stream ?? string.Empty;
            string streamDict = streamObj?.Dict ?? string.Empty;
            var extraDictEntries = ExtractFilterAndDecodeParms(streamDict);

            var subSb = new StringBuilder();
            subSb.AppendLine($"{subFormObjNum} 0 obj");
            subSb.AppendLine("<<");
            subSb.AppendLine("  /Type /XObject");
            subSb.AppendLine("  /Subtype /Form");
            subSb.AppendLine($"  /BBox {bboxStr}");
            subSb.AppendLine($"  /Resources {resourcesText}");
            if (!string.IsNullOrWhiteSpace(extraDictEntries))
            {
                subSb.AppendLine(extraDictEntries);
            }
            subSb.AppendLine($"  /Length {Latin1.GetByteCount(streamData)}");
            subSb.AppendLine(">>");
            subSb.AppendLine("stream");
            subSb.Append(streamData);
            if (!streamData.EndsWith('\n'))
                subSb.AppendLine();
            subSb.AppendLine("endstream");
            subSb.AppendLine("endobj");

            subForms.Add((subFormObjNum, subSb.ToString()));

            xobjectDictEntries.AppendLine($"      {subFormName} {subFormObjNum} 0 R");
            containerOps.AppendLine($"q {subFormName} Do Q");
        }

        int containerObjNum = startNewObjId + contentStreamObjNums.Count;
        string containerStream = containerOps.ToString();

        var containerSb = new StringBuilder();
        containerSb.AppendLine($"{containerObjNum} 0 obj");
        containerSb.AppendLine("<<");
        containerSb.AppendLine("  /Type /XObject");
        containerSb.AppendLine("  /Subtype /Form");
        containerSb.AppendLine($"  /BBox {bboxStr}");
        containerSb.AppendLine("  /Resources <<");
        containerSb.AppendLine("    /XObject <<");
        containerSb.Append(xobjectDictEntries);
        containerSb.AppendLine("    >>");
        containerSb.AppendLine("  >>");
        containerSb.AppendLine($"  /Length {Latin1.GetByteCount(containerStream)}");
        containerSb.AppendLine(">>");
        containerSb.AppendLine("stream");
        containerSb.Append(containerStream);
        containerSb.AppendLine("endstream");
        containerSb.AppendLine("endobj");

        return new FormXObjectDefinition(containerObjNum, containerSb.ToString(), subForms);
    }

    private static string ExtractFilterAndDecodeParms(string streamDict)
    {
        if (string.IsNullOrWhiteSpace(streamDict))
            return string.Empty;

        var sb = new StringBuilder();

        var filterMatch = Regex.Match(streamDict, @"\/Filter\s+(\/[a-zA-Z0-9_]+|\[[^\]]+\])");
        if (filterMatch.Success)
        {
            sb.AppendLine($"  /Filter {filterMatch.Groups[1].Value}");
        }

        var decodeParmsMatch = Regex.Match(streamDict, @"\/DecodeParms\s*(<<[\s\S]*?>>|\[[\s\S]*?\]|\d+\s+0\s+R)");
        if (decodeParmsMatch.Success)
        {
            sb.AppendLine($"  /DecodeParms {decodeParmsMatch.Groups[1].Value}");
        }

        return sb.ToString().TrimEnd();
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
