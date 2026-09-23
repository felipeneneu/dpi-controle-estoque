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
        // Formato:
        // /CSN [/Separation /NOME /DeviceCMYK <<FunctionType 2 ...>>]
        //
        // Para tint 100%: C0=0 e C1=valores CMYK
        var name = spotName;
        var resource = $"/CS_{name} [/Separation /{name} /DeviceCMYK " +
                       $"<< /FunctionType 2 /Domain [0 1] " +
                       $"/C0 [0 0 0 0] " +
                       $"/C1 [{c} {m} {y} {k}] /N 1 >>]";

        // Content stream: /CS_NOME cs / 1 sc  (tint 100%)
        var setup = $"/CS_{name} cs\n1 sc\n";

        return (resource, setup);
    }
}
