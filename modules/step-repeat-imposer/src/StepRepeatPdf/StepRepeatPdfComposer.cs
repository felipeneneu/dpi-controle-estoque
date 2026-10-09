using PdfSharpCore.Drawing;
using PdfSharpCore.Pdf;
using PdfSharpCore.Pdf.IO;
using StepRepeatEngine.Geometry;
using StepRepeatEngine.Marks;

namespace StepRepeatPdf;

public record StepRepeatExecutionResult(
    SessionDirectories SessionDirs,
    GridCalculationResult GridResult,
    PdfBoxInfo? BoxInfo
);

public static class StepRepeatPdfComposer
{
    private const double MmToPoints = 72.0 / 25.4;

    public static StepRepeatExecutionResult Compose(StepRepeatRequest req)
    {
        if (req == null) throw new ArgumentNullException(nameof(req));

        DateTime sessionStartTime = DateTime.Now;
        string baseOutputDir = Path.GetDirectoryName(Path.GetFullPath(req.OutputPdfPath)) ?? Environment.CurrentDirectory;

        var sessionDirs = SessionOutputManager.PrepareSessionDirectories(baseOutputDir, req.InputPdfPath, sessionStartTime);

        PdfBoxInfo? boxInfo = null;
        string? activeInputPdfPath = req.InputPdfPath;
        double itemWidthMm = req.ItemWidthMm ?? 90.0;
        double itemHeightMm = req.ItemHeightMm ?? 50.0;

        // Pré-Tratamento do PDF do Cliente (Medição e opção de uso de TrimBox ou MediaBox)
        if (!string.IsNullOrEmpty(req.InputPdfPath) && File.Exists(req.InputPdfPath))
        {
            boxInfo = PdfPageBoxDetector.Detect(req.InputPdfPath);

            if (req.ItemWidthMm == null || req.ItemHeightMm == null)
            {
                itemWidthMm = req.ItemWidthMm ?? (req.UseTrimBox ? boxInfo.EffectiveWidthMm : boxInfo.MediaBox.Width);
                itemHeightMm = req.ItemHeightMm ?? (req.UseTrimBox ? boxInfo.EffectiveHeightMm : boxInfo.MediaBox.Height);
            }

            if (req.UseTrimBox && boxInfo.HasTrimBox)
            {
                // Cortar marcas antigas do cliente no TrimBox
                activeInputPdfPath = PdfPretreatmentService.CreatePretreatedPdf(
                    inputPdfPath: req.InputPdfPath,
                    outputPretreatedPath: sessionDirs.PretreatedPdfPath,
                    boxInfo: boxInfo,
                    requestedBleedMm: req.BleedMm
                );
            }
            else
            {
                // Manter o PDF do cliente no tamanho integral (MediaBox)
                File.Copy(req.InputPdfPath, sessionDirs.PretreatedPdfPath, overwrite: true);
                activeInputPdfPath = sessionDirs.PretreatedPdfPath;
            }
        }

        // Calcular a grade Step & Repeat
        var gridResult = StepAndRepeatGridCalculator.Calculate(
            sheetWidthMm: req.SheetWidthMm,
            sheetHeightMm: req.SheetHeightMm,
            itemWidthMm: itemWidthMm,
            itemHeightMm: itemHeightMm,
            gutterXMm: req.GutterXMm,
            gutterYMm: req.GutterYMm,
            bleedMm: req.BleedMm,
            gripperMarginMm: req.GripperMarginMm,
            sideGuideMarginMm: req.SideGuideMarginMm,
            rotationMode: req.RotationMode
        );

        using (var outputDoc = new PdfDocument())
        {
            var page = outputDoc.AddPage();
            page.Width = XUnit.FromMillimeter(req.SheetWidthMm);
            page.Height = XUnit.FromMillimeter(req.SheetHeightMm);

            using (var gfx = XGraphics.FromPdfPage(page))
            {
                if (!string.IsNullOrEmpty(activeInputPdfPath) && File.Exists(activeInputPdfPath))
                {
                    using (var inputForm = XPdfForm.FromFile(activeInputPdfPath))
                    {
                        foreach (var cell in gridResult.Cells)
                        {
                            double xPt = cell.TrimBox.X * MmToPoints;
                            double yPt = (req.SheetHeightMm - cell.TrimBox.Top) * MmToPoints;
                            double wPt = cell.TrimBox.Width * MmToPoints;
                            double hPt = cell.TrimBox.Height * MmToPoints;

                            if (cell.IsRotated90)
                            {
                                var state = gfx.Save();
                                gfx.TranslateTransform(xPt + (wPt / 2.0), yPt + (hPt / 2.0));
                                gfx.RotateTransform(90);
                                gfx.DrawImage(inputForm, -hPt / 2.0, -wPt / 2.0, hPt, wPt);
                                gfx.Restore(state);
                            }
                            else
                            {
                                gfx.DrawImage(inputForm, xPt, yPt, wPt, hPt);
                            }
                        }
                    }
                }
                else
                {
                    foreach (var cell in gridResult.Cells)
                    {
                        double xPt = cell.TrimBox.X * MmToPoints;
                        double yPt = (req.SheetHeightMm - cell.TrimBox.Top) * MmToPoints;
                        double wPt = cell.TrimBox.Width * MmToPoints;
                        double hPt = cell.TrimBox.Height * MmToPoints;

                        RenderSampleCardArtwork(gfx, xPt, yPt, wPt, hPt, cell.Column + 1, cell.Row + 1, cell.IsRotated90);
                    }
                }

                var markOpts = req.SmartMarkOptions ?? new SmartMarkOptions();
                var slugCtx = new SluglineContext(
                    JobName: req.JobName,
                    CustomerName: req.CustomerName,
                    UpCount: gridResult.TotalUp,
                    SheetWidthMm: req.SheetWidthMm,
                    SheetHeightMm: req.SheetHeightMm,
                    Side: req.Side,
                    ColorName: "CMYK",
                    Timestamp: sessionStartTime
                );

                SmartMarkPdfRenderer.Render(gfx, gridResult, req.SheetWidthMm, req.SheetHeightMm, slugCtx, markOpts);
            }

            outputDoc.Save(sessionDirs.ImposedPdfPath);
        }

        try
        {
            string fullOutput = Path.GetFullPath(req.OutputPdfPath);
            string fullSaida = Path.GetFullPath(sessionDirs.ImposedPdfPath);
            if (!string.Equals(fullOutput, fullSaida, StringComparison.OrdinalIgnoreCase))
            {
                File.Copy(fullSaida, fullOutput, overwrite: true);
            }
        }
        catch (IOException)
        {
            // Fallback silencioso se o arquivo estiver em uso no Windows
        }

        return new StepRepeatExecutionResult(sessionDirs, gridResult, boxInfo);
    }

    private static void RenderSampleCardArtwork(
        XGraphics gfx,
        double xPt,
        double yPt,
        double wPt,
        double hPt,
        int col,
        int row,
        bool isRotated)
    {
        var bgBrush = new XSolidBrush(XColor.FromCmyk(1.0, 0.5, 0.0, 0.0));
        gfx.DrawRectangle(bgBrush, xPt, yPt, wPt, hPt);

        var borderPen = new XPen(XColor.FromCmyk(0, 0, 0, 1), 0.5);
        gfx.DrawRectangle(borderPen, xPt + 2, yPt + 2, wPt - 4, hPt - 4);

        var font = new XFont("Arial", 9, XFontStyle.Bold);
        var textBrush = new XSolidBrush(XColor.FromCmyk(0, 0, 0, 0));
        string rotText = isRotated ? " [90°]" : "";
        gfx.DrawString($"PEÇA #{col}-{row}{rotText}", font, textBrush, new XPoint(xPt + 6, yPt + 18));
    }
}
