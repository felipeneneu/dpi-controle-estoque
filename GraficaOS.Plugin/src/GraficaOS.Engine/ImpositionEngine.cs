using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using GraficaOS.Engine.Internal;

namespace GraficaOS.Engine;

/// <summary>
/// Classe COM principal exposta via ActiveXObject("GraficaOS.Engine").
/// Toda exceção é capturada e retornada como JSON com errorCode — nunca
/// lança exception pelo COM.
/// </summary>
[ComVisible(true)]
[Guid("A1B2C3D4-E5F6-7890-ABCD-EF1234567892")]
[ProgId("GraficaOS.Engine")]
[ClassInterface(ClassInterfaceType.None)]
[ComDefaultInterface(typeof(IGraficaOSEngine))]
public sealed class ImpositionEngine : IGraficaOSEngine
{
    private readonly TenantConfig _tenantConfig = new();
    private readonly TelemetryCollector _telemetry;

    public ImpositionEngine()
    {
        var endpoint = LoadFlushEndpoint();
        _telemetry = new TelemetryCollector(endpoint);
    }

    public string GetVersion()
    {
        try
        {
            return "0.1.0";
        }
        catch (Exception ex)
        {
            return ErrorJson("E_VERSION", ex.Message);
        }
    }

    public string GetActiveTenant()
    {
        try
        {
            var tenant = _tenantConfig.GetTenant();
            return JsonSerializer.Serialize(tenant, JsonDefaults.Options);
        }
        catch (Exception ex)
        {
            return ErrorJson("E_TENANT", ex.Message);
        }
    }

    public string PlanImposition(string jsonRequest)
    {
        var sw = Stopwatch.StartNew();
        try
        {
            var request = Deserialize<ImposeRequestDto>(jsonRequest);

            // Detecção precoce de overflow em chapa fixa (evita exception do core quando target > capacidade)
            if (request.SubstrateKind?.Equals("sheet", StringComparison.OrdinalIgnoreCase) == true)
            {
                var best = ImpositionCoreAdapter.BestGrid(request);
                if (request.TargetCopies > best.Capacity)
                {
                    sw.Stop();
                    var overflow = ImpositionCoreAdapter.ToOverflowResponse(request, best, sw.ElapsedMilliseconds);
                    return JsonSerializer.Serialize(overflow, JsonDefaults.Options);
                }
            }

            var (result, _) = ImpositionCoreAdapter.Plan(request);
            sw.Stop();

            // Detecção de overflow secundária: plano insuficiente em chapa fixa
            if (result.PlannedUnits < request.TargetCopies
                && request.SubstrateKind?.Equals("sheet", StringComparison.OrdinalIgnoreCase) == true)
            {
                var overflow = ImpositionCoreAdapter.ToOverflowResponse(request, result, sw.ElapsedMilliseconds);
                return JsonSerializer.Serialize(overflow, JsonDefaults.Options);
            }

            var response = ImpositionCoreAdapter.ToResponse(request, result, sw.ElapsedMilliseconds);
            return JsonSerializer.Serialize(response, JsonDefaults.Options);
        }
        catch (Exception ex)
        {
            sw.Stop();
            return ErrorJson("E_PLAN", ex.Message, sw.ElapsedMilliseconds);
        }
    }

    public string ImposeToPdf(string jsonRequest)
    {
        var sw = Stopwatch.StartNew();
        try
        {
            var request = Deserialize<ImposeRequestDto>(jsonRequest);

            if (string.IsNullOrWhiteSpace(request.InputPath))
                return ErrorJson("E_IMPOSE", "inputPath é obrigatório para imposição PDF.");

            if (string.IsNullOrWhiteSpace(request.OutputDir))
                return ErrorJson("E_IMPOSE", "outputDir é obrigatório para imposição PDF.");

            // Detecção precoce de overflow antes de gerar PDF
            if (request.SubstrateKind?.Equals("sheet", StringComparison.OrdinalIgnoreCase) == true)
            {
                var best = ImpositionCoreAdapter.BestGrid(request);
                if (request.TargetCopies > best.Capacity)
                {
                    sw.Stop();
                    var overflow = ImpositionCoreAdapter.ToOverflowResponse(request, best, sw.ElapsedMilliseconds);
                    return JsonSerializer.Serialize(overflow, JsonDefaults.Options);
                }
            }

            var (result, pdfOptions) = ImpositionCoreAdapter.Plan(request);
            sw.Stop();

            // Detecção de overflow antes de gerar PDF
            if (result.PlannedUnits < request.TargetCopies
                && request.SubstrateKind?.Equals("sheet", StringComparison.OrdinalIgnoreCase) == true)
            {
                var overflow = ImpositionCoreAdapter.ToOverflowResponse(request, result, sw.ElapsedMilliseconds);
                return JsonSerializer.Serialize(overflow, JsonDefaults.Options);
            }

            sw.Start();

            // Gera nome do arquivo de saída
            var inputName = Path.GetFileNameWithoutExtension(request.InputPath);
            var outputPath = Path.Combine(
                request.OutputDir,
                $"{inputName}_imposto_{result.Cols}x{result.Rows}.pdf");

            var outputFiles = ImpositionCoreAdapter.Impose(request.InputPath, outputPath, pdfOptions);
            sw.Stop();

            var response = ImpositionCoreAdapter.ToResponse(
                request, result, sw.ElapsedMilliseconds, outputFiles);
            return JsonSerializer.Serialize(response, JsonDefaults.Options);
        }
        catch (Exception ex)
        {
            sw.Stop();
            return ErrorJson("E_IMPOSE", ex.Message, sw.ElapsedMilliseconds);
        }
    }

    public string ApplyPlanToDocument(string jsonRequest)
    {
        var sw = Stopwatch.StartNew();
        try
        {
            var request = Deserialize<ImposeRequestDto>(jsonRequest);

            // Detecção precoce de overflow em chapa fixa
            if (request.SubstrateKind?.Equals("sheet", StringComparison.OrdinalIgnoreCase) == true)
            {
                var best = ImpositionCoreAdapter.BestGrid(request);
                if (request.TargetCopies > best.Capacity)
                {
                    sw.Stop();
                    var overflow = ImpositionCoreAdapter.ToOverflowResponse(request, best, sw.ElapsedMilliseconds);
                    return JsonSerializer.Serialize(overflow, JsonDefaults.Options);
                }
            }

            var (result, _) = ImpositionCoreAdapter.Plan(request);
            sw.Stop();

            // Retorna o plano completo com placements para o ExtendScript aplicar
            var response = ImpositionCoreAdapter.ToResponse(request, result, sw.ElapsedMilliseconds);
            return JsonSerializer.Serialize(response, JsonDefaults.Options);
        }
        catch (Exception ex)
        {
            sw.Stop();
            return ErrorJson("E_PLAN", ex.Message, sw.ElapsedMilliseconds);
        }
    }

    public string GetOverflowOptions(string jsonRequest)
    {
        var sw = Stopwatch.StartNew();
        try
        {
            var request = Deserialize<ImposeRequestDto>(jsonRequest);
            var best = ImpositionCoreAdapter.BestGrid(request);
            sw.Stop();

            var response = ImpositionCoreAdapter.ToOverflowResponse(request, best, sw.ElapsedMilliseconds);
            return JsonSerializer.Serialize(response, JsonDefaults.Options);
        }
        catch (Exception ex)
        {
            sw.Stop();
            return ErrorJson("E_OVERFLOW", ex.Message, sw.ElapsedMilliseconds);
        }
    }

    public void TrackEvent(string jsonEvent)
    {
        try
        {
            var tenant = _tenantConfig.GetTenant();
            var evt = Deserialize<TelemetryEventDto>(jsonEvent);

            // Enriquece com tenant/machine se não informado
            var enriched = evt with
            {
                TenantId = evt.TenantId ?? tenant.TenantId,
                MachineId = evt.MachineId ?? tenant.MachineId,
                Timestamp = evt.Timestamp == default ? DateTimeOffset.UtcNow : evt.Timestamp,
            };

            _telemetry.Track(enriched);
        }
        catch
        {
            // Nunca lança exceção — telemetria é best-effort
        }
    }

    public string FlushTelemetry()
    {
        try
        {
            // Execução síncrona do flush (COM não suporta async diretamente)
            var result = _telemetry.FlushAsync().GetAwaiter().GetResult();
            return JsonSerializer.Serialize(result, JsonDefaults.Options);
        }
        catch (Exception ex)
        {
            return ErrorJson("E_FLUSH", ex.Message);
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────

    private static T Deserialize<T>(string json)
    {
        return JsonSerializer.Deserialize<T>(json, JsonDefaults.Options)
            ?? throw new InvalidOperationException("JSON deserializado como null.");
    }

    private static string ErrorJson(string code, string message, long elapsedMs = 0)
    {
        var error = new ImposeResponseDto(
            SchemaVersion: "1.0",
            RequestId: string.Empty,
            Success: false,
            ErrorCode: code,
            Message: message,
            ExecutionTimeMs: elapsedMs,
            Sheet: null,
            Grid: null,
            OutputFiles: null,
            Placements: null,
            Options: null);
        return JsonSerializer.Serialize(error, JsonDefaults.Options);
    }

    private static string LoadFlushEndpoint()
    {
        try
        {
            var configPath = Path.Combine(AppContext.BaseDirectory, "appsettings.json");
            if (!File.Exists(configPath))
                return string.Empty;

            using var doc = JsonDocument.Parse(File.ReadAllText(configPath));
            if (doc.RootElement.TryGetProperty("telemetry", out var telemetry)
                && telemetry.TryGetProperty("endpoint", out var endpoint))
            {
                return endpoint.GetString() ?? string.Empty;
            }
        }
        catch
        {
            // Configuração não é crítica — usa default vazio
        }

        return string.Empty;
    }
}
