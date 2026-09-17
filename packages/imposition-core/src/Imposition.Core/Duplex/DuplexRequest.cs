using Imposition.Core.Contracts;

namespace Imposition.Core.Duplex;

/// <summary>
/// Contrato de entrada de duplex. Envolve o <see cref="ImpositionInput"/>
/// single-sided (nunca o modifica) + o pareamento escolhido.
/// Único ponto de entrada de duplex no core — ADR-022 §Decisão 3.
/// </summary>
public sealed record DuplexRequest(
    ImpositionInput FrontInput,
    DuplexPairing Pairing);
