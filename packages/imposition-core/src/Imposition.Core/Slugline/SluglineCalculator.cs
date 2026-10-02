using System.Globalization;
using Imposition.Core.Errors;

namespace Imposition.Core.Slugline;

/// <summary>
/// Cálculo da slugline (ADR-047, Decisão 1): texto já formatado e âncora em
/// milímetros relativa à chapa. Cálculo puro, sem IO, sem estado.
/// </summary>
public static class SluglineCalculator
{
    /// <summary>Corpo da slugline em mm (ADR-047 — fonte base /Helvetica).</summary>
    public const double DefaultFontSizeMm = 2.8;

    /// <summary>
    /// Offset óptico da baseline: o texto fica BAIXO na faixa de sangria, a 20%
    /// do corpo a partir da borda inferior (aproxima o registro óptico do texto
    /// com a linha de corte). A baseline é desenhada 0.2*copo ACIMA da borda
    /// inferior da página, dentro da faixa de sangria. Em coordenadas relativas
    /// à chapa isso significa um valor NEGATIVO: (estripe - 0.2*copo) medido da
    /// origem da chapa para baixo, na faixa de sangria (ver R-017 — corrige o
    /// sinal que antes desenhava o texto POR CIMA da arte).
    /// </summary>
    private const double BaselineOpticalOffsetFactor = 0.2;

    /// <summary>
    /// Faixa de sangria mínima para a baseline não entrar na chapa: exatamente o
    /// valor subtraído na fórmula da baseline (DefaultFontSizeMm *
    /// BaselineOpticalOffsetFactor). Fonte ÚNICA do número — o guard de
    /// validação e o cálculo compartilham esta constante, nunca dois literais.
    /// Abaixo dela (e acima de 0) a baseline sairia POSITIVA, ou seja, o texto
    /// sería desenhado POR CIMA da arte sem nenhum aviso.
    /// </summary>
    private const double MinBleedStripeForBaselineMm = DefaultFontSizeMm * BaselineOpticalOffsetFactor;

    public static SluglinePlacement? Calculate(SluglineInput input)
    {
        Validate(input);

        // BleedStripeMm == 0 (após validar que é finito e não negativo): sem
        // faixa de sangria não há onde a slugline caiba — ela é OMITIDA e a
        // página NUNCA é expandida (ADR-047, Decisão 2). null é o sinal; quem
        // consome registra a omissão — nunca silencioso no pipeline.
        // Faixa magra porém existente (0 < BleedStripeMm < MinBleedStripeForBaselineMm)
        // NÃO é o caso de omissão: é erro de contrato, tratado em Validate.
        if (input.BleedStripeMm <= 0)
            return null;

        // Texto: CustomText não vazio (após trim) vence; senão a linha técnica (ADR-048).
        var rawText = string.IsNullOrWhiteSpace(input.CustomText)
            ? SluglineFormatter.FormatTechnicalLine(input)
            : input.CustomText.Trim();

        // Normaliza e trunca para caber na largura da chapa (ADR-047 Decisões 2 e 3).
        var text = SluglineFormatter.EffectiveText(rawText, input.SheetWidthMm, DefaultFontSizeMm);

        // Âncora: centro horizontal da chapa; baseline baixa na faixa de
        // sangria (offset óptico de 20% do corpo): NEGATIVA, medida da origem
        // da chapa para baixo — ver BaselineOpticalOffsetFactor e R-017.
        var anchorXCenterMm = input.SheetWidthMm / 2.0;
        var baselineYMm = DefaultFontSizeMm * BaselineOpticalOffsetFactor - input.BleedStripeMm;

        return new SluglinePlacement(text, anchorXCenterMm, baselineYMm, DefaultFontSizeMm);
    }

    /// <summary>
    /// Valida o contrato de entrada (ADR-047, Decisão 1). Qualquer falha lança
    /// ImpositionException com ErrorCodes.InvalidSluglineInput e mensagem PT-BR
    /// indicando o campo e o valor recebido.
    /// As dimensões são double: <c>double.NaN &lt;= 0</c> e
    /// <c>double.NaN &lt; 0</c> são <c>false</c> em C#, então só comparar o
    /// domínio deixaria passar geometria NÃO-FINITA (NaN/+Infinity), que
    /// envenenaria <c>AnchorXCenterMm</c>/<c>BaselineYMm</c> e faria o
    /// truncamento devolver string vazia. Daí o <c>double.IsFinite</c> em todas
    /// as dimensões em mm.
    /// </summary>
    private static void Validate(SluglineInput input)
    {
        if (!double.IsFinite(input.SheetWidthMm) || input.SheetWidthMm <= 0)
            throw new ImpositionException(
                ErrorCodes.InvalidSluglineInput,
                $"SheetWidthMm deve ser finito e > 0; recebido: {Describe(input.SheetWidthMm)}");

        if (!double.IsFinite(input.SheetHeightMm) || input.SheetHeightMm <= 0)
            throw new ImpositionException(
                ErrorCodes.InvalidSluglineInput,
                $"SheetHeightMm deve ser finito e > 0; recebido: {Describe(input.SheetHeightMm)}");

        if (input.Cols < 1)
            throw new ImpositionException(
                ErrorCodes.InvalidSluglineInput,
                $"Cols deve ser >= 1; recebido: {input.Cols}");

        if (input.Rows < 1)
            throw new ImpositionException(
                ErrorCodes.InvalidSluglineInput,
                $"Rows deve ser >= 1; recebido: {input.Rows}");

        if (input.Total < 1)
            throw new ImpositionException(
                ErrorCodes.InvalidSluglineInput,
                $"Total deve ser >= 1; recebido: {input.Total}");

        if (!double.IsFinite(input.BleedStripeMm) || input.BleedStripeMm < 0)
            throw new ImpositionException(
                ErrorCodes.InvalidSluglineInput,
                $"BleedStripeMm deve ser finito e >= 0; recebido: {Describe(input.BleedStripeMm)}");

        // Faixa de sangria existente, porém mais magra que o offset óptico da
        // baseline: a baseline sairia POSITIVA (BaselineYMm > 0), ou seja, acima
        // da origem da chapa — o texto seria desenhado POR CIMA da arte sem
        // nenhum aviso. Rejeitar é melhor que devolver um placement incoerente.
        // O caso BleedStripeMm == 0 NÃO entra aqui: é a degradação declarada na
        // Decisão 2 da ADR-047 (sem --marks a slugline é omitida, com aviso,
        // nunca expande a página).
        if (input.BleedStripeMm > 0 && input.BleedStripeMm < MinBleedStripeForBaselineMm)
        {
            var minBleed = MinBleedStripeForBaselineMm.ToString("0.##", CultureInfo.InvariantCulture);
            throw new ImpositionException(
                ErrorCodes.InvalidSluglineInput,
                $"BleedStripeMm deve ser >= {minBleed} (DefaultFontSizeMm * 0.2) "
                + "para a baseline não entrar na chapa; "
                + $"recebido: {Describe(input.BleedStripeMm)}");
        }

        // Ordem: se CustomText não é vazio/whitespace, FileName não é exigido.
        if (string.IsNullOrWhiteSpace(input.FileName) && string.IsNullOrWhiteSpace(input.CustomText))
            throw new ImpositionException(
                ErrorCodes.InvalidSluglineInput,
                "FileName e CustomText não podem ser ambos vazios/whitespace; "
                + $"FileName recebido: '{input.FileName}', CustomText recebido: '{input.CustomText}'");
    }

    /// <summary>
    /// Texto da mensagem de erro com o valor recebido sempre em cultura
    /// invariante: em várias culturas <c>double.PositiveInfinity.ToString()</c>
    /// devolve "∞" em vez de "Infinity", e a mensagem de falha não pode mudar
    /// conforme a máquina do operador.
    /// </summary>
    private static string Describe(double value) => value.ToString(CultureInfo.InvariantCulture);
}