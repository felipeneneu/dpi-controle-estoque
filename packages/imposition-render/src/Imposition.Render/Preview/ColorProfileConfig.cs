namespace Imposition.Render.Preview;

/// <summary>
/// Intent de renderização para conversão de cores ICC (LittleCMS).
/// </summary>
public enum RenderingIntent
{
    Perceptual = 0,
    RelativeColorimetric = 1,
    Saturation = 2,
    AbsoluteColorimetric = 3
}

/// <summary>
/// Configuração de perfis ICC de entrada (CMYK) e saída (Monitor/Display) para display adaptation (ADR-052 / Regra R-020).
/// </summary>
public sealed record ColorProfileConfig
{
    public string CmykProfilePath { get; }
    public string MonitorProfilePath { get; }
    public RenderingIntent Intent { get; }

    public ColorProfileConfig(
        string cmykProfilePath,
        string monitorProfilePath = "sRGB",
        RenderingIntent intent = RenderingIntent.RelativeColorimetric)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(cmykProfilePath, nameof(cmykProfilePath));
        ArgumentException.ThrowIfNullOrWhiteSpace(monitorProfilePath, nameof(monitorProfilePath));

        CmykProfilePath = cmykProfilePath;
        MonitorProfilePath = monitorProfilePath;
        Intent = intent;
    }

    /// <summary>
    /// Configuração padrão utilizando FOGRA39 como espaço CMYK e sRGB para display.
    /// </summary>
    public static ColorProfileConfig Default => new("FOGRA39.icc", "sRGB.icc", RenderingIntent.RelativeColorimetric);
}
