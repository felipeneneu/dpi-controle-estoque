using AutoImposerCLI.Imposition;
using FluentAssertions;
using Imposition.Core.Contracts;
using Imposition.Core.Geometry;
using Xunit;

namespace AutoImposerCLI.Tests;

/// <summary>
/// Cobre o BestGrid (fonte única da capacidade, agora compartilhada pelo
/// MaxCapacity/MaxCapacityRoll e pela mensagem do exit code 4). Pins: casos
/// canônicos da Regra 1 (1015), do cardápio real 1000x2000 (27 UN) e rolo.
/// </summary>
public class BestGridTests
{
    [Fact]
    public void BestGrid_CapaCanonica_665x986_peca19x34_zeroMargens_deveDar1015_35x29()
    {
        var melhor = ImpositionBridge.BestGrid(
            sheetWidthMm: 665.0, sheetHeightMm: 986.0,
            gapMm: 0,
            marginTopMm: 0, marginRightMm: 0, marginBottomMm: 0, marginLeftMm: 0,
            pieceWidthMm: 19, pieceHeightMm: 34);

        melhor.Capacity.Should().Be(1015);
        melhor.Cols.Should().Be(35);
        melhor.Rows.Should().Be(29);
    }

    [Fact]
    public void BestGrid_CardapioReal_1000x2000_216x303_gap2_margem5_deveDar27_3x9()
    {
        var melhor = ImpositionBridge.BestGrid(
            sheetWidthMm: 1000.0, sheetHeightMm: 2000.0,
            gapMm: 2,
            marginTopMm: 5, marginRightMm: 5, marginBottomMm: 5, marginLeftMm: 5,
            pieceWidthMm: 216.4, pieceHeightMm: 303.4);

        // Landscape: 3 colunas (992.1/305.4) x 9 linhas (1992.1/218.4) = 27
        melhor.Capacity.Should().Be(27);
        melhor.Cols.Should().Be(3);
        melhor.Rows.Should().Be(9);
    }

    [Fact]
    public void BestGrid_OrientacaoForcada_retrocedeCapacidade()
    {
        var melhor = ImpositionBridge.BestGrid(
            sheetWidthMm: 1000.0, sheetHeightMm: 2000.0,
            gapMm: 2,
            marginTopMm: 5, marginRightMm: 5, marginBottomMm: 5, marginLeftMm: 5,
            pieceWidthMm: 216.4, pieceHeightMm: 303.4,
            forcedOrientation: Orientation.Portrait);

        // Portrait: 4 colunas x 6 linhas = 24 (auto daria 27 via landscape)
        melhor.Capacity.Should().Be(24);
        melhor.Cols.Should().Be(4);
        melhor.Rows.Should().Be(6);
    }

    [Fact]
    public void BestGrid_Rolo_700x1000_peca39x55_deveDar288_12x24()
    {
        var melhor = ImpositionBridge.BestGrid(
            sheetWidthMm: 700.0, sheetHeightMm: 1000.0,
            gapMm: 2,
            marginTopMm: 5, marginRightMm: 5, marginBottomMm: 5, marginLeftMm: 5,
            pieceWidthMm: 39, pieceHeightMm: 55);

        // Landscape (peca girada): 12 colunas (692.1/57) x 24 linhas (992.1/41) = 288
        melhor.Capacity.Should().Be(288);
        melhor.Cols.Should().Be(12);
        melhor.Rows.Should().Be(24);
    }
}