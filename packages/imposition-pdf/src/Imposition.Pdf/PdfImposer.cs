using Imposition.Pdf.Contracts;

namespace Imposition.Pdf;

/// <summary>
/// Motor de imposição de PDFs com preservação de OCG (camadas).
/// Usa QPDF para clonar estrutura; edita o QDF em C#.
/// </summary>
public static class PdfImposer
{
    /// <summary>Verifica se um PDF tem camadas OCG.</summary>
    public static OcgInfo Inspect(string pdfPath)
        => OcgReader.Read(pdfPath);

    /// <summary>
    /// Impõe N-up preservando camadas OCG.
    /// </summary>
    public static IReadOnlyList<string> Impose(
        string inputPath,
        string outputPath,
        ImposeOptions options)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(inputPath);
        ArgumentException.ThrowIfNullOrWhiteSpace(outputPath);
        ArgumentNullException.ThrowIfNull(options);

        var ocgInfo = Inspect(inputPath);
        if (!ocgInfo.HasOcg)
            throw new InvalidOperationException(
                "PDF não tem OCG. Use o caminho PdfSharp.");

        var tempPath = Path.GetTempPath();
        if (!Directory.Exists(tempPath)) Directory.CreateDirectory(tempPath);
        var qdfPath = Path.Combine(tempPath, $"imposition-{Guid.NewGuid():N}.qdf");
        try
        {
            // 1. QPDF --qdf
            QpdfRunner.Run($"--qdf \"{inputPath}\" \"{qdfPath}\"");

            // 2. Editar QDF em C# (N-up)
            var editedQdf = QdfPipeline.ApplyNup(qdfPath, options);

            // 3. Regenerar xref
            XrefBuilder.Rebuild(editedQdf);

            // 4. Recompressar
            QpdfRunner.Run(
                $"--object-streams=generate \"{editedQdf}\" \"{outputPath}\"");

            return new[] { outputPath };
        }
        finally
        {
            if (File.Exists(qdfPath)) File.Delete(qdfPath);
        }
    }
}
