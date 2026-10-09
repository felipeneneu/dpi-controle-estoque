using StepRepeatEngine.Geometry;

namespace StepRepeatPdf;

public record StepRepeatRequest(
    double SheetWidthMm = 330.0,
    double SheetHeightMm = 483.0,
    double? ItemWidthMm = null,
    double? ItemHeightMm = null,
    double GutterXMm = 4.0,
    double GutterYMm = 4.0,
    double BleedMm = 3.0,
    double GripperMarginMm = 15.0,
    double SideGuideMarginMm = 15.0,
    string JobName = "Imposição Step & Repeat Auto",
    string CustomerName = "GraficaOS Client",
    string Side = "Frente",
    string? InputPdfPath = null,
    string OutputPdfPath = "saida_imposicao_step_repeat.pdf",
    RotationMode RotationMode = RotationMode.AutoBestFit,
    bool UseTrimBox = true,
    SmartMarkOptions? SmartMarkOptions = null
);
