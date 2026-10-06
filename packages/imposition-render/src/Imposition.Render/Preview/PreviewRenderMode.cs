namespace Imposition.Render.Preview;

/// <summary>
/// Modos operacionais de renderização do preview de emendas (ADR-052).
/// </summary>
public enum PreviewRenderMode
{
    /// <summary>
    /// Renderização ultra-rápida com downscaling agressivo (meta &lt; 100 ms).
    /// </summary>
    Performance = 0,

    /// <summary>
    /// Renderização balanceada com resolução intermediária (meta &lt; 300 ms).
    /// </summary>
    Balanced = 1,

    /// <summary>
    /// Renderização de alta fidelidade 1:1 ou 100 DPI (meta &lt; 1000 ms).
    /// </summary>
    Quality = 2
}
