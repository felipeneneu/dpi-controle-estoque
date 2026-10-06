using System.Text;
using System.Text.RegularExpressions;
using Imposition.Pdf.Contracts;

namespace Imposition.Pdf.Tests.TestHelpers;

/// <summary>
/// Helper de inspeção e teste de PDFs/QDFs em memória/disco sem dependência de processos externos (ADR-043, R-023).
/// </summary>
public static class PdfInspector
{
    private static readonly Encoding Latin1 = Encoding.GetEncoding(28591);

    /// <summary>
    /// Inspeciona a presença de camadas OCG em um arquivo PDF ou QDF diretamente via parsing estrutural em C#.
    /// </summary>
    public static OcgInfo Inspect(string filePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(filePath);
        if (!File.Exists(filePath))
            throw new FileNotFoundException("Arquivo não encontrado.", filePath);

        var content = File.ReadAllText(filePath, Latin1);

        if (!content.Contains("/OCProperties") || !content.Contains("/OCGs"))
        {
            return new OcgInfo(false, Array.Empty<OcgLayer>());
        }

        // Extrai referências de OCG do array /OCGs [ ... ]
        var ocgsMatch = Regex.Match(content, @"\/OCGs\s*\[([^\]]+)\]");
        if (!ocgsMatch.Success)
        {
            return new OcgInfo(false, Array.Empty<OcgLayer>());
        }

        var refs = Regex.Matches(ocgsMatch.Groups[1].Value, @"(\d+\s+\d+\s+R)");
        var layers = new List<OcgLayer>();

        foreach (Match match in refs)
        {
            var refStr = match.Value.Trim();
            var objNum = refStr.Split(' ')[0];

            // Localiza a definição do objeto: "<num> 0 obj ... /Name (LayerName) ... endobj"
            var objPattern = $@"{objNum}\s+\d+\s+obj\b[\s\S]*?\/Name\s*\(([^)]+)\)[\s\S]*?endobj";
            var objMatch = Regex.Match(content, objPattern);

            if (objMatch.Success)
            {
                var name = objMatch.Groups[1].Value;
                layers.Add(new OcgLayer(name, refStr));
            }
        }

        return new OcgInfo(layers.Count > 0, layers);
    }

    /// <summary>
    /// Gera um arquivo QDF sintético contendo 3 camadas OCG (Arte, Branco, Faca) para testes.
    /// </summary>
    public static string CreateSampleQdfWithOcg(string path)
    {
        var qdfContent = """
            %PDF-1.3
            %%Comment: QDF 1.0
            1 0 obj
            <<
              /Type /Catalog
              /Pages 2 0 R
              /OCProperties <<
                /OCGs [ 6 0 R 7 0 R 8 0 R ]
              >>
            >>
            endobj
            2 0 obj
            <<
              /Type /Pages
              /Count 1
              /Kids [ 3 0 R ]
            >>
            endobj
            3 0 obj
            <<
              /Type /Page
              /Parent 2 0 R
              /MediaBox [ 0 0 100 100 ]
              /Contents 4 0 R
              /Resources <<
                /Properties <<
                  /OC1 6 0 R
                  /OC2 7 0 R
                  /OC3 8 0 R
                >>
              >>
            >>
            endobj
            4 0 obj
            <<
              /Length 60
            >>
            stream
            /OC /OC1 BDC
            q 1 0 0 1 10 10 cm 1 0 0 rg 0 0 80 80 re f Q
            EMC
            endstream
            endobj
            6 0 obj
            <<
              /Type /OCG
              /Name (Arte)
            >>
            endobj
            7 0 obj
            <<
              /Type /OCG
              /Name (Branco)
            >>
            endobj
            8 0 obj
            <<
              /Type /OCG
              /Name (Faca)
            >>
            endobj
            xref
            0 9
            0000000000 65535 f 
            0000000015 00000 n 
            trailer
            <<
              /Root 1 0 R
              /Size 9
            >>
            startxref
            600
            %%EOF
            """;

        File.WriteAllText(path, qdfContent.Replace("\r\n", "\n"), Latin1);
        return path;
    }

    /// <summary>
    /// Gera um arquivo QDF sintético sem camadas OCG para testes.
    /// </summary>
    public static string CreateSampleQdfWithoutOcg(string path)
    {
        var qdfContent = """
            %PDF-1.3
            %%Comment: QDF 1.0
            1 0 obj
            <<
              /Type /Catalog
              /Pages 2 0 R
            >>
            endobj
            2 0 obj
            <<
              /Type /Pages
              /Count 1
              /Kids [ 3 0 R ]
            >>
            endobj
            3 0 obj
            <<
              /Type /Page
              /Parent 2 0 R
              /MediaBox [ 0 0 100 100 ]
              /Contents 4 0 R
            >>
            endobj
            4 0 obj
            <<
              /Length 40
            >>
            stream
            q 1 0 0 1 10 10 cm 0 0 80 80 re f Q
            endstream
            endobj
            xref
            0 5
            0000000000 65535 f 
            0000000015 00000 n 
            trailer
            <<
              /Root 1 0 R
              /Size 5
            >>
            startxref
            400
            %%EOF
            """;

        File.WriteAllText(path, qdfContent.Replace("\r\n", "\n"), Latin1);
        return path;
    }

    /// <summary>
    /// Executa o pipeline N-up sobre QDF diretamente sem invocar binário externo qpdf.exe.
    /// </summary>
    public static string ImposeQdf(string inputQdfPath, string outputQdfPath, ImposeOptions options)
    {
        var ocg = Inspect(inputQdfPath);
        if (!ocg.HasOcg)
            throw new InvalidOperationException("PDF não tem OCG. Use o caminho PdfSharp.");

        var edited = QdfPipeline.ApplyNup(inputQdfPath, options);
        XrefBuilder.Rebuild(edited);

        var dir = Path.GetDirectoryName(outputQdfPath);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);

        File.Copy(edited, outputQdfPath, overwrite: true);
        return outputQdfPath;
    }
}
