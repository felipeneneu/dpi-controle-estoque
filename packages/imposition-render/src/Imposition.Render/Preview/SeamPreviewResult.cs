namespace Imposition.Render.Preview;

/// <summary>
/// Resultado da renderização de preview da arte com emendas (ADR-052).
/// </summary>
public sealed record SeamPreviewResult(
    byte[] EncodedImagePng,       // Buffer RGB/PNG — apenas para exibição em tela
    int RenderWidthPx,
    int RenderHeightPx,
    long ElapsedMilliseconds,
    PreviewRenderMode ExecutedMode,
    bool FromCache);
