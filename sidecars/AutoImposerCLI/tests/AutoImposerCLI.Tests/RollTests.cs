using FluentAssertions;
using Imposition.Core.Contracts;
using Imposition.Core.Geometry;
using Imposition.Core.Grid;
using AutoImposerCLI.Imposition;
using Xunit;

namespace AutoImposerCLI.Tests;

/// <summary>
/// BR-010_ak — Fix A (PR #3c): rolo com altura dinâmica (InitialLengthMm = 0)
/// é aceito pelo core; o limite físico vem de MaxLengthMm e a grade alinha
/// no topo (rolo não centraliza Y).
/// </summary>
public class RollTests
{
    [Fact]
    public void BR_010_ak_Roll_DynamicLength()
    {
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

        result.Total.Should().BeGreaterThanOrEqualTo(165);
        result.LengthMm.Should().BeLessThanOrEqualTo(1000);
        result.Placements[0].YMm.Should().Be(5.0);
    }
}