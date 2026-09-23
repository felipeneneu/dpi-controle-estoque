namespace Imposition.Pdf.Marks;

/// <summary>
/// Registra /Separation color spaces no catlogo do PDF.
/// Um spot precisa existir em /Resources/ColorSpace para ser usado
/// no content stream.
/// </summary>
internal static class SpotRegistry
{
    /// <summary>
    /// Gera o snippet QDF para registrar um spot. Retorna
    /// (resourceEntry, contentStreamSetup).
    /// </summary>
    public static (string resourceEntry, string contentStreamSetup)
        BuildSeparation(string spotName, double c, double m, double y, double k)
    {
        // Formato compatível com ISO 32000-1 e Adobe Illustrator:
        // /CS_NOME [/Separation /NOME /DeviceCMYK << /FunctionType 2 /Domain [0 1] /C0 [0.0 0.0 0.0 0.0] /C1 [c m y k] /N 1.0 /Range [...] >>]
        var name = spotName;
        var ci = System.Globalization.CultureInfo.InvariantCulture;
        var resource = $"/CS_{name} [/Separation /{name} /DeviceCMYK " +
                       $"<< /FunctionType 2 /Domain [0 1] " +
                       $"/C0 [0.0 0.0 0.0 0.0] " +
                       $"/C1 [{c.ToString("0.0", ci)} {m.ToString("0.0", ci)} {y.ToString("0.0", ci)} {k.ToString("0.0", ci)}] /N 1.0 " +
                       $"/Range [0.0 1.0 0.0 1.0 0.0 1.0 0.0 1.0] >>]";

        // Content stream:
        // CS e SCN para traço (stroke - operador S)
        // cs e scn para preenchimento (fill - operadores f, re f)
        // Tint a 100% (1)
        var setup = $"/CS_{name} CS\n1 SCN\n/CS_{name} cs\n1 scn\n";

        return (resource, setup);
    }
}
