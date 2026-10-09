using PdfSharpCore.Pdf;
using PdfSharpCore.Pdf.IO;
using StepRepeatEngine.Geometry;

namespace StepRepeatPdf;

public record PdfBoxInfo(
    Rect2D MediaBox,
    Rect2D? TrimBox,
    Rect2D? BleedBox,
    double EffectiveWidthMm,
    double EffectiveHeightMm,
    bool HasTrimBox
);

/// <summary>
/// Detector de caixas de página PDF (TrimBox, BleedBox, MediaBox).
/// Segue a regra R-023 (Resolução de herança na hierarquia /Parent se necessário).
/// </summary>
public static class PdfPageBoxDetector
{
    private const double PointsToMm = 25.4 / 72.0;

    public static PdfBoxInfo Detect(string pdfPath)
    {
        if (string.IsNullOrEmpty(pdfPath) || !File.Exists(pdfPath))
        {
            throw new FileNotFoundException("O arquivo PDF especificado não foi encontrado.", pdfPath);
        }

        using var doc = PdfReader.Open(pdfPath, PdfDocumentOpenMode.Import);
        if (doc.PageCount == 0)
        {
            throw new InvalidOperationException("O arquivo PDF de entrada não possui páginas.");
        }

        var page = doc.Pages[0];

        // 1. Obter MediaBox (obrigatório em PDF ISO 32000)
        double mediaW = page.Width * PointsToMm;
        double mediaH = page.Height * PointsToMm;
        var mediaBox = new Rect2D(0, 0, mediaW, mediaH);

        Rect2D? trimBox = null;
        Rect2D? bleedBox = null;

        // 2. Verificar TrimBox do PDF se declarada
        var trimRect = page.TrimBox;
        if (trimRect != null && trimRect.Width > 0 && trimRect.Height > 0)
        {
            double tw = trimRect.Width * PointsToMm;
            double th = trimRect.Height * PointsToMm;
            double tx = trimRect.X1 * PointsToMm;
            double ty = trimRect.Y1 * PointsToMm;
            trimBox = new Rect2D(tx, ty, tw, th);
        }

        // 3. Verificar BleedBox do PDF se declarada
        var bleedRect = page.BleedBox;
        if (bleedRect != null && bleedRect.Width > 0 && bleedRect.Height > 0)
        {
            double bw = bleedRect.Width * PointsToMm;
            double bh = bleedRect.Height * PointsToMm;
            double bx = bleedRect.X1 * PointsToMm;
            double by = bleedRect.Y1 * PointsToMm;
            bleedBox = new Rect2D(bx, by, bw, bh);
        }

        // Se TrimBox existir, as dimensões efetivas do produto são o TrimBox
        double effW = trimBox?.Width ?? mediaW;
        double effH = trimBox?.Height ?? mediaH;

        return new PdfBoxInfo(
            MediaBox: mediaBox,
            TrimBox: trimBox,
            BleedBox: bleedBox,
            EffectiveWidthMm: effW,
            EffectiveHeightMm: effH,
            HasTrimBox: trimBox.HasValue
        );
    }
}
