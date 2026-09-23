using System.Linq;
using System.Text;
using FluentAssertions;
using Imposition.Pdf.Contracts;
using Imposition.Pdf.Marks;
using Xunit;

namespace Imposition.Pdf.Tests;

/// <summary>
/// Testes de correção das marcas Mimaki: orientação, MediaBox e geometria.
/// Ref: PR #5c-fix (Bugs 1–3).
/// </summary>
public class MarksRendererTests
{
    private const double MmToPt = 72.0 / 25.4;
    private const double Tolerance = 0.01;

    // ── Bug 1: Orientação ──────────────────────────────────────────────

    [Fact]
    public void BR_045_h_EachCornerHasDistinctOrientation()
    {
        // Arrange: 4 cantos desenhados no mesmo bounding box (0,0,20,20)
        var topLeft = new StringBuilder();
        var topRight = new StringBuilder();
        var bottomLeft = new StringBuilder();
        var bottomRight = new StringBuilder();

        // Act
        MarksRenderer.DrawTopLeft(topLeft, 0, 0, 20);
        MarksRenderer.DrawTopRight(topRight, 0, 0, 20);
        MarksRenderer.DrawBottomLeft(bottomLeft, 0, 0, 20);
        MarksRenderer.DrawBottomRight(bottomRight, 0, 0, 20);

        // Assert: as 4 geometrias devem ser distintas (moldura)
        var contents = new[]
        {
            topLeft.ToString(),
            topRight.ToString(),
            bottomLeft.ToString(),
            bottomRight.ToString(),
        };

        contents.Distinct().Should().HaveCount(4,
            "cada canto deve produzir geometria distinta para formar uma moldura");
    }

    [Fact]
    public void BR_045_i_TopLeftIsOpenRightDown()
    {
        // Arrange
        var sb = new StringBuilder();

        // Act: ┌ — haste horizontal para direita, vertical para baixo
        MarksRenderer.DrawTopLeft(sb, 0, 0, 20);
        var content = sb.ToString();

        // Assert: ponto de ancoragem em (0, 20) — canto superior esquerdo
        // Haste horizontal: (0, 20) → (20, 20)
        content.Should().Contain("0 20 m");
        content.Should().Contain("20 20 l");
        // Haste vertical: (0, 20) → (0, 0)
        content.Should().Contain("0 0 l");
    }

    [Fact]
    public void BR_045_i2_BottomRightIsOpenLeftUp()
    {
        // Arrange
        var sb = new StringBuilder();

        // Act: ┘ — haste horizontal para esquerda, vertical para cima
        MarksRenderer.DrawBottomRight(sb, 0, 0, 20);
        var content = sb.ToString();

        // Assert: ponto de ancoragem em (20, 0) — canto inferior direito
        // Haste horizontal: (20, 0) → (0, 0)
        content.Should().Contain("20 0 m");
        content.Should().Contain("0 0 l");
        // Haste vertical: (20, 0) → (20, 20)
        content.Should().Contain("20 20 l");
    }

    // ── Bug 2: MediaBox ────────────────────────────────────────────────

    [Fact]
    public void BR_045_j_MediaBoxIncludesMarksSpace()
    {
        // Arrange: grade 686×592mm, offset 3mm, size 20mm
        // Expansão esperada por lado: 3 + 20 = 23mm, total: 46mm em cada eixo
        var marks = new MarksOptions(MarkType.MimakiTipo1Fcrm);

        // Act
        var (expandW, expandH) = MarksRenderer.GetMarksExpansion(marks);

        // Assert: expansão total = 2 × (offset + size) = 2 × (3 + 20) = 46mm
        expandW.Should().BeApproximately(46.0, Tolerance,
            "expansão horizontal deve ser 2 × (3 + 20) = 46mm");
        expandH.Should().BeApproximately(46.0, Tolerance,
            "expansão vertical deve ser 2 × (3 + 20) = 46mm");
    }

    [Fact]
    public void BR_045_j2_NoMarksNoExpansion()
    {
        // Act
        var (expandW, expandH) = MarksRenderer.GetMarksExpansion(null);

        // Assert
        expandW.Should().Be(0);
        expandH.Should().Be(0);
    }

    [Fact]
    public void BR_045_j3_RdgMarksIncludeBorderExpansion()
    {
        // Arrange: mimaki-fcrm-rdg tem RdgBorderMm = 2.0
        var marks = new MarksOptions(MarkType.MimakiTipo1FcrmRdg);

        // Act
        var (expandW, expandH) = MarksRenderer.GetMarksExpansion(marks);

        // Assert: 2 × (3 + 20 + 2) = 50mm
        expandW.Should().BeApproximately(50.0, Tolerance);
        expandH.Should().BeApproximately(50.0, Tolerance);
    }

    // ── Bug 3: Geometria (stroke) ──────────────────────────────────────

    [Fact]
    public void BR_045_k_StrokeIs1mmConvertedToPt()
    {
        // Arrange
        var spec = MarkSpecs.All.First(s => s.Type == MarkType.MimakiTipo1Fcrm);

        // Assert: spec define 1.0mm
        spec.StrokeMm.Should().Be(1.0, "espessura Mimaki deve ser 1mm");

        // Verificar conversão no content stream
        var content = MarksRenderer.GenerateContentStream(
            100, 100, 500, 400,
            new MarksOptions(MarkType.MimakiTipo1Fcrm),
            out _);

        // 1mm × (72/25.4) = 2.8346... pt
        double expectedStrokePt = 1.0 * MmToPt;
        content.Should().Contain($"{expectedStrokePt.ToString(System.Globalization.CultureInfo.InvariantCulture)} w",
            "stroke em pt deve ser 1mm convertido (≈2.835pt)");
    }

    [Fact]
    public void BR_045_k2_AllMimakiSpecsHave20mmSize()
    {
        // Assert: todas as specs Mimaki devem ter SizeMm = 20
        var mimakiSpecs = MarkSpecs.All.Where(s =>
            s.Type is MarkType.MimakiTipo1Plain
                   or MarkType.MimakiTipo1Fcrm
                   or MarkType.MimakiTipo1FcrmRdg);

        foreach (var spec in mimakiSpecs)
        {
            spec.SizeMm.Should().Be(20.0,
                $"spec '{spec.Name}' deve ter haste de 20mm");
            spec.StrokeMm.Should().Be(1.0,
                $"spec '{spec.Name}' deve ter traço de 1mm");
        }
    }

    // ── Fluxo sem marcas não quebra ────────────────────────────────────

    [Fact]
    public void BR_045_l_NoMarksFlowUnchanged()
    {
        // Arrange: ImposeOptions sem marcas
        var options = new ImposeOptions(700, 1000, 2, 2, 0, 0, 50, 50, false, Marks: null);

        // Assert: Marks é null, GetMarksExpansion retorna (0,0)
        options.Marks.Should().BeNull();
        var (expandW, expandH) = MarksRenderer.GetMarksExpansion(options.Marks);
        expandW.Should().Be(0);
        expandH.Should().Be(0);
    }

    [Fact]
    public void BR_045_m_NoExponentialNotationInContentStream()
    {
        // Act: gera content stream com coordenadas que causavam 7.1054E-15 por floating point
        var offsetPt = 3.0 * MmToPt;
        var sizePt = 20.0 * MmToPt;
        double startX = offsetPt + sizePt;
        double startY = offsetPt + sizePt;
        double right = startX + 500;
        double top = startY + 400;

        var content = MarksRenderer.GenerateContentStream(
            startX, startY, right, top,
            new MarksOptions(MarkType.MimakiTipo1Fcrm),
            out _);

        // Assert: ISO 32000-1 §7.3.3 proíbe notação científica em PDF
        content.Should().NotContain("E-", "PDF proíbe notação exponencial");
        content.Should().NotContain("e-", "PDF proíbe notação exponencial");
        content.Should().NotContain("E+", "PDF proíbe notação exponencial");
        content.Should().NotContain("e+", "PDF proíbe notação exponencial");
    }

    [Fact]
    public void BR_045_n_SeparationSpecHasRangeAndValidOperators()
    {
        // Act
        var (resource, setup) = SpotRegistry.BuildSeparation("MimakiFCRM", 0, 0, 0, 1);

        // Assert: Dicionário compatível com Illustrator e ISO 32000
        resource.Should().Contain("/Range [0.0 1.0 0.0 1.0 0.0 1.0 0.0 1.0]");
        resource.Should().Contain("/N 1.0");

        // Operadores de traço (CS / SCN) e preenchimento (cs / scn)
        setup.Should().Contain("/CS_MimakiFCRM CS");
        setup.Should().Contain("1 SCN");
        setup.Should().Contain("/CS_MimakiFCRM cs");
        setup.Should().Contain("1 scn");
        setup.Should().NotContain("1 sc\n", "sc não é suportado para Separation no PDF");
    }
}
