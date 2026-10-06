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

        var rollOption = new Option<double>(
            aliases: ["--roll", "-r"],
            description: "Largura total da bobina em mm (default: 1520)",
            getDefaultValue: () => 1520.0);

        var marginOption = new Option<double>(
            aliases: ["--margin", "-m"],
            description: "Margem lateral em mm (default: 15)",
            getDefaultValue: () => 15.0);

        var overlapOption = new Option<double>(
            aliases: ["--overlap", "-o"],
            description: "Sobreposição das emendas em mm (default: 10)",
            getDefaultValue: () => 10.0);

        var shrinkageOption = new Option<bool>(
            aliases: ["--shrinkage", "-s"],
            description: "Aplica compensação de encolhimento térmico");

        var widthOption = new Option<double?>(
            aliases: ["--width", "-w"],
            description: "Sobrescreve largura do trabalho em mm (opcional)");

        var heightOption = new Option<double?>(
            aliases: ["--height"],
            description: "Sobrescreve altura do trabalho em mm (opcional)");

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

        var roll = parseResult.GetValueForOption(root.Options[0] as Option<double> ?? new Option<double>("--roll"));
        var margin = parseResult.GetValueForOption(root.Options[1] as Option<double> ?? new Option<double>("--margin"));
        var overlap = parseResult.GetValueForOption(root.Options[2] as Option<double> ?? new Option<double>("--overlap"));
        var shrinkage = parseResult.GetValueForOption(root.Options[3] as Option<bool> ?? new Option<bool>("--shrinkage"));
        var width = parseResult.GetValueForOption(root.Options[4] as Option<double?> ?? new Option<double?>("--width"));
        var height = parseResult.GetValueForOption(root.Options[5] as Option<double?> ?? new Option<double?>("--height"));
        var job = parseResult.GetValueForOption(root.Options[6] as Option<string?> ?? new Option<string?>("--job"));
        var orientation = (parseResult.GetValueForOption(root.Options[7] as Option<string> ?? new Option<string>("--orientation")) ?? "vert").ToLowerInvariant();
        var direction = (parseResult.GetValueForOption(root.Options[8] as Option<string> ?? new Option<string>("--direction")) ?? "ltr").ToLowerInvariant();
        var formatExplicit = parseResult.GetValueForOption(root.Options[9] as Option<string?> ?? new Option<string?>("--format"));
        var outdir = parseResult.GetValueForOption(root.Options[10] as Option<string?> ?? new Option<string?>("--outdir"));
        var jsonOutput = parseResult.GetValueForOption(root.Options[11] as Option<bool> ?? new Option<bool>("--json"));
        var verbose = parseResult.GetValueForOption(root.Options[12] as Option<bool> ?? new Option<bool>("--verbose"));

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
            JsonOutput: jsonOutput,
            Verbose: verbose);

        return new CliParseResult(Success: true, Options: options, ExitCode: 0);
    }
}
