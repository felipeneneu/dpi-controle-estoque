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

    [Fact]
    public void BR_046_d_MultiRoundOptions_ExitCode4_Parity()
    {
        // 4. Teste de paridade de multi-rodada (Exit Code 4):
        // Chapa 665x986mm, arte 19x34mm, pedido 2000 cópias (capacidade é 1015)
        var autoCap = AutoImposerBridge.MaxCapacity(665, 986, 0, 0, 0, 0, 0, 19, 34);
        var illCap = IllustratorImposerBridge.MaxCapacity(665, 986, 0, 0, 0, 0, 0, 19, 34);

        illCap.Should().Be(autoCap);
        illCap.Should().Be(1015);

        int targetCopies = 2000;
        targetCopies.Should().BeGreaterThan(illCap);

        var autoCols = AutoImposerBridge.BestGrid(665, 986, 0, 0, 0, 0, 0, 19, 34).Cols;
        var illCols = IllustratorImposerBridge.BestGrid(665, 986, 0, 0, 0, 0, 0, 19, 34).Cols;

        illCols.Should().Be(autoCols);
        illCols.Should().Be(35);

        var rodadasMin = (int)Math.Ceiling((double)targetCopies / illCap);
        rodadasMin.Should().Be(2);

        // Opção 2 rodadas: 2 rodadas de 1015 = 2030 (sobra 30)
        var copiasIdeais = (int)Math.Ceiling((double)targetCopies / 2);
        var resto = copiasIdeais % illCols;
        var copiasRodada = resto == 0 ? copiasIdeais : copiasIdeais + (illCols - resto);
        copiasRodada.Should().Be(1015);
        (copiasRodada * 2).Should().Be(2030);
    }

    [Fact]
    public void BR_046_e_FineCutFrame_GeometryCalculations()
    {
        // 5. Teste de geometria da moldura FineCut:
        // Grade de 35 cols x 29 rows para peça 19x34mm com gap 0 em chapa 665x986mm
        var input = IllustratorImposerBridge.BuildInput(
            sheetWidthMm: 665,
            sheetHeightMm: 986,
            gapMm: 0,
            marginTopMm: 0,
            marginRightMm: 0,
            marginBottomMm: 0,
            marginLeftMm: 0,
            pieceWidthMm: 19,
            pieceHeightMm: 34,
            targetCopies: 1015);

        var plan = IllustratorImposerBridge.Plan(input);
        plan.Cols.Should().Be(35);
        plan.Rows.Should().Be(29);

        double gradeWMm = (plan.Cols * 19.0) + ((plan.Cols - 1) * 0.0);
        double gradeHMm = (plan.Rows * 34.0) + ((plan.Rows - 1) * 0.0);

        gradeWMm.Should().Be(665.0);
        gradeHMm.Should().Be(986.0);

        // Tolerância e dimensões do frame devem fechar 100% com a chapa
        gradeWMm.Should().BeLessOrEqualTo(665.0);
        gradeHMm.Should().BeLessOrEqualTo(986.0);
    }

    [Fact]
    public void BR_046_f_Centering_SheetAndRollCoordinates()
    {
        // 6. Teste de centralização geométrica na chapa:
        // Chapa 330x488mm, margem 5mm, gap 2mm, arte 90x50mm, 12 cópias (3 cols x 4 rows)
        var inputSheet = IllustratorImposerBridge.BuildInput(
            sheetWidthMm: 330,
            sheetHeightMm: 488,
            gapMm: 2,
            marginTopMm: 5,
            marginRightMm: 5,
            marginBottomMm: 5,
            marginLeftMm: 5,
            pieceWidthMm: 90,
            pieceHeightMm: 50,
            targetCopies: 12,
            forcedOrientation: Orientation.Portrait);

        var planSheet = IllustratorImposerBridge.Plan(inputSheet);
        planSheet.Cols.Should().Be(3);
        planSheet.Rows.Should().Be(4);

        double gradeWMm = (planSheet.Cols * 90.0) + ((planSheet.Cols - 1) * 2.0); // 270 + 4 = 274mm
        double gradeHMm = (planSheet.Rows * 50.0) + ((planSheet.Rows - 1) * 2.0); // 200 + 6 = 206mm

        // Na chapa inteira (sem trim), a prancha é a chapa física inteira:
        double artboardWMm = 330.0;
        double artboardHMm = 488.0;

        double utilWMm = artboardWMm - 10.0; // 320mm
        double utilHMm = artboardHMm - 10.0; // 478mm

        double expectedStartXMm = 5.0 + ((utilWMm - gradeWMm) / 2.0); // 5 + 23 = 28mm
        double expectedStartYMm = 5.0 + ((utilHMm - gradeHMm) / 2.0); // 5 + 136 = 141mm

        planSheet.Placements[0].XMm.Should().Be(expectedStartXMm);
        planSheet.Placements[0].YMm.Should().Be(expectedStartYMm);

        // Verificação de simetria (margem esquerda == margem direita; margem topo == margem rodapé)
        double leftMargin = expectedStartXMm;
        double rightMargin = artboardWMm - (expectedStartXMm + gradeWMm);
        leftMargin.Should().BeApproximately(rightMargin, 0.01);

        double topMargin = expectedStartYMm;
        double bottomMargin = artboardHMm - (expectedStartYMm + gradeHMm);
        topMargin.Should().BeApproximately(bottomMargin, 0.01);
    }
}
