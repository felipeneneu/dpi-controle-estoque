using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using FluentAssertions;
using Imposition.Core.Slugline;
using Imposition.Pdf.Contracts;
using Imposition.Pdf.Marks;
using Xunit;

namespace Imposition.Pdf.Tests;

/// <summary>
/// Testes do renderizador de texto da slugline (ADR-047, Decisoes 3 e 4).
/// Testes PUROS de string: nao invocam qpdf nem leem PDF de fixture — a
/// geometria e o texto do content stream sao verificados isolados.
/// </summary>
public class SluglineRendererTests
{
    private const double MmToPt = 72.0 / 25.4;
    private const double Tolerance = 0.01;

    /// <summary>Data fixa: nenhum teste depende do relogio da maquina.</summary>
    private static readonly DateTimeOffset Stamp = new(2026, 9, 30, 14, 5, 0, TimeSpan.Zero);

    /// <summary>Texto de amostra; a largura e derivada de <c>SampleText.Length</c>.</summary>
    private const string SampleText = "prato_teste.pdf  2x2=4";

    private static SluglinePlacement Placement(
        string text = SampleText,
        double anchorXCenterMm = 350.0,
        double baselineYMm = 22.4,
        double fontSizeMm = 2.8)
        => new(text, anchorXCenterMm, baselineYMm, fontSizeMm);

    private static double ParseTfFontSize(string content)
    {
        var m = Regex.Match(content, @"/F1\s+([0-9.eE+-]+)\s+Tf");
        m.Success.Should().BeTrue($"o stream deve conter '/F1 <tamanho> Tf'; obtido: {content}");
        return double.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture);
    }

    private static (double X, double Y) ParseTd(string content)
    {
        var m = Regex.Match(content, @"(-?[0-9.]+)\s+(-?[0-9.]+)\s+Td");
        m.Success.Should().BeTrue($"o stream deve conter um operador Td; obtido: {content}");
        return (double.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture),
                double.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture));
    }

    private static string[] LinesOf(string content)
        => content.Replace("\r\n", "\n").Split('\n').Select(l => l.Trim()).ToArray();

    // ── Tf: corpo da fonte em pt ──────────────────────────────────────

    [Fact]
    public void BR_047_a_TfUsesFontSizeInPt()
    {
        // Arrange: corpo 2.8mm (SluglineCalculator.DefaultFontSizeMm)
        var placement = Placement(fontSizeMm: 2.8);

        // Act
        var content = SluglineRenderer.GenerateContentStream(placement, 0, 0);

        // Assert: ISO 32000 espera o corpo em pt, nao em mm
        // 2.8mm x (72/25.4) = 7.937007874...pt
        ParseTfFontSize(content).Should().BeApproximately(2.8 * MmToPt, 0.001,
            "o operador Tf deve receber o corpo convertido de mm para pt");
        content.Should().Contain("Tf");
    }

    // ── Td: centragem horizontal pela estimativa Helvetica ────────────

    [Fact]
    public void BR_047_b_TdCentersTextUsingHelveticaEstimate()
    {
        // Arrange: chapa com origem em (0,0) na pagina
        var placement = Placement();
        double estWidthMm = SluglineFormatter.EstimateTextWidthMm(placement.Text, placement.FontSizeMm);

        // Act
        var content = SluglineRenderer.GenerateContentStream(placement, sheetLeftPt: 0, sheetBottomPt: 0);
        var (x, y) = ParseTd(content);

        // Assert: left = ancora - largura/2; baseline = origem + Y em mm
        x.Should().BeApproximately(
            placement.AnchorXCenterMm * MmToPt - estWidthMm * MmToPt / 2.0, Tolerance,
            "o texto deve ser centralizado na ancora usando a estimativa Helvetica");
        y.Should().BeApproximately(placement.BaselineYMm * MmToPt, Tolerance,
            "a baseline deve ficar em sheetBottom + BaselineYMm convertido");
    }

    [Fact]
    public void BR_047_c_DrawsCenteredAtSheetOrigin()
    {
        // Arrange: a mesma slugline, agora com deslocamento da chapa na pagina
        var placement = Placement();
        const double SheetLeftPt = 120.0;
        const double SheetBottomPt = 75.0;

        // Act
        var atOrigin = SluglineRenderer.GenerateContentStream(placement, 0, 0);
        var offset = SluglineRenderer.GenerateContentStream(placement, SheetLeftPt, SheetBottomPt);

        // Assert: o deslocamento da chapa translada a geometria 1:1
        var (x0, y0) = ParseTd(atOrigin);
        var (x1, y1) = ParseTd(offset);
        x1.Should().BeApproximately(x0 + SheetLeftPt, Tolerance);
        y1.Should().BeApproximately(y0 + SheetBottomPt, Tolerance);
    }

    // ── Escape de delimitadores de string PDF ──────────────────────────

    [Fact]
    public void BR_047_d_EscapesParensAndBackslash()
    {
        // Arrange: parenteses e barra invertida fechariam/abriam a string
        var placement = Placement(text: "a(b)\\c");

        // Act
        var content = SluglineRenderer.GenerateContentStream(placement, 0, 0);

        // Assert: ISO 32000 §7.3.4.2 — \ ( ) devem ser escapados
        content.Should().Contain("(a\\(b\\)\\\\c) Tj");
        content.Should().NotContain("(a(b) ");
    }

    // ── Notacao exponencial proibida ───────────────────────────────────

    [Fact]
    public void BR_047_e_NeverUsesExponentialNotation()
    {
        // Arrange: magnitudes que em double virariam "1E-05" / "1E+15"
        var placement = Placement(anchorXCenterMm: 1e-5, baselineYMm: 1e15, fontSizeMm: 1e15);

        // Act
        var content = SluglineRenderer.GenerateContentStream(placement, 1e-5, 1e-5);

        // Assert: ISO 32000-1 §7.3.3 proibe notacao cientifica
        content.Should().NotContain("E-", "PDF proibe notacao exponencial");
        content.Should().NotContain("E+", "PDF proibe notacao exponencial");
        content.Should().NotContain("e-", "PDF proibe notacao exponencial");
        content.Should().NotContain("e+", "PDF proibe notacao exponencial");
    }

    // ── Texto vazio: nada a desenhar ───────────────────────────────────

    [Fact]
    public void BR_047_f_EmptyTextReturnsEmptyStream()
    {
        // Act
        var empty = SluglineRenderer.GenerateContentStream(Placement(text: string.Empty), 0, 0);
        var whitespace = SluglineRenderer.GenerateContentStream(Placement(text: "   "), 0, 0);

        // Assert: sem texto nao ha BT/Tj — o stream volta vazio
        empty.Should().BeEmpty("sem texto nao ha nada a desenhar");
        whitespace.Should().BeEmpty("texto em branco tambem nao produz conteudo");
    }

    // ── BT/ET equilibrados ─────────────────────────────────────────────

    [Fact]
    public void BR_047_g_BtEtBalanced()
    {
        // Act
        var content = SluglineRenderer.GenerateContentStream(Placement(), 10, 20);
        var lines = LinesOf(content);

        // Assert: exatamente um par BT/ET, nao aninhado e nao orfao
        lines.Count(l => l == "BT").Should().Be(1, "um unico inicio de objeto de texto");
        lines.Count(l => l == "ET").Should().Be(1, "um unico fim de objeto de texto");
        Array.IndexOf(lines, "BT").Should().BeLessThan(Array.IndexOf(lines, "ET"),
            "BT precede ET no content stream");
    }

    // ── Contrato: ImposeOptions aceita Slugline no final ───────────────

    [Fact]
    public void BR_047_h_ImposeOptionsAcceptsSluglineAtEnd()
    {
        // Arrange: posicional de 11 parametros, Slugline depois de Marks
        var withSlugline = new ImposeOptions(
            700, 1000, 2, 2, 0, 0, 50, 50, false,
            new MarksOptions(MarkType.MimakiTipo1Fcrm),
            new SluglineOptions("a.pdf", Stamp, 4));

        // Act
        var withoutSlugline = new ImposeOptions(
            700, 1000, 2, 2, 0, 0, 50, 50, false,
            new MarksOptions(MarkType.MimakiTipo1Fcrm));

        // Assert
        withSlugline.Slugline.Should().NotBeNull();
        withSlugline.Slugline!.FileName.Should().Be("a.pdf");
        withSlugline.Slugline.ImpositionTime.Should().Be(Stamp);
        withSlugline.Slugline.Total.Should().Be(4);
        withSlugline.Slugline.CustomText.Should().BeNull("CustomText e opcional");
        withSlugline.Marks.Should().NotBeNull("Slugline nao desloca Marks");
        withoutSlugline.Slugline.Should().BeNull("call sites existentes seguem compilando sem alteracao");
    }
}
