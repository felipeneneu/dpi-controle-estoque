using System;
using System.IO;
using System.Text;
using FluentAssertions;
using Imposition.Core.Seams;
using Imposition.Pdf.Seams;
using Xunit;

namespace Imposition.Pdf.Tests.Seams;

/// <summary>
/// Auditoria e reprodução determinística do bug estrutural de Resources no QdfPanelSplitter (ADR-060, Task 0.5).
/// Demonstra que o exportador anterior emitia painéis vazios de ~1.8 KB sem os objetos indiretos (imagens, fontes)
/// referenciados em /Resources.
/// </summary>
[Trait("Category", "Audit")]
public class PdfSplitterAuditTests : IDisposable
{
    private readonly string _tempDir;
    private static readonly Encoding Latin1 = Encoding.GetEncoding(28591);

    public PdfSplitterAuditTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "PdfSplitterAuditTests_" + Guid.NewGuid().ToString("N"));
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

    private static string CreateRealisticCmykPdfWithImage(string filePath)
    {
        // Cria um PDF QDF válido contendo uma imagem XObject CMYK no objeto 10 (tamanho ~10 KB)
        // e referenciada nos /Resources da página.
        var imageBytes = new byte[10240];
        Array.Fill(imageBytes, (byte)0x7F); // Simula payload binário de imagem
        var imageStream = Latin1.GetString(imageBytes);

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
              /MediaBox [ 0 0 1000 500 ]
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
              /Length 55
            >>
            stream
            q
            100 0 0 100 50 50 cm
            /Im1 Do
            Q
            endstream
            endobj
            10 0 obj
            <<
              /Type /XObject
              /Subtype /Image
              /Width 100
              /Height 100
              /ColorSpace /DeviceCMYK
              /BitsPerComponent 8
              /Length {{imageBytes.Length}}
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
            10800
            %%EOF
            """;

        File.WriteAllText(filePath, qdf.Replace("\r\n", "\n"), Latin1);
        return filePath;
    }

    [Fact]
    public async Task Audit_ReproduceBug_PanelMustContainReferencedXObjectImage()
    {
        // 1. Arrange: PDF fonte com imagem de 10 KB referenciada no objeto 10
        var sourcePath = Path.Combine(_tempDir, "source_with_image.pdf");
        CreateRealisticCmykPdfWithImage(sourcePath);

        var sourceInfo = new FileInfo(sourcePath);
        sourceInfo.Length.Should().BeGreaterThan(10000, "o PDF de origem deve conter a imagem de 10 KB");

        var seamsInput = new SeamsInput(
            ArtworkWidthMm: 1000,
            ArtworkHeightMm: 500,
            PrintableRollWidthMm: 600,
            OverlapMm: 50,
            ApplyShrinkage: false);
        var seamsResult = PanelCalculator.Calculate(seamsInput);

        var splitter = new QdfPanelSplitter();

        // 2. Act: Fatiar PDF
        var outputFiles = await splitter.SplitAsync(
            sourcePath,
            seamsResult,
            _tempDir,
            "painel_{index:D2}.pdf");

        outputFiles.Should().HaveCount(2);

        // 3. Assert: Cada painel DEVE conter o objeto de imagem referenciado (10 0 obj)
        // No algoritmo bugado anterior, o splitter cria um arquivo de apenas ~1.8 KB contendo apenas
        // os objetos 1 a 5, deixando a referência /Im1 órfã e omitindo completamente o objeto 10.
        foreach (var panelFile in outputFiles)
        {
            var panelInfo = new FileInfo(panelFile);
            var panelContent = File.ReadAllText(panelFile, Latin1);

            // Esta asserção comprova o bug: se o objeto 10 não estiver presente,
            // ou se o tamanho for menor que a imagem original (> 10 KB), falha com RED.
            panelContent.Should().Contain("10 0 obj", "o painel fatiado deve conter o objeto indireto de imagem clonado do source");
            panelInfo.Length.Should().BeGreaterThan(10000, "o painel fatiado deve ter tamanho correspondente ao conteúdo");
        }
    }
}
