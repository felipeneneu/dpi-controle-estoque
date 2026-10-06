using System.Text;
using System.Text.RegularExpressions;

namespace Imposition.Pdf.Preflight;

/// <summary>
/// Desfecho da validação estrutural parcial de conformidade com PDF/X-1a (ISO 15930-1).
/// </summary>
/// <param name="IsCompliant">Verdadeiro se o arquivo atende a todos os critérios do checklist reduzido.</param>
/// <param name="Issues">Lista de violações detectadas durante o preflight.</param>
public sealed record PdfxValidationResult(
    bool IsCompliant,
    IReadOnlyList<string> Issues);

/// <summary>
/// Validador estrutural parcial de pré-impressão para conformidade básica com ISO 15930-1 (QDF puro em C#).
/// </summary>
public static class PdfxValidator
{
    private static readonly Encoding Latin1 = Encoding.GetEncoding(28591);

    /// <summary>
    /// Valida o arquivo PDF contra o checklist estrutural reduzido da ISO 15930-1 (ADR-054).
    /// </summary>
    public static PdfxValidationResult Validate(string pdfPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(pdfPath);
        if (!File.Exists(pdfPath))
        {
            return new PdfxValidationResult(false, new[] { $"Arquivo não encontrado: '{pdfPath}'." });
        }

        var content = File.ReadAllText(pdfPath, Latin1);
        var issues = new List<string>();

        // 1. Versão do PDF >= 1.3
        var versionMatch = Regex.Match(content, @"%PDF-(\d+)\.(\d+)");
        if (versionMatch.Success)
        {
            int major = int.Parse(versionMatch.Groups[1].Value);
            int minor = int.Parse(versionMatch.Groups[2].Value);
            if (major < 1 || (major == 1 && minor < 3))
            {
                issues.Add($"Versão do cabeçalho PDF ({major}.{minor}) é inferior à especificação 1.3.");
            }
        }
        else
        {
            issues.Add("Cabeçalho %PDF não localizado no início do arquivo.");
        }

        // 2. OutputIntents GTS_PDFX com DestOutputProfile
        if (!content.Contains("/OutputIntents") || !content.Contains("/GTS_PDFX"))
        {
            issues.Add("Dicionário /OutputIntents com subtipo /GTS_PDFX não encontrado no catálogo.");
        }
        else if (!content.Contains("/DestOutputProfile"))
        {
            issues.Add("Chave /DestOutputProfile ausente no dicionário OutputIntent.");
        }

        // 3. Ausência de OCG (ISO 15930-1 proíbe camadas)
        if (content.Contains("/OCProperties"))
        {
            issues.Add("Camadas opcionais (/OCProperties) detectadas, proibidas pela especificação PDF/X-1a.");
        }

        // 4. Ausência de grupos de transparência não achatados
        if (Regex.IsMatch(content, @"\/Group\s*<<[\s\S]*?\/S\s*\/Transparency"))
        {
            issues.Add("Grupo de transparência não achatado (/Group /S /Transparency) detectado.");
        }

        // 5. Ausência de DeviceRGB (Regra R-020)
        if (Regex.IsMatch(content, @"\/ColorSpace[\s\S]*?\/DeviceRGB") ||
            Regex.IsMatch(content, @"\/ICCBased[\s\S]*?\/N\s+3\b") ||
            Regex.IsMatch(content, @"(?<![a-zA-Z0-9_\/])(?:(?:\d+(?:\.\d+)?\s+){3}(?:rg|RG))\b") ||
            Regex.IsMatch(content, @"\/Subtype\s*\/Image[\s\S]*?\/ColorSpace\s*\/DeviceRGB"))
        {
            issues.Add("Elementos em espaço de cores DeviceRGB detectados (Regra R-020).");
        }

        return new PdfxValidationResult(issues.Count == 0, issues);
    }
}
