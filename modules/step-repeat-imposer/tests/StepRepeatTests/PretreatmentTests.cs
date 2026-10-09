using FluentAssertions;
using StepRepeatEngine.Geometry;
using StepRepeatPdf;
using Xunit;

namespace StepRepeatTests;

public class PretreatmentTests
{
    [Fact]
    public void BR_Pretreatment_ShouldPreserveExactTrimBoxAndClipOldMarks()
    {
        string samplePath = @"arquivos-testes/REN_TRADE_FOLHETO_BISCOITOS_JAU_SERVE - 19-Ago.pdf";
        if (!File.Exists(samplePath)) return;

        var boxInfo = PdfPageBoxDetector.Detect(samplePath);
        boxInfo.HasTrimBox.Should().BeTrue();

        string tempOutput = Path.Combine(Path.GetTempPath(), $"pretreated_test_{Guid.NewGuid():N}.pdf");

        try
        {
            PdfPretreatmentService.CreatePretreatedPdf(samplePath, tempOutput, boxInfo, requestedBleedMm: 3.0);
            File.Exists(tempOutput).Should().BeTrue();

            var pretreatedInfo = PdfPageBoxDetector.Detect(tempOutput);
            pretreatedInfo.MediaBox.Width.Should().BeApproximately(210.0 + 6.0, 1.0); // 210mm TrimBox + 6mm bleed
            pretreatedInfo.MediaBox.Height.Should().BeApproximately(148.0 + 6.0, 1.0); // 148mm TrimBox + 6mm bleed
        }
        finally
        {
            if (File.Exists(tempOutput)) File.Delete(tempOutput);
        }
    }
}
