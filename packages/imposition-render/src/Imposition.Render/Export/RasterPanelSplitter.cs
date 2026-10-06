using System.Buffers.Binary;
using Imposition.Core.Errors;
using Imposition.Core.Seams;
using Imposition.Render.Native;

namespace Imposition.Render.Export;

/// <summary>
/// Representa os dados raster brutos em CMYK (4 canais) de um painel individual fatiado (ADR-053 / BR-054).
/// </summary>
public sealed record PanelRasterData(
    int PanelIndex,
    byte[] CmykBuffer,
    int WidthPx,
    int HeightPx,
    double Dpi);

/// <summary>
/// Fatiador de imagens raster em painéis individuais operando em buffer CMYK puro (Regra R-020).
/// Zero conversão para RGB, preservação estrita de canais e desenho direto de linhas-guia K40%.
/// </summary>
public static class RasterPanelSplitter
{
    private const double MmPerInch = 25.4;
    private const double PointsPerInch = 72.0;

    /// <summary>
    /// Fatia um buffer CMYK completo em múltiplos painéis conforme a geometria calculada pelo SeamsResult.
    /// </summary>
    public static IReadOnlyList<PanelRasterData> Split(
        ReadOnlySpan<byte> sourceCmyk,
        int srcWidthPx,
        int srcHeightPx,
        SeamsResult seamsResult,
        double dpi = 150.0)
    {
        ArgumentNullException.ThrowIfNull(seamsResult, nameof(seamsResult));

        if (!double.IsFinite(dpi) || dpi <= 0 || dpi > 4800)
        {
            throw new ImpositionException(ErrorCodes.InvalidExportInput, "O DPI deve ser um número finito estritamente positivo (máximo 4800 DPI).");
        }

        if (srcWidthPx <= 0 || srcHeightPx <= 0)
        {
            throw new ImpositionException(ErrorCodes.InvalidExportInput, "As dimensões da imagem fonte devem ser estritamente positivas.");
        }

        var expectedBytes = (long)srcWidthPx * srcHeightPx * 4;
        if (sourceCmyk.Length < expectedBytes)
        {
            throw new ImpositionException(ErrorCodes.InvalidExportInput, $"Buffer CMYK insuficiente: esperado {expectedBytes} bytes, recebido {sourceCmyk.Length}.");
        }

        if (seamsResult.Panels == null || seamsResult.Panels.Count == 0)
        {
            throw new ImpositionException(ErrorCodes.InvalidExportInput, "O resultado de emenda não contém painéis para fatiamento.");
        }

        var results = new List<PanelRasterData>(seamsResult.Panels.Count);
        foreach (var panel in seamsResult.Panels)
        {
            results.Add(SplitPanel(sourceCmyk, srcWidthPx, srcHeightPx, panel, seamsResult, dpi));
        }

        return results;
    }

    /// <summary>
    /// Fatia um painel individual a partir de um buffer CMYK fonte.
    /// </summary>
    public static PanelRasterData SplitPanel(
        ReadOnlySpan<byte> sourceCmyk,
        int srcWidthPx,
        int srcHeightPx,
        PanelPlacement panel,
        SeamsResult seamsResult,
        double dpi = 150.0)
    {
        ArgumentNullException.ThrowIfNull(panel, nameof(panel));
        ArgumentNullException.ThrowIfNull(seamsResult, nameof(seamsResult));

        if (!double.IsFinite(dpi) || dpi <= 0 || dpi > 4800)
        {
            throw new ImpositionException(ErrorCodes.InvalidExportInput, "O DPI deve ser um número finito estritamente positivo (máximo 4800 DPI).");
        }

        if (srcWidthPx <= 0 || srcHeightPx <= 0)
        {
            throw new ImpositionException(ErrorCodes.InvalidExportInput, "As dimensões da imagem fonte devem ser estritamente positivas.");
        }

        if (!double.IsFinite(panel.OutputWidthMm) || panel.OutputWidthMm <= 0 ||
            !double.IsFinite(panel.OutputHeightMm) || panel.OutputHeightMm <= 0)
        {
            throw new ImpositionException(ErrorCodes.InvalidExportInput, "As dimensões de saída do painel devem ser finitas e positivas.");
        }

        var outWidthPx = Math.Max(1, (int)Math.Round(panel.OutputWidthMm * dpi / MmPerInch));
        var outHeightPx = Math.Max(1, (int)Math.Round(panel.OutputHeightMm * dpi / MmPerInch));

        var srcXStartPx = (int)Math.Round(panel.SourceXPositionMm * dpi / MmPerInch);
        var srcYStartPx = (int)Math.Round(panel.SourceYPositionMm * dpi / MmPerInch);

        var dstBytes = outWidthPx * outHeightPx * 4;
        var dstBuffer = new byte[dstBytes];

        // Cópia scanline a scanline com clamp para garantir integridade mesmo em bordas com sangria/encolhimento
        for (var dy = 0; dy < outHeightPx; dy++)
        {
            var sy = Math.Clamp(srcYStartPx + dy, 0, srcHeightPx - 1);
            var srcRowOffset = sy * srcWidthPx * 4;
            var dstRowOffset = dy * outWidthPx * 4;

            for (var dx = 0; dx < outWidthPx; dx++)
            {
                var sx = Math.Clamp(srcXStartPx + dx, 0, srcWidthPx - 1);
                var srcPixelOffset = srcRowOffset + (sx * 4);
                var dstPixelOffset = dstRowOffset + (dx * 4);

                dstBuffer[dstPixelOffset] = sourceCmyk[srcPixelOffset];
                dstBuffer[dstPixelOffset + 1] = sourceCmyk[srcPixelOffset + 1];
                dstBuffer[dstPixelOffset + 2] = sourceCmyk[srcPixelOffset + 2];
                dstBuffer[dstPixelOffset + 3] = sourceCmyk[srcPixelOffset + 3];
            }
        }

        // Pintura da linha-guia K40% se o painel for elegível (BR-053 / BR-054)
        if (panel.HasGuideLine)
        {
            PaintGuideLine(dstBuffer, outWidthPx, outHeightPx, panel, seamsResult, dpi);
        }

        return new PanelRasterData(panel.Index, dstBuffer, outWidthPx, outHeightPx, dpi);
    }

    /// <summary>
    /// Valida e fatia painéis diretamente a partir de um arquivo JPEG CMYK em disco.
    /// Aborta com E_EXPORT_SOURCE_NOT_CMYK se o arquivo não tiver 4 componentes CMYK.
    /// </summary>
    public static IReadOnlyList<PanelRasterData> SplitFromFile(
        string imagePath,
        SeamsResult seamsResult,
        double dpi = 150.0)
    {
        ArgumentNullException.ThrowIfNull(imagePath, nameof(imagePath));
        ArgumentNullException.ThrowIfNull(seamsResult, nameof(seamsResult));

        if (!File.Exists(imagePath))
        {
            throw new ImpositionException(ErrorCodes.PreviewInputNotFound, $"Arquivo de imagem fonte não encontrado: '{imagePath}'.");
        }

        var (width, height, components) = ReadJpegHeaderInfo(imagePath);

        if (components != 4)
        {
            throw new ImpositionException(
                ErrorCodes.ExportSourceNotCmyk,
                $"O arquivo de imagem fonte '{Path.GetFileName(imagePath)}' possui {components} componente(s). A exportação exige imagem CMYK (4 canais) estrita (Regra R-020).");
        }

        // Decodifica buffer CMYK usando leitor nativo/gerenciado
        var cmykBuffer = LibJpegTurboNative.DecodeCmyk(imagePath, out var decW, out var decH);
        return Split(cmykBuffer, decW, decH, seamsResult, dpi);
    }

    /// <summary>
    /// Lê cabeçalho do JPEG para verificar dimensões e contagem de componentes de cor sem decodificar a imagem inteira.
    /// </summary>
    public static (int Width, int Height, int Components) ReadJpegHeaderInfo(string filePath)
    {
        using var stream = File.OpenRead(filePath);
        return ReadJpegHeaderInfo(stream);
    }

    /// <summary>
    /// Lê cabeçalho do JPEG a partir de um Stream.
    /// </summary>
    public static (int Width, int Height, int Components) ReadJpegHeaderInfo(Stream stream)
    {
        Span<byte> header = stackalloc byte[2];
        if (stream.Read(header) != 2 || header[0] != 0xFF || header[1] != 0xD8)
        {
            throw new ImpositionException(ErrorCodes.InvalidExportInput, "O arquivo fornecido não é um JPEG válido (assinatura SOI 0xFFD8 ausente).");
        }

        Span<byte> lenBytes = stackalloc byte[2];
        Span<byte> sof = stackalloc byte[6];

        while (stream.Position < stream.Length)
        {
            var b = stream.ReadByte();
            if (b == -1) break;
            if (b != 0xFF) continue;

            var marker = stream.ReadByte();
            while (marker == 0xFF)
            {
                marker = stream.ReadByte();
            }

            if (marker == -1 || marker == 0xD9 || marker == 0xDA) // EOI ou SOS
            {
                break;
            }

            if (stream.Read(lenBytes) != 2) break;
            var length = BinaryPrimitives.ReadUInt16BigEndian(lenBytes);

            if (length < 2) break;
            var payloadLength = length - 2;

            // SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2)
            if (marker is 0xC0 or 0xC1 or 0xC2)
            {
                if (stream.Read(sof) != 6) break;

                // sof[0] = precision, sof[1..3] = height, sof[3..5] = width, sof[5] = components
                var h = BinaryPrimitives.ReadUInt16BigEndian(sof[1..3]);
                var w = BinaryPrimitives.ReadUInt16BigEndian(sof[3..5]);
                var comp = sof[5];

                return (w, h, comp);
            }

            stream.Seek(payloadLength, SeekOrigin.Current);
        }

        throw new ImpositionException(ErrorCodes.InvalidExportInput, "Marcador SOF não encontrado no arquivo JPEG.");
    }

    private static void PaintGuideLine(
        Span<byte> dstBuffer,
        int outWidthPx,
        int outHeightPx,
        PanelPlacement panel,
        SeamsResult seamsResult,
        double dpi)
    {
        var guideLines = GuideLineCalculator.Calculate(seamsResult);
        var guide = guideLines.FirstOrDefault(g => g.TargetPanelIndex == panel.Index);

        if (guide == null)
            return;

        var thicknessPx = Math.Max(1, (int)Math.Round(guide.ThicknessPt * dpi / PointsPerInch));
        var cByte = (byte)Math.Clamp((int)Math.Round(guide.Cyan * 255), 0, 255);
        var mByte = (byte)Math.Clamp((int)Math.Round(guide.Magenta * 255), 0, 255);
        var yByte = (byte)Math.Clamp((int)Math.Round(guide.Yellow * 255), 0, 255);
        var kByte = (byte)Math.Clamp((int)Math.Round(guide.Black * 255), 0, 255); // K40% -> 102

        // Determina se a linha é vertical ou horizontal
        var isVertical = guide.LengthMm >= panel.OutputHeightMm * 0.9;

        if (isVertical)
        {
            var lineXPx = (int)Math.Round(guide.XPositionMm * dpi / MmPerInch);
            var lineYStartPx = (int)Math.Round(guide.YPositionMm * dpi / MmPerInch);
            var lineYEndPx = (int)Math.Round((guide.YPositionMm + guide.LengthMm) * dpi / MmPerInch);

            lineYStartPx = Math.Clamp(lineYStartPx, 0, outHeightPx - 1);
            lineYEndPx = Math.Clamp(lineYEndPx, 0, outHeightPx);

            for (var y = lineYStartPx; y < lineYEndPx; y++)
            {
                var rowOffset = y * outWidthPx * 4;
                for (var t = 0; t < thicknessPx; t++)
                {
                    var x = lineXPx + t;
                    if (x < 0 || x >= outWidthPx) continue;

                    var pixelOffset = rowOffset + (x * 4);
                    dstBuffer[pixelOffset] = cByte;
                    dstBuffer[pixelOffset + 1] = mByte;
                    dstBuffer[pixelOffset + 2] = yByte;
                    dstBuffer[pixelOffset + 3] = kByte;
                }
            }
        }
        else
        {
            var lineYPx = (int)Math.Round(guide.YPositionMm * dpi / MmPerInch);
            var lineXStartPx = (int)Math.Round(guide.XPositionMm * dpi / MmPerInch);
            var lineXEndPx = (int)Math.Round((guide.XPositionMm + guide.LengthMm) * dpi / MmPerInch);

            lineXStartPx = Math.Clamp(lineXStartPx, 0, outWidthPx - 1);
            lineXEndPx = Math.Clamp(lineXEndPx, 0, outWidthPx);

            for (var x = lineXStartPx; x < lineXEndPx; x++)
            {
                for (var t = 0; t < thicknessPx; t++)
                {
                    var y = lineYPx + t;
                    if (y < 0 || y >= outHeightPx) continue;

                    var pixelOffset = (y * outWidthPx + x) * 4;
                    dstBuffer[pixelOffset] = cByte;
                    dstBuffer[pixelOffset + 1] = mByte;
                    dstBuffer[pixelOffset + 2] = yByte;
                    dstBuffer[pixelOffset + 3] = kByte;
                }
            }
        }
    }
}
