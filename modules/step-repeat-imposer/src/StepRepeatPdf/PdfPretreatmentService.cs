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

        // Se o PDF do cliente tiver TrimBox, alinhar o TrimBox do cliente com o centro da página pré-tratada
        double cropX = boxInfo.TrimBox?.X ?? 0.0;
        double cropY = boxInfo.TrimBox?.Y ?? 0.0;

        // Posição de desenho da Form XObject com offset de recorte para remover marcas externas do cliente
        double drawXPt = (requestedBleedMm - cropX) * MmToPoints;
        double drawYPt = (requestedBleedMm - cropY) * MmToPoints;

        double origWPt = boxInfo.MediaBox.Width * MmToPoints;
        double origHPt = boxInfo.MediaBox.Height * MmToPoints;

        // Inserir a arte recortada no TrimBox
        gfx.DrawImage(inputForm, drawXPt, drawYPt, origWPt, origHPt);

        // Salvar PDF limpo pré-tratado
        outputDoc.Save(outputPretreatedPath);

        return outputPretreatedPath;
    }
}
