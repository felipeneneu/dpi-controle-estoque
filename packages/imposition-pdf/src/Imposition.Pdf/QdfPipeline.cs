using System.Text;
using System.Text.RegularExpressions;
using Imposition.Pdf.Contracts;

namespace Imposition.Pdf;

internal static class QdfPipeline
{
    private static readonly Encoding Latin1 = Encoding.GetEncoding(28591);
    private sealed record PdfObj(int Num, int StartLine, int EndObjLine, string Dict, string? Stream);

    public static string ApplyNup(string qdfPath, ImposeOptions options)
    {
        var editedPath = qdfPath + ".edited.qdf";
        var text = File.ReadAllText(qdfPath, Latin1).Replace("\r\n", "\n");
        var lines = new List<string>(text.Split('\n'));
        var objs = ParseObjects(lines);

        var pages = objs.Where(o => Regex.IsMatch(o.Dict, @"\/Type\s*/Page\b")).OrderBy(o => o.Num).ToList();
        if (pages.Count == 0) throw new InvalidOperationException("Nenhuma pǭgina encontrada no QDF.");

        double pw = GetMediaBoxWidth(pages[0].Dict), ph = GetMediaBoxHeight(pages[0].Dict);
        
        double pt = 72.0 / 25.4;

        // Expansão do MediaBox para acomodar marcas (em mm → pt)
        var (expandWMm, expandHMm) = MarksRenderer.GetMarksExpansion(options.Marks);
        double expandWPt = expandWMm * pt;
        double expandHPt = expandHMm * pt;

        double sheetW = options.SheetWMm * pt + expandWPt;
        double sheetH = options.SheetHMm * pt + expandHPt;

        // Offset da grade para centralizar dentro do MediaBox expandido
        double marksOffsetPt = expandWPt / 2.0;
        double marksOffsetYPt = expandHPt / 2.0;

        double startX = options.StartXMm * pt + marksOffsetPt;
        double startY = options.StartYMm * pt + marksOffsetYPt;
        double stepX  = options.StepXMm * pt;
        double stepY  = options.StepYMm * pt;

        int baseNum = objs.Max(o => o.Num) + 1;
        var sb = new StringBuilder();
        var sheetOps = new StringBuilder();

        int formNum = baseNum;
        int contentNum = baseNum + 1;
        int sheetPageNum = baseNum + 2;

        var src = pages[0]; // always use first page
        string contentBytes = ConcatContents(src, objs);
        string resourcesText = GetResourcesText(src.Dict);

        // 1. Escreve UM unico Form XObject referenciando a arte
        string streamData = contentBytes + "\n";
        sb.AppendLine($"{formNum} 0 obj");
        sb.AppendLine("<<");
        sb.AppendLine("  /BBox [0 0 " + N(pw) + " " + N(ph) + "]");
        sb.AppendLine($"  /Length {Latin1.GetByteCount(streamData)}");
        sb.AppendLine($"  /Resources {resourcesText}");
        sb.AppendLine("  /Subtype /Form");
        sb.AppendLine("  /Type /XObject");
        sb.AppendLine(">>");
        sb.AppendLine("stream");
        sb.Append(streamData);
        if (!streamData.EndsWith("\n")) sb.AppendLine();
        sb.AppendLine("endstream");
        sb.AppendLine("endobj");
        sb.AppendLine();

        // 2. Preenche o grid referenciando o form (Fm0)
        for (int rBottom = 0; rBottom < options.Rows; rBottom++)
        {
            for (int c = 0; c < options.Cols; c++)
            {
                double x = startX + c * stepX;
                double y = startY + rBottom * stepY;
                
                sheetOps.AppendLine("q");
                if (options.Rotate90)
                {
                    // Translada +X para compensar a rotacao, depois rotaciona 90 graus CCW
                    double tx = x + ph; 
                    double ty = y;
                    sheetOps.AppendLine($"0 1 -1 0 {N(tx)} {N(ty)} cm");
                }
                else
                {
                    sheetOps.AppendLine($"1 0 0 1 {N(x)} {N(y)} cm");
                }
                sheetOps.AppendLine($"/Fm0 Do");
                sheetOps.AppendLine("Q");
            }
        }

        Dictionary<string, string> spots = new();
        if (options.Marks != null)
        {
            double pieceW = options.Rotate90 ? ph : pw;
            double pieceH = options.Rotate90 ? pw : ph;
            double gradeRight = startX + (options.Cols - 1) * stepX + pieceW;
            double gradeTop = startY + (options.Rows - 1) * stepY + pieceH;
            
            string marksStream = MarksRenderer.GenerateContentStream(
                startX, startY, gradeRight, gradeTop, options.Marks, out spots);
                
            sheetOps.AppendLine(marksStream);
        }

        string sheetStreamData = sheetOps.ToString().Replace("\r\n", "\n");
        sb.AppendLine($"{contentNum} 0 obj");
        sb.AppendLine("<<");
        sb.AppendLine($"  /Length {Latin1.GetByteCount(sheetStreamData)}");
        sb.AppendLine(">>");
        sb.AppendLine("stream\n" + sheetStreamData);
        if (!sheetStreamData.EndsWith("\n")) sb.AppendLine();
        sb.AppendLine("endstream");
        sb.AppendLine("endobj");
        sb.AppendLine();

        var rootPages = objs.FirstOrDefault(o => Regex.IsMatch(o.Dict, @"\/Type\s*/Pages\b"));
        if (rootPages is null) throw new InvalidOperationException("Objeto /Pages não encontrado.");

        sb.AppendLine($"{sheetPageNum} 0 obj");
        sb.AppendLine("<<");
        sb.AppendLine("  /Contents " + contentNum + " 0 R");
        sb.AppendLine($"  /MediaBox [0 0 {N(sheetW)} {N(sheetH)}]");
        sb.AppendLine($"  /Parent {rootPages.Num} 0 R");
        sb.AppendLine("  /Resources <<");
        sb.AppendLine("    /XObject <<");
        sb.AppendLine($"      /Fm0 {formNum} 0 R");
        sb.AppendLine("    >>");
        
        if (spots.Count > 0)
        {
            sb.AppendLine("    /ColorSpace <<");
            foreach (var spot in spots)
            {
                sb.AppendLine($"      {spot.Value}");
            }
            sb.AppendLine("    >>");
        }
        
        sb.AppendLine("  >>");
        sb.AppendLine("  /Type /Page");
        sb.AppendLine(">>");
        sb.AppendLine("endobj");
        sb.AppendLine();

        string objectBlob = sb.ToString().Replace("\r\n", "\n");

        string[] newRootBody =
        {
            "<<",
            "  /Count 1",
            "  /Kids [",
            $"    {sheetPageNum} 0 R",
            "  ]",
            "  /Type /Pages",
            ">>"
        };
        lines.RemoveRange(rootPages.StartLine + 1, rootPages.EndObjLine - (rootPages.StartLine + 1));
        lines.InsertRange(rootPages.StartLine + 1, newRootBody);

        int xrefIdx = lines.FindIndex(l => l.Trim().TrimStart(' ').StartsWith("xref"));
        lines.InsertRange(xrefIdx, objectBlob.Split('\n'));

        File.WriteAllText(editedPath, string.Join("\n", lines), Latin1);
        return editedPath;
    }

    private static string N(double d)
    {
        if (Math.Abs(d) < 1e-6) return "0";
        var s = d.ToString(System.Globalization.CultureInfo.InvariantCulture);
        if (s.Contains('E') || s.Contains('e'))
            return d.ToString("0.################", System.Globalization.CultureInfo.InvariantCulture);
        return s;
    }

    private static List<PdfObj> ParseObjects(List<string> lines)
    {
        var result = new List<PdfObj>();
        for (int i = 0; i < lines.Count; i++)
        {
            var m = Regex.Match(lines[i], @"^(\d+)\s+0\s+obj$");
            if (!m.Success) continue;
            int num = int.Parse(m.Groups[1].Value);
            int j = i + 1;
            var dictLines = new List<string>();
            int? streamLine = null;
            int? endStreamLine = null;
            while (j < lines.Count && !lines[j].Trim().StartsWith("endobj"))
            {
                if (lines[j].Trim() == "stream" && streamLine is null) streamLine = j;
                else if (streamLine is not null && lines[j].Trim().StartsWith("endstream")) { endStreamLine = j; break; }
                else if (streamLine is null) dictLines.Add(lines[j]);
                j++;
            }
            string? stream = null;
            if (streamLine is not null && endStreamLine is not null)
                stream = string.Join("\n", lines.Skip(streamLine.Value + 1).Take(endStreamLine.Value - streamLine.Value - 1));
            result.Add(new PdfObj(num, i, j, string.Join("\n", dictLines), stream));
            i = j;
        }
        return result;
    }

    private static double[] GetMediaBox(string pageDict)
    {
        var m = Regex.Match(pageDict, @"\/MediaBox\s*\[\s*([0-9.eE+-]+)\s+([0-9.eE+-]+)\s+([0-9.eE+-]+)\s+([0-9.eE+-]+)");
        if (!m.Success) return new[] { 0d, 0d, 1d, 1d };
        return new[] { double.Parse(m.Groups[1].Value, System.Globalization.CultureInfo.InvariantCulture),
                       double.Parse(m.Groups[2].Value, System.Globalization.CultureInfo.InvariantCulture),
                       double.Parse(m.Groups[3].Value, System.Globalization.CultureInfo.InvariantCulture),
                       double.Parse(m.Groups[4].Value, System.Globalization.CultureInfo.InvariantCulture) };
    }

    private static double GetMediaBoxWidth(string pageDict) { var m = GetMediaBox(pageDict); return m[2] - m[0]; }
    private static double GetMediaBoxHeight(string pageDict) { var m = GetMediaBox(pageDict); return m[3] - m[1]; }

    private static string ConcatContents(PdfObj page, List<PdfObj> objs)
    {
        var refNums = new List<int>();
        int ci = page.Dict.IndexOf("/Contents");
        int ce = page.Dict.IndexOf("/", ci + 9);
        string slice = ce < 0 ? page.Dict.Substring(ci + 9) : page.Dict.Substring(ci + 9, ce - (ci + 9));
        foreach (Match m2 in Regex.Matches(slice, @"(\d+)\s+0\s+R"))
            refNums.Add(int.Parse(m2.Groups[1].Value));

        var sb = new StringBuilder();
        foreach (int rn in refNums)
        {
            var o = objs.FirstOrDefault(x => x.Num == rn);
            if (o?.Stream is { } s) { sb.Append(s.TrimEnd('\n')).Append('\n'); }
        }
        return sb.ToString();
    }

    private static string GetResourcesText(string pageDict)
    {
        int ri = pageDict.IndexOf("/Resources");
        if (ri < 0) return "<< >>";
        string rest = pageDict.Substring(ri + "/Resources".Length).TrimStart();
        var m = Regex.Match(rest, @"^(\d+)\s+0\s+R");
        if (m.Success) return m.Groups[0].Value;
        if (!rest.StartsWith("<<")) return "<< >>";
        int end = ScanBalanced(rest, 0);
        return end < 0 ? "<< >>" : rest.Substring(0, end);
    }

    private static int ScanBalanced(string s, int i)
    {
        int depth = 0;
        for (int k = i; k + 1 < s.Length; k++)
        {
            if (s[k] == '<' && s[k + 1] == '<') { depth++; k++; }
            else if (s[k] == '>' && s[k + 1] == '>') { depth--; k++; if (depth == 0) return k + 1; }
        }
        return -1;
    }
}
