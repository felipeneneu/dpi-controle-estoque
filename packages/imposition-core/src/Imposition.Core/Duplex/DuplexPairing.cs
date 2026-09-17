namespace Imposition.Core.Duplex;

/// <summary>
/// Regra 5 do AGENTS.md. Head-to-Head / Head-to-Foot descrevem o
/// pareamento físico do topo entre frente e verso.
/// A escolha errada desperdiça a tiragem inteira, não uma peça.
/// </summary>
public enum DuplexPairing
{
    /// <summary>Topo-frente alinha com topo-verso. Material vira lateralmente (livro).</summary>
    HeadToHead,

    /// <summary>Topo-frente alinha com base-verso (Head-to-Toe). Material vira de cima pra baixo (calendário de mesa).</summary>
    HeadToFoot,
}
