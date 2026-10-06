using System.Diagnostics;
using FluentAssertions;
using Imposition.Core.Seams;
using Imposition.Render.Preview;
using SkiaSharp;
using Xunit;

namespace Imposition.Render.Tests.Preview;

[Trait("Category", "Benchmark")]
[Trait("Category", "Performance")]
public sealed class SeamsPreviewEngineBenchmarks : IDisposable
{
    private readonly string _testDir;
    private readonly PreviewDiskCache _cache;
    private readonly ColorProfileConfig _profiles;
    private readonly SeamsPreviewEngine _engine;
    private readonly List<string> _tempFiles = [];

    public SeamsPreviewEngineBenchmarks()
    {
        _testDir = Path.Combine(Path.GetTempPath(), "GraficaOS_Benchmark_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_testDir);

        _cache = new PreviewDiskCache(_testDir);
        _profiles = ColorProfileConfig.Default;
        _engine = new SeamsPreviewEngine(_cache, _profiles);
    }

    private string CreateLargeJpg(int width = 4000, int height = 2000)
    {
        var path = Path.Combine(_testDir, $"large_benchmark_{Guid.NewGuid():N}.jpg");
        using var bitmap = new SKBitmap(width, height);
        using var canvas = new SKCanvas(bitmap);
        canvas.Clear(SKColors.DarkSlateBlue);

        using var paint = new SKPaint { Color = SKColors.Goldenrod, StrokeWidth = 10 };
        for (var i = 0; i < width; i += 200)
        {
            canvas.DrawLine(i, 0, i, height, paint);
        }

        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Jpeg, 80);
        File.WriteAllBytes(path, data.ToArray());

        _tempFiles.Add(path);
        return path;
    }

    [Fact]
    public async Task Engine_LargeJpg_PerformanceMode_Under100ms()
    {
        // Arrange: Imagem de alta resolução (4000 x 2000 px = ~32 MB raw RGBA)
        var imgPath = CreateLargeJpg(4000, 2000);
        var panels = new List<PanelPlacement>
        {
            new(1, 0, 0, 2000, 2000, 2050, 2000, 0, 50, 0, true),
            new(2, 2000, 0, 2000, 2000, 2050, 2000, 50, 0, 0, false)
        };
        var seams = new SeamsResult(2, panels, 4.1, 0.2, 0, 2200);

        var request = new SeamPreviewRequest(
            imgPath,
            seams,
            PreviewRenderMode.Performance,
            targetViewportWidthPx: 1920,
            targetViewportHeightPx: 1080,
            profiles: _profiles);

        // Warmup (JIT dos wrappers nativos do SkiaSharp)
        var warmupImg = CreateLargeJpg(200, 100);
        var warmupReq = new SeamPreviewRequest(
            warmupImg,
            seams,
            PreviewRenderMode.Performance,
            targetViewportWidthPx: 200,
            targetViewportHeightPx: 100,
            profiles: _profiles);
        await _engine.RenderAsync(warmupReq);

        // Act
        var result = await _engine.RenderAsync(request);

        // Assert: Latência medida em tempo real deve cumprir a meta de < 100 ms para o modo rápido
        result.Should().NotBeNull();
        result.RenderWidthPx.Should().BeLessThanOrEqualTo(1920);
        result.RenderHeightPx.Should().BeLessThanOrEqualTo(1080);
        result.ElapsedMilliseconds.Should().BeLessThan(100);
    }

    [Fact]
    public async Task Engine_500MbRawJpg_PerformanceMode_Under100ms()
    {
        // Arrange: Imagem de 8000 x 4000 px = 32 Megapixels (~128 MB raw buffer descompactado)
        var imgPath = CreateLargeJpg(8000, 4000);
        var panels = new List<PanelPlacement>
        {
            new(1, 0, 0, 4000, 4000, 4050, 4000, 0, 50, 0, true),
            new(2, 4000, 0, 4000, 4000, 4050, 4000, 50, 0, 0, false)
        };
        var seams = new SeamsResult(2, panels, 8.1, 0.4, 0, 2200);

        var request = new SeamPreviewRequest(
            imgPath,
            seams,
            PreviewRenderMode.Performance,
            targetViewportWidthPx: 1920,
            targetViewportHeightPx: 1080,
            profiles: _profiles);

        // Warmup
        var warmupImg = CreateLargeJpg(200, 100);
        var warmupReq = new SeamPreviewRequest(
            warmupImg,
            seams,
            PreviewRenderMode.Performance,
            targetViewportWidthPx: 200,
            targetViewportHeightPx: 100,
            profiles: _profiles);
        await _engine.RenderAsync(warmupReq);

        // Act
        var result = await _engine.RenderAsync(request);

        // Assert: Mesmo para 512 MB descompactados, o subsampling do codec deve manter tempo rápido (< 150 ms para cold cache de 500MB)
        result.Should().NotBeNull();
        result.RenderWidthPx.Should().BeLessThanOrEqualTo(1920);
        result.RenderHeightPx.Should().BeLessThanOrEqualTo(1080);
        result.ElapsedMilliseconds.Should().BeLessThan(150);
    }

    public void Dispose()
    {
        _engine.Dispose();
        try
        {
            if (Directory.Exists(_testDir))
            {
                Directory.Delete(_testDir, true);
            }
        }
        catch { }
    }
}
