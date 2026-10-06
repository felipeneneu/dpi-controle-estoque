using FluentAssertions;
using Imposition.Core.Errors;
using Imposition.Core.Seams;
using Imposition.Render.Preview;
using SkiaSharp;
using Xunit;

namespace Imposition.Render.Tests.Preview;

[Trait("Category", "Engine")]
public sealed class SeamsPreviewEngineTests : IDisposable
{
    private readonly string _testDir;
    private readonly PreviewDiskCache _cache;
    private readonly ColorProfileConfig _profiles;
    private readonly SeamsPreviewEngine _engine;
    private readonly List<string> _tempFiles = [];

    public SeamsPreviewEngineTests()
    {
        _testDir = Path.Combine(Path.GetTempPath(), "GraficaOS_Test_Engine_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_testDir);

        _cache = new PreviewDiskCache(_testDir);
        _profiles = ColorProfileConfig.Default;
        _engine = new SeamsPreviewEngine(_cache, _profiles);
    }

    private string CreateSampleImage(int width = 1000, int height = 500)
    {
        var path = Path.Combine(_testDir, $"img_{Guid.NewGuid():N}.jpg");
        using var bitmap = new SKBitmap(width, height);
        using var canvas = new SKCanvas(bitmap);
        canvas.Clear(SKColors.LightBlue);

        using var paint = new SKPaint { Color = SKColors.Red, StrokeWidth = 3 };
        canvas.DrawLine(0, 0, width, height, paint);

        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Jpeg, 85);
        File.WriteAllBytes(path, data.ToArray());

        _tempFiles.Add(path);
        return path;
    }

    private static SeamsResult CreateSampleSeams(double widthMm = 2000, double heightMm = 1000)
    {
        var panels = new List<PanelPlacement>
        {
            new(1, 0, 0, widthMm / 2, heightMm, (widthMm / 2) + 50, heightMm, 0, 50, 0, true),
            new(2, widthMm / 2, 0, widthMm / 2, heightMm, (widthMm / 2) + 50, heightMm, 50, 0, 0, false)
        };

        return new SeamsResult(
            TotalPanels: 2,
            Panels: panels,
            TotalLinearLengthMeters: 2.1,
            TotalWasteAreaM2: 0.1,
            ShrinkageAppliedMm: 0,
            EffectiveRollWidthMm: 1600);
    }

    [Fact]
    public async Task BR_052_RenderAsync_FirstCall_ReturnsFromCacheFalseAndGeneratesPng()
    {
        var imgPath = CreateSampleImage(800, 400);
        var seams = CreateSampleSeams(2000, 1000);
        var request = new SeamPreviewRequest(
            imgPath, seams, PreviewRenderMode.Performance, 800, 400, _profiles);

        var result = await _engine.RenderAsync(request);

        result.Should().NotBeNull();
        result.FromCache.Should().BeFalse();
        result.EncodedImagePng.Should().NotBeEmpty();
        result.RenderWidthPx.Should().Be(800);
        result.RenderHeightPx.Should().Be(400);
        result.ExecutedMode.Should().Be(PreviewRenderMode.Performance);
        result.ElapsedMilliseconds.Should().BeGreaterThanOrEqualTo(0);
    }

    [Fact]
    public async Task BR_052_RenderAsync_SecondCallSameKey_ReturnsFromCacheTrueWithIdenticalBytes()
    {
        var imgPath = CreateSampleImage(800, 400);
        var seams = CreateSampleSeams(2000, 1000);
        var request = new SeamPreviewRequest(
            imgPath, seams, PreviewRenderMode.Performance, 800, 400, _profiles);

        var firstResult = await _engine.RenderAsync(request);
        var secondResult = await _engine.RenderAsync(request);

        secondResult.FromCache.Should().BeTrue();
        secondResult.EncodedImagePng.Should().Equal(firstResult.EncodedImagePng);
        secondResult.RenderWidthPx.Should().Be(firstResult.RenderWidthPx);
        secondResult.RenderHeightPx.Should().Be(firstResult.RenderHeightPx);
    }

    [Fact]
    public async Task BR_052_RenderAsync_CancellationTokenCancelled_ThrowsOperationCanceledException()
    {
        var imgPath = CreateSampleImage(800, 400);
        var seams = CreateSampleSeams(2000, 1000);
        var request = new SeamPreviewRequest(
            imgPath, seams, PreviewRenderMode.Performance, 800, 400, _profiles);

        using var cts = new CancellationTokenSource();
        cts.Cancel(); // Pré-cancelado

        var act = () => _engine.RenderAsync(request, cts.Token);
        await act.Should().ThrowAsync<OperationCanceledException>();
    }

    [Fact]
    public async Task BR_052_RenderAsync_PerformanceMode_RenderWidthPxInsideViewport()
    {
        var imgPath = CreateSampleImage(2000, 1000);
        var seams = CreateSampleSeams(4000, 2000);
        var request = new SeamPreviewRequest(
            imgPath, seams, PreviewRenderMode.Performance, 800, 600, _profiles);

        var result = await _engine.RenderAsync(request);

        result.RenderWidthPx.Should().BeLessThanOrEqualTo(800);
        result.RenderHeightPx.Should().BeLessThanOrEqualTo(600);
    }

    [Fact]
    public async Task BR_052_RenderAsync_QualityMode_RenderWidthPxMatchesOrExceedsBalancedMode()
    {
        var imgPath = CreateSampleImage(2000, 1000);
        var seams = CreateSampleSeams(4000, 2000);

        var reqBalanced = new SeamPreviewRequest(
            imgPath, seams, PreviewRenderMode.Balanced, 800, 600, _profiles);
        var reqQuality = new SeamPreviewRequest(
            imgPath, seams, PreviewRenderMode.Quality, 800, 600, _profiles);

        var resBalanced = await _engine.RenderAsync(reqBalanced);
        var resQuality = await _engine.RenderAsync(reqQuality);

        resQuality.RenderWidthPx.Should().BeGreaterThanOrEqualTo(resBalanced.RenderWidthPx);
    }

    [Fact]
    public async Task BR_052_RenderAsync_NonCmykOrRgbInput_RendersSuccessfullyWithoutCrash()
    {
        var imgPath = CreateSampleImage(500, 500);
        var seams = CreateSampleSeams(1000, 1000);
        var request = new SeamPreviewRequest(
            imgPath, seams, PreviewRenderMode.Performance, 400, 400, _profiles);

        var act = () => _engine.RenderAsync(request);
        await act.Should().NotThrowAsync();
    }

    [Fact]
    public async Task BR_052_RenderAsync_NonExistentInput_ThrowsImpositionExceptionWithCodePreviewInputNotFound()
    {
        var seams = CreateSampleSeams(1000, 1000);
        var request = new SeamPreviewRequest(
            "arquivo_inexistente_12345.jpg", seams, PreviewRenderMode.Performance, 800, 600, _profiles);

        var act = () => _engine.RenderAsync(request);
        var ex = await act.Should().ThrowAsync<ImpositionException>();
        ex.Which.Code.Should().Be(ErrorCodes.PreviewInputNotFound);
    }

    [Fact]
    public void BR_052_RenderAsync_InvalidViewport_ThrowsException()
    {
        var seams = CreateSampleSeams(1000, 1000);

        var act = () => new SeamPreviewRequest(
            "dummy.jpg", seams, PreviewRenderMode.Performance, 0, 600, _profiles);

        act.Should().Throw<ArgumentOutOfRangeException>();
    }

    [Fact]
    public void BR_052_Dispose_CalledTwice_IsIdempotentAndDoesNotThrow()
    {
        var engine = new SeamsPreviewEngine(_cache, _profiles);

        var act = () =>
        {
            engine.Dispose();
            engine.Dispose();
        };

        act.Should().NotThrow();
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
