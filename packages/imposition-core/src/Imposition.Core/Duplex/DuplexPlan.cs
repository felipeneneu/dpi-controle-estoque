using Imposition.Core.Contracts;

namespace Imposition.Core.Duplex;

/// <summary>
/// Plano duplex pronto para render. Front e Back são
/// <see cref="ImpositionResult"/> independentes.
/// </summary>
public sealed record DuplexPlan(
    ImpositionResult Front,
    ImpositionResult Back,
    DuplexPairing Pairing,
    string GridHash);
