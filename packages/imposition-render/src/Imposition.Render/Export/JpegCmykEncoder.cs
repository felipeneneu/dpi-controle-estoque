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

            // Grava marcadores APP1 (Exif) e APP13 (Photoshop ResolutionInfo) para garantir DPI sem violar ISO 10918-5 (sem APP0 JFIF em CMYK)
            WriteResolutionMarkers(cinfo, dpi);

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

    private static void WriteResolutionMarkers(jpeg_compress_struct cinfo, int dpi)
    {
        if (dpi <= 0) return;

        // 1. Marcador APP1 (Exif TIFF IFD0 com XResolution / YResolution)
        var exif = new byte[72];
        exif[0] = (byte)'E';
        exif[1] = (byte)'x';
        exif[2] = (byte)'i';
        exif[3] = (byte)'f';
        exif[4] = 0;
        exif[5] = 0;

        // TIFF Header (Big Endian "MM")
        exif[6] = (byte)'M';
        exif[7] = (byte)'M';
        exif[8] = 0;
        exif[9] = 0x2A; // 42
        BinaryPrimitives.WriteUInt32BigEndian(exif.AsSpan(10, 4), 8);

        // IFD0 (3 tags)
        BinaryPrimitives.WriteUInt16BigEndian(exif.AsSpan(14, 2), 3);

        // Tag 0x011A (XResolution)
        BinaryPrimitives.WriteUInt16BigEndian(exif.AsSpan(16, 2), 0x011A);
        BinaryPrimitives.WriteUInt16BigEndian(exif.AsSpan(18, 2), 5); // Rational
        BinaryPrimitives.WriteUInt32BigEndian(exif.AsSpan(20, 4), 1); // Count
        BinaryPrimitives.WriteUInt32BigEndian(exif.AsSpan(24, 4), 50); // Offset relativo ao byte 6

        // Tag 0x011B (YResolution)
        BinaryPrimitives.WriteUInt16BigEndian(exif.AsSpan(28, 2), 0x011B);
        BinaryPrimitives.WriteUInt16BigEndian(exif.AsSpan(30, 2), 5); // Rational
        BinaryPrimitives.WriteUInt32BigEndian(exif.AsSpan(32, 4), 1); // Count
        BinaryPrimitives.WriteUInt32BigEndian(exif.AsSpan(36, 4), 58); // Offset relativo ao byte 6

        // Tag 0x0128 (ResolutionUnit: 2 = Inches)
        BinaryPrimitives.WriteUInt16BigEndian(exif.AsSpan(40, 2), 0x0128);
        BinaryPrimitives.WriteUInt16BigEndian(exif.AsSpan(42, 2), 3); // Short
        BinaryPrimitives.WriteUInt32BigEndian(exif.AsSpan(44, 4), 1); // Count
        BinaryPrimitives.WriteUInt16BigEndian(exif.AsSpan(48, 2), 2); // 2 = Inches
        exif[50] = 0;
        exif[51] = 0;

        // Offset próximo IFD (0 = fim)
        BinaryPrimitives.WriteUInt32BigEndian(exif.AsSpan(52, 4), 0);

        // Valores Rational a partir do byte 56 (offset 50 relativo ao byte 6)
        BinaryPrimitives.WriteUInt32BigEndian(exif.AsSpan(56, 4), (uint)dpi);
        BinaryPrimitives.WriteUInt32BigEndian(exif.AsSpan(60, 4), 1);
        BinaryPrimitives.WriteUInt32BigEndian(exif.AsSpan(64, 4), (uint)dpi);
        BinaryPrimitives.WriteUInt32BigEndian(exif.AsSpan(68, 4), 1);

        cinfo.jpeg_write_marker(0xE1, exif); // 0xE1 = APP1

        // 2. Marcador APP13 (Photoshop 3.0 ResolutionInfo 0x03ED)
        var psHeader = System.Text.Encoding.ASCII.GetBytes("Photoshop 3.0\0");
        var app13 = new byte[42];
        Buffer.BlockCopy(psHeader, 0, app13, 0, 14);

        app13[14] = (byte)'8';
        app13[15] = (byte)'B';
        app13[16] = (byte)'I';
        app13[17] = (byte)'M';

        BinaryPrimitives.WriteUInt16BigEndian(app13.AsSpan(18, 2), 0x03ED);
        app13[20] = 0;
        app13[21] = 0;
        BinaryPrimitives.WriteUInt32BigEndian(app13.AsSpan(22, 4), 16);

        BinaryPrimitives.WriteInt32BigEndian(app13.AsSpan(26, 4), dpi << 16);
        BinaryPrimitives.WriteInt16BigEndian(app13.AsSpan(30, 2), 1);
        BinaryPrimitives.WriteInt16BigEndian(app13.AsSpan(32, 2), 2);
        BinaryPrimitives.WriteInt32BigEndian(app13.AsSpan(34, 4), dpi << 16);
        BinaryPrimitives.WriteInt16BigEndian(app13.AsSpan(38, 2), 1);
        BinaryPrimitives.WriteInt16BigEndian(app13.AsSpan(40, 2), 2);

        cinfo.jpeg_write_marker(0xED, app13); // 0xED = APP13
    }

    private static int ScanDpiFromStream(Stream stream)
    {
        Span<byte> markerHeader = stackalloc byte[2];
        if (stream.Read(markerHeader) != 2 || markerHeader[0] != 0xFF || markerHeader[1] != 0xD8)
            return 0;

        Span<byte> lenBytes = stackalloc byte[2];
        while (stream.Position < stream.Length)
        {
            int b = stream.ReadByte();
            if (b == -1) break;
            if (b != 0xFF) continue;

            int marker = stream.ReadByte();
            while (marker == 0xFF) marker = stream.ReadByte();
            if (marker is -1 or 0xD9 or 0xDA) break;

            if (stream.Read(lenBytes) != 2) break;
            int length = BinaryPrimitives.ReadUInt16BigEndian(lenBytes);
            if (length < 2) break;
            int payloadLength = length - 2;

            if (marker == 0xE0 && payloadLength >= 14) // APP0 JFIF
            {
                var payload = new byte[payloadLength];
                if (stream.Read(payload) == payloadLength)
                {
                    if (payload[0] == 'J' && payload[1] == 'F' && payload[2] == 'I' && payload[3] == 'F' && payload[4] == 0)
                    {
                        byte units = payload[7];
                        int xDensity = BinaryPrimitives.ReadUInt16BigEndian(payload.AsSpan(8, 2));
                        if (units == 1 && xDensity > 0) return xDensity;
                        if (units == 2 && xDensity > 0) return (int)Math.Round(xDensity * 2.54);
                    }
                }
                continue;
            }

            if (marker == 0xED && payloadLength >= 42) // APP13 Photoshop
            {
                var payload = new byte[payloadLength];
                if (stream.Read(payload) == payloadLength)
                {
                    for (int i = 14; i <= payload.Length - 28; i++)
                    {
                        if (payload[i] == '8' && payload[i + 1] == 'B' && payload[i + 2] == 'I' && payload[i + 3] == 'M' &&
                            payload[i + 4] == 0x03 && payload[i + 5] == 0xED)
                        {
                            int dataLen = BinaryPrimitives.ReadInt32BigEndian(payload.AsSpan(i + 8, 4));
                            if (dataLen >= 16 && i + 12 + 16 <= payload.Length)
                            {
                                int fixedDpi = BinaryPrimitives.ReadInt32BigEndian(payload.AsSpan(i + 12, 4));
                                int resDpi = fixedDpi >> 16;
                                if (resDpi > 0) return resDpi;
                            }
                        }
                    }
                }
                continue;
            }

            if (marker == 0xE1 && payloadLength >= 14) // APP1 Exif
            {
                var payload = new byte[payloadLength];
                if (stream.Read(payload) == payloadLength)
                {
                    if (payload[0] == 'E' && payload[1] == 'x' && payload[2] == 'i' && payload[3] == 'f' && payload[4] == 0 && payload[5] == 0)
                    {
                        bool isLittle = payload[6] == 'I' && payload[7] == 'I';
                        bool isBig = payload[6] == 'M' && payload[7] == 'M';
                        if (isLittle || isBig)
                        {
                            int ifdOffset = isBig
                                ? (int)BinaryPrimitives.ReadUInt32BigEndian(payload.AsSpan(10, 4))
                                : (int)BinaryPrimitives.ReadUInt32LittleEndian(payload.AsSpan(10, 4));

                            int ifdPos = 6 + ifdOffset;
                            if (ifdPos + 2 <= payload.Length)
                            {
                                int numEntries = isBig
                                    ? BinaryPrimitives.ReadUInt16BigEndian(payload.AsSpan(ifdPos, 2))
                                    : BinaryPrimitives.ReadUInt16LittleEndian(payload.AsSpan(ifdPos, 2));

                                int tagPos = ifdPos + 2;
                                for (int t = 0; t < numEntries && tagPos + 12 <= payload.Length; t++, tagPos += 12)
                                {
                                    ushort tag = isBig
                                        ? BinaryPrimitives.ReadUInt16BigEndian(payload.AsSpan(tagPos, 2))
                                        : BinaryPrimitives.ReadUInt16LittleEndian(payload.AsSpan(tagPos, 2));

                                    if (tag == 0x011A) // XResolution
                                    {
                                        int valOffset = 6 + (isBig
                                            ? (int)BinaryPrimitives.ReadUInt32BigEndian(payload.AsSpan(tagPos + 8, 4))
                                            : (int)BinaryPrimitives.ReadUInt32LittleEndian(payload.AsSpan(tagPos + 8, 4)));

                                        if (valOffset + 8 <= payload.Length)
                                        {
                                            uint num = isBig
                                                ? BinaryPrimitives.ReadUInt32BigEndian(payload.AsSpan(valOffset, 4))
                                                : BinaryPrimitives.ReadUInt32LittleEndian(payload.AsSpan(valOffset, 4));
                                            uint den = isBig
                                                ? BinaryPrimitives.ReadUInt32BigEndian(payload.AsSpan(valOffset + 4, 4))
                                                : BinaryPrimitives.ReadUInt32LittleEndian(payload.AsSpan(valOffset + 4, 4));

                                            if (den > 0 && num > 0)
                                            {
                                                return (int)Math.Round((double)num / den);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                continue;
            }

            stream.Seek(payloadLength, SeekOrigin.Current);
        }

        return 0;
    }

    /// <summary>
    /// Lê metadados de cabeçalho da imagem JPEG (largura, altura, DPI, HasDpi) sem decodificar scanlines (ultrarrápido).
    /// </summary>
    public static (int Width, int Height, int Dpi, bool HasDpi) ReadImageInfo(Stream stream)
    {
        ArgumentNullException.ThrowIfNull(stream, nameof(stream));

        long initialPos = stream.CanSeek ? stream.Position : 0;
        var dinfo = new jpeg_decompress_struct();
        int width;
        int height;
        int dpi = 300;
        bool hasDpi = false;

        try
        {
            dinfo.jpeg_stdio_src(stream);
            dinfo.jpeg_read_header(true);

            width = dinfo.Image_width;
            height = dinfo.Image_height;

            if (dinfo.Density_unit == DensityUnit.DotsInch && dinfo.X_density > 0)
            {
                dpi = dinfo.X_density;
                hasDpi = true;
            }
            else if (dinfo.Density_unit == DensityUnit.DotsCm && dinfo.X_density > 0)
            {
                dpi = (int)Math.Round(dinfo.X_density * 2.54);
                hasDpi = true;
            }
        }
        finally
        {
            dinfo.jpeg_destroy();
        }

        if (!hasDpi && stream.CanSeek)
        {
            try
            {
                stream.Position = initialPos;
                int markerDpi = ScanDpiFromStream(stream);
                if (markerDpi > 0)
                {
                    dpi = markerDpi;
                    hasDpi = true;
                }
            }
            catch
            {
                // Fallback silencioso
            }
        }

        return (width, height, dpi, hasDpi);
    }

    /// <summary>
    /// Lê metadados de cabeçalho da imagem JPEG em disco (largura, altura, DPI, HasDpi) sem decodificar scanlines.
    /// </summary>
    public static (int Width, int Height, int Dpi, bool HasDpi) ReadImageInfo(string filePath)
    {
        ArgumentNullException.ThrowIfNull(filePath, nameof(filePath));
        using var stream = File.OpenRead(filePath);
        return ReadImageInfo(stream);
    }
}
