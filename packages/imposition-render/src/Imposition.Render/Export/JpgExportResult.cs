namespace Imposition.Render.Export;

/// <summary>
/// Resultado da exportação de lote de painéis JPEG CMYK (ADR-053).
/// Preenchido exclusivamente após a conclusão da escrita em disco (Regra R-019).
/// </summary>
/// <param name="GeneratedFiles">Lista dos caminhos absolutos dos arquivos gerados.</param>
/// <param name="TotalBytes">Tamanho total acumulado em bytes de todos os arquivos gerados.</param>
/// <param name="ElapsedTime">Tempo total decorrido durante a exportação.</param>
public sealed record JpgExportResult(
    IReadOnlyList<string> GeneratedFiles,
    long TotalBytes,
    TimeSpan ElapsedTime);
