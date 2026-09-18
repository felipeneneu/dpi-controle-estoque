using FluentAssertions;
using Imposition.Core.Contracts;
using Imposition.Core.Geometry;
using Imposition.Core.Grid;
using Xunit;

namespace Imposition.Core.Tests.Centering;

/// <summary>
/// BR-040 — centralização da grade dentro da área útil (ADR-021 / PR #3c).
/// Fonte única no core: X sempre centraliza; Y centraliza em folha.
/// Valores fixados na execução (D3).
/// </summary>
public class PlacementCenteringTests
{
    private static ImpositionInput Sheet(
        double widthMm,
        double heightMm,
        double pieceW,
        double pieceH,
        MarginSpec margin,
        int targetCopies,
        double gapMm = 0.0)
        => new(
            Substrate: new SubstrateSpec(
                Kind: SubstrateKind.Sheet,
                WidthMm: widthMm,
                InitialLengthMm: heightMm,
                MaxLengthMm: null,
                ToleranceMm: 0.1,
                RegisterMm: 0.1),
            Piece: new PieceSpec(pieceW, pieceH),
            Gap: new GapSpec(gapMm, gapMm),
            Margin: margin,
            TargetCopies: targetCopies,
            SurplusPolicy: SurplusPolicy.Truncate,
            ScalePolicy: ScalePolicy.Reject,
            ForcedOrientation: null,
            ForcedCols: null);

    [Fact]
    public void BR_040_a_MarginsSymmetric_GradeCentered()
    {
        // Chapa 100×100, peça 20×20, gap 0, margem 10, alvo 16.
        // Grade 4×4 = 80×80 == área útil (80×80). startX = 10, startY = 10.
        var result = GridSearchEngine.Plan(Sheet(
            widthMm: 100, heightMm: 100,
            pieceW: 20, pieceH: 20,
            margin: new MarginSpec(10, 10, 10, 10),
            targetCopies: 16));

        result.Cols.Should().Be(4);
        result.Rows.Should().Be(4);
        result.Placements[0].XMm.Should().Be(10.0);
        result.Placements[0].YMm.Should().Be(10.0);
    }

    [Fact]
    public void BR_040_b_MarginsAsymmetric_LeftGreaterRight()
    {
        // Chapa 100×100, peça 20×20, gap 0, L=20/R=0/T=0/B=0, alvo 20.
        // utilW=80 → 4 cols; grade 4×5 = 80×100 == utilH. startX = 20 (offset
        // desloca para a direita por causa da margem maior à esquerda), startY = 0.
        var result = GridSearchEngine.Plan(Sheet(
            widthMm: 100, heightMm: 100,
            pieceW: 20, pieceH: 20,
            margin: new MarginSpec(20, 0, 0, 0),
            targetCopies: 20));

        result.Cols.Should().Be(4);
        result.Rows.Should().Be(5);
        result.Placements[0].XMm.Should().Be(20.0);
        result.Placements[0].YMm.Should().Be(0.0);
    }

    [Fact]
    public void BR_040_c_MarginsAsymmetric_TopGreaterBottom()
    {
        // Chapa 100×100, peça 20×20, gap 0, T=15/B=5, L/R=0, alvo 20.
        // utilH=80 → 4 rows; grade 5×4 = 100×80 == utilW. startY = 15, startX = 0.
        var result = GridSearchEngine.Plan(Sheet(
            widthMm: 100, heightMm: 100,
            pieceW: 20, pieceH: 20,
            margin: new MarginSpec(0, 0, 15, 5),
            targetCopies: 20));

        result.Cols.Should().Be(5);
        result.Rows.Should().Be(4);
        result.Placements[0].XMm.Should().Be(0.0);
        result.Placements[0].YMm.Should().Be(15.0);
    }

    [Fact]
    public void BR_040_d_GradeFillsArea_ZeroOffset()
    {
        // Chapa 200×100, peça 20×20, gap 0, margem 0, alvo 45.
        // Grade 10×5 ocupa 100% da área útil (200×100) → offset zero.
        var result = GridSearchEngine.Plan(Sheet(
            widthMm: 200, heightMm: 100,
            pieceW: 20, pieceH: 20,
            margin: new MarginSpec(0, 0, 0, 0),
            targetCopies: 45));

        result.Cols.Should().Be(10);
        result.Rows.Should().Be(5);
        result.PlannedUnits.Should().Be(45);
        result.Placements[0].XMm.Should().Be(0.0);
        result.Placements[0].YMm.Should().Be(0.0);
    }

    [Fact]
    public void BR_040_e_Canonical_FullArea_ZeroOffset()
    {
        // Canônico 19×34 em 665×986, alvo 1015 → grade ocupa 100%.
        var result = GridSearchEngine.Plan(Sheet(
            widthMm: 665, heightMm: 986,
            pieceW: 19, pieceH: 34,
            margin: new MarginSpec(0, 0, 0, 0),
            targetCopies: 1015));

        result.Cols.Should().Be(35);
        result.Rows.Should().Be(29);
        result.Placements[0].XMm.Should().Be(0.0);
        result.Placements[0].YMm.Should().Be(0.0);
    }
}