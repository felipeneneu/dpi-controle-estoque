using FluentAssertions;
using Imposition.Core.Contracts;
using Imposition.Core.Geometry;
using Xunit;
using AutoImposerBridge = AutoImposerCLI.Imposition.ImpositionBridge;
using IllustratorImposerBridge = IllustratorImposerCLI.Imposition.ImpositionBridge;

namespace IllustratorImposerCLI.Tests;

public class CrossMotorTests
{
    [Fact]
    public void BR_046_a_IllustratorCliMatchesAutoImposer()
    {
        // 1. Caso Canonico Golden Master: 19x34mm em 665x986mm, gap 0, margens 0, alvo 1015
        var input = new ImpositionInput(
            Substrate: new SubstrateSpec(
                Kind: SubstrateKind.Sheet,
                WidthMm: 665,
                InitialLengthMm: 986,
                MaxLengthMm: null,
                ToleranceMm: 0.1,
                RegisterMm: 0.1),
            Piece: new PieceSpec(19, 34),
            Gap: new GapSpec(0, 0),
            Margin: new MarginSpec(0, 0, 0, 0),
            TargetCopies: 1015,
            SurplusPolicy: SurplusPolicy.FillRow,
            ScalePolicy: ScalePolicy.Reject,
            ForcedOrientation: null,
            ForcedCols: null);

        var autoResult = AutoImposerBridge.Plan(input);
        var illResult = IllustratorImposerBridge.Plan(input);

        illResult.GridHash.Should().Be(autoResult.GridHash);
        illResult.Cols.Should().Be(35);
        illResult.Rows.Should().Be(29);
        illResult.PlannedUnits.Should().Be(1015);
    }

    [Fact]
    public void BR_046_b_IllustratorCliMatchesAutoImposer_Roll()
    {
        // 2. Caso Rolo: 19x34mm em bobina 750mm, max 10000mm, gap 2mm, margem 15mm, alvo 100
        var inputRoll = new ImpositionInput(
            Substrate: new SubstrateSpec(
                Kind: SubstrateKind.Roll,
                WidthMm: 750,
                InitialLengthMm: 0,
                MaxLengthMm: 10000,
                ToleranceMm: 0.1,
                RegisterMm: 0.1),
            Piece: new PieceSpec(19, 34),
            Gap: new GapSpec(2, 2),
            Margin: new MarginSpec(15, 15, 15, 15),
            TargetCopies: 100,
            SurplusPolicy: SurplusPolicy.FillRow,
            ScalePolicy: ScalePolicy.Reject,
            ForcedOrientation: null,
            ForcedCols: null);

        var autoResult = AutoImposerBridge.Plan(inputRoll);
        var illResult = IllustratorImposerBridge.Plan(inputRoll);

        illResult.GridHash.Should().Be(autoResult.GridHash);
        illResult.Cols.Should().Be(autoResult.Cols);
        illResult.Rows.Should().Be(autoResult.Rows);
        illResult.PlannedUnits.Should().Be(autoResult.PlannedUnits);
        illResult.LengthMm.Should().Be(autoResult.LengthMm);
    }

    [Fact]
    public void BR_046_c_IllustratorCliMatchesAutoImposer_ForcedOrientation()
    {
        // 3. Orientação forçada
        var inputPortrait = IllustratorImposerBridge.BuildInput(
            sheetWidthMm: 665,
            sheetHeightMm: 986,
            gapMm: 0,
            marginTopMm: 0,
            marginRightMm: 0,
            marginBottomMm: 0,
            marginLeftMm: 0,
            pieceWidthMm: 34,
            pieceHeightMm: 19,
            targetCopies: 969,
            forcedOrientation: Orientation.Portrait);

        var autoResult = AutoImposerBridge.Plan(inputPortrait);
        var illResult = IllustratorImposerBridge.Plan(inputPortrait);

        illResult.GridHash.Should().Be(autoResult.GridHash);
        illResult.Orientation.Should().Be(Orientation.Portrait);
        illResult.PlannedUnits.Should().Be(969);
    }
}
