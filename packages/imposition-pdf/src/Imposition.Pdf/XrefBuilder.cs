using System.Text;
using System.Text.RegularExpressions;

namespace Imposition.Pdf;

internal static class XrefBuilder
{
    private static readonly Encoding Latin1 = Encoding.GetEncoding(28591);

    /// <summary>Regenera a seção xref+trailer de um QDF com offsets exatos.</summary>
    public static void Rebuild(string editedQdfPath)
    {
        var text = File.ReadAllText(editedQdfPath, Latin1).Replace("\r\n", "\n");
        var lines = new List<string>(text.Split('\n'));
        
        string idHex = ExtractOriginalId(lines);
        
        int newXrefIdx = lines.FindIndex(l => l.Trim() == "xref");
        if (newXrefIdx < 0) throw new InvalidOperationException("xref final não encontrada.");
        
        lines.RemoveRange(newXrefIdx, lines.Count - newXrefIdx);
        while (lines.Count > 0 && lines[^1] == "") lines.RemoveAt(lines.Count - 1);
        
        int size = FindMaxObjNum(lines) + 1;
        lines.AddRange(BuildXref(lines, size, idHex));
        
        File.WriteAllText(editedQdfPath, string.Join("\n", lines), Latin1);
    }

    private static int FindMaxObjNum(List<string> lines)
    {
        int max = 0;
        foreach (var l in lines)
        {
            var m = Regex.Match(l, @"^(\d+)\s+0\s+obj$");
            if (m.Success)
            {
                int num = int.Parse(m.Groups[1].Value);
                if (num > max) max = num;
            }
        }
        return max;
    }

    private static string ExtractOriginalId(List<string> lines)
    {
        int tr = lines.FindIndex(l => l.Trim().StartsWith("trailer"));
        if (tr < 0) return "";
        for (int k = tr; k < lines.Count; k++)
        {
            var m = Regex.Match(lines[k], @"\/ID\s+\[([^\]]*)\]");
            if (m.Success) return m.Groups[1].Value.Trim();
        }
        return "";
    }

    private static List<string> BuildXref(List<string> contentLines, int size, string idHex)
    {
        long[] off = new long[contentLines.Count];
        long cur = 0;
        for (int i = 0; i < contentLines.Count; i++)
        {
            off[i] = cur;
            cur += Latin1.GetByteCount(contentLines[i]) + 1;
        }
        var objOff = new Dictionary<int, long>();
        for (int i = 0; i < contentLines.Count; i++)
        {
            var m = Regex.Match(contentLines[i], @"^(\d+)\s+0\s+obj$");
            if (m.Success) objOff[int.Parse(m.Groups[1].Value)] = off[i];
        }

        var x = new List<string>
        {
            "xref",
            $"0 {size}",
            "0000000000 65535 f ",
        };
        for (int n = 1; n < size; n++)
        {
            if (objOff.TryGetValue(n, out long o) && o > 0) x.Add(o.ToString("0000000000") + " 00000 n ");
            else x.Add("0000000000 65535 f ");
        }
        x.Add("trailer <<");
        x.Add("  /Root 1 0 R");
        x.Add($"  /Size {size}");
        if (!string.IsNullOrEmpty(idHex)) x.Add($"  /ID [{idHex}]");
        x.Add(">>");
        x.Add("startxref");
        long xoff = 0;
        for (int i = 0; i < contentLines.Count; i++) xoff += Latin1.GetByteCount(contentLines[i]) + 1;
        x.Add(xoff.ToString());
        x.Add("%%EOF");
        return x;
    }
}
