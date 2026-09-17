using FluentAssertions;
using Imposition.Core.Errors;
using Imposition.Core.Tolerance;
using Xunit;

namespace Imposition.Core.Tests;

public class ToleranceTests
{
    [Fact]
    public void BR_010_k_FactoryFloorAppliedWhenInputsSmaller()
        => Imposition.Core.Tolerance.Tolerance.Resolve(0.05, 0.05).Should().Be(0.1);

    [Fact]
    public void BR_010_l_RegisterDominatesWhenLarger()
        => Imposition.Core.Tolerance.Tolerance.Resolve(0.05, 0.25).Should().Be(0.25);

    [Fact]
    public void BR_010_m_NegativeInputsRejected()
    {
        var act = () => Imposition.Core.Tolerance.Tolerance.Resolve(-0.1, 0.1);
        act.Should().Throw<ImpositionException>()
           .Which.Code.Should().Be(ErrorCodes.InvalidTolerance);
    }
}
