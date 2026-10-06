namespace Imposition.Pdf.Preflight;

/// <summary>
/// Especificação de OutputIntent para conformidade PDF/X-1a (ISO 15930-1).
/// </summary>
/// <param name="OutputConditionIdentifier">Identificador de condição de saída (ex.: "FOGRA39").</param>
/// <param name="Info">Descrição legível do perfil (ex.: "ISO Coated v2 (ECI)").</param>
/// <param name="IccProfileBytes">Buffer de bytes bruto do perfil ICC embutido.</param>
public sealed record PdfxOutputIntent(
    string OutputConditionIdentifier,
    string Info,
    byte[] IccProfileBytes);
