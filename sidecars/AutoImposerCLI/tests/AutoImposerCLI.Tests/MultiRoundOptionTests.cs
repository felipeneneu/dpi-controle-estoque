using FluentAssertions;
using Xunit;

namespace AutoImposerCLI.Tests;

/// <summary>
/// BR-010_ao — multi-rodadas: quando targetCopies excede capacidade, o CLI
/// propõe dividir em N rodadas do mesmo arquivo. Valida a matemática das
/// opções (copiasRodada arredondado para múltiplo de cols) sem invocar o CLI.
/// As fórmulas foram validadas à mão na missão; TODA discrepância aqui é
/// bloqueante (PARE e reporte — nunca ajuste o teste).
/// </summary>
public class MultiRoundOptionTests
{
    private static (int target, int total, int surplus) CalcOption(
        int targetCopies, int capacidade, int cols, int n)
    {
        var copiasIdeais = (int)Math.Ceiling((double)targetCopies / n);
        var resto = copiasIdeais % cols;
        var copiasRodada = resto == 0 ? copiasIdeais : copiasIdeais + (cols - resto);
        var total = copiasRodada * n;
        return (copiasRodada, total, total - targetCopies);
    }

    [Fact]
    public void BR_010_ao_Caso1_Real()
    {
        // target 300, cap 276, cols 12
        CalcOption(300, 276, 12, 2).Should().Be((156, 312, 12));
        CalcOption(300, 276, 12, 3).Should().Be((108, 324, 24));
        CalcOption(300, 276, 12, 4).Should().Be((84, 336, 36));
    }

    [Fact]
    public void BR_010_ao_Caso2_CabeEm1Rodada()
    {
        // target == cap → NÃO cai no ramo de excesso (comportamento atual).
        // Guarda: a "opção" de 1 rodada deve fechar no próprio capacidade.
        CalcOption(276, 276, 12, 1).Should().Be((276, 276, 0));
    }

    [Fact]
    public void BR_010_ao_Caso3_PoucoAcima()
    {
        // target 280, cap 276, cols 12
        CalcOption(280, 276, 12, 2).Should().Be((144, 288, 8));
        CalcOption(280, 276, 12, 3).Should().Be((96, 288, 8));
        CalcOption(280, 276, 12, 4).Should().Be((72, 288, 8));
    }

    [Fact]
    public void BR_010_ao_Caso4_MeioAcima()
    {
        // target 414, cap 276, cols 12
        CalcOption(414, 276, 12, 2).Should().Be((216, 432, 18));
        CalcOption(414, 276, 12, 3).Should().Be((144, 432, 18));
        CalcOption(414, 276, 12, 4).Should().Be((108, 432, 18));
    }

    [Fact]
    public void BR_010_ao_Caso5_QuintoAcima()
    {
        // target 1380, cap 276, cols 12 → rodadasMin = ceil(1380/276) = 5.
        // Opções do CLI: N = 5, 6, 7.
        CalcOption(1380, 276, 12, 5).Should().Be((276, 1380, 0));
        CalcOption(1380, 276, 12, 6).Should().Be((240, 1440, 60));
        CalcOption(1380, 276, 12, 7).Should().Be((204, 1428, 48));
    }
}