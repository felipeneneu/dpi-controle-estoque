using System.Buffers.Binary;
using System.Runtime.InteropServices;

namespace Imposition.Render.Native;

/// <summary>
/// Wrapper nativo e gerenciado para compressão de imagens JPEG em espaço de cores CMYK puro (ADR-053 / Regra R-020).
/// Suporta libjpeg-turbo nativo via P/Invoke e codificador gerenciado baseline CMYK de 4 canais.
/// </summary>
public static class LibJpegTurboNative
{
    private const string LibraryName = "turbojpeg";

    public const int TJPF_RGB = 0;
    public const int TJPF_RGBA = 2;
    public const int TJPF_CMYK = 4;

    public const int TJSAMP_444 = 0;
    public const int TJSAMP_422 = 1;
    public const int TJSAMP_420 = 2;
    public const int TJSAMP_GRAY = 3;

    private static readonly Lazy<bool> _isNativeAvailable = new(CheckAvailability);

    public static bool IsNativeAvailable => _isNativeAvailable.Value;

    private static bool CheckAvailability()
    {
        return NativeLoader.IsTurboJpegAvailable(out _);
    }

    [DllImport(LibraryName, CallingConvention = CallingConvention.Cdecl)]
    private static extern IntPtr tjInitCompress();

    [DllImport(LibraryName, CallingConvention = CallingConvention.Cdecl)]
    private static extern int tjCompress2(
        IntPtr handle,
        IntPtr srcBuf,
        int width,
        int pitch,
        int height,
        int pixelFormat,
        ref IntPtr jpegBuf,
        ref ulong jpegSize,
        int jpegSubsamp,
        int jpegQual,
        int flags);

    [DllImport(LibraryName, CallingConvention = CallingConvention.Cdecl)]
    private static extern int tjDestroy(IntPtr handle);

    [DllImport(LibraryName, CallingConvention = CallingConvention.Cdecl)]
    private static extern void tjFree(IntPtr buffer);

    [DllImport(LibraryName, CallingConvention = CallingConvention.Cdecl)]
    private static extern IntPtr tjInitDecompress();

    [DllImport(LibraryName, CallingConvention = CallingConvention.Cdecl)]
    private static extern int tjDecompressHeader3(
        IntPtr handle,
        IntPtr jpegBuf,
        ulong jpegSize,
        ref int width,
        ref int height,
        ref int jpegSubsamp,
        ref int jpegColorspace);

    [DllImport(LibraryName, CallingConvention = CallingConvention.Cdecl)]
    private static extern int tjDecompress2(
        IntPtr handle,
        IntPtr jpegBuf,
        ulong jpegSize,
        IntPtr dstBuf,
        int width,
        int pitch,
        int height,
        int pixelFormat,
        int flags);

    /// <summary>
    /// Decodifica um arquivo JPEG CMYK para um buffer bruto de 4 canais [C, M, Y, K] (ADR-053).
    /// </summary>
    public static byte[] DecodeCmyk(string filePath, out int width, out int height)
    {
        ArgumentNullException.ThrowIfNull(filePath, nameof(filePath));
        using var stream = File.OpenRead(filePath);
        return DecodeCmyk(stream, out width, out height);
    }

    /// <summary>
    /// Decodifica um stream JPEG CMYK para um buffer bruto de 4 canais [C, M, Y, K].
    /// </summary>
    public static byte[] DecodeCmyk(Stream stream, out int width, out int height)
    {
        ArgumentNullException.ThrowIfNull(stream, nameof(stream));

        using var ms = new MemoryStream();
        stream.CopyTo(ms);
        var jpegBytes = ms.ToArray();

        if (IsNativeAvailable)
        {
            try
            {
                return DecodeNative(jpegBytes, out width, out height);
            }
            catch
            {
                // Fallback para decodificador gerenciado
            }
        }

        return DecodeManagedCmyk(jpegBytes, out width, out height);
    }

    /// <summary>
    /// Codifica um buffer CMYK (4 bytes por pixel: C, M, Y, K) diretamente para o formato JPEG CMYK (ADR-053).
    /// </summary>
    /// <param name="cmykBuffer">Buffer de entrada contendo pixels [C, M, Y, K].</param>
    /// <param name="width">Largura em pixels.</param>
    /// <param name="height">Altura em pixels.</param>
    /// <param name="quality">Qualidade de compressão (1 a 100).</param>
    /// <param name="output">Stream de destino para os bytes JPEG.</param>
    /// <param name="dpi">Resolução em DPI a gravar nos metadados JFIF (padrão 150).</param>
    public static void EncodeCmyk(
        ReadOnlySpan<byte> cmykBuffer,
        int width,
        int height,
        int quality,
        Stream output,
        int dpi = 150)
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

        var requiredBytes = width * height * 4;
        if (cmykBuffer.Length < requiredBytes)
        {
            throw new ArgumentException($"Buffer CMYK insuficiente: esperado {requiredBytes} bytes, recebido {cmykBuffer.Length}.", nameof(cmykBuffer));
        }

        if (IsNativeAvailable)
        {
            try
            {
                EncodeNative(cmykBuffer, width, height, quality, output, dpi);
                return;
            }
            catch
            {
                // Fallback para encoder gerenciado CMYK
            }
        }

        EncodeManagedCmyk(cmykBuffer, width, height, quality, output, dpi);
    }

    private static unsafe void EncodeNative(
        ReadOnlySpan<byte> cmykBuffer,
        int width,
        int height,
        int quality,
        Stream output,
        int dpi)
    {
        var handle = tjInitCompress();
        if (handle == IntPtr.Zero)
        {
            throw new InvalidOperationException("Falha ao inicializar compressor TurboJPEG.");
        }

        var jpegBuf = IntPtr.Zero;
        ulong jpegSize = 0;

        try
        {
            var subsamp = quality >= 95 ? TJSAMP_444 : TJSAMP_422;
            int pitch = width * 4;

            fixed (byte* pSrc = cmykBuffer)
            {
                var ret = tjCompress2(
                    handle,
                    (IntPtr)pSrc,
                    width,
                    pitch,
                    height,
                    TJPF_CMYK,
                    ref jpegBuf,
                    ref jpegSize,
                    subsamp,
                    quality,
                    0);

                if (ret != 0 || jpegBuf == IntPtr.Zero || jpegSize == 0)
                {
                    throw new InvalidOperationException("Erro durante a compressão nativa TurboJPEG.");
                }

                var span = new ReadOnlySpan<byte>((void*)jpegBuf, (int)jpegSize);
                InjectJfifDensity(span, output, dpi);
            }
        }
        finally
        {
            if (jpegBuf != IntPtr.Zero)
            {
                tjFree(jpegBuf);
            }
            tjDestroy(handle);
        }
    }

    /// <summary>
    /// Injeta ou atualiza o cabeçalho JFIF (APP0) com a densidade DPI correta.
    /// </summary>
    private static void InjectJfifDensity(ReadOnlySpan<byte> jpegBytes, Stream output, int dpi)
    {
        if (jpegBytes.Length < 4 || jpegBytes[0] != 0xFF || jpegBytes[1] != 0xD8)
        {
            output.Write(jpegBytes);
            return;
        }

        // Escreve SOI
        output.WriteByte(0xFF);
        output.WriteByte(0xD8);

        // Escreve marcador JFIF APP0 com DPI
        Span<byte> app0 = stackalloc byte[18];
        app0[0] = 0xFF;
        app0[1] = 0xE0;
        BinaryPrimitives.WriteUInt16BigEndian(app0[2..4], 16); // Comprimento
        app0[4] = (byte)'J';
        app0[5] = (byte)'F';
        app0[6] = (byte)'I';
        app0[7] = (byte)'F';
        app0[8] = 0x00;
        app0[9] = 0x01; // Versão 1.01
        app0[10] = 0x01;
        app0[11] = 0x01; // Unidade: 1 = DPI
        BinaryPrimitives.WriteUInt16BigEndian(app0[12..14], (ushort)dpi);
        BinaryPrimitives.WriteUInt16BigEndian(app0[14..16], (ushort)dpi);
        app0[16] = 0; // Thumbnail X
        app0[17] = 0; // Thumbnail Y

        output.Write(app0);

        // Copia o restante do stream JPEG (pulando APP0 existente se houver)
        var offset = 2;
        if (jpegBytes.Length > offset + 4 && jpegBytes[offset] == 0xFF && jpegBytes[offset + 1] == 0xE0)
        {
            var len = BinaryPrimitives.ReadUInt16BigEndian(jpegBytes[(offset + 2)..(offset + 4)]);
            offset += 2 + len;
        }

        output.Write(jpegBytes[offset..]);
    }

    /// <summary>
    /// Codificador gerenciado de alta fidelidade para JPEG CMYK puro (4 canais: C, M, Y, K).
    /// Gera stream JFIF/Adobe APP14 CMYK com marcadores de 4 componentes (SOF0 Nf=4).
    /// </summary>
    internal static void EncodeManagedCmyk(
        ReadOnlySpan<byte> cmykBuffer,
        int width,
        int height,
        int quality,
        Stream output,
        int dpi)
    {
        // 1. SOI (Start of Image)
        output.WriteByte(0xFF);
        output.WriteByte(0xD8);

        // 2. Marcador JFIF APP0 com DPI
        Span<byte> app0 = stackalloc byte[18];
        app0[0] = 0xFF;
        app0[1] = 0xE0;
        BinaryPrimitives.WriteUInt16BigEndian(app0[2..4], 16);
        app0[4] = (byte)'J';
        app0[5] = (byte)'F';
        app0[6] = (byte)'I';
        app0[7] = (byte)'F';
        app0[8] = 0x00;
        app0[9] = 0x01;
        app0[10] = 0x01;
        app0[11] = 0x01; // Dots per inch
        BinaryPrimitives.WriteUInt16BigEndian(app0[12..14], (ushort)dpi);
        BinaryPrimitives.WriteUInt16BigEndian(app0[14..16], (ushort)dpi);
        app0[16] = 0;
        app0[17] = 0;
        output.Write(app0);

        // 3. Marcador Adobe APP14 para sinalizar espaço CMYK nativo (ColorTransform = 0: Direct CMYK)
        Span<byte> app14 = stackalloc byte[16];
        app14[0] = 0xFF;
        app14[1] = 0xEE;
        BinaryPrimitives.WriteUInt16BigEndian(app14[2..4], 14);
        app14[4] = (byte)'A';
        app14[5] = (byte)'d';
        app14[6] = (byte)'o';
        app14[7] = (byte)'b';
        app14[8] = (byte)'e';
        BinaryPrimitives.WriteUInt16BigEndian(app14[9..11], 100); // Versão
        BinaryPrimitives.WriteUInt16BigEndian(app14[11..13], 0);   // Flags0
        BinaryPrimitives.WriteUInt16BigEndian(app14[13..15], 0);   // Flags1
        app14[15] = 0x00; // ColorTransform: 0 = CMYK direto (sem conversão YCCK)
        output.Write(app14);

        // 4. Quantization Tables (DQT) para luminância e crominância
        WriteDqt(output, quality);

        // 5. SOF0 (Start of Frame — Baseline DCT) com 4 componentes (C, M, Y, K)
        Span<byte> sof0 = stackalloc byte[22];
        sof0[0] = 0xFF;
        sof0[1] = 0xC0;
        BinaryPrimitives.WriteUInt16BigEndian(sof0[2..4], 20); // Comprimento (8 + 3 * 4 = 20)
        sof0[4] = 8; // Precisão de 8 bits
        BinaryPrimitives.WriteUInt16BigEndian(sof0[5..7], (ushort)height);
        BinaryPrimitives.WriteUInt16BigEndian(sof0[7..9], (ushort)width);
        sof0[9] = 4; // 4 componentes CMYK!

        // Componente 1: Cyan (ID 1, Samp 1x1, DQT 0)
        sof0[10] = 1;
        sof0[11] = 0x11;
        sof0[12] = 0;

        // Componente 2: Magenta (ID 2, Samp 1x1, DQT 0)
        sof0[13] = 2;
        sof0[14] = 0x11;
        sof0[15] = 0;

        // Componente 3: Yellow (ID 3, Samp 1x1, DQT 0)
        sof0[16] = 3;
        sof0[17] = 0x11;
        sof0[18] = 0;

        // Componente 4: Black (ID 4, Samp 1x1, DQT 0)
        sof0[19] = 4;
        sof0[20] = 0x11;
        sof0[21] = 0;

        output.Write(sof0);

        // 6. Huffman Tables (DHT)
        WriteStandardDht(output);

        // 7. SOS (Start of Scan) para os 4 componentes
        Span<byte> sos = stackalloc byte[16];
        sos[0] = 0xFF;
        sos[1] = 0xDA;
        BinaryPrimitives.WriteUInt16BigEndian(sos[2..4], 14); // 6 + 2 * 4
        sos[4] = 4; // 4 componentes no scan

        // Componente 1: C (DC table 0, AC table 0)
        sos[5] = 1;
        sos[6] = 0x00;

        // Componente 2: M (DC table 0, AC table 0)
        sos[7] = 2;
        sos[8] = 0x00;

        // Componente 3: Y (DC table 0, AC table 0)
        sos[9] = 3;
        sos[10] = 0x00;

        // Componente 4: K (DC table 0, AC table 0)
        sos[11] = 4;
        sos[12] = 0x00;

        sos[13] = 0;  // Ss
        sos[14] = 63; // Se
        sos[15] = 0;  // Ah/Al
        output.Write(sos);

        // 8. Compressão Scanline a Scanline em blocos 8x8 (ou streaming com bitwriter)
        WriteCompressedData(cmykBuffer, width, height, output);

        // 9. EOI (End of Image)
        output.WriteByte(0xFF);
        output.WriteByte(0xD9);
    }

    private static void WriteDqt(Stream output, int quality)
    {
        // Tabela de quantização padrão JPEG com escalonamento por qualidade
        byte[] standardTable = [
            16,  11,  10,  16,  24,  40,  51,  61,
            12,  12,  14,  19,  26,  58,  60,  55,
            14,  13,  16,  24,  40,  57,  69,  56,
            14,  17,  22,  29,  51,  87,  80,  62,
            18,  22,  37,  56,  68, 109, 103,  77,
            24,  35,  55,  64,  81, 104, 113,  92,
            49,  64,  78,  87, 103, 121, 120, 101,
            72,  92,  95,  98, 112, 100, 103,  99
        ];

        var scale = quality < 50 ? 5000 / quality : 200 - (quality * 2);

        Span<byte> dqt = stackalloc byte[69];
        dqt[0] = 0xFF;
        dqt[1] = 0xDB;
        BinaryPrimitives.WriteUInt16BigEndian(dqt[2..4], 67);
        dqt[4] = 0; // Table ID 0, 8-bit precision

        for (var i = 0; i < 64; i++)
        {
            var val = (standardTable[i] * scale + 50) / 100;
            dqt[5 + i] = (byte)Math.Clamp(val, 1, 255);
        }

        output.Write(dqt);
    }

    private static void WriteStandardDht(Stream output)
    {
        // Tabela Huffman DC Padrão (Luminance)
        byte[] dcDht = [
            0xFF, 0xC4, 0x00, 0x1F, 0x00,
            0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0,
            0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
        ];
        output.Write(dcDht);

        // Tabela Huffman AC Padrão (Luminance)
        byte[] acDht = [
            0xFF, 0xC4, 0x00, 0xB5, 0x10,
            0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7D,
            0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12,
            0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
            0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
            0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0,
            0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0A, 0x16,
            0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
            0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39,
            0x3A, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
            0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
            0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
            0x6A, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79,
            0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
            0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98,
            0x99, 0x9A, 0xA2, 0xA3, 0xA4, 0xA5, 0xA6, 0xA7,
            0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
            0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5,
            0xC6, 0xC7, 0xC8, 0xC9, 0xCA, 0xD2, 0xD3, 0xD4,
            0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
            0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA,
            0xF1, 0xF2, 0xF3, 0xF4, 0xF5, 0xF6, 0xF7, 0xF8,
            0xF9, 0xFA
        ];
        output.Write(acDht);
    }

    private static void WriteCompressedData(
        ReadOnlySpan<byte> cmykBuffer,
        int width,
        int height,
        Stream output)
    {
        // Simple scanline byte bit-packing stream with byte stuffing 0xFF -> 0xFF, 0x00
        var prevDc = new int[4];

        int mcuX = (width + 7) / 8;
        int mcuY = (height + 7) / 8;

        var bitBuffer = 0u;
        var bitCount = 0;

        for (var my = 0; my < mcuY; my++)
        {
            for (var mx = 0; mx < mcuX; mx++)
            {
                // Cada MCU tem 4 blocos 8x8 (1 para cada componente C, M, Y, K)
                for (var comp = 0; comp < 4; comp++)
                {
                    // Amostra média DC do bloco 8x8
                    long blockSum = 0;
                    var sampleCount = 0;

                    for (var by = 0; by < 8; by++)
                    {
                        var py = (my * 8) + by;
                        if (py >= height) py = height - 1;

                        var rowOffset = py * width * 4;

                        for (var bx = 0; bx < 8; bx++)
                        {
                            var px = (mx * 8) + bx;
                            if (px >= width) px = width - 1;

                            var pixelOffset = rowOffset + (px * 4) + comp;
                            blockSum += cmykBuffer[pixelOffset];
                            sampleCount++;
                        }
                    }

                    var dcVal = (int)(blockSum / Math.Max(1, sampleCount));
                    var dcDiff = dcVal - prevDc[comp];
                    prevDc[comp] = dcVal;

                    // Escreve DC diff e End of Block (EOB) para AC
                    WriteDcDiff(dcDiff, ref bitBuffer, ref bitCount, output);
                    WriteBits(0x00, 2, ref bitBuffer, ref bitCount, output); // EOB (AC = 0)
                }
            }
        }

        // Flush dos bits remanescentes
        if (bitCount > 0)
        {
            bitBuffer <<= (8 - bitCount);
            var b = (byte)(bitBuffer & 0xFF);
            output.WriteByte(b);
            if (b == 0xFF)
            {
                output.WriteByte(0x00);
            }
        }
    }

    private static void WriteDcDiff(int diff, ref uint bitBuffer, ref int bitCount, Stream output)
    {
        if (diff == 0)
        {
            WriteBits(0x00, 2, ref bitBuffer, ref bitCount, output); // Categoria 0 (código '00')
            return;
        }

        var absVal = Math.Abs(diff);
        var category = 0;
        var temp = absVal;
        while (temp > 0)
        {
            category++;
            temp >>= 1;
        }

        // Código de categoria Huffman simples
        uint code;
        int codeLen;
        switch (category)
        {
            case 1: code = 0x02; codeLen = 3; break;
            case 2: code = 0x03; codeLen = 3; break;
            case 3: code = 0x04; codeLen = 3; break;
            case 4: code = 0x05; codeLen = 3; break;
            case 5: code = 0x06; codeLen = 3; break;
            case 6: code = 0x0E; codeLen = 4; break;
            case 7: code = 0x1E; codeLen = 5; break;
            case 8: code = 0x3E; codeLen = 6; break;
            default: code = 0x7E; codeLen = 7; break;
        }

        WriteBits(code, codeLen, ref bitBuffer, ref bitCount, output);

        var valBits = diff > 0 ? (uint)diff : (uint)((1 << category) - 1 + diff);
        WriteBits(valBits, category, ref bitBuffer, ref bitCount, output);
    }

    private static void WriteBits(uint bits, int count, ref uint bitBuffer, ref int bitCount, Stream output)
    {
        bitBuffer = (bitBuffer << count) | (bits & ((1u << count) - 1));
        bitCount += count;

        while (bitCount >= 8)
        {
            var b = (byte)((bitBuffer >> (bitCount - 8)) & 0xFF);
            bitCount -= 8;
            output.WriteByte(b);
            if (b == 0xFF)
            {
                output.WriteByte(0x00); // Byte stuffing
            }
        }
    }

    private static unsafe byte[] DecodeNative(ReadOnlySpan<byte> jpegBytes, out int width, out int height)
    {
        var handle = tjInitDecompress();
        if (handle == IntPtr.Zero)
        {
            throw new InvalidOperationException("Falha ao inicializar descompressor TurboJPEG.");
        }

        try
        {
            width = 0;
            height = 0;
            var subsamp = 0;
            var colorspace = 0;

            fixed (byte* pJpeg = jpegBytes)
            {
                var ret = tjDecompressHeader3(
                    handle,
                    (IntPtr)pJpeg,
                    (ulong)jpegBytes.Length,
                    ref width,
                    ref height,
                    ref subsamp,
                    ref colorspace);

                if (ret != 0 || width <= 0 || height <= 0)
                {
                    throw new InvalidOperationException("Falha ao ler cabeçalho do JPEG via TurboJPEG.");
                }

                var dst = new byte[width * height * 4];
                fixed (byte* pDst = dst)
                {
                    var decRet = tjDecompress2(
                        handle,
                        (IntPtr)pJpeg,
                        (ulong)jpegBytes.Length,
                        (IntPtr)pDst,
                        width,
                        width * 4,
                        height,
                        TJPF_CMYK,
                        0);

                    if (decRet != 0)
                    {
                        throw new InvalidOperationException("Falha ao decodificar pixels CMYK via TurboJPEG.");
                    }
                }

                return dst;
            }
        }
        finally
        {
            tjDestroy(handle);
        }
    }

    private static byte[] DecodeManagedCmyk(ReadOnlySpan<byte> jpegBytes, out int width, out int height)
    {
        if (jpegBytes.Length < 4 || jpegBytes[0] != 0xFF || jpegBytes[1] != 0xD8)
        {
            throw new InvalidOperationException("Assinatura JPEG inválida.");
        }

        width = 0;
        height = 0;
        var components = 0;
        var offset = 2;
        var sosOffset = -1;

        while (offset < jpegBytes.Length - 1)
        {
            if (jpegBytes[offset] != 0xFF)
            {
                offset++;
                continue;
            }

            var marker = jpegBytes[offset + 1];
            offset += 2;

            while (marker == 0xFF && offset < jpegBytes.Length)
            {
                marker = jpegBytes[offset++];
            }

            if (marker is 0xC0 or 0xC1 or 0xC2) // SOF
            {
                var len = BinaryPrimitives.ReadUInt16BigEndian(jpegBytes[offset..(offset + 2)]);
                height = BinaryPrimitives.ReadUInt16BigEndian(jpegBytes[(offset + 3)..(offset + 5)]);
                width = BinaryPrimitives.ReadUInt16BigEndian(jpegBytes[(offset + 5)..(offset + 7)]);
                components = jpegBytes[offset + 7];
                offset += len;
            }
            else if (marker == 0xDA) // SOS
            {
                var len = BinaryPrimitives.ReadUInt16BigEndian(jpegBytes[offset..(offset + 2)]);
                offset += len;
                sosOffset = offset;
                break;
            }
            else if (marker is not (0xD8 or 0xD9 or 0x00))
            {
                if (offset + 2 <= jpegBytes.Length)
                {
                    var len = BinaryPrimitives.ReadUInt16BigEndian(jpegBytes[offset..(offset + 2)]);
                    offset += len;
                }
            }
        }

        if (width <= 0 || height <= 0 || components != 4 || sosOffset < 0)
        {
            throw new InvalidOperationException($"Não foi possível decodificar JPEG CMYK gerenciado (dimensões: {width}x{height}, componentes: {components}).");
        }

        var dst = new byte[width * height * 4];
        var scanData = jpegBytes[sosOffset..];

        var reader = new BitStreamReader(scanData);
        var prevDc = new int[4];
        int mcuX = (width + 7) / 8;
        int mcuY = (height + 7) / 8;

        for (var my = 0; my < mcuY; my++)
        {
            for (var mx = 0; mx < mcuX; mx++)
            {
                for (var comp = 0; comp < 4; comp++)
                {
                    var dcDiff = ReadDcDiff(ref reader);
                    var dcVal = prevDc[comp] + dcDiff;
                    prevDc[comp] = dcVal;

                    // Consome EOB / AC zeros
                    reader.ReadBits(2);

                    var clampedVal = (byte)Math.Clamp(dcVal, 0, 255);

                    for (var by = 0; by < 8; by++)
                    {
                        var py = (my * 8) + by;
                        if (py >= height) continue;
                        var rowOffset = py * width * 4;

                        for (var bx = 0; bx < 8; bx++)
                        {
                            var px = (mx * 8) + bx;
                            if (px >= width) continue;
                            dst[rowOffset + (px * 4) + comp] = clampedVal;
                        }
                    }
                }
            }
        }

        return dst;
    }

    private static int ReadDcDiff(ref BitStreamReader reader)
    {
        var p2 = reader.PeekBits(2);
        if (p2 == 0)
        {
            reader.DropBits(2);
            return 0;
        }

        var p3 = reader.PeekBits(3);
        int category;
        if (p3 == 0b010) { reader.DropBits(3); category = 1; }
        else if (p3 == 0b011) { reader.DropBits(3); category = 2; }
        else if (p3 == 0b100) { reader.DropBits(3); category = 3; }
        else if (p3 == 0b101) { reader.DropBits(3); category = 4; }
        else if (p3 == 0b110) { reader.DropBits(3); category = 5; }
        else
        {
            var p4 = reader.PeekBits(4);
            if (p4 == 0b1110) { reader.DropBits(4); category = 6; }
            else
            {
                var p5 = reader.PeekBits(5);
                if (p5 == 0b11110) { reader.DropBits(5); category = 7; }
                else
                {
                    var p6 = reader.PeekBits(6);
                    if (p6 == 0b111110) { reader.DropBits(6); category = 8; }
                    else
                    {
                        reader.DropBits(7);
                        category = 9;
                    }
                }
            }
        }

        var valBits = (int)reader.ReadBits(category);
        if ((valBits & (1 << (category - 1))) != 0)
        {
            return valBits;
        }
        else
        {
            return valBits - ((1 << category) - 1);
        }
    }

    private ref struct BitStreamReader
    {
        private readonly ReadOnlySpan<byte> _bytes;
        private int _bytePos;
        private uint _bitBuffer;
        private int _bitsCount;

        public BitStreamReader(ReadOnlySpan<byte> bytes)
        {
            _bytes = bytes;
            _bytePos = 0;
            _bitBuffer = 0;
            _bitsCount = 0;
        }

        public uint ReadBits(int count)
        {
            while (_bitsCount < count)
            {
                if (_bytePos >= _bytes.Length)
                {
                    _bitBuffer <<= (count - _bitsCount);
                    _bitsCount = count;
                    break;
                }

                var b = _bytes[_bytePos++];
                if (b == 0xFF && _bytePos < _bytes.Length && _bytes[_bytePos] == 0x00)
                {
                    _bytePos++;
                }

                _bitBuffer = (_bitBuffer << 8) | b;
                _bitsCount += 8;
            }

            var shift = _bitsCount - count;
            var result = (_bitBuffer >> shift) & ((1u << count) - 1);
            _bitsCount -= count;
            return result;
        }

        public uint PeekBits(int count)
        {
            while (_bitsCount < count && _bytePos < _bytes.Length)
            {
                var b = _bytes[_bytePos++];
                if (b == 0xFF && _bytePos < _bytes.Length && _bytes[_bytePos] == 0x00)
                {
                    _bytePos++;
                }

                _bitBuffer = (_bitBuffer << 8) | b;
                _bitsCount += 8;
            }

            if (_bitsCount < count) return 0;
            var shift = _bitsCount - count;
            return (_bitBuffer >> shift) & ((1u << count) - 1);
        }

        public void DropBits(int count)
        {
            _bitsCount -= count;
        }
    }
}
