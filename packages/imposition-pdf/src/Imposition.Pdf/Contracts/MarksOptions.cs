using Imposition.Pdf.Marks;

namespace Imposition.Pdf.Contracts;

/// <summary>Opções de marcas de corte.</summary>
public sealed record MarksOptions(
    MarkType Type,
    double SizeMm = 20.0,
    double OffsetMm = 3.0,
    double LineWidthPt = 0.25,
    string LayerName = "MARCAS",
    bool FillAroundRdG = false,
    string? CustomMarkFile = null);
