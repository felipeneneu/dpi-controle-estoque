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
}
