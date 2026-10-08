using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Imposition.Core.Errors;
using SeamsCLI.CommandLine;
using SeamsCLI.Execution;
using SeamsCLI.Logging;

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
        bool noLogRequested = args.Any(a => a.Equals("--no-log", StringComparison.OrdinalIgnoreCase));

        // Inicialização do logger de diagnóstico (ADR-058)
        RunLogger? logger = null;
        if (!noLogRequested)
        {
            var logDir = parseResult.Options?.LogDir ?? FindArgValue(args, "--log-dir");
            var jobName = parseResult.Options?.JobName
                ?? (parseResult.Options != null ? Path.GetFileNameWithoutExtension(parseResult.Options.SourcePath) : null)
                ?? FindArgValue(args, "--job")
                ?? FindArgValue(args, "-j");

            if (string.IsNullOrWhiteSpace(jobName) && args.Length > 0 && !args[0].StartsWith('-'))
            {
                jobName = Path.GetFileNameWithoutExtension(args[0]);
            }

            logger = RunLogger.Start(logDir, jobName ?? "job", args);
        }

        try
        {
            if (!parseResult.Success)
            {
                logger?.Error($"Falha ao validar argumentos: {parseResult.ErrorMessage}");

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
            var workflowResult = await executor.ExecuteAsync(options, progress, logger, cts.Token);

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
                    if (logger != null && !string.IsNullOrEmpty(logger.LogFilePath))
                    {
                        Console.Out.WriteLine($"[SeamsCLI] Log de diagnóstico: {logger.LogFilePath}");
                    }
                }
                else
                {
                    Console.Error.WriteLine($"[SeamsCLI Erro] ({workflowResult.ErrorCode}): {workflowResult.ErrorMessage}");
                    if (logger != null && !string.IsNullOrEmpty(logger.LogFilePath))
                    {
                        Console.Error.WriteLine($"[SeamsCLI] Detalhes do erro gravados em: {logger.LogFilePath}");
                    }
                }
            }

            // 5. Determinação do Exit Code canônico (ADR-055)
            return MapExitCode(workflowResult);
        }
        finally
        {
            logger?.Dispose();
        }
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

    private static string? FindArgValue(string[] args, string flag)
    {
        for (int i = 0; i < args.Length - 1; i++)
        {
            if (args[i].Equals(flag, StringComparison.OrdinalIgnoreCase))
            {
                return args[i + 1];
            }
        }
        return null;
    }
}
