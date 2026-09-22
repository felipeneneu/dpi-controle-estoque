namespace Imposition.Pdf.Contracts;

/// <summary>Opções de imposição para o PdfImposer.</summary>
public sealed record ImposeOptions(
    double SheetWMm,
    double SheetHMm,
    int Cols,
    int Rows,
    double StartXMm,
    double StartYMm,
    double StepXMm,
    double StepYMm,
    bool Rotate90,
    MarksOptions? Marks = null);

/// <summary>Informações de OCG extraídas do PDF.</summary>
public sealed record OcgInfo(
    bool HasOcg,
    IReadOnlyList<OcgLayer> Layers);

public sealed record OcgLayer(
    string Name,
    string ObjectRef);
