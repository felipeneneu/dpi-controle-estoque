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
            info.HasTrimBox.Should().BeTrue();
            info.EffectiveWidthMm.Should().BeApproximately(210.0, 1.0);
            info.EffectiveHeightMm.Should().BeApproximately(148.0, 1.0);
            info.LeftCropMm.Should().BeGreaterThanOrEqualTo(0);
            info.TopCropMm.Should().BeGreaterThanOrEqualTo(0);
        }
    }
}
