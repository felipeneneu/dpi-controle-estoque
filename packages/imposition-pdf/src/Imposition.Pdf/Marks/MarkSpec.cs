namespace Imposition.Pdf.Marks;

/// <summary>
/// Especificação de uma marca de registro/corte.
/// StrokeMm: espessura do traço em mm (convertido para pt no renderer).
/// </summary>
public sealed record MarkSpec(
    string Name,
    MarkType Type,
    double SizeMm,
    double OffsetMm,
    double StrokeMm,
    bool HasRdgFill = false,
    string? SpotName = null,
    string RdgSpotName = "RDG_WHITE",
    double RdgBorderMm = 2.0);

public static class MarkSpecs
{
    public const double MimakiDefaultSizeMm = 20.0;
    public const double MimakiDefaultStrokeMm = 1.0;

    public static readonly MarkSpec[] All = new[]
    {
        new MarkSpec("mimaki-tipo1-plain", MarkType.MimakiTipo1Plain,
                     SizeMm: 20, OffsetMm: 3, StrokeMm: 1.0),
        new MarkSpec("mimaki-fcrm", MarkType.MimakiTipo1Fcrm,
                     SizeMm: 20, OffsetMm: 3, StrokeMm: 1.0,
                     SpotName: "MimakiFCRM"),
        new MarkSpec("mimaki-fcrm-rdg", MarkType.MimakiTipo1FcrmRdg,
                     SizeMm: 20, OffsetMm: 3, StrokeMm: 1.0,
                     HasRdgFill: true, SpotName: "MimakiFCRM"),
        new MarkSpec("crop-3mm", MarkType.Crop,
                     SizeMm: 5, OffsetMm: 3, StrokeMm: 0.088),
    };
}
