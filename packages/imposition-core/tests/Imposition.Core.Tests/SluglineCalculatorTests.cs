using FluentAssertions;
using Imposition.Core.Errors;
using Imposition.Core.Slugline;
using Xunit;

namespace Imposition.Core.Tests;

public class SluglineCalculatorTests
{
    private static readonly DateTimeOffset FixedTime =
        new(2026, 9, 30, 14, 5, 0, TimeSpan.Zero);

    private static SluglineInput Sample(double bleedStripeMm = 5, string? customText = null)
        => new(
            FileName: "prato_teste.pdf",
            ImpositionTime: FixedTime,
            SheetWidthMm: 665,
            SheetHeightMm: 986,
            Cols: 35,
            Rows: 29,
            Total: 1015,
            BleedStripeMm: bleedStripeMm,
            CustomText: customText);

    [Fact]
    public void BR_047_b_UsesTechnicalLineWhenCustomTextIsNull()
    {
        var result = SluglineCalculator.Calculate(Sample());

        result.Should().NotBeNull();
        result!.Text.Should().Be("prato_teste.pdf  30/09/2026 14:05  35x29=1015  665x986mm");
    }

    [Fact]
    public void BR_047_c_CustomTextWinsOverTechnicalLine()
    {
        var result = SluglineCalculator.Calculate(Sample(customText: "PROVA FINAL"));

        result.Should().NotBeNull();
        result!.Text.Should().Be("PROVA FINAL");
    }

    [Fact]
    public void BR_047_e_OutputTextIsNormalizedToLatin1()
    {
        var result = SluglineCalculator.Calculate(Sample(customText: "TÉCNICA ç ñ 😀"));

        result.Should().NotBeNull();
        result!.Text.Should().Be("TECNICA ç ñ");
    }

    [Fact]
    public void BR_047_n_CustomTextIsTrimmed()
    {
        var result = SluglineCalculator.Calculate(Sample(customText: "  MEU RODAPE  "));

        result.Should().NotBeNull();
        result!.Text.Should().Be("MEU RODAPE");
    }

    [Fact]
    public void BR_047_o_WhitespaceOnlyCustomTextFallsBackToTechnicalLine()
    {
        // Só espaços/tabs: o CustomText conta como ausente e a linha técnica
        // vence — a slugline nunca sai em branco.
        var result = SluglineCalculator.Calculate(Sample(customText: "   "));

        result.Should().NotBeNull();
        result!.Text.Should().Be("prato_teste.pdf  30/09/2026 14:05  35x29=1015  665x986mm");
    }

    [Fact]
    public void BR_047_p_LongTextIsTruncatedAndFittingTextStaysIntact()
    {
        // Faixa estreita: texto longo precisa ser truncado para caber na largura.
        var narrow = new SluglineInput(
            FileName: "x.pdf",
            ImpositionTime: FixedTime,
            SheetWidthMm: 20,
            SheetHeightMm: 986,
            Cols: 1,
            Rows: 1,
            Total: 1,
            BleedStripeMm: 5,
            CustomText: "XXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

        var truncated = SluglineCalculator.Calculate(narrow);
        truncated.Should().NotBeNull();
        truncated!.Text.Should().StartWith("X");
        truncated.Text.Should().EndWith("...");
        truncated.Text.Should().NotBe("XXXXXXXXXXXXXXXXXXXXXXXXXXXXX");
        SluglineFormatter.EstimateTextWidthMm(truncated.Text, SluglineCalculator.DefaultFontSizeMm)
            .Should().BeLessThanOrEqualTo(narrow.SheetWidthMm);

        // Texto que cabe fica intacto.
        var intact = SluglineCalculator.Calculate(Sample(customText: "OK"));
        intact.Should().NotBeNull();
        intact!.Text.Should().Be("OK");
    }

    [Fact]
    public void BR_047_q_ZeroBleedStripeOmitsSluglineReturningNull()
    {
        // BleedStripeMm == 0 (após validar que é finito e não negativo): sem
        // faixa de sangria, a slugline é omitida — nunca expande a página.
        // É o ÚNICO caso que devolve null (ADR-047, Decisão 2).
        SluglineCalculator.Calculate(Sample(bleedStripeMm: 0))
            .Should().BeNull();
    }

    [Fact]
    public void BR_047_r_AnchorsCenterAtHalfWidthAndBaselineInsideStripe()
    {
        var result = SluglineCalculator.Calculate(Sample(customText: "POSICAO"));

        result.Should().NotBeNull();
        result!.AnchorXCenterMm.Should().BeApproximately(665.0 / 2.0, 1e-9);
        // Baseline = -(BleedStripeMm - FontSizeMm * 0.2): NEGATIVA, medida da
        // origem da chapa para BAIXO, na faixa de sangria (R-017). Igual à
        // fórmula dada pelo adereço, mas apontando para a margem.
        result.BaselineYMm.Should().BeApproximately(-(5 - 2.8 * 0.2), 1e-9);
        result.FontSizeMm.Should().Be(SluglineCalculator.DefaultFontSizeMm);
        result.BaselineYMm.Should().BeLessThan(0);
        result.BaselineYMm.Should().BeGreaterThan(-5);
    }

    [Fact]
    public void BR_047_s_ThinBleedStripeBelowBaselineOffsetThrows()
    {
        // Faixa de sangria existente, porém mais magra que o offset óptico da
        // baseline (2.8 × 0.2 = 0.56mm): a baseline sairia POSITIVA, ou seja,
        // acima da origem da chapa — o texto seria desenhado por cima da arte
        // sem nenhum aviso. Rejeitar é melhor que devolver um placement
        // incoerente (não é o caso de omissão: omissão é só BleedStripeMm == 0).
        // O valor 0.56 em si (2.8*0.2) fica exatamente na borda (baseline = 0).
        foreach (var thinBleed in new[] { 0.2, 0.5 })
        {
            var act = () => SluglineCalculator.Calculate(Sample(bleedStripeMm: thinBleed));
            act.Should().Throw<ImpositionException>()
               .Which.Code.Should().Be(ErrorCodes.InvalidSluglineInput);
        }
    }

    [Fact]
    public void BR_047_t_InvalidInputsThrowImpositionExceptionWithInvalidSluglineInputCode()
    {
        // double.NaN / double.PositiveInfinity entram na lista de propósito:
        // `NaN <= 0` e `NaN < 0` são false em C#, então sem o guard de finito
        // a geometria não-finita passaria inteira e envenenaria a âncora.
        var invalid = new[]
        {
            new SluglineInput("x.pdf", FixedTime, 0, 986, 1, 1, 1, 5),
            new SluglineInput("x.pdf", FixedTime, 665, 0, 1, 1, 1, 5),
            new SluglineInput("x.pdf", FixedTime, 665, 986, 0, 1, 1, 5),
            new SluglineInput("x.pdf", FixedTime, 665, 986, 1, 0, 1, 5),
            new SluglineInput("x.pdf", FixedTime, 665, 986, 1, 1, 0, 5),
            new SluglineInput("x.pdf", FixedTime, 665, 986, 1, 1, 1, -1),
            new SluglineInput("   ", FixedTime, 665, 986, 1, 1, 1, 5, CustomText: "  "),
            new SluglineInput("x.pdf", FixedTime, double.NaN, 986, 1, 1, 1, 5),
            new SluglineInput("x.pdf", FixedTime, 665, double.NaN, 1, 1, 1, 5),
            new SluglineInput("x.pdf", FixedTime, 665, 986, 1, 1, 1, double.NaN),
            new SluglineInput("x.pdf", FixedTime, double.PositiveInfinity, 986, 1, 1, 1, 5),
            new SluglineInput("x.pdf", FixedTime, 665, double.PositiveInfinity, 1, 1, 1, 5),
            new SluglineInput("x.pdf", FixedTime, 665, 986, 1, 1, 1, double.PositiveInfinity),
        };

        foreach (var input in invalid)
        {
            var act = () => SluglineCalculator.Calculate(input);
            act.Should().Throw<ImpositionException>()
               .Which.Code.Should().Be(ErrorCodes.InvalidSluglineInput);
        }
    }

    [Fact]
    public void BR_047_u_EmptyFileNameIsValidWhenCustomTextIsPresent()
    {
        // A ordem da validação: se CustomText não é vazio, FileName não é exigido.
        var input = new SluglineInput(
            FileName: "",
            ImpositionTime: FixedTime,
            SheetWidthMm: 665,
            SheetHeightMm: 986,
            Cols: 1,
            Rows: 1,
            Total: 1,
            BleedStripeMm: 5,
            CustomText: "SLUG");

        var result = SluglineCalculator.Calculate(input);

        result.Should().NotBeNull();
        result!.Text.Should().Be("SLUG");
    }
}
