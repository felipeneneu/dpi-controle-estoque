namespace Imposition.Core.Seams;

/// <summary>
/// Direção e ordenação dos painéis de emenda (ADR-049).
/// </summary>
public enum SeamDirection
{
    /// <summary>Painel 1 inicia na extremidade esquerda/superior (padrão de fábrica).</summary>
    LeftToRight = 0,

    /// <summary>Painel 1 inicia na extremidade direita/inferior.</summary>
    RightToLeft = 1
}
