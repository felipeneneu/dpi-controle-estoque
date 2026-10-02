using FluentAssertions;
using Imposition.Core.Slugline;
using Xunit;

namespace AutoImposerCLI.Tests;

/// <summary>
/// BR-047 — flag <c>--slugline &lt;texto&gt;</c> do AutoImposerCLI (ADR-047,
/// Decisao 6; ruling R-018). Testes PUROS: nao invocam o Main, nao dependem de
/// qpdf e nao tocam PDF. O corpo do Main sao top-level statements (nao
/// testavel), entao o parse vive em helpers <c>internal static</c> da classe
/// <c>partial class Program</c>.
///
/// Regras fixadas por R-018:
/// (a) sem flag, ou com texto vazio/whitespace -> <c>null</c> (pipeline intocado);
/// (b) <c>Total = cols * rows</c> (a CLI deriva; o core NAO faz cross-check);
/// (c) <c>FileName = Path.GetFileName(inputPdf)</c>;
/// (d) degradacoes nunca silenciosas: sem faixa de sangria, fallback PdfSharp e
///     caractere fora de latin-1 sao declarados (stderr + RESULT_JSON).
///
/// R-019 (fidelidade do desfecho): o valor de <c>sluglineInfo</c> e DERIVADO
/// depois da gravacao do PDF, pela mesma cadeia do core que o QDF usa — nunca
/// previsto. Ver a serie BR_047_ze..zi.
/// </summary>
public class SluglineOptionTests
{
    [Fact]
    public void BR_047_v_ParseSlugline_AusenteRetornaNull()
    {
        // Sem a flag, a CLI nao toca no pipeline (ADR-047 Decisao 6).
        Program.ParseSlugline(new[] { "a.pdf" }, "a.pdf", 2, 3).Should().BeNull();
    }

    [Fact]
    public void BR_047_w_ParseSlugline_FlagVaziaRetornaNull()
    {
        // Texto vazio e texto so com espacos sao indistinguiveis de flag ausente.
        Program.ParseSlugline(new[] { "a.pdf", "--slugline", "" }, "a.pdf", 2, 3)
            .Should().BeNull();
        Program.ParseSlugline(new[] { "a.pdf", "--slugline", "   " }, "a.pdf", 2, 3)
            .Should().BeNull();
        // Flag como ultimo token (sem valor) tambem nao liga o recurso.
        Program.ParseSlugline(new[] { "a.pdf", "--slugline" }, "a.pdf", 2, 3)
            .Should().BeNull();
    }

    [Fact]
    public void BR_047_x_ParseSlugline_FlagValidaMontaOptions()
    {
        var slug = Program.ParseSlugline(
            new[] { "C:\\Artes\\adesivo.pdf", "--slugline", "  CARIMBO RODAPE  " },
            "C:\\Artes\\adesivo.pdf", 2, 3);

        slug.Should().NotBeNull();
        slug!.CustomText.Should().Be("CARIMBO RODAPE");   // trimado
        slug.FileName.Should().Be("adesivo.pdf");        // so o nome do arquivo
        slug.Total.Should().Be(6);                       // 2 x 3
        // O horario nao e deterministico: prova que foi carimbado, nao o valor.
        slug.ImpositionTime.Should().NotBe(default);
    }

    [Fact]
    public void BR_047_y_ParseSlugline_TotalEhColsVezesRows()
    {
        // Caso da ADR-047: 35 x 29 = 1015 UN. R-018 fixa que a CLI deriva
        // cols*rows (e exatamente a grade que o QDF desenha).
        var slug = Program.ParseSlugline(
            new[] { "a.pdf", "--slugline", "OPACA 150g" }, "a.pdf", 35, 29);

        slug.Should().NotBeNull();
        slug!.Total.Should().Be(1015);
        slug.Total.Should().Be(35 * 29);
    }

    [Fact]
    public void BR_047_za_ParseSlugline_FlagCaseInsensitive()
    {
        var slug = Program.ParseSlugline(
            new[] { "a.pdf", "--SLUGLINE", "CARIMBO" }, "a.pdf", 1, 1);

        slug.Should().NotBeNull();
        slug!.CustomText.Should().Be("CARIMBO");
    }

    [Fact]
    public void BR_047_zb_HasSluglineFlag_AusenteEVaziaFalsas()
    {
        Program.HasSluglineFlag(new[] { "a.pdf" }).Should().BeFalse();
        Program.HasSluglineFlag(new[] { "a.pdf", "--slugline" }).Should().BeFalse();
        Program.HasSluglineFlag(new[] { "a.pdf", "--slugline", "" }).Should().BeFalse();
        Program.HasSluglineFlag(new[] { "a.pdf", "--slugline", "\t " }).Should().BeFalse();
        Program.HasSluglineFlag(new[] { "a.pdf", "--slugline", "X" }).Should().BeTrue();
    }

    [Fact]
    public void BR_047_zc_SluglineTextHasNonLatin1()
    {
        // /WinAnsiEncoding cobre latin-1 (ADR-047 Decisao 3). Caractere acima de
        // 0xFF nao vira glifo vazio no RIP: o core NormalizeLatin1 o REMOVE do
        // rodape -> a CLI avisa a consequencia (e o desfecho sai "omitida").
        // \u00C7 = 'Ç' (latin-1, ok); \u2615 = 'COFFEE' (fora de latin-1).
        Program.SluglineTextHasNonLatin1("CARIMBO").Should().BeFalse();
        Program.SluglineTextHasNonLatin1("CARIMBO Ção").Should().BeFalse();
        Program.SluglineTextHasNonLatin1("CARIMBO ☕").Should().BeTrue();
        Program.SluglineTextHasNonLatin1("").Should().BeFalse();
        Program.SluglineTextHasNonLatin1(null!).Should().BeFalse();
    }

    [Fact]
    public void BR_047_zd_CampoSluglineInfo_AditivoNoResult()
    {
        // Campo aditivo no RESULT_JSON: o Electron continua desserializando
        // (chave nova, backwards compatible) e o padrao e "nada a dizer".
        var result = new ImpositionResult { requestedUnits = 0 };

        result.sluglineInfo.Should().BeNull();
        result.requestedUnits.Should().Be(0);
    }

    // ── R-019: fidelidade do desfecho ───────────────────────────────────
    // `sluglineInfo` e RESULTADO, nunca previsao: se vale "desenhada" porque
    // o texto sobreviveu a NormalizeLatin1 + TruncateToFit e o QdfPipeline
    // gravou o PDF. Sem o flag o campo fica null (nada a dizer); com o
    // pipeline em erro, `fail()` tambem o deixa null (nada foi desenhado).

    [Fact]
    public void BR_047_ze_ResolveSluglineInfo_TextoForaDeLatin1_OmitidaTextoVazio()
    {
        // So caractere acima de 0xFF: o core REMOVE o texto inteiro, o
        // content stream sai sem nenhum `Tj` e nada foi desenhado.
        Program.ResolveSluglineInfo("☕", 700)
            .Should().Be("omitida_texto_vazio");
    }

    [Fact]
    public void BR_047_zf_ResolveSluglineInfo_TextoNormal_Desenhada()
    {
        Program.ResolveSluglineInfo("CARIMBO RODAPE", 700)
            .Should().Be("desenhada");
    }

    [Fact]
    public void BR_047_zg_ResolveSluglineInfo_TextoGigante_DesenhadaTruncada()
    {
        // 1000 caracteres nao cabem em 20mm: o core corta e sufixa "...".
        // O truncamento PRECISA ser declarado (o PDF sai diferente do pedido).
        Program.ResolveSluglineInfo(new string('X', 1000), 20)
            .Should().Be("desenhada_truncada");
    }

    [Fact]
    public void BR_047_zh_ResolveSluglineInfo_SemSluglineRetornaNull()
    {
        // Sem a flag nao ha slugline, nao ha o que declarar.
        Program.ResolveSluglineInfo(null, 700).Should().BeNull();
    }

    [Fact]
    public void BR_047_zi_ResolveSluglineInfo_TruncarNaoAlteraTextoLatin1()
    {
        // Latin-1 atravessa o QDF inteiro: 'Ç' e latin-1 legitimo que o core
        // mantem, 'Ã' e diacritico com base ASCII (dobra para 'A'). Com a
        // largura exatamente igual a do texto normalizado, TruncateToFit
        // devolve o texto intacto (nada truncado) => "desenhada". Truncar so
        // muda o desfecho quando o texto NAO cabe.
        const string texto = "OPACA 150g ÇÃO";
        var normalizado = SluglineFormatter.NormalizeLatin1(texto);
        normalizado.Should().Be("OPACA 150g ÇAO");

        var largura = SluglineFormatter.EstimateTextWidthMm(
            normalizado, SluglineCalculator.DefaultFontSizeMm);

        Program.ResolveSluglineInfo(texto, largura).Should().Be("desenhada");
        Program.ResolveSluglineInfo(texto, 700).Should().Be("desenhada");
    }

    [Fact]
    public void BR_047_zj_ParseSlugline_Auto_RetornaCustomTextNull()
    {
        // ADR-048: --slugline auto instancia SluglineOptions com CustomText = null,
        // acionando a geracao da linha tecnica automatica no core (FormatTechnicalLine).
        var slug = Program.ParseSlugline(
            new[] { "C:\\Artes\\adesivo.pdf", "--slugline", "auto" },
            "C:\\Artes\\adesivo.pdf", 4, 5);

        slug.Should().NotBeNull();
        slug!.CustomText.Should().BeNull();
        slug.FileName.Should().Be("adesivo.pdf");
        slug.Total.Should().Be(20);
    }

    [Fact]
    public void BR_047_zk_ParseSlugline_AutoCaseInsensitive()
    {
        var slugUpper = Program.ParseSlugline(
            new[] { "a.pdf", "--slugline", "AUTO" }, "a.pdf", 2, 2);
        slugUpper.Should().NotBeNull();
        slugUpper!.CustomText.Should().BeNull();

        var slugMixed = Program.ParseSlugline(
            new[] { "a.pdf", "--slugline", "AuTo" }, "a.pdf", 2, 2);
        slugMixed.Should().NotBeNull();
        slugMixed!.CustomText.Should().BeNull();
    }

    [Fact]
    public void BR_047_zl_ParseSlugline_AutoComoPrefixo_MantemTextoCustom()
    {
        var slug = Program.ParseSlugline(
            new[] { "a.pdf", "--slugline", "auto adesivo" }, "a.pdf", 2, 2);
        slug.Should().NotBeNull();
        slug!.CustomText.Should().Be("auto adesivo");
    }

    [Fact]
    public void BR_047_zm_ParseSlugline_ProximoTokenFlag_RetornaNull()
    {
        // N4-4: --slugline --marks nao deve engolir --marks como texto da slugline.
        Program.ParseSlugline(new[] { "a.pdf", "--slugline", "--marks" }, "a.pdf", 2, 2)
            .Should().BeNull();
        Program.HasSluglineFlag(new[] { "a.pdf", "--slugline", "--marks" })
            .Should().BeFalse();
    }

    [Fact]
    public void BR_047_zn_ParseSlugline_DashSimples_MantemComoTexto()
    {
        // Token com traço simples (-x) e aceito como texto custom.
        var slug = Program.ParseSlugline(
            new[] { "a.pdf", "--slugline", "-x" }, "a.pdf", 2, 2);
        slug.Should().NotBeNull();
        slug!.CustomText.Should().Be("-x");
    }

    [Fact]
    public void BR_047_zo_SluglineTextHasFoldedDiacritics()
    {
        // N4-2: Detectar quando NormalizeLatin1 dobra diacriticos (ex: 'É' -> 'E', 'Ã' -> 'A').
        // 'ç', 'ñ', '°' sao mantidos sem dobra (latin-1 legitimo).
        Program.SluglineTextHasFoldedDiacritics("TÉCNICA ÇÃO").Should().BeTrue();
        Program.SluglineTextHasFoldedDiacritics("TECNICA ÇAO").Should().BeFalse();
        Program.SluglineTextHasFoldedDiacritics("ABC ç ñ ° 123").Should().BeFalse();
        Program.SluglineTextHasFoldedDiacritics("café").Should().BeTrue();
        Program.SluglineTextHasFoldedDiacritics("").Should().BeFalse();
        Program.SluglineTextHasFoldedDiacritics(null!).Should().BeFalse();
    }

    [Fact]
    public void BR_017_TryEnsureDirectory_DiretorioValido_CriaComSucesso()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), "AutoImposer_ValidDirTest_" + Guid.NewGuid().ToString("N"));
        try
        {
            var success = Program.TryEnsureDirectory(tempDir, out var error);
            success.Should().BeTrue();
            error.Should().BeNull();
            Directory.Exists(tempDir).Should().BeTrue();
        }
        finally
        {
            if (Directory.Exists(tempDir)) Directory.Delete(tempDir, true);
        }
    }

    [Fact]
    public void BR_017_TryEnsureDirectory_DiretorioInvalido_RetornaErroSemCrash()
    {
        // Caminho com caracteres ilegais para sistema de arquivos Windows
        var invalidPath = "Z:\\nao_existe_??_**\\dir";
        var success = Program.TryEnsureDirectory(invalidPath, out var error);

        success.Should().BeFalse();
        error.Should().NotBeNullOrWhiteSpace();
        error.Should().Contain("Falha ao criar diretório de saída");
    }
}



