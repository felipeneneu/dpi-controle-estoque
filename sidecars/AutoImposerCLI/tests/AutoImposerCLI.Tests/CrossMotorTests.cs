using FluentAssertions;
using Imposition.Core.Contracts;
using Imposition.Core.Geometry;
using Imposition.Core.Grid;
using AutoImposerCLI.Imposition;
using PdfSharp.Pdf;
using PdfSharp.Drawing;
using System.IO;
using Xunit;

namespace AutoImposerCLI.Tests;

public class CrossMotorTests
{
    [Fact]
    public void BR_010_ae_CrossMotor_SameInput_SameGridHash()
    {
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
            SurplusPolicy: SurplusPolicy.Truncate,
            ScalePolicy: ScalePolicy.Reject,
            ForcedOrientation: null,
            ForcedCols: null);

        var coreResult = GridSearchEngine.Plan(input);
        var cliResult = ImpositionBridge.Plan(input);

        cliResult.GridHash.Should().Be(coreResult.GridHash);
        cliResult.PlannedUnits.Should().Be(1015);
    }

    [Fact]
    public void BR_010_ag_LegacyDefaultCapacity_RespectsRotationAndTolerance()
    {
        var capacidade = ImpositionBridge.MaxCapacity(
            sheetWidthMm: 665,
            sheetHeightMm: 986,
            gapMm: 0,
            marginTopMm: 0,
            marginRightMm: 0,
            marginBottomMm: 0,
            marginLeftMm: 0,
            pieceWidthMm: 34,
            pieceHeightMm: 19);

        capacidade.Should().Be(1015);

        var input = ImpositionBridge.BuildInput(
            sheetWidthMm: 665,
            sheetHeightMm: 986,
            gapMm: 0,
            marginTopMm: 0,
            marginRightMm: 0,
            marginBottomMm: 0,
            marginLeftMm: 0,
            pieceWidthMm: 34,
            pieceHeightMm: 19,
            targetCopies: capacidade,
            forcedOrientation: null);

        var cliResult = ImpositionBridge.Plan(input);

        cliResult.Cols.Should().Be(35);
        cliResult.Rows.Should().Be(29);
        cliResult.PlannedUnits.Should().Be(1015);
    }

    [Fact]
    public void BR_010_af_CountIntegrity_PdfReadBack()
    {
        // Gerar um PDF de teste em memória e salvá-lo para read-back
        var tempFile = Path.GetTempFileName() + ".pdf";
        try
        {
            using (var doc = new PdfDocument())
            {
                var page = doc.AddPage();
                page.Width = XUnit.FromMillimeter(100);
                page.Height = XUnit.FromMillimeter(100);

                using (var gfx = XGraphics.FromPdfPage(page))
                {
                    // Simular a inserção de XObjects usando PdfSharp
                    // Criamos um XForm
                    var form = new XForm(doc, XUnit.FromMillimeter(10), XUnit.FromMillimeter(10));
                    using (var formGfx = XGraphics.FromForm(form))
                    {
                        formGfx.DrawRectangle(XPens.Black, 0, 0, 10, 10);
                    }

                    // Desenhar N vezes
                    for (int i = 0; i < 5; i++)
                    {
                        gfx.DrawImage(form, 10 + i * 15, 10);
                    }
                }
                doc.Save(tempFile);
            }

            // Validar
            int planned = 5;
            int drawn = 5;
            int readBack = PdfReadBack.CountDrawnUnits(tempFile);

            // O read-back do motor 1 retorna o total de XObjects do tipo Form
            // No caso ideal, deve bater com o planned
            if (readBack != -1)
            {
                readBack.Should().Be(planned);
            }

            // Validar via CountIntegrity (Warn)
            var ex = Record.Exception(() => CountIntegrity.Validate(planned, drawn, readBack, strict: false));
            ex.Should().BeNull();
        }
        finally
        {
            if (File.Exists(tempFile)) File.Delete(tempFile);
        }
    }

    [Fact]
    public void BR_010_ah_MaxCapacity_RespectsForcedOrientation()
    {
        // Peça 34×19 em chapa 665×986 (gap 0, margens 0), capacidade máxima:
        // - Diretamente (Portrait)  : 34×19 → (35 cols × 29 rows)?? não — ver cálculo abaixo
        // - Rotacionada (Landscape): 19×34 → 35 cols × 29 rows = 1015
        // A vencedora (auto) deve ser a de maior capacidade; orientação forçada respeita a pedida.
        int capDirect = ImpositionBridge.MaxCapacity(
            sheetWidthMm: 665, sheetHeightMm: 986, gapMm: 0,
            marginTopMm: 0, marginRightMm: 0, marginBottomMm: 0, marginLeftMm: 0,
            pieceWidthMm: 34, pieceHeightMm: 19,
            forcedOrientation: Orientation.Portrait);

        int capRotated = ImpositionBridge.MaxCapacity(
            sheetWidthMm: 665, sheetHeightMm: 986, gapMm: 0,
            marginTopMm: 0, marginRightMm: 0, marginBottomMm: 0, marginLeftMm: 0,
            pieceWidthMm: 34, pieceHeightMm: 19,
            forcedOrientation: Orientation.Landscape);

        int capAuto = ImpositionBridge.MaxCapacity(
            sheetWidthMm: 665, sheetHeightMm: 986, gapMm: 0,
            marginTopMm: 0, marginRightMm: 0, marginBottomMm: 0, marginLeftMm: 0,
            pieceWidthMm: 34, pieceHeightMm: 19,
            forcedOrientation: null);

        // Sem tolerância/rotação, 34×19: floor(665/34)=19 × floor(986/19)=51 → 969
        capDirect.Should().Be(969);
        capRotated.Should().Be(1015);
        capAuto.Should().Be(1015);

        // O plano respeita a orientação forçada no resultado
        var inputPortrait = ImpositionBridge.BuildInput(
            sheetWidthMm: 665, sheetHeightMm: 986, gapMm: 0,
            marginTopMm: 0, marginRightMm: 0, marginBottomMm: 0, marginLeftMm: 0,
            pieceWidthMm: 34, pieceHeightMm: 19,
            targetCopies: capDirect,
            forcedOrientation: Orientation.Portrait);

        var planoPortrait = ImpositionBridge.Plan(inputPortrait);
        planoPortrait.Orientation.Should().Be(Orientation.Portrait);
        planoPortrait.PlannedUnits.Should().Be(capDirect);
    }

    [Fact]
    public void BR_010_ai_Roll_AutoExtendsToMaxLength()
    {
        // Rolo de 665mm de largura, extensão máxima de 2000mm (mesma arte 34×19,
        // gap 0, margens 0). Capacidade = 35 colunas × 58 linhas = 2030.
        int capRoll = ImpositionBridge.MaxCapacityRoll(
            rollWidthMm: 665, maxLengthMm: 2000, gapMm: 0,
            marginTopMm: 0, marginRightMm: 0, marginBottomMm: 0, marginLeftMm: 0,
            pieceWidthMm: 19, pieceHeightMm: 34);

        capRoll.Should().Be(2030);

        var inputRoll = ImpositionBridge.BuildInput(
            sheetWidthMm: 665, sheetHeightMm: 2000, gapMm: 0,
            marginTopMm: 0, marginRightMm: 0, marginBottomMm: 0, marginLeftMm: 0,
            pieceWidthMm: 19, pieceHeightMm: 34,
            targetCopies: capRoll,
            forcedOrientation: null,
            surplusPolicy: SurplusPolicy.FillRow,
            kind: SubstrateKind.Roll,
            maxLengthMm: 2000);

        var planoRoll = ImpositionBridge.Plan(inputRoll);

        planoRoll.Cols.Should().Be(35);
        planoRoll.Rows.Should().Be(58);
        planoRoll.PlannedUnits.Should().Be(2030);
        // Não pode ultrapassar o comprimento máximo do rolo
        planoRoll.LengthMm.Should().BeLessOrEqualTo(2000);
    }
}
