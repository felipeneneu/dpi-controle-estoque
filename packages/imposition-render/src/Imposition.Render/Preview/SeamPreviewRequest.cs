using Imposition.Core.Seams;

namespace Imposition.Render.Preview;

/// <summary>
/// Requisição de renderização de preview multirresolução de emendas (ADR-052).
/// </summary>
public sealed record SeamPreviewRequest
{
    public string ImagePath { get; }
    public SeamsResult Seams { get; }
    public PreviewRenderMode Mode { get; }
    public int TargetViewportWidthPx { get; }
    public int TargetViewportHeightPx { get; }
    public ColorProfileConfig Profiles { get; }
    public bool ShowCutLines { get; }
    public bool ShowGuideLines { get; }
    public bool ShowOverlapShading { get; }

    public SeamPreviewRequest(
        string imagePath,
        SeamsResult seams,
        PreviewRenderMode mode,
        int targetViewportWidthPx,
        int targetViewportHeightPx,
        ColorProfileConfig profiles,
        bool showCutLines = true,
        bool showGuideLines = true,
        bool showOverlapShading = true)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(imagePath, nameof(imagePath));
        ArgumentNullException.ThrowIfNull(seams, nameof(seams));
        ArgumentNullException.ThrowIfNull(profiles, nameof(profiles));

        if (targetViewportWidthPx <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(targetViewportWidthPx), "A largura do viewport deve ser estritamente positiva.");
        }

        if (targetViewportHeightPx <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(targetViewportHeightPx), "A altura do viewport deve ser estritamente positiva.");
        }

        ImagePath = imagePath;
        Seams = seams;
        Mode = mode;
        TargetViewportWidthPx = targetViewportWidthPx;
        TargetViewportHeightPx = targetViewportHeightPx;
        Profiles = profiles;
        ShowCutLines = showCutLines;
        ShowGuideLines = showGuideLines;
        ShowOverlapShading = showOverlapShading;
    }
}
