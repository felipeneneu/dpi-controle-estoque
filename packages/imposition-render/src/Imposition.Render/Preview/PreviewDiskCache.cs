using System.Diagnostics.CodeAnalysis;

namespace Imposition.Render.Preview;

/// <summary>
/// Cache em disco persistente para renderizações de preview (ADR-052 / BR_052_CACHE).
/// Gerencia retenção por TTL, limite de tamanho em bytes com política LRU e escrita atômica.
/// </summary>
public sealed class PreviewDiskCache
{
    private readonly string _cacheDirectory;
    private readonly TimeSpan _ttl;
    private readonly long _maxSizeBytes;
    private readonly object _lock = new();

    public string CacheDirectory => _cacheDirectory;
    public TimeSpan Ttl => _ttl;
    public long MaxSizeBytes => _maxSizeBytes;

    public PreviewDiskCache(
        string? cacheDirectory = null,
        TimeSpan? ttl = null,
        long maxSizeBytes = 500L * 1024 * 1024) // 500 MB default
    {
        _cacheDirectory = cacheDirectory ?? Path.Combine(Path.GetTempPath(), "GraficaOS", "PreviewCache");
        _ttl = ttl ?? TimeSpan.FromDays(7);
        _maxSizeBytes = maxSizeBytes > 0 ? maxSizeBytes : 500L * 1024 * 1024;

        if (!Directory.Exists(_cacheDirectory))
        {
            Directory.CreateDirectory(_cacheDirectory);
        }
    }

    /// <summary>
    /// Tenta recuperar a imagem PNG em cache associada à chave composta.
    /// </summary>
    public bool TryGet(PreviewCacheKey key, [NotNullWhen(true)] out byte[]? pngBytes)
    {
        ArgumentNullException.ThrowIfNull(key, nameof(key));

        var hash = key.ComputeSha256();
        var filePath = Path.Combine(_cacheDirectory, $"{hash}.png");

        lock (_lock)
        {
            if (!File.Exists(filePath))
            {
                pngBytes = null;
                return false;
            }

            var fileInfo = new FileInfo(filePath);
            var age = DateTime.UtcNow - fileInfo.LastWriteTimeUtc;

            if (age > _ttl)
            {
                try { File.Delete(filePath); } catch { }
                pngBytes = null;
                return false;
            }

            try
            {
                pngBytes = File.ReadAllBytes(filePath);
                try { File.SetLastAccessTimeUtc(filePath, DateTime.UtcNow); } catch { }
                return true;
            }
            catch
            {
                pngBytes = null;
                return false;
            }
        }
    }

    /// <summary>
    /// Salva o buffer PNG no cache de forma atômica utilizando arquivo temporário e rename.
    /// </summary>
    public void Set(PreviewCacheKey key, byte[] pngBytes)
    {
        ArgumentNullException.ThrowIfNull(key, nameof(key));
        ArgumentNullException.ThrowIfNull(pngBytes, nameof(pngBytes));

        if (!Directory.Exists(_cacheDirectory))
        {
            Directory.CreateDirectory(_cacheDirectory);
        }

        var hash = key.ComputeSha256();
        var finalPath = Path.Combine(_cacheDirectory, $"{hash}.png");
        var tempPath = Path.Combine(_cacheDirectory, $"{hash}_{Guid.NewGuid():N}.tmp");

        lock (_lock)
        {
            try
            {
                File.WriteAllBytes(tempPath, pngBytes);
                File.Move(tempPath, finalPath, overwrite: true);
                File.SetLastAccessTimeUtc(finalPath, DateTime.UtcNow);
                File.SetLastWriteTimeUtc(finalPath, DateTime.UtcNow);

                EvictIfNecessary();
            }
            finally
            {
                if (File.Exists(tempPath))
                {
                    try { File.Delete(tempPath); } catch { }
                }
            }
        }
    }

    /// <summary>
    /// Executa a limpeza de arquivos expirados (TTL) e descarte LRU caso o limite de tamanho seja ultrapassado.
    /// </summary>
    public void EvictIfNecessary()
    {
        lock (_lock)
        {
            if (!Directory.Exists(_cacheDirectory))
            {
                return;
            }

            var dir = new DirectoryInfo(_cacheDirectory);
            var files = dir.GetFiles("*.png").ToList();

            var now = DateTime.UtcNow;
            long totalSize = 0;
            var activeFiles = new List<FileInfo>();

            foreach (var file in files)
            {
                if (now - file.LastWriteTimeUtc > _ttl)
                {
                    try { file.Delete(); } catch { }
                }
                else
                {
                    totalSize += file.Length;
                    activeFiles.Add(file);
                }
            }

            if (totalSize > _maxSizeBytes)
            {
                // Ordena por LastAccessTimeUtc ascendente (menos acessado recentemente primeiro)
                var orderedFiles = activeFiles.OrderBy(f => f.LastAccessTimeUtc).ToList();

                foreach (var file in orderedFiles)
                {
                    if (totalSize <= _maxSizeBytes * 0.85) // Libera até 85% da capacidade
                    {
                        break;
                    }

                    var len = file.Length;
                    try
                    {
                        file.Delete();
                        totalSize -= len;
                    }
                    catch { }
                }
            }
        }
    }

    /// <summary>
    /// Limpa todos os arquivos do cache em disco.
    /// </summary>
    public void Clear()
    {
        lock (_lock)
        {
            if (!Directory.Exists(_cacheDirectory))
            {
                return;
            }

            var dir = new DirectoryInfo(_cacheDirectory);
            foreach (var file in dir.GetFiles())
            {
                try { file.Delete(); } catch { }
            }
        }
    }
}
