using System.Security.Cryptography;
using System.Text;

namespace Imposition.Render.Preview;

/// <summary>
/// Chave determinística de cache para previews de emendas (ADR-052).
/// Inclui hash do arquivo de imagem, modo, dimensões de viewport, hashes de perfil ICC e flags de overlay.
/// </summary>
public sealed record PreviewCacheKey(
    string ImageHash,
    PreviewRenderMode Mode,
    int ViewportWidth,
    int ViewportHeight,
    string CmykProfileHash,
    string MonitorProfileHash,
    bool ShowCutLines,
    bool ShowGuideLines,
    bool ShowOverlapShading)
{
    /// <summary>
    /// Calcula o hash SHA-256 da chave composta para uso seguro como nome de arquivo em disco.
    /// </summary>
    public string ComputeSha256()
    {
        var rawKey = $"{ImageHash}|{Mode}|{ViewportWidth}x{ViewportHeight}|{CmykProfileHash}|{MonitorProfileHash}|{ShowCutLines}|{ShowGuideLines}|{ShowOverlapShading}";
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(rawKey));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
