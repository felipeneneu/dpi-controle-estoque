using System;
using System.Buffers.Binary;
using System.IO;
using System.Text;
using FluentAssertions;
using Imposition.Core.Seams;
using Imposition.Pdf.Preflight;
using Imposition.Pdf.Seams;
using Imposition.Pdf.Tests.TestHelpers;
using Xunit;

namespace Imposition.Pdf.Tests.Seams;

public class PdfxPanelExporterIntegrationTests : IDisposable
{
    private readonly string _tempDir;
    private static readonly Encoding Latin1 = Encoding.GetEncoding(28591);

    public PdfxPanelExporterIntegrationTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "PdfxSmokeE2E_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_tempDir);
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

    private static byte[] CreateValidSyntheticIcc()
    {
        var bytes = new byte[256];
        BinaryPrimitives.WriteUInt32BigEndian(bytes.AsSpan(0, 4), 256);
        bytes[36] = (byte)'a';
        bytes[37] = (byte)'c';
        bytes[38] = (byte)'s';
        bytes[39] = (byte)'p';
        return bytes;
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task BR_055_SmokeE2E_RealBanner3000x1000_ExportsCompliantPanelsWithPreservedVectors()
    {
        // 1. Arrange: Gerar PDF CMYK vetorial sintético (3000x1000 mm)
        var sourcePdf = Path.Combine(_tempDir, "fachada_3000x1000.pdf");
        var sourceQdfContent = """
            %PDF-1.3
            %%Comment: QDF 1.0
            1 0 obj
            << /Type /Catalog /Pages 2 0 R >>
            endobj
            2 0 obj
            << /Type /Pages /Count 1 /Kids [ 3 0 R ] >>
            endobj
            3 0 obj
            <<
              /Type /Page
              /Parent 2 0 R
              /MediaBox [ 0 0 8503.937 2834.646 ]
              /CropBox [ 0 0 8503.937 2834.646 ]
              /Contents 4 0 R
            >>
            endobj
            4 0 obj
            << /Length 120 >>
            stream
            0 0 0 1 K
            0.5 w
            100 100 m
            8400 100 l
            8400 2700 l
            100 2700 l
            h
            S
            0 0.8 0.2 0 k
            200 200 400 400 re f
            endstream
            endobj
            xref
            0 5
            0000000000 65535 f
            0000000019 00000 n
            0000000078 00000 n
            0000000140 00000 n
            0000000300 00000 n
            trailer
            << /Root 1 0 R /Size 5 >>
            startxref
            500
            %%EOF
            """;
        File.WriteAllText(sourcePdf, sourceQdfContent, Latin1);

        // 2. Calcular divisão de emendas: Banner 3000x1000 mm em rolo de 1520 mm com 10 mm de overlap
        var seamsInput = new SeamsInput(
            ArtworkWidthMm: 3000,
            ArtworkHeightMm: 1000,
            PrintableRollWidthMm: 1520,
            OverlapMm: 10,
            ApplyShrinkage: false);
        var seams = PanelCalculator.Calculate(seamsInput);

        seams.TotalPanels.Should().Be(2, "3000mm com rolo de 1520mm e 10mm overlap produz 2 painéis");

        // 3. Configurar opções de exportação PDF/X-1a com FOGRA39
        var icc = CreateValidSyntheticIcc();
        var intent = new PdfxOutputIntent("FOGRA39", "ISO Coated v2 (ECI)", icc);
        var options = new PdfxExportOptions(intent, "{job}_painel_{index:D2}.pdf");

        var progressPoints = new List<double>();
        var progress = new Progress<double>(p => progressPoints.Add(p));

        // 4. Act: Exportar via PdfxPanelExporter
        var exporter = new PdfxPanelExporter();
        var exportResult = await exporter.ExportAsync(
            sourcePdf,
            seams,
            _tempDir,
            options,
            progress);

        // 5. Assert: Verificar integridade do resultado
        exportResult.GeneratedFiles.Should().HaveCount(2);
        exportResult.PerPanelResults.Should().HaveCount(2);
        exportResult.AllCompliant.Should().BeTrue("todos os painéis devem ser conformes com PDF/X-1a");
        exportResult.ElapsedTime.Should().BeGreaterThan(TimeSpan.Zero);

        progressPoints.Should().Contain(0.0);
        progressPoints.Should().Contain(1.0);

        // 6. Validar cada arquivo individualmente em disco
        for (int i = 0; i < exportResult.GeneratedFiles.Count; i++)
        {
            var filePath = exportResult.GeneratedFiles[i];
            File.Exists(filePath).Should().BeTrue();

            var validation = PdfxValidator.Validate(filePath);
            validation.IsCompliant.Should().BeTrue(string.Join("; ", validation.Issues));
            validation.Issues.Should().BeEmpty();

            var fileContent = File.ReadAllText(filePath, Latin1);

            // Confirma cabeçalho ISO
            fileContent.Should().StartWith("%PDF-1.3");

            // Confirma OutputIntent GTS_PDFX e FOGRA39
            fileContent.Should().Contain("/OutputIntents");
            fileContent.Should().Contain("/GTS_PDFX");
            fileContent.Should().Contain("FOGRA39");
            fileContent.Should().Contain("ISO Coated v2 (ECI)");

            // Confirma preservação de operadores vetoriais (sem rasterização)
            fileContent.Should().Contain("/Fm0 Do", "arte deve ser invocada como Form XObject vetorial");
            fileContent.Should().Contain("/Subtype /Form");

            // Confirma ausência de OCG e RGB
            fileContent.Should().NotContain("/OCProperties");
            fileContent.Should().NotContain("/DeviceRGB");
        }
    }
}
