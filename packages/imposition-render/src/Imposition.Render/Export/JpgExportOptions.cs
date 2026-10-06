namespace Imposition.Render.Export;

/// <summary>
/// Opções de configuração para exportação de painéis em JPEG CMYK puro (ADR-053 / BR-054).
/// </summary>
/// <param name="Quality">Qualidade de compressão JPEG (1 a 100, padrão 100 = máxima fidelidade sem perdas visíveis).</param>
/// <param name="Dpi">Densidade de pontos por polegada a gravar nos metadados JFIF (padrão 150 DPI).</param>
/// <param name="EmbedIccProfile">Indica se o perfil ICC CMYK deve ser embutido nos marcadores APP2 (padrão true).</param>
/// <param name="NamingPattern">Padrão de nomenclatura para os arquivos de saída (padrão "{job}_painel_{index:D2}.jpg").</param>
public sealed record JpgExportOptions(
    int Quality = 100,
    int Dpi = 150,
    bool EmbedIccProfile = true,
    string NamingPattern = "{job}_painel_{index:D2}.jpg")
{
    public static JpgExportOptions Default { get; } = new();
}
