using System.Text.Json;
using Imposition.Pdf.Contracts;

namespace Imposition.Pdf;

internal static class OcgReader
{
    public static OcgInfo Read(string pdfPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(pdfPath);
        if (!File.Exists(pdfPath))
            throw new FileNotFoundException("PDF não encontrado.", pdfPath);

        var json = QpdfRunner.Run($"--json \"{pdfPath}\"");
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        // Formato qpdf v2:
        // "qpdf": [ "v2", { metadados }, { "obj:1 0 R": { "value": { ... } } } ]
        if (!root.TryGetProperty("qpdf", out var qpdfArr) || qpdfArr.ValueKind != JsonValueKind.Array)
            return new OcgInfo(false, Array.Empty<OcgLayer>());

        var arr = qpdfArr.EnumerateArray().ToList();
        if (arr.Count < 2) return new OcgInfo(false, Array.Empty<OcgLayer>());

        var objects = arr[1];
        var layers = new List<OcgLayer>();

        foreach (var obj in objects.EnumerateObject())
        {
            var value = obj.Value;
            if (value.ValueKind == JsonValueKind.Object &&
                value.TryGetProperty("value", out var v) &&
                v.ValueKind == JsonValueKind.Object &&
                v.TryGetProperty("/OCProperties", out var ocp))
            {
                if (ocp.TryGetProperty("/OCGs", out var ocgs))
                {
                    foreach (var ocgRef in ocgs.EnumerateArray())
                    {
                        string refStr = ocgRef.GetString() ?? ""; // ex: "5 0 R"
                        string objKey = $"obj:{refStr}";
                        
                        if (objects.TryGetProperty(objKey, out var ocgObj) &&
                            ocgObj.TryGetProperty("value", out var ocgValue) &&
                            ocgValue.TryGetProperty("/Name", out var nameProp))
                        {
                            string name = nameProp.GetString() ?? "";
                            if (name.StartsWith("u:")) name = name.Substring(2);
                            layers.Add(new OcgLayer(name, refStr));
                        }
                    }
                }
            }
        }

        return new OcgInfo(layers.Count > 0, layers);
    }
}
