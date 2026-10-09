namespace StepRepeatEngine.Geometry;

public enum RotationMode
{
    AutoBestFit = 0,
    Normal0 = 1,
    Rotate90 = 2
}

public record GridCellPlacement(
    int Row,
    int Column,
    Rect2D TrimBox,
    Rect2D BleedBox,
    double BleedTop,
    double BleedBottom,
    double BleedLeft,
    double BleedRight,
    bool IsRotated90 = false
);

public record GridCalculationResult(
    int Columns,
    int Rows,
    int TotalUp,
    Rect2D PrintableArea,
    IReadOnlyList<GridCellPlacement> Cells,
    bool IsRotated90 = false,
    double EffectiveItemWidthMm = 0,
    double EffectiveItemHeightMm = 0
);

/// <summary>
/// Calculador geométrico de grade para imposição comercial Step & Repeat.
/// Suporta Rotação Automática de Melhor Aproveitamento (AutoBestFit / Best Yield).
/// </summary>
public static class StepAndRepeatGridCalculator
{
    public static GridCalculationResult Calculate(
        double sheetWidthMm,
        double sheetHeightMm,
        double itemWidthMm,
        double itemHeightMm,
        double gutterXMm = 4.0,
        double gutterYMm = 4.0,
        double bleedMm = 3.0,
        double gripperMarginMm = 15.0,
        double sideGuideMarginMm = 15.0,
        double topMarginMm = 15.0,
        double rightMarginMm = 15.0,
        RotationMode rotationMode = RotationMode.AutoBestFit)
    {
        if (!double.IsFinite(sheetWidthMm) || sheetWidthMm <= 0)
            throw new ArgumentOutOfRangeException(nameof(sheetWidthMm));
        if (!double.IsFinite(sheetHeightMm) || sheetHeightMm <= 0)
            throw new ArgumentOutOfRangeException(nameof(sheetHeightMm));
        if (!double.IsFinite(itemWidthMm) || itemWidthMm <= 0)
            throw new ArgumentOutOfRangeException(nameof(itemWidthMm));
        if (!double.IsFinite(itemHeightMm) || itemHeightMm <= 0)
            throw new ArgumentOutOfRangeException(nameof(itemHeightMm));

        // 1. Calcular Orientação Normal (0 graus)
        var normalResult = CalculateSingleOrientation(
            sheetWidthMm, sheetHeightMm, itemWidthMm, itemHeightMm,
            gutterXMm, gutterYMm, bleedMm, gripperMarginMm, sideGuideMarginMm,
            topMarginMm, rightMarginMm, isRotated: false
        );

        // 2. Calcular Orientação Rotacionada (90 graus: inverte largura e altura da peça)
        var rotatedResult = CalculateSingleOrientation(
            sheetWidthMm, sheetHeightMm, itemHeightMm, itemWidthMm,
            gutterXMm, gutterYMm, bleedMm, gripperMarginMm, sideGuideMarginMm,
            topMarginMm, rightMarginMm, isRotated: true
        );

        if (rotationMode == RotationMode.Normal0) return normalResult;
        if (rotationMode == RotationMode.Rotate90) return rotatedResult;

        // AutoBestFit: Escolhe a orientação que gera o maior número total de peças (TotalUp)
        if (rotatedResult.TotalUp > normalResult.TotalUp)
        {
            return rotatedResult;
        }

        return normalResult;
    }

    private static GridCalculationResult CalculateSingleOrientation(
        double sheetWidthMm,
        double sheetHeightMm,
        double itemW,
        double itemH,
        double gutterX,
        double gutterY,
        double bleedMm,
        double gripperMargin,
        double sideGuideMargin,
        double topMargin,
        double rightMargin,
        bool isRotated)
    {
        double printableX = sideGuideMargin;
        double printableY = gripperMargin;
        double printableWidth = sheetWidthMm - sideGuideMargin - rightMargin;
        double printableHeight = sheetHeightMm - gripperMargin - topMargin;

        if (printableWidth <= 0 || printableHeight <= 0)
        {
            throw new InvalidOperationException("As margens configuradas excedem o tamanho total da folha.");
        }

        var printableArea = new Rect2D(printableX, printableY, printableWidth, printableHeight);

        int columns = 0;
        if (printableWidth >= itemW)
        {
            columns = 1 + (int)Math.Floor((printableWidth - itemW) / (itemW + gutterX) + 0.0001);
        }

        int rows = 0;
        if (printableHeight >= itemH)
        {
            rows = 1 + (int)Math.Floor((printableHeight - itemH) / (itemH + gutterY) + 0.0001);
        }

        int totalUp = columns * rows;
        var cells = new List<GridCellPlacement>();

        if (totalUp > 0)
        {
            double gridTotalWidth = (columns * itemW) + ((columns - 1) * gutterX);
            double gridTotalHeight = (rows * itemH) + ((rows - 1) * gutterY);

            double startX = printableX + ((printableWidth - gridTotalWidth) / 2.0);
            double startY = printableY + ((printableHeight - gridTotalHeight) / 2.0);

            for (int r = 0; r < rows; r++)
            {
                for (int c = 0; c < columns; c++)
                {
                    double itemX = startX + (c * (itemW + gutterX));
                    double itemY = startY + (r * (itemH + gutterY));

                    var trimBox = new Rect2D(itemX, itemY, itemW, itemH);

                    double bleedLeft = (c == 0) ? bleedMm : GutterBleedResolver.Resolve(gutterX, bleedMm, bleedMm).EffectiveBleedItemA;
                    double bleedRight = (c == columns - 1) ? bleedMm : GutterBleedResolver.Resolve(gutterX, bleedMm, bleedMm).EffectiveBleedItemB;

                    double bleedBottom = (r == 0) ? bleedMm : GutterBleedResolver.Resolve(gutterY, bleedMm, bleedMm).EffectiveBleedItemA;
                    double bleedTop = (r == rows - 1) ? bleedMm : GutterBleedResolver.Resolve(gutterY, bleedMm, bleedMm).EffectiveBleedItemB;

                    var bleedBox = new Rect2D(
                        itemX - bleedLeft,
                        itemY - bleedBottom,
                        itemW + bleedLeft + bleedRight,
                        itemH + bleedTop + bleedBottom
                    );

                    cells.Add(new GridCellPlacement(r, c, trimBox, bleedBox, bleedTop, bleedBottom, bleedLeft, bleedRight, isRotated));
                }
            }
        }

        return new GridCalculationResult(columns, rows, totalUp, printableArea, cells, isRotated, itemW, itemH);
    }
}
