using FluentAssertions;
using Imposition.Render.Preview;
using Xunit;

namespace Imposition.Render.Tests.Preview;

[Trait("Category", "Cache")]
public sealed class PreviewDiskCacheTests : IDisposable
{
    private readonly string _testCacheDir;

    public PreviewDiskCacheTests()
    {
        _testCacheDir = Path.Combine(Path.GetTempPath(), "GraficaOS_TestCache_" + Guid.NewGuid().ToString("N"));
    }

    public void Dispose()
    {
        if (Directory.Exists(_testCacheDir))
        {
            try { Directory.Delete(_testCacheDir, recursive: true); } catch { }
        }
    }

    [Fact]
    public void BR_052_SetAndTryGet_RetrievesIdenticalBytes()
    {
        // Arrange
        var cache = new PreviewDiskCache(_testCacheDir);
        var key = new PreviewCacheKey("img_hash_123", PreviewRenderMode.Balanced, 800, 600, "fogra39_hash", "srgb_hash", true, true, true);
        byte[] expectedBytes = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]; // PNG header

        // Act
        cache.Set(key, expectedBytes);
        var found = cache.TryGet(key, out var retrievedBytes);

        // Assert
        found.Should().BeTrue();
        retrievedBytes.Should().NotBeNull();
        retrievedBytes.Should().Equal(expectedBytes);
    }

    [Fact]
    public void BR_052_DifferentIccProfileHash_ResultsInCacheMiss()
    {
        // Arrange
        var cache = new PreviewDiskCache(_testCacheDir);
        var key1 = new PreviewCacheKey("img_1", PreviewRenderMode.Balanced, 800, 600, "profile_A", "srgb", true, true, true);
        var key2 = new PreviewCacheKey("img_1", PreviewRenderMode.Balanced, 800, 600, "profile_B", "srgb", true, true, true);
        byte[] data = [1, 2, 3, 4];

        // Act
        cache.Set(key1, data);
        var found = cache.TryGet(key2, out var retrieved);

        // Assert: Chave com profile diferente não deve colidir
        found.Should().BeFalse();
        retrieved.Should().BeNull();
    }

    [Fact]
    public void BR_052_ExpiredTtl_ReturnsCacheMiss()
    {
        // Arrange: TTL negativo / expirado
        var cache = new PreviewDiskCache(_testCacheDir, ttl: TimeSpan.FromMilliseconds(-100));
        var key = new PreviewCacheKey("img_exp", PreviewRenderMode.Performance, 400, 300, "f39", "srgb", true, true, true);
        byte[] data = [10, 20, 30];

        // Act
        cache.Set(key, data);
        var found = cache.TryGet(key, out var retrieved);

        // Assert
        found.Should().BeFalse();
        retrieved.Should().BeNull();
    }

    [Fact]
    public void BR_052_LruEviction_DeletesOldestFilesWhenExceedingMaxSize()
    {
        // Arrange: Limite de 1500 bytes
        var cache = new PreviewDiskCache(_testCacheDir, maxSizeBytes: 1500);
        var key1 = new PreviewCacheKey("k1", PreviewRenderMode.Performance, 100, 100, "p1", "srgb", false, false, false);
        var key2 = new PreviewCacheKey("k2", PreviewRenderMode.Performance, 100, 100, "p1", "srgb", false, false, false);
        var key3 = new PreviewCacheKey("k3", PreviewRenderMode.Performance, 100, 100, "p1", "srgb", false, false, false);

        byte[] payload = new byte[800]; // 800 bytes cada
        Array.Fill(payload, (byte)0xFF);

        // Act
        cache.Set(key1, payload);
        Thread.Sleep(50);
        cache.Set(key2, payload); // total = 1600 > 1500 -> dispara eviction
        Thread.Sleep(50);
        cache.Set(key3, payload);

        // Assert: key1 deve ter sido descartado por LRU
        cache.TryGet(key1, out _).Should().BeFalse();
        cache.TryGet(key3, out _).Should().BeTrue();
    }
}
