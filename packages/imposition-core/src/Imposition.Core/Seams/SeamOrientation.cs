namespace Imposition.Core.Seams;

/// <summary>
/// Orientação do corte e fatiamento dos painéis de emenda (ADR-049).
/// </summary>
public enum SeamOrientation
{
    /// <summary>Painéis verticais (fatiados ao longo da largura da arte, avanço longitudinal no rolo).</summary>
    Vertical = 0,

    /// <summary>Painéis horizontais (fatiados ao longo da altura da arte).</summary>
    Horizontal = 1
}
