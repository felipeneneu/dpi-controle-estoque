using FluentAssertions;
using Imposition.Core.Slugline;
using Xunit;

namespace Imposition.Core.Tests;

public class SluglineFormatterTests
{
    private const double FontSizeMm = 2.8;

    private static SluglineInput Sample()
        => new(
            FileName: "prato_teste.pdf",
            ImpositionTime: new DateTimeOffset(2026, 9, 30, 14, 5, 0, TimeSpan.Zero),
            SheetWidthMm: 665,
            SheetHeightMm: 986,
            Cols: 35,
            Rows: 29,
            Total: 1015,
            BleedStripeMm: 5);

    [Fact]
    public void BR_047_a_FormatTechnicalLineUsesExactContractLayout()
    {
        var line = SluglineFormatter.FormatTechnicalLine(Sample());

        line.Should().Be("prato_teste.pdf  30/09/2026 14:05  35x29=1015  665x986mm");
    }

    [Fact]
    public void BR_047_d_NormalizeLatin1FoldsAccentsKeepsLegitLatin1AndDropsOutside()
    {
        // Ex.: "TÉCNICA ç ñ 😀" => "TECNICA ç ñ".
        // É tem base ASCII (E) e é dobrado; ç/ñ/° são latin-1 legítimo e ficam;
        // emoji (U+1F600) está fora de latin-1 e é descartado.
        SluglineFormatter.NormalizeLatin1("TÉCNICA ç ñ 😀")
            .Should().Be("TECNICA ç ñ");
    }

    [Fact]
    public void BR_047_f_EstimateTextWidthIsDeterministicAndMonotonic()
    {
        var w1 = SluglineFormatter.EstimateTextWidthMm("abc", FontSizeMm);
        var w2 = SluglineFormatter.EstimateTextWidthMm("abc", FontSizeMm);
        var w3 = SluglineFormatter.EstimateTextWidthMm("abcd", FontSizeMm);

        w1.Should().BeApproximately(0.556 * FontSizeMm * 3, 1e-12);
        w2.Should().Be(w1); // determinístico: mesma entrada, mesma largura
        w3.Should().BeGreaterThan(w2); // monotônica: n + 1 > n
    }

    [Fact]
    public void BR_047_g_EstimateTextWidthOfEmptyTextIsZero()
        => SluglineFormatter.EstimateTextWidthMm(string.Empty, FontSizeMm).Should().Be(0d);

    [Fact]
    public void BR_047_h_TruncateToFitKeepsTextThatFits()
    {
        SluglineFormatter.TruncateToFit("cabe", maxWidthMm: 20, fontSizeMm: FontSizeMm)
            .Should().Be("cabe");
    }

    [Fact]
    public void BR_047_i_TruncateToFitCutsAndSuffixesEllipsisUntilWidthFits()
    {
        const double maxWidth = 8;

        var result = SluglineFormatter.TruncateToFit("abcdef", maxWidth, FontSizeMm);

        result.Should().Be("ab...");
        result.Should().EndWith("...");
        SluglineFormatter.EstimateTextWidthMm(result, FontSizeMm)
            .Should().BeLessThanOrEqualTo(maxWidth);
    }

    [Fact]
    public void BR_047_j_TruncateToFitReturnsEmptyWhenEllipsisCannotFit()
    {
        SluglineFormatter.TruncateToFit("abc", maxWidthMm: 0, fontSizeMm: FontSizeMm)
            .Should().BeEmpty();

        SluglineFormatter.TruncateToFit("", maxWidthMm: 0, fontSizeMm: FontSizeMm)
            .Should().BeEmpty();

        SluglineFormatter.TruncateToFit("", maxWidthMm: 20, fontSizeMm: FontSizeMm)
            .Should().BeEmpty();
    }

    [Fact]
    public void BR_047_k_TruncateToFitReturnsEmptyWhenMaxWidthIsPositiveButBelowEllipsis()
    {
        // maxWidthMm > 0, porém menor que a própria reticência (3 glifos =
        // 0.556 × 2.8 × 3 = 4.67mm): nenhum prefixo cabe, nem a reticência
        // sozinha — devolve vazio em vez de texto estourando a chapa.
        const double maxWidth = 1.0; // > 0 e < 4.67mm

        SluglineFormatter.TruncateToFit("abc", maxWidthMm: maxWidth, fontSizeMm: FontSizeMm)
            .Should().BeEmpty();
    }

    [Fact]
    public void BR_047_l_TruncateToFitReturnsEllipsisWhenOnlyItFits()
    {
        // 5 glifos não cabem em 5mm (7.78mm), mas a reticência sozinha cabe
        // (4.67mm): o resultado mínimo NÃO-vazio é "..." — o truncamento
        // continua visível, nunca silencioso.
        // Observação: com entrada de 3 glifos este ramo é inalcançável, porque
        // "..." e o texto original têm a mesma largura estimada (3 glifos) —
        // se "..." cabesse, o texto inteiro caberia e nem entraria no corte.
        const double maxWidth = 5.0;

        SluglineFormatter.EstimateTextWidthMm("...", FontSizeMm)
            .Should().BeLessThanOrEqualTo(maxWidth);
        SluglineFormatter.EstimateTextWidthMm("ab...", FontSizeMm)
            .Should().BeGreaterThan(maxWidth);

        SluglineFormatter.TruncateToFit("abcde", maxWidthMm: maxWidth, fontSizeMm: FontSizeMm)
            .Should().Be("...");
    }

    [Fact]
    public void BR_047_m_TruncateToFitKeepsThreeCharTextThatFitsWithoutEllipsis()
    {
        // Documenta o limite do caso acima: "abc" tem exatamente a largura da
        // reticência (4.67mm), logo em 5mm o texto cabe inteiro e o corte não
        // é acionado — a reticência nunca é somada a texto que já cabe.
        SluglineFormatter.TruncateToFit("abc", maxWidthMm: 5.0, fontSizeMm: FontSizeMm)
            .Should().Be("abc");
    }

    [Fact]
    public void BR_047_n_EffectiveTextNormalizesAndTruncates()
    {
        // Normaliza latin-1 (dobra diacrítico, descarta fora de latin-1) e trunca para caber na chapa.
        var text = "TÉCNICA ç ☕"; // normaliza para "TECNICA ç"
        SluglineFormatter.EffectiveText(text, maxWidthMm: 100).Should().Be("TECNICA ç");

        // Com largura insuficiente para o texto inteiro mas suficiente para reticências:
        SluglineFormatter.EffectiveText("ABCDEFGHIJ", maxWidthMm: 10, fontSizeMm: FontSizeMm)
            .Should().EndWith("...");
    }
}

