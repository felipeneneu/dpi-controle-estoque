using System.Globalization;
using System.Text;

namespace Imposition.Core.Slugline;

/// <summary>
/// Formatação da slugline (ADR-047, Decisão 1).
/// Cálculo puro, sem IO, sem estado.
/// </summary>
public static class SluglineFormatter
{
    /// <summary>
    /// Fator de avanço médio do Helvetica (ADR-047, Decisão 3): largura
    /// estimada = fator × corpo × comprimento do texto. O Helvetica é uma
    /// fonte de largura variável; 0.556 é o avanço médio entre os glifos
    /// ASCII em 1 em.
    /// </summary>
    public const double HelveticaAverageAdvanceFactor = 0.556;

    /// <summary>
    /// Formato EXATO da linha técnica, nesta ordem:
    /// {FileName}  {ImpositionTime:dd/MM/yyyy HH:mm}  {Cols}x{Rows}={Total}  {SheetWidthMm:0.#}x{SheetHeightMm:0.#}mm
    /// Ex.: "prato_teste.pdf  30/09/2026 14:05  35x29=1015  665x986mm"
    /// Usa CultureInfo.InvariantCulture para o separador decimal ser sempre
    /// ponto, independente da cultura da máquina.
    /// </summary>
    public static string FormatTechnicalLine(SluglineInput input)
    {
        var stamp = input.ImpositionTime.ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture);
        var width = input.SheetWidthMm.ToString("0.#", CultureInfo.InvariantCulture);
        var height = input.SheetHeightMm.ToString("0.#", CultureInfo.InvariantCulture);
        return $"{input.FileName}  {stamp}  {input.Cols}x{input.Rows}={input.Total}  {width}x{height}mm";
    }

    /// <summary>
    /// Normaliza o texto para latin-1 (ADR-047, Decisão 3 — WinAnsiEncoding).
    /// Regra determinística, por caractere:
    /// 1. ASCII (U+0000–U+007F): mantém.
    /// 2. Latin-1 legítimo sem dobra ASCII ({ç, Ç, ñ, Ñ, °}): mantém.
    /// 3. Diacrítico latin-1 com base ASCII (á, é, ã, ö, …): dobra para a base
    ///    ("TÉCNICA" => "TECNICA", "café" => "cafe").
    /// 4. Outro latin-1 (U+0080–U+00FF) sem dobra: mantém.
    /// 5. Fora de latin-1 (emoji, cirílico, CJK): DROPA.
    /// A iteração por char descarta sozinho os surrogates de emoji (cada metade
    /// é &gt; U+00FF), então o resultado é determinístico.
    /// Ao final, o texto é aparado (Trim): descartar um caractere fora de
    /// latin-1 não pode deixar espaço pendurado no início/fim
    /// ("TÉCNICA ç ñ 😀" => "TECNICA ç ñ", sem espaço residual).
    /// </summary>
    public static string NormalizeLatin1(string text)
    {
        ArgumentNullException.ThrowIfNull(text);

        var sb = new StringBuilder(text.Length);
        foreach (var c in text)
        {
            if (c <= 0x7F)
            {
                sb.Append(c);
            }
            else if (IsKeptLatin1Char(c))
            {
                sb.Append(c);
            }
            else if (c <= 0xFF)
            {
                sb.Append(FoldDiacriticToAscii(c));
            }
            // c > 0xFF: fora de latin-1 → descartado.
        }

        return sb.ToString().Trim();
    }

    /// <summary>
    /// Largura estimada do texto em mm para a fonte Helvetica:
    /// <c>HelveticaAverageAdvanceFactor * fontSizeMm * text.Length</c>.
    /// </summary>
    public static double EstimateTextWidthMm(string text, double fontSizeMm)
        => HelveticaAverageAdvanceFactor * fontSizeMm * text.Length;

    /// <summary>
    /// Deriva o texto efetivo da slugline a partir de um texto de entrada e da largura
    /// disponível da chapa: aplica normalização para latin-1 e truncamento com reticências.
    /// Fonte única da verdade compartilhada entre o core e os consumidores (ex.: CLI).
    /// </summary>
    public static string EffectiveText(string text, double maxWidthMm, double fontSizeMm = SluglineCalculator.DefaultFontSizeMm)
    {
        ArgumentNullException.ThrowIfNull(text);
        var normalized = NormalizeLatin1(text);
        return TruncateToFit(normalized, maxWidthMm, fontSizeMm);
    }

    /// <summary>
    /// Trunca o texto para caber em <c>maxWidthMm</c>, sufixando "..." (latin-1).
    /// Se o texto inteiro cabe, devolve intacto. Se nem "..." cabe
    /// (maxWidthMm &lt;= 0 ou texto vazio), devolve "". Nunca lança por texto curto.
    /// O corte é determinístico: o maior prefixo cujo texto + "..." ainda caiba.
    /// </summary>
    public static string TruncateToFit(string text, double maxWidthMm, double fontSizeMm)
    {
        ArgumentNullException.ThrowIfNull(text);

        if (maxWidthMm <= 0 || text.Length == 0)
            return string.Empty;

        if (EstimateTextWidthMm(text, fontSizeMm) <= maxWidthMm)
            return text;

        const string ellipsis = "...";
        for (var k = text.Length - 1; k >= 0; k--)
        {
            var candidate = text[..k] + ellipsis;
            if (EstimateTextWidthMm(candidate, fontSizeMm) <= maxWidthMm)
                return candidate;
        }

        return string.Empty;
    }

    /// <summary>
    /// Latin-1 legítimo que NÃO dobra para ASCII: cedilha, tilde-do-n e grau
    /// (mais as maiúsculas correspondentes, mesma categoria).
    /// </summary>
    private static bool IsKeptLatin1Char(char c)
        => c is '\u00E7' or '\u00C7' or '\u00F1' or '\u00D1' or '\u00B0';

    /// <summary>
    /// Dobra diacríticos latin-1 para a base ASCII. Devolve o próprio caractere
    /// quando não há dobra (ex.: ß, ×, ÷ — latin-1 legítimo mantido).
    /// </summary>
    private static char FoldDiacriticToAscii(char c) => c switch
    {
        // A: À Á Â Ã Ä Å
        '\u00C0' or '\u00C1' or '\u00C2' or '\u00C3' or '\u00C4' or '\u00C5' => 'A',
        '\u00E0' or '\u00E1' or '\u00E2' or '\u00E3' or '\u00E4' or '\u00E5' => 'a',
        // E: È É Ê Ë
        '\u00C8' or '\u00C9' or '\u00CA' or '\u00CB' => 'E',
        '\u00E8' or '\u00E9' or '\u00EA' or '\u00EB' => 'e',
        // I: Ì Í Î Ï
        '\u00CC' or '\u00CD' or '\u00CE' or '\u00CF' => 'I',
        '\u00EC' or '\u00ED' or '\u00EE' or '\u00EF' => 'i',
        // O: Ò Ó Ô Õ Ö
        '\u00D2' or '\u00D3' or '\u00D4' or '\u00D5' or '\u00D6' => 'O',
        '\u00F2' or '\u00F3' or '\u00F4' or '\u00F5' or '\u00F6' => 'o',
        // U: Ù Ú Û Ü
        '\u00D9' or '\u00DA' or '\u00DB' or '\u00DC' => 'U',
        '\u00F9' or '\u00FA' or '\u00FB' or '\u00FC' => 'u',
        // Y: Ý ÿ
        '\u00DD' => 'Y',
        '\u00FD' or '\u00FF' => 'y',
        _ => c,
    };
}