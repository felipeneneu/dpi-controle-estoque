using System.Diagnostics;
using System.Security.Cryptography;
using Imposition.Core.Errors;
using Imposition.Core.Seams;
using SkiaSharp;

namespace Imposition.Render.Preview;

/// <summary>
/// Motor integrado de renderização de preview multirresolução de emendas (ADR-052 / BR_052).
/// Orquestra cache em disco, decodificação, downsampling, display adaptation LittleCMS e pintura de overlays.
/// </summary>
public sealed class SeamsPreviewEngine : IDisposable
{
    private readonly PreviewDiskCache _cache;
    private readonly ColorProfileConfig _profiles;
    private readonly CmykToDisplayTransform _transform;
    private bool _disposed;
    private readonly object _lock = new();

    public PreviewDiskCache Cache => _cache;
    public ColorProfileConfig Profiles => _profiles;
    public CmykToDisplayTransform Transform => _transform;

    public SeamsPreviewEngine(PreviewDiskCache cache, ColorProfileConfig profiles)
    {
        ArgumentNullException.ThrowIfNull(cache, nameof(cache));
        ArgumentNullException.ThrowIfNull(profiles, nameof(profiles));

        _cache = cache;
        _profiles = profiles;
        _transform = new CmykToDisplayTransform(profiles);
    }

    /// <summary>
    /// Renderiza de forma assíncrona o preview da arte com emendas aplicando cache, downsampling e overlays.
    /// </summary>
    public async Task<SeamPreviewResult> RenderAsync(
        SeamPreviewRequest request,
        CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        ArgumentNullException.ThrowIfNull(request, nameof(request));

        if (request.TargetViewportWidthPx <= 0 || request.TargetViewportHeightPx <= 0)
        {
            throw new ImpositionException(ErrorCodes.InvalidPreviewInput, "As dimensões do viewport devem ser estritamente positivas.");
        }

        if (string.IsNullOrWhiteSpace(request.ImagePath))
        {
            throw new ImpositionException(ErrorCodes.InvalidPreviewInput, "O caminho do arquivo de imagem não pode ser nulo ou vazio.");
        }

        if (!File.Exists(request.ImagePath))
        {
            throw new ImpositionException(ErrorCodes.PreviewInputNotFound, $"Arquivo de imagem de entrada não encontrado: '{request.ImagePath}'.");
        }

        cancellationToken.ThrowIfCancellationRequested();

        var imageHash = ComputeImageHash(request.ImagePath);
        var cmykHash = string.IsNullOrWhiteSpace(request.Profiles.CmykProfilePath) ? "FOGRA39" : request.Profiles.CmykProfilePath;
        var monitorHash = string.IsNullOrWhiteSpace(request.Profiles.MonitorProfilePath) ? "sRGB" : request.Profiles.MonitorProfilePath;

        var cacheKey = new PreviewCacheKey(
            imageHash,
            request.Mode,
            request.TargetViewportWidthPx,
            request.TargetViewportHeightPx,
            cmykHash,
            monitorHash,
            request.ShowCutLines,
            request.ShowGuideLines,
            request.ShowOverlapShading);

        // 1. Verificação em Cache
        if (_cache.TryGet(cacheKey, out var cachedPng))
        {
            using var cachedCodec = SKCodec.Create(new MemoryStream(cachedPng));
            var cachedW = cachedCodec?.Info.Width ?? request.TargetViewportWidthPx;
            var cachedH = cachedCodec?.Info.Height ?? request.TargetViewportHeightPx;

            return new SeamPreviewResult(
                cachedPng,
                cachedW,
                cachedH,
                ElapsedMilliseconds: 0,
                request.Mode,
                FromCache: true);
        }

        // 2. Execução Completa (Cache Miss) com medição real de tempo (R-019)
        var sw = Stopwatch.StartNew();

        using var stream = File.OpenRead(request.ImagePath);
        using var codec = SKCodec.Create(stream);
        if (codec == null)
        {
            throw new ImpositionException(ErrorCodes.InvalidPreviewInput, $"Não foi possível decodificar o arquivo de imagem: '{request.ImagePath}'.");
        }

        var srcWidth = codec.Info.Width;
        var srcHeight = codec.Info.Height;

        var (targetW, targetH) = PreviewDownsampler.CalculateDimensions(
            srcWidth,
            srcHeight,
            request.TargetViewportWidthPx,
            request.TargetViewportHeightPx,
            request.Mode);

        cancellationToken.ThrowIfCancellationRequested();

        var targetInfo = new SKImageInfo(targetW, targetH, SKColorType.Rgba8888, SKAlphaType.Premul);
        using SKBitmap renderBitmap = new(targetInfo);

        var desiredScale = Math.Max((float)targetW / srcWidth, (float)targetH / srcHeight);
        var scaledDimensions = codec.GetScaledDimensions(desiredScale);

        if (scaledDimensions.Width > 0 && scaledDimensions.Height > 0)
        {
            var intermediateInfo = new SKImageInfo(scaledDimensions.Width, scaledDimensions.Height, SKColorType.Rgba8888, SKAlphaType.Premul);
            using var subBitmap = SKBitmap.Decode(codec, intermediateInfo);

            if (subBitmap != null)
            {
                if (scaledDimensions.Width == targetW && scaledDimensions.Height == targetH)
                {
                    subBitmap.CopyTo(renderBitmap);
                }
                else
                {
                    using var resized = subBitmap.Resize(targetInfo, SKSamplingOptions.Default);
                    if (resized != null)
                    {
                        resized.CopyTo(renderBitmap);
                    }
                }
            }
            else
            {
                // Fallback decode padrão
                stream.Position = 0;
                using var fullBitmap = SKBitmap.Decode(stream);
                if (fullBitmap != null)
                {
                    using var resized = fullBitmap.Resize(targetInfo, SKSamplingOptions.Default);
                    resized?.CopyTo(renderBitmap);
                }
            }
        }
        else
        {
            stream.Position = 0;
            using var fullBitmap = SKBitmap.Decode(stream);
            if (fullBitmap != null)
            {
                using var resized = fullBitmap.Resize(targetInfo, SKSamplingOptions.Default);
                resized?.CopyTo(renderBitmap);
            }
        }

        cancellationToken.ThrowIfCancellationRequested();

        // 3. Pintura de Overlays de UI
        using (var canvas = new SKCanvas(renderBitmap))
        {
            PreviewOverlayPainter.PaintOverlays(
                canvas,
                request.Seams,
                request,
                _transform,
                targetW,
                targetH);

            canvas.Flush();
        }

        cancellationToken.ThrowIfCancellationRequested();

        // 4. Codificação PNG e Armazenamento em Cache
        using var image = SKImage.FromBitmap(renderBitmap);
        using var encodedData = image.Encode(SKEncodedImageFormat.Png, 80);
        var pngBytes = encodedData.ToArray();

        sw.Stop();

        _cache.Set(cacheKey, pngBytes);

        return new SeamPreviewResult(
            pngBytes,
            targetW,
            targetH,
            sw.ElapsedMilliseconds,
            request.Mode,
            FromCache: false);
    }

    private static string ComputeImageHash(string filePath)
    {
        var info = new FileInfo(filePath);
        var raw = $"{info.FullName}|{info.Length}|{info.LastWriteTimeUtc.Ticks}";
        var bytes = SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(raw));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    public void Dispose()
    {
        if (_disposed)
            return;

        lock (_lock)
        {
            if (_disposed)
                return;

            _disposed = true;
            _transform.Dispose();
        }
    }
}
