using FluentAssertions;
using Imposition.Core.Contracts;
using Imposition.Core.Geometry;
using Imposition.Core.Grid;
using AutoImposerCLI.Imposition;
using Xunit;

namespace AutoImposerCLI.Tests;

/// <summary>
/// BR-010_am — flag --trim-to-content: rolo e chapa. O PDF final deve ter o
/// tamanho da grade (+ margens laterais/topo/base) em vez do substrato inteiro.
/// BR-010_an cobre chapa (a página encurta TAMBÉM em Y, pois folha centraliza).
/// Testes validam a matemática de redução da MediaBox sem invocar o CLI.
/// </summary>
public class TrimToContentTests
{
    [Fact]
    public void BR_010_am_TrimToContent_RoloReduzMediaBox()
    {
        // Rolo 700×1000, peça 39×55, gap 2, margem 5, alvo 165.
        var input = ImpositionBridge.BuildInput(
            sheetWidthMm: 700, sheetHeightMm: 0,
            gapMm: 2,
            marginTopMm: 5, marginRightMm: 5,
            marginBottomMm: 5, marginLeftMm: 5,
            pieceWidthMm: 39, pieceHeightMm: 55,
            targetCopies: 165,
            forcedOrientation: null,
            kind: SubstrateKind.Roll,
            maxLengthMm: 1000);

        var result = GridSearchEngine.Plan(input);

        // Largura da peça NA ORIENTAÇÃO VENCEDORA (Placement.WidthMm já é o
        // slot orientado — mesmo valor que slotWMm no Program.cs).
        var slotW = result.Placements[0].WidthMm;
        var gradeWMm = result.Cols * slotW + (result.Cols - 1) * 2;
        var gradeHMm = result.LengthMm;

        // Sem trim: página = 700 × (margemTopo + length + margemBase) [comportamento atual]
        // Com trim:   página = (gradeW + marg. L/R) × (gradeH + marg. T/B)
        var pageSemTrim = (700.0, 5.0 + result.LengthMm + 5.0);
        var pageComTrim = (gradeWMm + 10.0, gradeHMm + 10.0);

        pageComTrim.Item1.Should().BeLessThan(pageSemTrim.Item1);
        pageComTrim.Item2.Should().BeLessThanOrEqualTo(pageSemTrim.Item2);
    }

    [Fact]
    public void BR_010_an_TrimToContent_ChapaReduzMediaBox()
    {
        // Chapa 1000×2000, peça 216.4×303.4 (cardápio real), gap 2, margem 5,
        // alvo 27 (= capacidade na grade landscape 3 cols × 9 rows).
        var input = ImpositionBridge.BuildInput(
            sheetWidthMm: 1000, sheetHeightMm: 2000,
            gapMm: 2,
            marginTopMm: 5, marginRightMm: 5,
            marginBottomMm: 5, marginLeftMm: 5,
            pieceWidthMm: 216.4, pieceHeightMm: 303.4,
            targetCopies: 27,
            forcedOrientation: null,
            kind: SubstrateKind.Sheet);

        var result = GridSearchEngine.Plan(input);

        result.Total.Should().BeGreaterThanOrEqualTo(27);

        var slotW = result.Placements[0].WidthMm;
        var gradeWMm = result.Cols * slotW + (result.Cols - 1) * 2;
        var gradeHMm = result.LengthMm;

        // Sem trim: página = chapa inteira (1000 × 2000).
        // Com trim:   página = (gradeW + marg. L/R) × (gradeH + marg. T/B),
        // encurta nas DUAS dimensões (folha centraliza Y).
        var chapa = (1000.0, 2000.0);
        var pageComTrim = (gradeWMm + 10.0, gradeHMm + 10.0);

        pageComTrim.Item1.Should().BeLessThan(chapa.Item1);
        pageComTrim.Item2.Should().BeLessThan(chapa.Item2);
        pageComTrim.Item1.Should().BeLessThan(990.0);
    }
}