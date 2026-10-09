using PdfSharpCore.Drawing;
using PdfSharpCore.Pdf;
using PdfSharpCore.Pdf.IO;
using StepRepeatEngine.Geometry;

namespace StepRepeatPdf;

/// <summary>
/// Serviço de Pré-Tratamento de Arquivos PDF.
/// Recorta a arte exatamente no TrimBox (+ sangria desejada), removendo marcas antigas do cliente.
/// </summary>
public static class PdfPretreatmentService
{
    private const double MmToPoints = 72.0 / 25.4;

    /// <summary>
    /// Gera um PDF pré-tratado limpo em Desenvolvimento/ sem marcas antigas.
    /// </summary>
    public static string CreatePretreatedPdf(
        string inputPdfPath,
        string outputPretreatedPath,
        PdfBoxInfo boxInfo,
        double requestedBleedMm = 3.0)
    {
        if (string.IsNullOrEmpty(inputPdfPath) || !File.Exists(inputPdfPath))
        {
            throw new FileNotFoundException("PDF de entrada não encontrado.", inputPdfPath);
        }

        double trimW = boxInfo.EffectiveWidthMm;
        double trimH = boxInfo.EffectiveHeightMm;

        // Tamanho final pré-tratado (TrimBox + sangria desejada em mm)
        double targetWidthMm = trimW + (2 * requestedBleedMm);
        double targetHeightMm = trimH + (2 * requestedBleedMm);

        using var outputDoc = new PdfDocument();
        var page = outputDoc.AddPage();
        page.Width = XUnit.FromMillimeter(targetWidthMm);
        page.Height = XUnit.FromMillimeter(targetHeightMm);

        using var gfx = XGraphics.FromPdfPage(page);
        using var inputForm = XPdfForm.FromFile(inputPdfPath);

        // Clipping estrito no retângulo da página pré-tratada (TrimBox + sangria)
        gfx.IntersectClip(new XRect(0, 0, page.Width.Point, page.Height.Point));

        // Offsets do TrimBox do cliente em relação ao canto superior esquerdo do MediaBox
        double leftCrop = boxInfo.LeftCropMm;
        double topCrop = boxInfo.TopCropMm;

        // Posição de desenho da Form XObject para alinhar o TrimBox do cliente com (requestedBleedMm, requestedBleedMm)
        double drawXPt = (requestedBleedMm - leftCrop) * MmToPoints;
        double drawYPt = (requestedBleedMm - topCrop) * MmToPoints;

        double origWPt = boxInfo.MediaBox.Width * MmToPoints;
        double origHPt = boxInfo.MediaBox.Height * MmToPoints;

        // Inserir a arte recortada no TrimBox exato
        gfx.DrawImage(inputForm, drawXPt, drawYPt, origWPt, origHPt);

        // Salvar PDF limpo pré-tratado
        outputDoc.Save(outputPretreatedPath);

        return outputPretreatedPath;
    }
}
