using FluentAssertions;
using Imposition.Core.Contracts;
using Xunit;

namespace Imposition.Core.Tests;

public class EffectiveInputResolverTests
{
    private static ImpositionInput Make() => SystemDefaults.Value;

    [Fact]
    public void BR_010_o_CallLayerWinsOverAllOthers()
    {
        var call = Make() with { TargetCopies = 999 };
        var r = EffectiveInputResolver.Resolve(
            fromCall: call,
            fromPreset: Make() with { TargetCopies = 500 },
            fromProfile: Make() with { TargetCopies = 100 });
        r.TargetCopies.Should().Be(999);
    }

    [Fact]
    public void BR_010_p_PresetWinsOverProfileAndSystem()
    {
        var r = EffectiveInputResolver.Resolve(
            fromCall: null,
            fromPreset: Make() with { TargetCopies = 500 },
            fromProfile: Make() with { TargetCopies = 100 });
        r.TargetCopies.Should().Be(500);
    }

    [Fact]
    public void BR_010_q_SystemDefaultsWhenAllLayersNull()
    {
        var r = EffectiveInputResolver.Resolve(
            fromCall: null, fromPreset: null, fromProfile: null);
        r.Should().BeSameAs(SystemDefaults.Value);
    }
}
