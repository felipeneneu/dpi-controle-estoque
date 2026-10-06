using Imposition.Pdf.Preflight;

namespace Imposition.Pdf.Seams;

/// <summary>
/// Opções de exportação de painéis no formato PDF/X-1a (ADR-054, BR-055).
/// </summary>
/// <param name="OutputIntent">Configuração de OutputIntent contendo perfil ICC CMYK embutido.</param>
/// <param name="NamingPattern">Padrão de nomenclatura (ex.: "{job}_painel_{index:D2}.pdf").</param>
public sealed record PdfxExportOptions(
    PdfxOutputIntent OutputIntent,
    string NamingPattern = "{job}_painel_{index:D2}.pdf");
