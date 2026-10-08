using System.Globalization;
using Imposition.Core.Errors;

namespace SeamsCLI.CommandLine;

/// <summary>
/// Parser seguro de especificações de cor CMYK para linhas-guia (ADR-059, BR-059).
/// Suporta presets padronizados e notação percentual explícita C,M,Y,K.
/// </summary>
public static class ColorParser
{
    public static (double Cyan, double Magenta, double Yellow, double Black) ParseCmyk(string? colorSpec)
    {
        if (string.IsNullOrWhiteSpace(colorSpec))
        {
            // Padrão ADR-051 / ADR-059: K 40%
            return (0.0, 0.0, 0.0, 0.40);
        }

        var normalized = colorSpec.Trim().ToLowerInvariant();

        return normalized switch
        {
            "k40" => (0.0, 0.0, 0.0, 0.40),
            "k100" or "black" or "preto" => (0.0, 0.0, 0.0, 1.0),
            "magenta" or "m100" => (0.0, 1.0, 0.0, 0.0),
            "cyan" or "c100" or "ciano" => (1.0, 0.0, 0.0, 0.0),
            "yellow" or "y100" or "amarelo" => (0.0, 0.0, 1.0, 0.0),
            "white" or "branco" => (0.0, 0.0, 0.0, 0.0),
            "red" or "vermelho" => (0.0, 1.0, 1.0, 0.0),
            _ => ParseExplicitCmyk(normalized)
        };
    }

    private static (double Cyan, double Magenta, double Yellow, double Black) ParseExplicitCmyk(string raw)
    {
        var parts = raw.Split(',', StringSplitOptions.TrimEntries);
        if (parts.Length != 4)
        {
            throw new ImpositionException(
                ErrorCodes.InvalidArgument,
                $"Especificação de cor '{raw}' inválida. Use um preset (k40, k100, magenta, cyan, yellow, white, red) ou 4 componentes percentuais C,M,Y,K (ex: 0,0,0,40).");
        }

        if (!double.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out var c) ||
            !double.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var m) ||
            !double.TryParse(parts[2], NumberStyles.Float, CultureInfo.InvariantCulture, out var y) ||
            !double.TryParse(parts[3], NumberStyles.Float, CultureInfo.InvariantCulture, out var k))
        {
            throw new ImpositionException(
                ErrorCodes.InvalidArgument,
                $"Os valores de componentes CMYK em '{raw}' devem ser números válidos.");
        }

        if (!double.IsFinite(c) || c < 0.0 || c > 100.0 ||
            !double.IsFinite(m) || m < 0.0 || m > 100.0 ||
            !double.IsFinite(y) || y < 0.0 || y > 100.0 ||
            !double.IsFinite(k) || k < 0.0 || k > 100.0)
        {
            throw new ImpositionException(
                ErrorCodes.InvalidArgument,
                $"Cada componente CMYK em '{raw}' deve ser finito e estar na faixa percentual de 0 a 100.");
        }

        return (c / 100.0, m / 100.0, y / 100.0, k / 100.0);
    }
}
