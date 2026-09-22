namespace Imposition.Pdf.Contracts;

/// <summary>Tipo de marca de corte.</summary>
public enum MarkType
{
    /// <summary>L-shape para guilhotina (Konica).</summary>
    Crop,

    /// <summary>OutTombo Tipo 1 da Mimaki (plotter lê via sensor).</summary>
    MimakiTipo1,

    /// <summary>Marca customizada injetada de um PDF externo.</summary>
    CustomPdf,
}

/// <summary>Opções de marcas de corte.</summary>
public sealed record MarksOptions(
    MarkType Type,
    double SizeMm = 10.0,
    double OffsetMm = 3.0,
    double LineWidthPt = 0.25,
    string LayerName = "MARCAS",
    bool FillAroundRdG = false,
    string? CustomMarkFile = null);
