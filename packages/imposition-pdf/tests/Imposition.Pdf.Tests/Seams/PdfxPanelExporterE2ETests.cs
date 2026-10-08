using System;
using System.IO;
using System.Text;
using FluentAssertions;
using Imposition.Core.Seams;
using Imposition.Pdf.Preflight;
using Imposition.Pdf.Seams;
using SkiaSharp;
using Xunit;

namespace Imposition.Pdf.Tests.Seams;

/// <summary>
/// Validação cruzada E2E com PDFium (PDFtoImage) e verificação das 5 regras obrigatórias (V1..V5) (ADR-060, Regra R-021).
/// </summary>
[Trait("Category", "E2E")]
public class PdfxPanelExporterE2ETests : IDisposable
{
    private readonly string _tempDir;
    private readonly string _e2eOutputDir;
    private static readonly Encoding Latin1 = Encoding.GetEncoding(28591);

    public PdfxPanelExporterE2ETests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "PdfxE2ETests_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_tempDir);

        _e2eOutputDir = Path.Combine(Directory.GetCurrentDirectory(), ".tmp", "e2e-output");
        Directory.CreateDirectory(_e2eOutputDir);
    }

    public void Dispose()
    {
        try
        {
            if (Directory.Exists(_tempDir))
                Directory.Delete(_tempDir, true);
        }
        catch { }
    }

    private static string CreateRealisticSourcePdf(string filePath)
    {
        // Gera um PDF de ~150 KB contendo imagem DeviceCMYK com conteúdo colorido não-branco
        int width = 200;
        int height = 200;
        int pixelCount = width * height * 4; // 4 canais CMYK (160.000 bytes)
        var cmykBytes = new byte[pixelCount];

        // Preenche com ciano/magenta escuro (C=200, M=150, Y=50, K=50)
        for (int i = 0; i < pixelCount; i += 4)
        {
            cmykBytes[i] = 200;     // C
            cmykBytes[i + 1] = 150; // M
            cmykBytes[i + 2] = 50;  // Y
            cmykBytes[i + 3] = 50;  // K
        }

        var imageStream = Latin1.GetString(cmykBytes);

        var contentOps = "0 1 0 0 k\n100 100 1000 1000 re f\n1 0 0 0 k\n1600 100 1000 1000 re f\nq\n1000 0 0 800 1000 200 cm\n/Im1 Do\nQ\n";
        int contentOpsLength = Latin1.GetByteCount(contentOps);

        var qdf = $$"""
            %PDF-1.3
            %%Comment: QDF 1.0
            1 0 obj
            <<
              /Type /Catalog
              /Pages 2 0 R
            >>
            endobj
            2 0 obj
            <<
              /Type /Pages
              /Count 1
              /Kids [ 3 0 R ]
            >>
            endobj
            3 0 obj
            <<
              /Type /Page
              /Parent 2 0 R
              /MediaBox [ 0 0 2834.646 1417.323 ]
              /CropBox [ 0 0 2834.646 1417.323 ]
              /Contents 4 0 R
              /Resources <<
                /XObject <<
                  /Im1 10 0 R
                >>
              >>
            >>
            endobj
            4 0 obj
            <<
              /Length {{contentOpsLength}}
            >>
            stream
            {{contentOps}}endstream
            endobj
            10 0 obj
            <<
              /Type /XObject
              /Subtype /Image
              /Width {{width}}
              /Height {{height}}
              /ColorSpace /DeviceCMYK
              /BitsPerComponent 8
              /Length {{cmykBytes.Length}}
            >>
            stream
            {{imageStream}}
            endstream
            endobj
            xref
            0 11
            0000000000 65535 f 
            0000000015 00000 n 
            0000000078 00000 n 
            0000000140 00000 n 
            0000000280 00000 n 
            0000000000 65535 f 
            0000000000 65535 f 
            0000000000 65535 f 
            0000000000 65535 f 
            0000000000 65535 f 
            0000000400 00000 n 
            trailer
            <<
              /Root 1 0 R
              /Size 11
            >>
            startxref
            165000
            %%EOF
            """;

        File.WriteAllText(filePath, qdf.Replace("\r\n", "\n"), Latin1);
        XrefBuilder.Rebuild(filePath);
        return filePath;
    }

    private static bool StreamsAreIdenticalPrefix(string sourcePath, string panelPath, long sourceLength)
    {
        using var src = File.OpenRead(sourcePath);
        using var pnl = File.OpenRead(panelPath);

        byte[] buf1 = new byte[1024 * 1024]; // 1 MB buffer de streaming
        byte[] buf2 = new byte[1024 * 1024];
        long remaining = sourceLength;

        while (remaining > 0)
        {
            int toRead = (int)Math.Min(buf1.Length, remaining);
            int read1 = src.Read(buf1, 0, toRead);
            int read2 = pnl.Read(buf2, 0, toRead);

            if (read1 != read2 || read1 == 0)
                return false;

            if (!buf1.AsSpan(0, read1).SequenceEqual(buf2.AsSpan(0, read2)))
                return false;

            remaining -= read1;
        }

        return true;
    }

    [Fact]
    public async Task CrossValidation_E2E_FiveObligatoryValidations_PassForExportedPanels()
    {
        // 1. Cria PDF fonte realista de ~160 KB
        var sourcePdfPath = Path.Combine(_tempDir, "banner_factory_source.pdf");
        CreateRealisticSourcePdf(sourcePdfPath);

        var sourceInfo = new FileInfo(sourcePdfPath);
        long sourceLength = sourceInfo.Length;
        sourceLength.Should().BeGreaterThan(100_000, "o arquivo fonte deve ter mais de 100 KB para teste realista");

        // 2. Define entrada de emendas (banner de 1000x500mm fatiado para rolo de 600mm -> 2 painéis)
        var seamsInput = new SeamsInput(
            ArtworkWidthMm: 1000,
            ArtworkHeightMm: 500,
            PrintableRollWidthMm: 600,
            OverlapMm: 50,
            ApplyShrinkage: false);
        var seamsResult = PanelCalculator.Calculate(seamsInput);

        // Perfil ICC sintético conforme ADR-054
        var iccBytes = new byte[256];
        System.Buffers.Binary.BinaryPrimitives.WriteUInt32BigEndian(iccBytes.AsSpan(0, 4), (uint)iccBytes.Length);
        Encoding.ASCII.GetBytes("acsp").CopyTo(iccBytes, 36);
        var outputIntent = new PdfxOutputIntent(
            IccProfileBytes: iccBytes,
            OutputConditionIdentifier: "FOGRA39",
            Info: "ISO Coated v2 (ECI)");

        var exporter = new PdfxPanelExporter();
        var options = new PdfxExportOptions(outputIntent, NamingPattern: "e2e_painel_{index:D2}.pdf");

        // 3. Executa exportação E2E
        var result = await exporter.ExportAsync(sourcePdfPath, seamsResult, _tempDir, options);

        result.GeneratedFiles.Should().HaveCount(seamsResult.TotalPanels);
        result.Metadata.Should().NotBeNull();
        result.Metadata!.FileSizesBytes.Should().HaveCount(seamsResult.TotalPanels);

        // 4. Validações V1 a V5 por painel
        for (int i = 0; i < result.GeneratedFiles.Count; i++)
        {
            var panelFile = result.GeneratedFiles[i];
            var panelInfo = new FileInfo(panelFile);
            var panelPlacement = seamsResult.Panels[i];

            // V1: Tamanho de disco > 100 KB (combate o bug de 1.8 KB)
            panelInfo.Length.Should().BeGreaterThan(100_000, "V1: o painel deve manter os dados originais e ter mais de 100 KB");

            // V2: PDFtoImage (PDFium) abre o documento sem erro
#pragma warning disable CA1416 // PDFtoImage é suportado em Windows e Linux
            IList<System.Drawing.SizeF> pageSizes;
            using (var sizeStream = File.OpenRead(panelFile))
            {
                pageSizes = PDFtoImage.Conversion.GetPageSizes(sizeStream);
            }

            using var imageStream = File.OpenRead(panelFile);
            using var skBitmap = PDFtoImage.Conversion.ToImage(imageStream, page: 0);
#pragma warning restore CA1416
            pageSizes.Should().NotBeEmpty("V2: PDFtoImage deve ler o número de páginas do documento via PDFium");
            skBitmap.Should().NotBeNull("V2: PDFtoImage deve decodificar a página do painel com sucesso via PDFium");

            // V3: Dimensões físicas batem com OutputWidthMm e OutputHeightMm
            double expectedWidthMm = panelPlacement.OutputWidthMm;
            double expectedHeightMm = panelPlacement.OutputHeightMm;

            var pageSize = pageSizes[0];
            double widthMm = pageSize.Width * 25.4 / 72.0;
            double heightMm = pageSize.Height * 25.4 / 72.0;

            Math.Abs(widthMm - expectedWidthMm).Should().BeLessThanOrEqualTo(2.0, "V3: largura geométrica da página deve coincidir com o painel");
            Math.Abs(heightMm - expectedHeightMm).Should().BeLessThanOrEqualTo(2.0, "V3: altura geométrica da página deve coincidir com o painel");

            // V4: Renderização NÃO é branco puro (comprova presença e renderização dos pixels da imagem)
            bool foundColoredPixel = false;
            for (int y = 0; y < skBitmap.Height && !foundColoredPixel; y += 10)
            {
                for (int x = 0; x < skBitmap.Width; x += 10)
                {
                    var color = skBitmap.GetPixel(x, y);
                    // Se o pixel não for branco puro (255, 255, 255), comprova renderização da arte
                    if (color.Red < 250 || color.Green < 250 || color.Blue < 250)
                    {
                        foundColoredPixel = true;
                        break;
                    }
                }
            }

            var centerColor = skBitmap.GetPixel(skBitmap.Width / 2, skBitmap.Height / 2);
            foundColoredPixel.Should().BeTrue($"V4: painel {i} (w={skBitmap.Width}, h={skBitmap.Height}, center={centerColor}) não pode ser em branco puro");

            // V5: Byte-identity verificado via streaming por chunks de 1 MB
            bool isPrefixIdentical = StreamsAreIdenticalPrefix(sourcePdfPath, panelFile, sourceLength);
            isPrefixIdentical.Should().BeTrue("V5: os bytes [0..sourceLength] do painel devem ser 100% idênticos ao PDF fonte");

            // Copia cópia para pasta .tmp/e2e-output para inspeção complementar (R-021)
            var humanInspectPath = Path.Combine(_e2eOutputDir, Path.GetFileName(panelFile));
            File.Copy(panelFile, humanInspectPath, overwrite: true);
        }
    }
}
