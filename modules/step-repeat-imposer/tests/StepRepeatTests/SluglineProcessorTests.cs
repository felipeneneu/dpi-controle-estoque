using FluentAssertions;
using StepRepeatEngine.Marks;
using Xunit;

namespace StepRepeatTests;

public class SluglineProcessorTests
{
    [Fact]
    public void BR_SluglineProcessor_ShouldInterpolateAllDynamicTokens()
    {
        var ctx = new SluglineContext(
            JobName: "Cartão de Visita VIP",
            CustomerName: "Grafica Express",
            UpCount: 24,
            SheetWidthMm: 330.0,
            SheetHeightMm: 483.0,
            Side: "Frente",
            ColorName: "CMYK",
            Timestamp: new DateTime(2026, 10, 9, 14, 30, 0)
        );

        string pattern = "JOB: $job | CLIENTE: $customer | $upCount | SHEET: $sheetSize | LADO: $side | COR: $color | DATA: $date $time";

        string result = SluglineTokenProcessor.Process(pattern, ctx);

        result.Should().Be("JOB: Cartão de Visita VIP | CLIENTE: Grafica Express | 24-UP | SHEET: 330x483mm | LADO: Frente | COR: CMYK | DATA: 2026-10-09 14:30:00");
    }
}
