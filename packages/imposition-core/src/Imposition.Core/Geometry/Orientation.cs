namespace Imposition.Core.Geometry;

/// <summary>
/// Regra 1 do AGENTS.md: origem top-left, Y crescente para baixo.
/// Orientação descreve como a peça é girada dentro do slot.
/// </summary>
public enum Orientation
{
    Portrait  = 0,
    Landscape = 90,
}

public enum SubstrateKind
{
    /// <summary>Folha/chapa — comprimento fixo. Não cabe = rejeita.</summary>
    Sheet,
    /// <summary>Rolo/bobina — auto-estende até maxLengthMm.</summary>
    Roll,
}

public enum SurplusPolicy
{
    /// <summary>Corta em targetCopies. drawn == planned == target.</summary>
    Truncate,
    /// <summary>Preenche a última linha com sobras.</summary>
    FillRow,
    /// <summary>Usa todas as linhas disponíveis.</summary>
    FillAdvance,
}

public enum ScalePolicy
{
    Fit,
    Bleed,
    Reject,
}
