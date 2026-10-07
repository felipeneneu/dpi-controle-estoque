using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Imposition.Core.Errors;
using SeamsCLI.CommandLine;
using SeamsCLI.Execution;

namespace SeamsCLI;

public static class Program
{
    public static async Task<int> Main(string[] args)
    {
        using var cts = new CancellationTokenSource();

        // Configuração de cancelamento gracioso (SIGINT / Ctrl+C)
        Console.CancelKeyPress += (sender, e) =>
        {
            e.Cancel = true;
            cts.Cancel();
            Console.Error.WriteLine("\n[SeamsCLI] Cancelamento solicitado. Finalizando com segurança...");
        };

        // 1. Parsing de argumentos
        var parseResult = SeamsCliParser.Parse(args);
        if (parseResult.ExitCode == 0 && parseResult.Options == null)
        {
            return 0;
        }

        bool jsonRequested = args.Any(a => a.Equals("--json", StringComparison.OrdinalIgnoreCase));

        if (!parseResult.Success)
        {
            if (jsonRequested)
            {
                var errorResult = new SeamsWorkflowResult(
                    Success: false,
                    PanelCount: 0,
                    GeneratedFiles: [],
                    TotalLinearLengthMeters: 0.0,
                    ElapsedTime: TimeSpan.Zero,
                    Warnings: [],
                    ErrorCode: parseResult.ErrorCode ?? ErrorCodes.InvalidArgument,
                    ErrorMessage: parseResult.ErrorMessage ?? "Argumentos inválidos.");

                Console.Out.WriteLine(JsonResultEmitter.Emit(errorResult));
            }

            Console.Error.WriteLine($"[SeamsCLI Erro] {parseResult.ErrorMessage}");
            return parseResult.ExitCode;
        }

        var options = parseResult.Options!;

        // 2. Configuração de progresso para stderr se verbose
        IProgress<double>? progress = null;
        if (options.Verbose)
        {
            progress = new Progress<double>(p =>
            {
                Console.Error.WriteLine($"[SeamsCLI Progresso] {p * 100:F0}%");
            });
        }

        // 3. Execução do workflow
        var executor = new SeamsWorkflowExecutor();
        var workflowResult = await executor.ExecuteAsync(options, progress, cts.Token);

        // 4. Emissão do resultado
        if (options.JsonOutput)
        {
            Console.Out.WriteLine(JsonResultEmitter.Emit(workflowResult));
        }
        else
        {
            if (workflowResult.Success)
            {
                var seamWord = workflowResult.SeamCount == 1 ? "emenda" : "emendas";
                Console.Out.WriteLine($"[SeamsCLI] Sucesso: {workflowResult.PanelCount} painéis gerados ({workflowResult.SeamCount} {seamWord}).");
                Console.Out.WriteLine($"[SeamsCLI] Comprimento linear total: {workflowResult.TotalLinearLengthMeters:F2} m em {workflowResult.ElapsedTime.TotalMilliseconds:F0} ms.");
                foreach (var file in workflowResult.GeneratedFiles)
                {
                    Console.Out.WriteLine($"  - {file}");
                }
            }
            else
            {
                Console.Error.WriteLine($"[SeamsCLI Erro] ({workflowResult.ErrorCode}): {workflowResult.ErrorMessage}");
            }
        }

        // 5. Determinação do Exit Code canônico (ADR-055)
        return MapExitCode(workflowResult);
    }

    public static int MapExitCode(SeamsWorkflowResult result)
    {
        if (result.Success) return 0;

        return result.ErrorCode switch
        {
            ErrorCodes.OperationCanceled => 130,

            ErrorCodes.InputNotFound or
            ErrorCodes.InvalidArgument or
            ErrorCodes.InvalidDimension or
            ErrorCodes.InvalidOverlap or
            ErrorCodes.FormatMismatch => 1,

            ErrorCodes.RollTooNarrow or
            ErrorCodes.SeamsOverlapExceedsRoll or
            ErrorCodes.SeamsArtworkExceedsMaxPanels or
            ErrorCodes.InvalidSeamsInput => 2,

            ErrorCodes.ExportSourceNotCmyk or
            ErrorCodes.SourceHasOcg or
            ErrorCodes.PdfxNonCompliant or
            ErrorCodes.InvalidIccProfile or
            ErrorCodes.InvalidExportInput => 3,

            ErrorCodes.IoError or
            ErrorCodes.AccessDenied => 4,

            _ => 1
        };
    }
}
