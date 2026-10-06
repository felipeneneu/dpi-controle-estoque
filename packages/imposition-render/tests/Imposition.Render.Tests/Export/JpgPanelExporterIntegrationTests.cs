using System.Buffers.Binary;
using FluentAssertions;
using Imposition.Core.Seams;
using Imposition.Render.Export;
using Imposition.Render.Native;
using Xunit;

namespace Imposition.Render.Tests.Export;

[Trait("Category", "Integration")]
public sealed class JpgPanelExporterIntegrationTests : IDisposable
{
    private readonly string _workDir;

    public JpgPanelExporterIntegrationTests()
    {
        _workDir = Path.Combine(Path.GetTempPath(), $"GraficaOS_E2E_Export_{Guid.NewGuid():N}");
        Directory.CreateDirectory(_workDir);
    }

    public void Dispose()
    {
        if (Directory.Exists(_workDir))
        {
            try { Directory.Delete(_workDir, recursive: true); } catch { /* Ignore */ }
        }
    }

    [Fact]
    public async Task BR_054_E2E_ExportRealCmykJpeg_MultiPanels_WithShrinkageAndGuideLine()
    {
        // 1. Arrange: Cria uma arte fonte CMYK em arquivo JPEG (3000 x 1500 mm em escala, 150 DPI)
        var dpi = 150;
        var artworkWidthMm = 3000.0;
        var artworkHeightMm = 1500.0;
        var rollWidthMm = 1200.0;
        var overlapMm = 25.0;

        var srcWidthPx = (int)Math.Round(artworkWidthMm * dpi / 25.4);
        var srcHeightPx = (int)Math.Round(artworkHeightMm * dpi / 25.4);

        // Cria buffer CMYK sintético com 4 faixas distintas
        var srcBuffer = new byte[srcWidthPx * srcHeightPx * 4];
        for (var y = 0; y < srcHeightPx; y++)
        {
            for (var x = 0; x < srcWidthPx; x++)
            {
                var offset = (y * srcWidthPx + x) * 4;
                var quadrant = (x * 4) / srcWidthPx;
                switch (quadrant)
                {
                    case 0: srcBuffer[offset] = 255; break;     // Ciano
                    case 1: srcBuffer[offset + 1] = 255; break; // Magenta
                    case 2: srcBuffer[offset + 2] = 255; break; // Amarelo
                    default: srcBuffer[offset + 3] = 200; break;// Preto 80%
                }
            }
        }

        var sourceJpgPath = Path.Combine(_workDir, "banner_mega_evento.jpg");
        using (var fs = File.Create(sourceJpgPath))
        {
            LibJpegTurboNative.EncodeCmyk(srcBuffer, srcWidthPx, srcHeightPx, 100, fs, dpi);
        }

        // 2. Calcula divisão geométrica com encolhimento térmico ativado
        var seamsInput = new SeamsInput(
            ArtworkWidthMm: artworkWidthMm,
            ArtworkHeightMm: artworkHeightMm,
            PrintableRollWidthMm: rollWidthMm,
            OverlapMm: overlapMm,
            ApplyShrinkage: true);

        var seamsResult = PanelCalculator.Calculate(seamsInput);
        seamsResult.TotalPanels.Should().BeGreaterThanOrEqualTo(3);

        var outputDir = Path.Combine(_workDir, "saida_rip");
        var exporter = JpgPanelExporter.Instance;
        var options = new JpgExportOptions(
            Quality: 100,
            Dpi: 150,
            NamingPattern: "{job}_painel_{index:D2}.jpg");

        // 3. Act: Exporta painéis de forma assíncrona com medição e progresso
        var progressReports = new List<double>();
        var progress = new Progress<double>(p => progressReports.Add(p));

        var result = await exporter.ExportPanelsAsync(
            sourceJpgPath,
            seamsResult,
            outputDir,
            options,
            progress);

        // 4. Assert: Valida resultado global (R-019)
        result.Should().NotBeNull();
        result.GeneratedFiles.Should().HaveCount(seamsResult.TotalPanels);
        result.TotalBytes.Should().BeGreaterThan(0);
        result.ElapsedTime.Should().BeGreaterThan(TimeSpan.Zero);
        progressReports.Should().Contain(1.0);

        var jfifBuffer = new byte[18];

        // Valida integridade de cada painel gerado no disco
        for (var i = 0; i < seamsResult.TotalPanels; i++)
        {
            var panel = seamsResult.Panels[i];
            var expectedFile = Path.Combine(outputDir, $"banner_mega_evento_painel_{panel.Index:D2}.jpg");

            File.Exists(expectedFile).Should().BeTrue($"O arquivo do painel {panel.Index} deve existir.");

            var (headerW, headerH, components) = RasterPanelSplitter.ReadJpegHeaderInfo(expectedFile);

            // Regra R-020: O arquivo gerado é estritamente CMYK (4 canais)
            components.Should().Be(4, $"O painel {panel.Index} deve ter 4 componentes CMYK.");

            var expectedW = (int)Math.Round(panel.OutputWidthMm * dpi / 25.4);
            var expectedH = (int)Math.Round(panel.OutputHeightMm * dpi / 25.4);

            headerW.Should().Be(expectedW, $"A largura em pixels do painel {panel.Index} deve corresponder à dimensão com sobreposição.");
            headerH.Should().Be(expectedH, $"A altura em pixels do painel {panel.Index} deve corresponder à dimensão com encolhimento.");

            // Verifica densidade DPI no cabeçalho JFIF
            using var fileStream = File.OpenRead(expectedFile);
            fileStream.ReadExactly(jfifBuffer);

            jfifBuffer[0].Should().Be(0xFF);
            jfifBuffer[1].Should().Be(0xD8);
            jfifBuffer[2].Should().Be(0xFF);
            jfifBuffer[3].Should().Be(0xE0); // APP0
            jfifBuffer[13].Should().Be(0x01); // Unidade = DPI (offset 13 no arquivo = 2 SOI + 11 APP0)
            var densityX = BinaryPrimitives.ReadUInt16BigEndian(jfifBuffer.AsSpan(14, 2));
            var densityY = BinaryPrimitives.ReadUInt16BigEndian(jfifBuffer.AsSpan(16, 2));
            densityX.Should().Be(150);
            densityY.Should().Be(150);
        }

        // Verifica que não ficaram arquivos temporários residuais
        Directory.GetFiles(outputDir, "*.tmp*").Should().BeEmpty();
    }
}
