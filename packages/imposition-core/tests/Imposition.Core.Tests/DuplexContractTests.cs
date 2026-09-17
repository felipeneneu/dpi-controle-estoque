using System.Reflection;
using FluentAssertions;
using Imposition.Core.Contracts;
using Xunit;

namespace Imposition.Core.Tests;

public class DuplexContractTests
{
    [Fact] // Guardrail estrutural: ImpositionInput NÃO tem campo duplex.
    public void BR_010_ab_ImpositionInput_DoesNotExposeDuplex()
    {
        var props = typeof(ImpositionInput).GetProperties(
            BindingFlags.Public | BindingFlags.Instance);

        props.Select(p => p.Name.ToLowerInvariant())
             .Should().NotContain("duplex")
             .And.NotContain("pairing");
    }
}
