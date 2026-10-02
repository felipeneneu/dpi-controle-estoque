using Imposition.Core.Errors;
using Imposition.Core.Rolls;
using Xunit;

namespace Imposition.Core.Tests.Rolls;

[Trait("Category", "Rolls")]
[Trait("Category", "Seams")]
public sealed class RollSuggesterTests
{
    [Fact]
    public void BR_051_Arte7000x1000_AllCandidates_ReturnsRoll1520_FewestPanels()
    {
        var candidates = DefaultRolls.All;

        // 7000 mm em 1520 (útil 1490) gera 5 painéis (1400+20=1420 <= 1490).
        // Em 1270 (útil 1240) exige 6 painéis.
        var suggestion = RollSuggester.Suggest(7000.0, 1000.0, 10.0, candidates);

        Assert.NotNull(suggestion);
        Assert.Equal("roll-1520", suggestion.SelectedRoll.Id);
        Assert.Equal(5, suggestion.PanelCount);
    }

    [Fact]
    public void BR_051_Arte2500x1000_Candidates1520And1270_ReturnsRoll1520_FewestPanels()
    {
        var candidates = new[] { DefaultRolls.Roll1520, DefaultRolls.Roll1270 };

        // 2500 mm em 1520 gera 2 painéis (1250+10=1260 <= 1490).
        // Em 1270 gera 3 painéis (833+20=853 <= 1240).
        var suggestion = RollSuggester.Suggest(2500.0, 1000.0, 10.0, candidates);

        Assert.NotNull(suggestion);
        Assert.Equal("roll-1520", suggestion.SelectedRoll.Id);
        Assert.Equal(2, suggestion.PanelCount);
    }

    [Fact]
    public void BR_051_Arte1200x1000_Candidates1520And1270_ReturnsRoll1270_LeastWaste()
    {
        var candidates = new[] { DefaultRolls.Roll1520, DefaultRolls.Roll1270 };

        // 1200 mm cabe em 1 painel tanto no 1270 (útil 1240) quanto no 1520 (útil 1490).
        // 1270 gera menos refugo de sobra lateral.
        var suggestion = RollSuggester.Suggest(1200.0, 1000.0, 10.0, candidates);

        Assert.NotNull(suggestion);
        Assert.Equal("roll-1270", suggestion.SelectedRoll.Id);
        Assert.Equal(1, suggestion.PanelCount);
    }

    [Fact]
    public void BR_051_Arte500x1000_AllCandidates_ReturnsRoll910_LeastWaste()
    {
        var candidates = DefaultRolls.All;

        // 500 mm cabe em 1 painel em todos; 910 tem o menor refugo.
        var suggestion = RollSuggester.Suggest(500.0, 1000.0, 10.0, candidates);

        Assert.NotNull(suggestion);
        Assert.Equal("roll-910", suggestion.SelectedRoll.Id);
        Assert.Equal(1, suggestion.PanelCount);
    }

    [Fact]
    public void BR_051_Arte4000x1000_SingleCandidate1520_ReturnsRoll1520()
    {
        var candidates = new[] { DefaultRolls.Roll1520 };

        var suggestion = RollSuggester.Suggest(4000.0, 1000.0, 10.0, candidates);

        Assert.NotNull(suggestion);
        Assert.Equal("roll-1520", suggestion.SelectedRoll.Id);
        Assert.True(suggestion.PanelCount >= 3);
    }

    [Fact]
    public void BR_051_EmptyCandidates_ThrowsRollNotFound()
    {
        var candidates = Array.Empty<RollSpecification>();

        var ex = Assert.Throws<ImpositionException>(() =>
            RollSuggester.Suggest(100.0, 100.0, 10.0, candidates));

        Assert.Equal(ErrorCodes.RollNotFound, ex.Code);
    }

    [Fact]
    public void BR_051_Arte5000x1000_SingleCandidate910_ReturnsRoll910()
    {
        var candidates = new[] { DefaultRolls.Roll910 };

        var suggestion = RollSuggester.Suggest(5000.0, 1000.0, 10.0, candidates);

        Assert.NotNull(suggestion);
        Assert.Equal("roll-910", suggestion.SelectedRoll.Id);
    }

    [Fact]
    public void BR_051_NaN_ArtworkWidth_ThrowsInvalidSeamsInput()
    {
        var candidates = DefaultRolls.All;

        var ex = Assert.Throws<ImpositionException>(() =>
            RollSuggester.Suggest(double.NaN, 1000.0, 10.0, candidates));

        Assert.Equal(ErrorCodes.InvalidSeamsInput, ex.Code);
    }
}
