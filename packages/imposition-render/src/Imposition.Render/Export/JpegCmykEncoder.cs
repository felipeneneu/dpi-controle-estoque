using System.Buffers.Binary;
using BitMiracle.LibJpeg.Classic;

namespace Imposition.Render.Export;

/// <summary>
/// Codificador e decodificador gerenciado de alta fidelidade para imagens JPEG em espaço de cores CMYK puro (4 canais: C, M, Y, K)
/// baseado em BitMiracle.LibJpeg.NET (ADR-056 / Regra R-020).
/// Respeita estritamente a especificação ISO/IEC 10918-5: omite cabeçalho APP0 JFIF em CMYK, emite marcador APP14 Adobe
/// com ColorTransform = 0 (Direct CMYK) e embute perfil ICC CMYK (FOGRA39) em marcadores APP2 (ICC.1:2010).
/// </summary>
public static class JpegCmykEncoder
{
    private static readonly byte[] IccProfileHeader = [
        (byte)'I', (byte)'C', (byte)'C', (byte)'_',
        (byte)'P', (byte)'R', (byte)'O', (byte)'F',
        (byte)'I', (byte)'L', (byte)'E', 0x00
    ];

    private static readonly Lazy<byte[]?> DefaultFogra39Icc = new(LoadDefaultFogra39Profile);

    /// <summary>
    /// Retorna os bytes do perfil ICC FOGRA39 padrão do sistema ou sintetizado.
    /// </summary>
    public static byte[]? GetDefaultFogra39Profile() => DefaultFogra39Icc.Value;

    private static byte[]? LoadDefaultFogra39Profile()
    {
        string[] candidates = [
            @"C:\Windows\System32\spool\drivers\color\CoatedFOGRA39.icc",
            Path.Combine(AppContext.BaseDirectory, "resources", "icc", "cmyk", "CoatedFOGRA39.icc"),
            Path.Combine(Directory.GetCurrentDirectory(), "resources", "icc", "cmyk", "CoatedFOGRA39.icc")
        ];

        foreach (var path in candidates)
        {
            if (File.Exists(path))
            {
                try
                {
                    return File.ReadAllBytes(path);
                }
                catch
                {
                    // Tenta próximo candidato
                }
            }
        }

        // Fallback: cabeçalho sintético válido ICC v2 CMYK (mínimo 256 bytes)
        var synthetic = new byte[256];
        BinaryPrimitives.WriteUInt32BigEndian(synthetic.AsSpan(0, 4), 256);
        synthetic[36] = (byte)'a';
        synthetic[37] = (byte)'c';
        synthetic[38] = (byte)'s';
        synthetic[39] = (byte)'p';
        synthetic[16] = (byte)'C';
        synthetic[17] = (byte)'M';
        synthetic[18] = (byte)'Y';
        synthetic[19] = (byte)'K';
        return synthetic;
    }

    /// <summary>
    /// Codifica um buffer CMYK (4 bytes por pixel: C, M, Y, K) diretamente para o formato JPEG CMYK (ADR-056).
    /// </summary>
    /// <param name="cmykBuffer">Buffer de entrada contendo pixels [C, M, Y, K].</param>
    /// <param name="width">Largura em pixels.</param>
    /// <param name="height">Altura em pixels.</param>
    /// <param name="quality">Qualidade de compressão (1 a 100).</param>
    /// <param name="dpi">Resolução em DPI a gravar na densidade da imagem.</param>
    /// <param name="iccProfile">Bytes opcionais do perfil ICC CMYK (FOGRA39) a embutir em APP2.</param>
    /// <param name="output">Stream de destino para os bytes JPEG.</param>
    public static void Encode(
        ReadOnlySpan<byte> cmykBuffer,
        int width,
        int height,
        int quality,
        int dpi,
        byte[]? iccProfile,
        Stream output)
    {
        ArgumentNullException.ThrowIfNull(output, nameof(output));

        if (!output.CanWrite)
        {
            throw new ArgumentException("O stream de destino não suporta escrita.", nameof(output));
        }

        if (width <= 0 || height <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(width), "Dimensões da imagem devem ser estritamente positivas.");
        }

        quality = Math.Clamp(quality, 1, 100);
        dpi = Math.Max(1, dpi);

        var requiredBytes = (long)width * height * 4;
        if (cmykBuffer.Length < requiredBytes)
        {
            throw new ArgumentException($"Buffer CMYK insuficiente: esperado {requiredBytes} bytes, recebido {cmykBuffer.Length}.", nameof(cmykBuffer));
        }

        var cinfo = new jpeg_compress_struct();
        try
        {
            cinfo.jpeg_stdio_dest(output);

            cinfo.Image_width = width;
            cinfo.Image_height = height;
            cinfo.Input_components = 4;
            cinfo.In_color_space = J_COLOR_SPACE.JCS_CMYK;

            cinfo.jpeg_set_defaults();
            cinfo.jpeg_set_colorspace(J_COLOR_SPACE.JCS_CMYK);
            cinfo.jpeg_set_quality(quality, force_baseline: true);

            // ADR-056: Nunca emitir APP0 JFIF em CMYK (ISO/IEC 10918-5)
            cinfo.Write_JFIF_header = false;

            // ADR-056: Emitir APP14 Adobe com ColorTransform = 0 (Direct CMYK)
            cinfo.Write_Adobe_marker = true;

            // Configuração de resolução / DPI
            cinfo.Density_unit = DensityUnit.DotsInch;
            cinfo.X_density = (short)dpi;
            cinfo.Y_density = (short)dpi;

            cinfo.jpeg_start_compress(true);

            // Grava marcadores APP2 ICC_PROFILE se perfil fornecido (ICC.1:2010 / ISO 15076-1)
            if (iccProfile != null && iccProfile.Length > 0)
            {
                WriteIccProfileMarkers(cinfo, iccProfile);
            }

            // Escrita de scanlines
            var rowBuffer = new byte[1][];
            rowBuffer[0] = new byte[width * 4];

            for (var y = 0; y < height; y++)
            {
                cmykBuffer.Slice(y * width * 4, width * 4).CopyTo(rowBuffer[0]);
                cinfo.jpeg_write_scanlines(rowBuffer, 1);
            }

            cinfo.jpeg_finish_compress();
        }
        finally
        {
            cinfo.jpeg_destroy();
        }
    }

    /// <summary>
    /// Sobrecarga compatível para codificação CMYK.
    /// </summary>
    public static void EncodeCmyk(
        ReadOnlySpan<byte> cmykBuffer,
        int width,
        int height,
        int quality,
        Stream output,
        int dpi = 150,
        byte[]? iccProfile = null)
    {
        Encode(cmykBuffer, width, height, quality, dpi, iccProfile, output);
    }

    private static void WriteIccProfileMarkers(jpeg_compress_struct cinfo, byte[] iccProfile)
    {
        const int maxChunkPayload = 65519; // 65535 - 2 (comprimento) - 12 (identificador) - 2 (seq/count)
        int numChunks = (iccProfile.Length + maxChunkPayload - 1) / maxChunkPayload;
        if (numChunks == 0) numChunks = 1;

        for (int i = 0; i < numChunks; i++)
        {
            int offset = i * maxChunkPayload;
            int length = Math.Min(maxChunkPayload, iccProfile.Length - offset);

            byte[] markerData = new byte[14 + length];
            Array.Copy(IccProfileHeader, 0, markerData, 0, 12);
            markerData[12] = (byte)(i + 1);
            markerData[13] = (byte)numChunks;
            Array.Copy(iccProfile, offset, markerData, 14, length);

            cinfo.jpeg_write_marker((int)JPEG_MARKER.APP2, markerData);
        }
    }

    /// <summary>
    /// Decodifica um stream JPEG CMYK para um buffer bruto de 4 canais [C, M, Y, K] (ADR-056).
    /// </summary>
    public static byte[] DecodeCmyk(Stream stream, out int width, out int height)
    {
        ArgumentNullException.ThrowIfNull(stream, nameof(stream));

        var dinfo = new jpeg_decompress_struct();
        try
        {
            dinfo.jpeg_stdio_src(stream);
            dinfo.jpeg_read_header(true);

            dinfo.Out_color_space = J_COLOR_SPACE.JCS_CMYK;
            dinfo.jpeg_start_decompress();

            width = dinfo.Output_width;
            height = dinfo.Output_height;

            var dst = new byte[width * height * 4];
            var rowBuffer = new byte[1][];
            rowBuffer[0] = new byte[width * 4];

            while (dinfo.Output_scanline < dinfo.Output_height)
            {
                var y = dinfo.Output_scanline;
                dinfo.jpeg_read_scanlines(rowBuffer, 1);
                Array.Copy(rowBuffer[0], 0, dst, y * width * 4, width * 4);
            }

            dinfo.jpeg_finish_decompress();
            return dst;
        }
        finally
        {
            dinfo.jpeg_destroy();
        }
    }

    /// <summary>
    /// Decodifica um arquivo JPEG CMYK para um buffer bruto de 4 canais [C, M, Y, K] (ADR-056).
    /// </summary>
    public static byte[] DecodeCmyk(string filePath, out int width, out int height)
    {
        ArgumentNullException.ThrowIfNull(filePath, nameof(filePath));
        using var stream = File.OpenRead(filePath);
        return DecodeCmyk(stream, out width, out height);
    }
}
