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
    bool HasTrimBox,
    double LeftCropMm = 0.0,
    double TopCropMm = 0.0
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
        double mediaX1 = page.MediaBox.X1 * PointsToMm;
        double mediaY1 = page.MediaBox.Y1 * PointsToMm;
        double mediaX2 = page.MediaBox.X2 * PointsToMm;
        double mediaY2 = page.MediaBox.Y2 * PointsToMm;
        double mediaW = (mediaX2 - mediaX1);
        double mediaH = (mediaY2 - mediaY1);
        var mediaBox = new Rect2D(mediaX1, mediaY1, mediaW, mediaH);

        Rect2D? trimBox = null;
        Rect2D? bleedBox = null;
        double leftCropMm = 0.0;
        double topCropMm = 0.0;

        // 2. Verificar TrimBox do PDF se declarada
        var trimRect = page.TrimBox;
        if (trimRect != null && trimRect.Width > 0 && trimRect.Height > 0)
        {
            double tx1 = trimRect.X1 * PointsToMm;
            double ty1 = trimRect.Y1 * PointsToMm;
            double tx2 = trimRect.X2 * PointsToMm;
            double ty2 = trimRect.Y2 * PointsToMm;
            double tw = tx2 - tx1;
            double th = ty2 - ty1;

            trimBox = new Rect2D(tx1, ty1, tw, th);
            leftCropMm = Math.Max(0.0, tx1 - mediaX1);
            topCropMm = Math.Max(0.0, mediaY2 - ty2);
        }

        // 3. Verificar BleedBox do PDF se declarada
        var bleedRect = page.BleedBox;
        if (bleedRect != null && bleedRect.Width > 0 && bleedRect.Height > 0)
        {
            double bx1 = bleedRect.X1 * PointsToMm;
            double by1 = bleedRect.Y1 * PointsToMm;
            double bx2 = bleedRect.X2 * PointsToMm;
            double by2 = bleedRect.Y2 * PointsToMm;
            double bw = bx2 - bx1;
            double bh = by2 - by1;
            bleedBox = new Rect2D(bx1, by1, bw, bh);
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
            HasTrimBox: trimBox.HasValue,
            LeftCropMm: leftCropMm,
            TopCropMm: topCropMm
        );
    }
}
