using System.Text.Json;

namespace GraficaOS.Engine;

/// <summary>
/// Coletor de telemetria offline-first. Grava eventos em arquivos JSONL
/// no outbox local (%ProgramData%\GraficaOS\outbox\). Thread-safe.
/// Nunca lança exceção para o chamador.
/// </summary>
public sealed class TelemetryCollector
{
    private static readonly string OutboxDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "GraficaOS",
        "outbox");

    private readonly object _appendLock = new();
    private readonly string _flushEndpoint;

    public TelemetryCollector(string flushEndpoint = "")
    {
        _flushEndpoint = flushEndpoint;
    }

    /// <summary>Registra um evento no outbox local (append thread-safe).</summary>
    public void Track(TelemetryEventDto evt)
    {
        try
        {
            Directory.CreateDirectory(OutboxDir);
            var fileName = $"{DateTimeOffset.UtcNow:yyyy-MM-dd}.jsonl";
            var filePath = Path.Combine(OutboxDir, fileName);
            var json = JsonSerializer.Serialize(evt, JsonDefaults.Options);

            lock (_appendLock)
            {
                File.AppendAllText(filePath, json + Environment.NewLine);
            }
        }
        catch
        {
            // Nunca lança exceção — telemetria não pode derrubar o motor
        }
    }

    /// <summary>
    /// Envia telemetria pendente para o endpoint configurado.
    /// Lê arquivos por ordem cronológica, envia em lote, apaga se 200 OK.
    /// Para o loop na primeira falha (tenta na próxima execução).
    /// </summary>
    public async Task<FlushResultDto> FlushAsync()
    {
        // Sem endpoint configurado → telemetria fica local
        if (string.IsNullOrWhiteSpace(_flushEndpoint))
        {
            return new FlushResultDto(
                Success: true,
                SentCount: 0,
                ErrorCode: null,
                Message: "Endpoint não configurado. Telemetria permanece local.");
        }

        try
        {
            if (!Directory.Exists(OutboxDir))
            {
                return new FlushResultDto(
                    Success: true,
                    SentCount: 0,
                    ErrorCode: null,
                    Message: "Nenhum arquivo de telemetria encontrado.");
            }

            var files = Directory.GetFiles(OutboxDir, "*.jsonl")
                .OrderBy(f => f)
                .ToArray();

            if (files.Length == 0)
            {
                return new FlushResultDto(
                    Success: true,
                    SentCount: 0,
                    ErrorCode: null,
                    Message: "Nenhum arquivo de telemetria pendente.");
            }

            var totalSent = 0;
            using var httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };

            foreach (var file in files)
            {
                var lines = await File.ReadAllLinesAsync(file);
                var nonEmpty = lines.Where(l => !string.IsNullOrWhiteSpace(l)).ToArray();
                if (nonEmpty.Length == 0)
                {
                    // Arquivo vazio — pode deletar
                    File.Delete(file);
                    continue;
                }

                var batchJson = JsonSerializer.Serialize(nonEmpty, JsonDefaults.Options);
                var content = new StringContent(batchJson, System.Text.Encoding.UTF8, "application/json");
                var response = await httpClient.PostAsync(_flushEndpoint, content);

                if (!response.IsSuccessStatusCode)
                {
                    // Para na primeira falha — tenta na próxima execução
                    return new FlushResultDto(
                        Success: false,
                        SentCount: totalSent,
                        ErrorCode: "E_FLUSH_HTTP",
                        Message: $"Falha HTTP {(int)response.StatusCode} ao enviar {Path.GetFileName(file)}.");
                }

                File.Delete(file);
                totalSent += nonEmpty.Length;
            }

            return new FlushResultDto(
                Success: true,
                SentCount: totalSent,
                ErrorCode: null,
                Message: $"{totalSent} evento(s) enviado(s) com sucesso.");
        }
        catch (Exception ex)
        {
            return new FlushResultDto(
                Success: false,
                SentCount: 0,
                ErrorCode: "E_FLUSH",
                Message: $"Erro ao enviar telemetria: {ex.Message}");
        }
    }
}
