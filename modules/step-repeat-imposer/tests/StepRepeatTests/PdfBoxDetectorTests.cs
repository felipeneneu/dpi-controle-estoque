using FluentAssertions;
using StepRepeatPdf;
using Xunit;

namespace StepRepeatTests;

public class PdfBoxDetectorTests
{
    [Fact]
    public void BR_PdfBoxDetector_ShouldInspectBiscoitosPdf()
    {
        string samplePath = @"arquivos-testes/REN_TRADE_FOLHETO_BISCOITOS_JAU_SERVE - 19-Ago.pdf";
        if (File.Exists(samplePath))
        {
            var info = PdfPageBoxDetector.Detect(samplePath);
            info.MediaBox.Width.Should().BeGreaterThan(0);
            info.MediaBox.Height.Should().BeGreaterThan(0);
        }
    }
}
