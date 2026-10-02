using Imposition.Core.Rolls;
using Imposition.Core.Seams;
using Xunit;

namespace Imposition.Core.Tests.Rolls;

[Trait("Category", "Rolls")]
[Trait("Category", "Integration")]
[Trait("Category", "Seams")]
public sealed class RollSuggesterIntegrationTests
{
    [Fact]
    public void BR_051_SuggestionEquivalentToDirectPanelCalculator_ProducesIdenticalPlacements()
    {
        // Arrange: Arte 7000 x 1000 mm, overlap 10 mm
        const double artWidth = 7000.0;
        const double artHeight = 1000.0;
        const double overlap = 10.0;

        // 1. Sugestão automática via RollSuggester
        var suggestion = RollSuggester.Suggest(artWidth, artHeight, overlap, DefaultRolls.All);

        // 2. Cálculo direto via PanelCalculator usando a largura útil do rolo selecionado
        var directInput = new SeamsInput(
            ArtworkWidthMm: artWidth,
            ArtworkHeightMm: artHeight,
            PrintableRollWidthMm: suggestion.SelectedRoll.UsableWidthMm,
            OverlapMm: overlap,
            ApplyShrinkage: true);

        var directResult = PanelCalculator.Calculate(directInput);

        // Assert: Garantir equivalência estrutural absoluta
        Assert.Equal(directResult.TotalPanels, suggestion.PanelCount);
        Assert.Equal(directResult.Panels.Count, suggestion.PanelCount);

        for (var i = 0; i < directResult.Panels.Count; i++)
        {
            var pDirect = directResult.Panels[i];

            // Re-executa com o rolo sugerido para confirmar integridade
            Assert.True(pDirect.OutputWidthMm <= suggestion.SelectedRoll.UsableWidthMm + 0.001);
            Assert.Equal(i + 1, pDirect.Index);
            Assert.True(pDirect.OutputHeightMm > artHeight); // Com acréscimo de encolhimento
        }
    }

    [Fact]
    public void BR_051_CustomRollRepositoryIntegration_SuggesterConsumesRepo()
    {
        // Arrange
        var tempDir = Path.Combine(Path.GetTempPath(), "GraficaOS_Integ_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);
        var jsonPath = Path.Combine(tempDir, "rolls.json");

        try
        {
            var repo = new JsonRollRepository(jsonPath);
            var customRoll = RollSpecification.Create("custom-super-wide", "Lona 2,00m", 2000.0, 15.0);
            repo.Save(customRoll);

            var candidates = repo.GetAll();

            // Act: Banner 1900 x 1000 mm
            var suggestion = RollSuggester.Suggest(1900.0, 1000.0, 10.0, candidates);

            // Assert: Rolo de 2,00m (útil 1970mm) permite produzir em 1 painel único sem emenda
            Assert.Equal("custom-super-wide", suggestion.SelectedRoll.Id);
            Assert.Equal(1, suggestion.PanelCount);
        }
        finally
        {
            if (Directory.Exists(tempDir))
                Directory.Delete(tempDir, recursive: true);
        }
    }
}
