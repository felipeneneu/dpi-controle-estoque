namespace Imposition.Render.Preview;

/// <summary>
/// Downsampler de alta performance para buffers raster CMYK de pré-impressão (ADR-052 / Regra R-020).
/// Executa a redução de resolução diretamente nos 4 canais CMYK sem qualquer conversão prévia para RGB.
/// </summary>
public static class PreviewDownsampler
{
    /// <summary>
    /// Calcula as dimensões de saída ideais com base no modo de renderização e dimensões do viewport.
    /// </summary>
    public static (int Width, int Height) CalculateDimensions(
        int srcWidth,
        int srcHeight,
        int viewportWidth,
        int viewportHeight,
        PreviewRenderMode mode)
    {
        if (srcWidth <= 0 || srcHeight <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(srcWidth), "Dimensões da imagem fonte devem ser estritamente positivas.");
        }

        if (viewportWidth <= 0 || viewportHeight <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(viewportWidth), "Dimensões do viewport devem ser estritamente positivas.");
        }

        double scale;
        switch (mode)
        {
            case PreviewRenderMode.Performance:
                // Fit estrito dentro do viewport para latência mínima (< 100 ms)
                scale = Math.Min((double)viewportWidth / srcWidth, (double)viewportHeight / srcHeight);
                scale = Math.Min(scale, 1.0);
                break;

            case PreviewRenderMode.Balanced:
                // Escala intermediária de 1.5x do viewport para permitir zoom suave
                var fitScale = Math.Min((double)viewportWidth / srcWidth, (double)viewportHeight / srcHeight);
                scale = Math.Min(fitScale * 1.5, 1.0);
                break;

            case PreviewRenderMode.Quality:
            default:
                // Resolução integral 1:1 da fonte (limitada a 4096px para segurança de memória)
                var maxDimension = Math.Max(srcWidth, srcHeight);
                scale = maxDimension > 4096 ? 4096.0 / maxDimension : 1.0;
                break;
        }

        var targetWidth = Math.Max(1, (int)Math.Round(srcWidth * scale));
        var targetHeight = Math.Max(1, (int)Math.Round(srcHeight * scale));

        return (targetWidth, targetHeight);
    }

    /// <summary>
    /// Reduz a resolução de um buffer CMYK (4 bytes por pixel) diretamente no espaço de cores nativo.
    /// </summary>
    public static (byte[] Buffer, int Width, int Height) DownsampleCmyk(
        ReadOnlySpan<byte> srcBuffer,
        int srcWidth,
        int srcHeight,
        int targetWidth,
        int targetHeight,
        PreviewRenderMode mode)
    {
        if (srcWidth <= 0 || srcHeight <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(srcWidth), "Dimensões fonte inválidas.");
        }

        if (targetWidth <= 0 || targetHeight <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(targetWidth), "Dimensões alvo inválidas.");
        }

        var expectedSrcBytes = srcWidth * srcHeight * 4;
        if (srcBuffer.Length < expectedSrcBytes)
        {
            throw new ArgumentException($"Buffer CMYK insuficiente: esperado {expectedSrcBytes} bytes, recebido {srcBuffer.Length}.", nameof(srcBuffer));
        }

        // Se dimensões forem idênticas, copia o buffer diretamente
        if (srcWidth == targetWidth && srcHeight == targetHeight)
        {
            var copy = new byte[expectedSrcBytes];
            srcBuffer[..expectedSrcBytes].CopyTo(copy);
            return (copy, targetWidth, targetHeight);
        }

        var dstBytes = targetWidth * targetHeight * 4;
        var dstBuffer = new byte[dstBytes];

        var xRatio = (double)srcWidth / targetWidth;
        var yRatio = (double)srcHeight / targetHeight;

        // Amostragem por área (Box Averaging) para alta fidelidade cromática em downscale
        for (var dy = 0; dy < targetHeight; dy++)
        {
            var syStart = (int)(dy * yRatio);
            var syEnd = Math.Min(srcHeight, (int)Math.Ceiling((dy + 1) * yRatio));
            if (syEnd <= syStart) syEnd = syStart + 1;

            var dstRowOffset = dy * targetWidth * 4;

            for (var dx = 0; dx < targetWidth; dx++)
            {
                var sxStart = (int)(dx * xRatio);
                var sxEnd = Math.Min(srcWidth, (int)Math.Ceiling((dx + 1) * xRatio));
                if (sxEnd <= sxStart) sxEnd = sxStart + 1;

                long sumC = 0, sumM = 0, sumY = 0, sumK = 0;
                var count = 0;

                for (var sy = syStart; sy < syEnd; sy++)
                {
                    var srcRowOffset = sy * srcWidth * 4;
                    for (var sx = sxStart; sx < sxEnd; sx++)
                    {
                        var srcPixelOffset = srcRowOffset + (sx * 4);
                        sumC += srcBuffer[srcPixelOffset];
                        sumM += srcBuffer[srcPixelOffset + 1];
                        sumY += srcBuffer[srcPixelOffset + 2];
                        sumK += srcBuffer[srcPixelOffset + 3];
                        count++;
                    }
                }

                var dstPixelOffset = dstRowOffset + (dx * 4);
                dstBuffer[dstPixelOffset] = (byte)(count > 0 ? sumC / count : 0);
                dstBuffer[dstPixelOffset + 1] = (byte)(count > 0 ? sumM / count : 0);
                dstBuffer[dstPixelOffset + 2] = (byte)(count > 0 ? sumY / count : 0);
                dstBuffer[dstPixelOffset + 3] = (byte)(count > 0 ? sumK / count : 0);
            }
        }

        return (dstBuffer, targetWidth, targetHeight);
    }
}
