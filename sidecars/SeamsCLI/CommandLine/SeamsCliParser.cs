using System.CommandLine;
using System.CommandLine.Parsing;
using System.Globalization;
using Imposition.Core.Errors;

namespace SeamsCLI.CommandLine;

public static class SeamsCliParser
{
    public static RootCommand BuildRootCommand()
    {
        var rootCommand = new RootCommand("Utilitário Headless de Emendas do GraficaOS (SeamsCLI)");

        var sourceArg = new Argument<string>("arquivo-origem", "Caminho para arquivo PDF, JPG ou TIFF");

        var rollOption = CreateDoubleOption(["--roll", "-r"], "Largura total da bobina em mm (default: 1520)", 1520.0);
        var marginOption = CreateDoubleOption(["--margin", "-m"], "Margem lateral em mm (default: 15)", 15.0);
        var overlapOption = CreateDoubleOption(["--overlap", "-o"], "Sobreposição das emendas em mm (default: 10)", 10.0);

        var shrinkageOption = new Option<bool>(
            aliases: ["--shrinkage", "-s"],
            description: "Aplica compensação de encolhimento térmico");

        var widthOption = CreateNullableDoubleOption(["--width", "-w"], "Sobrescreve largura do trabalho em mm (opcional)");
        var heightOption = CreateNullableDoubleOption(["--height"], "Sobrescreve altura do trabalho em mm (opcional)");

        var jobOption = new Option<string?>(
            aliases: ["--job", "-j"],
            description: "Nome ou prefixo do job (opcional)");

        var orientationOption = new Option<string>(
            aliases: ["--orientation"],
            description: "Orientação dos painéis: vert ou horiz (default: vert)",
            getDefaultValue: () => "vert");

        var directionOption = new Option<string>(
            aliases: ["--direction"],
            description: "Direção dos painéis: ltr ou rtl (default: ltr)",
            getDefaultValue: () => "ltr");

        var formatOption = new Option<string?>(
            aliases: ["--format"],
            description: "Formato de saída: jpg ou pdf (default: inferido da extensão)");

        var outdirOption = new Option<string?>(
            aliases: ["--outdir", "-d"],
            description: "Diretório de saída (default: diretório do arquivo de origem)");

        var dpiOption = new Option<int?>(
            aliases: ["--dpi"],
            description: "Resolução DPI de saída (default: preserva o DPI original da imagem)");

        var guideLineOption = new Option<bool>(
            aliases: ["--guide-line"],
            description: "Ativa linha-guia de emenda (default: true)",
            getDefaultValue: () => true);

        var noGuideLineOption = new Option<bool>(
            aliases: ["--no-guide-line"],
            description: "Desativa linha-guia de emenda");

        var lineColorOption = new Option<string>(
            aliases: ["--line-color", "-c"],
            description: "Cor da linha-guia: k40, k100, magenta, cyan, yellow, white, red ou C,M,Y,K (default: k40)",
            getDefaultValue: () => "k40");

        var lineThicknessOption = CreateDoubleOption(["--line-thickness", "-t"], "Espessura da linha-guia em pontos (pt) (default: 1.0)", 1.0);

        var noLogOption = new Option<bool>(
            aliases: ["--no-log"],
            description: "Desativa gravação de arquivo de log de diagnóstico");

        var logDirOption = new Option<string?>(
            aliases: ["--log-dir"],
            description: "Diretório customizado para os arquivos de log (default: <exe-dir>/logs)");

        var jsonOption = new Option<bool>(
            aliases: ["--json"],
            description: "Emite RESULT_JSON no stdout");

        var verboseOption = new Option<bool>(
            aliases: ["--verbose", "-v"],
            description: "Exibe logs e progresso detalhados em stderr");

        rootCommand.AddArgument(sourceArg);
        rootCommand.AddOption(rollOption);
        rootCommand.AddOption(marginOption);
        rootCommand.AddOption(overlapOption);
        rootCommand.AddOption(shrinkageOption);
        rootCommand.AddOption(widthOption);
        rootCommand.AddOption(heightOption);
        rootCommand.AddOption(jobOption);
        rootCommand.AddOption(orientationOption);
        rootCommand.AddOption(directionOption);
        rootCommand.AddOption(formatOption);
        rootCommand.AddOption(outdirOption);
        rootCommand.AddOption(dpiOption);
        rootCommand.AddOption(guideLineOption);
        rootCommand.AddOption(noGuideLineOption);
        rootCommand.AddOption(lineColorOption);
        rootCommand.AddOption(lineThicknessOption);
        rootCommand.AddOption(noLogOption);
        rootCommand.AddOption(logDirOption);
        rootCommand.AddOption(jsonOption);
        rootCommand.AddOption(verboseOption);

        return rootCommand;
    }

    public static CliParseResult Parse(string[] args)
    {
        if (args.Any(a => a.Equals("--help", StringComparison.OrdinalIgnoreCase) || a.Equals("-h", StringComparison.OrdinalIgnoreCase)))
        {
            var helpText =
@"Uso: SeamsCLI [opções] <arquivo-origem>

Argumentos:
  <arquivo-origem>               Caminho para arquivo PDF, JPG ou TIFF

Opções:
  -r, --roll <largura_mm>        Largura total da bobina em mm (default: 1520)
  -m, --margin <margem_mm>       Margem lateral em mm (default: 15)
  -o, --overlap <sobrepos_mm>    Sobreposição das emendas em mm (default: 10)
  -s, --shrinkage                Aplica compensação de encolhimento térmico
  -w, --width <largura_mm>       Sobrescreve largura do trabalho em mm (opcional)
  --height <altura_mm>           Sobrescreve altura do trabalho em mm (opcional)
  -j, --job <nome>               Nome ou prefixo do job (opcional)
  --orientation <vert|horiz>     Orientação dos painéis: vert ou horiz (default: vert)
  --direction <ltr|rtl>          Direção dos painéis: ltr ou rtl (default: ltr)
  --format <jpg|pdf>             Formato de saída: jpg ou pdf (default: inferido da extensão)
  -d, --outdir <diretório>       Diretório de saída (default: diretório do arquivo de origem)
  --dpi <dpi>                    Resolução DPI de saída (default: preserva DPI original)
  --guide-line                   Desenha linha-guia na emenda (default: ativo)
  --no-guide-line                Desativa o desenho da linha-guia
  -c, --line-color <cor>         Cor da linha: k40, k100, magenta, cyan, yellow, white, red ou C,M,Y,K (default: k40)
  -t, --line-thickness <pt>      Espessura da linha em pontos (pt) (default: 1.0)
  --no-log                       Desativa a gravação de logs de diagnóstico
  --log-dir <diretório>          Diretório para salvar os logs (default: <exe>/logs)
  --json                         Emite RESULT_JSON no stdout
  -v, --verbose                  Exibe logs e progresso detalhados em stderr
  --version                      Exibe versão
  -h, --help                     Exibe esta ajuda";

            Console.Out.WriteLine(helpText);
            return new CliParseResult(Success: true, Options: null, ExitCode: 0);
        }

        if (args.Any(a => a.Equals("--version", StringComparison.OrdinalIgnoreCase)))
        {
            Console.Out.WriteLine("SeamsCLI v0.1.0 (GraficaOS Prepress Engine)");
            return new CliParseResult(Success: true, Options: null, ExitCode: 0);
        }

        if (args.Length == 0)
        {
            return new CliParseResult(
                Success: false,
                Options: null,
                ExitCode: 1,
                ErrorCode: ErrorCodes.InvalidArgument,
                ErrorMessage: "Arquivo de origem não informado. Utilize --help para obter ajuda.");
        }

        var root = BuildRootCommand();
        var parseResult = root.Parse(args);

        if (parseResult.Errors.Count > 0)
        {
            var firstError = parseResult.Errors[0].Message;
            return new CliParseResult(
                Success: false,
                Options: null,
                ExitCode: 1,
                ErrorCode: ErrorCodes.InvalidArgument,
                ErrorMessage: $"Erro ao processar argumentos: {firstError}");
        }

        var sourcePath = parseResult.GetValueForArgument(root.Arguments[0] as Argument<string> ?? new Argument<string>("arquivo-origem"));
        if (string.IsNullOrWhiteSpace(sourcePath))
        {
            return new CliParseResult(
                Success: false,
                Options: null,
                ExitCode: 1,
                ErrorCode: ErrorCodes.InvalidArgument,
                ErrorMessage: "Arquivo de origem não informado.");
        }

        if (!File.Exists(sourcePath))
        {
            return new CliParseResult(
                Success: false,
                Options: null,
                ExitCode: 1,
                ErrorCode: ErrorCodes.InputNotFound,
                ErrorMessage: $"O arquivo de origem '{sourcePath}' não foi encontrado.");
        }

        T GetOption<T>(string alias, T defaultValue = default!)
        {
            var opt = root.Options.OfType<Option<T>>().FirstOrDefault(o => o.HasAlias(alias));
            return opt != null ? parseResult.GetValueForOption(opt) ?? defaultValue : defaultValue;
        }

        var roll = GetOption<double>("--roll", 1520.0);
        var margin = GetOption<double>("--margin", 15.0);
        var overlap = GetOption<double>("--overlap", 10.0);
        var shrinkage = GetOption<bool>("--shrinkage", false);
        var width = GetOption<double?>("--width", null);
        var height = GetOption<double?>("--height", null);
        var job = GetOption<string?>("--job", null);
        var orientation = (GetOption<string>("--orientation", "vert") ?? "vert").ToLowerInvariant();
        var direction = (GetOption<string>("--direction", "ltr") ?? "ltr").ToLowerInvariant();
        var formatExplicit = GetOption<string?>("--format", null);
        var outdir = GetOption<string?>("--outdir", null);
        var dpi = GetOption<int?>("--dpi", null);
        var jsonOutput = GetOption<bool>("--json", false);
        var verbose = GetOption<bool>("--verbose", false);

        bool noGuideLine = args.Any(a => a.Equals("--no-guide-line", StringComparison.OrdinalIgnoreCase));
        bool guideLine = !noGuideLine;
        var lineColor = GetOption<string>("--line-color", "k40") ?? "k40";
        var lineThickness = GetOption<double>("--line-thickness", 1.0);
        bool noLog = args.Any(a => a.Equals("--no-log", StringComparison.OrdinalIgnoreCase));
        var logDir = GetOption<string?>("--log-dir", null);

        // Validações R-013 (IsFinite)
        if (!double.IsFinite(roll) || roll <= 0)
        {
            return new CliParseResult(
                Success: false,
                Options: null,
                ExitCode: 1,
                ErrorCode: ErrorCodes.InvalidArgument,
                ErrorMessage: "A largura da bobina (--roll) deve ser um número finito maior que zero.");
        }

        if (!double.IsFinite(margin) || margin < 0)
        {
            return new CliParseResult(
                Success: false,
                Options: null,
                ExitCode: 1,
                ErrorCode: ErrorCodes.InvalidArgument,
                ErrorMessage: "A margem (--margin) deve ser um número finito maior ou igual a zero.");
        }

        if (!double.IsFinite(overlap) || overlap < 0)
        {
            return new CliParseResult(
                Success: false,
                Options: null,
                ExitCode: 1,
                ErrorCode: ErrorCodes.InvalidArgument,
                ErrorMessage: "A sobreposição (--overlap) deve ser um número finito maior ou igual a zero.");
        }

        if (width.HasValue && (!double.IsFinite(width.Value) || width.Value <= 0))
        {
            return new CliParseResult(
                Success: false,
                Options: null,
                ExitCode: 1,
                ErrorCode: ErrorCodes.InvalidDimension,
                ErrorMessage: "A largura sobrescrita (--width) deve ser um número finito maior que zero.");
        }

        if (height.HasValue && (!double.IsFinite(height.Value) || height.Value <= 0))
        {
            return new CliParseResult(
                Success: false,
                Options: null,
                ExitCode: 1,
                ErrorCode: ErrorCodes.InvalidDimension,
                ErrorMessage: "A altura sobrescrita (--height) deve ser um número finito maior que zero.");
        }

        if (dpi.HasValue && (dpi.Value <= 0 || dpi.Value > 4800))
        {
            return new CliParseResult(
                Success: false,
                Options: null,
                ExitCode: 1,
                ErrorCode: ErrorCodes.InvalidArgument,
                ErrorMessage: "A resolução DPI (--dpi) deve ser um número inteiro estritamente positivo (máximo 4800).");
        }

        if (!double.IsFinite(lineThickness) || lineThickness <= 0)
        {
            return new CliParseResult(
                Success: false,
                Options: null,
                ExitCode: 1,
                ErrorCode: ErrorCodes.InvalidArgument,
                ErrorMessage: "A espessura da linha-guia (--line-thickness) deve ser um número finito maior que zero.");
        }

        try
        {
            ColorParser.ParseCmyk(lineColor);
        }
        catch (ImpositionException ex)
        {
            return new CliParseResult(
                Success: false,
                Options: null,
                ExitCode: 1,
                ErrorCode: ex.Code,
                ErrorMessage: ex.Message);
        }

        // Restrições Geométricas
        if (roll <= 2 * margin)
        {
            return new CliParseResult(
                Success: false,
                Options: null,
                ExitCode: 1,
                ErrorCode: ErrorCodes.InvalidArgument,
                ErrorMessage: $"A largura da bobina ({roll} mm) deve ser maior que o dobro da margem ({margin * 2} mm).");
        }

        if (overlap >= roll)
        {
            return new CliParseResult(
                Success: false,
                Options: null,
                ExitCode: 1,
                ErrorCode: ErrorCodes.InvalidOverlap,
                ErrorMessage: $"A sobreposição ({overlap} mm) não pode ser maior ou igual à largura da bobina ({roll} mm).");
        }

        // Inferência e Validação de Formato
        var ext = Path.GetExtension(sourcePath).ToLowerInvariant();
        string formatResolved;
        if (string.IsNullOrWhiteSpace(formatExplicit))
        {
            formatResolved = ext is ".pdf" ? "pdf" : "jpg";
        }
        else
        {
            formatResolved = formatExplicit.ToLowerInvariant();
            if (formatResolved != "jpg" && formatResolved != "pdf")
            {
                return new CliParseResult(
                    Success: false,
                    Options: null,
                    ExitCode: 1,
                    ErrorCode: ErrorCodes.InvalidArgument,
                    ErrorMessage: $"Formato '{formatExplicit}' inválido. Utilize 'jpg' ou 'pdf'.");
            }

            // Proibição de Mismatch
            if (ext == ".pdf" && formatResolved == "jpg")
            {
                return new CliParseResult(
                    Success: false,
                    Options: null,
                    ExitCode: 1,
                    ErrorCode: ErrorCodes.FormatMismatch,
                    ErrorMessage: "Mismatch de formato: arquivo de origem é PDF, mas formato de saída solicitado é 'jpg'.");
            }
            if (ext != ".pdf" && formatResolved == "pdf")
            {
                return new CliParseResult(
                    Success: false,
                    Options: null,
                    ExitCode: 1,
                    ErrorCode: ErrorCodes.FormatMismatch,
                    ErrorMessage: $"Mismatch de formato: arquivo de origem raster ({ext}) não pode ser exportado como 'pdf' no MVP.");
            }
        }

        var options = new SeamsCliOptions(
            SourcePath: sourcePath,
            RollWidthMm: roll,
            MarginMm: margin,
            OverlapMm: overlap,
            ShrinkageCompensation: shrinkage,
            WidthMm: width,
            HeightMm: height,
            JobName: job,
            Orientation: orientation,
            Direction: direction,
            Format: formatResolved,
            OutputDir: outdir,
            Dpi: dpi,
            JsonOutput: jsonOutput,
            Verbose: verbose,
            GuideLine: guideLine,
            LineColor: lineColor,
            LineThicknessPt: lineThickness,
            NoLog: noLog,
            LogDir: logDir);

        return new CliParseResult(Success: true, Options: options, ExitCode: 0);
    }

    private static Option<double> CreateDoubleOption(string[] aliases, string description, double defaultValue)
    {
        return new Option<double>(
            aliases: aliases,
            parseArgument: result =>
            {
                if (result.Tokens.Count == 0) return defaultValue;
                var token = result.Tokens[0].Value;
                if (double.TryParse(token.Replace(',', '.'), NumberStyles.Float, CultureInfo.InvariantCulture, out var val))
                {
                    return val;
                }
                result.ErrorMessage = $"O valor '{token}' para {aliases[0]} não é um número válido.";
                return defaultValue;
            },
            isDefault: true,
            description: description);
    }

    private static Option<double?> CreateNullableDoubleOption(string[] aliases, string description)
    {
        return new Option<double?>(
            aliases: aliases,
            parseArgument: result =>
            {
                if (result.Tokens.Count == 0) return null;
                var token = result.Tokens[0].Value;
                if (double.TryParse(token.Replace(',', '.'), NumberStyles.Float, CultureInfo.InvariantCulture, out var val))
                {
                    return val;
                }
                result.ErrorMessage = $"O valor '{token}' para {aliases[0]} não é um número válido.";
                return null;
            },
            description: description);
    }
}
