using System;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ImpositorKonica.Models;

namespace ImpositorKonica.Services
{
    /// <summary>
    /// Servidor de comunicação IPC local via Windows Named Pipes.
    /// Recebe dados de imposição e etiquetas do Electron em tempo real.
    /// Pipe Name: \\.\pipe\graficaos-impositor
    /// </summary>
    public class PipeServerService : IAsyncDisposable
    {
        public const string PipeName = "graficaos-impositor";

        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNameCaseInsensitive = true
        };

        private readonly Action<ImpositionPayload> _onPayloadReceived;
        private readonly CancellationTokenSource _cts = new();
        private Task? _listenerTask;

        public PipeServerService(Action<ImpositionPayload> onPayloadReceived)
        {
            _onPayloadReceived = onPayloadReceived ?? throw new ArgumentNullException(nameof(onPayloadReceived));
        }

        public void Start()
        {
            _listenerTask = Task.Run(ListenLoopAsync);
        }

        private async Task ListenLoopAsync()
        {
            while (!_cts.IsCancellationRequested)
            {
                try
                {
                    // Cria uma nova instância de pipe para aceitar a próxima conexão
                    await using var server = new NamedPipeServerStream(
                        PipeName,
                        PipeDirection.InOut,
                        NamedPipeServerStream.MaxAllowedServerInstances,
                        PipeTransmissionMode.Byte,
                        PipeOptions.Asynchronous);

                    await server.WaitForConnectionAsync(_cts.Token);

                    var utf8NoBom = new UTF8Encoding(false);
                    using var reader = new StreamReader(server, utf8NoBom, leaveOpen: true);
                    await using var writer = new StreamWriter(server, utf8NoBom, leaveOpen: true) { AutoFlush = true };

                    string? line = await reader.ReadLineAsync(_cts.Token);
                    if (!string.IsNullOrWhiteSpace(line))
                    {
                        ImpositionPayload? payload = null;
                        try
                        {
                            using var doc = JsonDocument.Parse(line);
                            if (doc.RootElement.TryGetProperty("payload", out var payloadElem))
                            {
                                payload = JsonSerializer.Deserialize<ImpositionPayload>(payloadElem.GetRawText(), JsonOptions);
                            }
                            else
                            {
                                payload = JsonSerializer.Deserialize<ImpositionPayload>(line, JsonOptions);
                            }
                        }
                        catch (Exception ex)
                        {
                            Console.Error.WriteLine($"[PipeServerService] Erro ao interpretar payload: {ex.Message}");
                        }

                        if (payload != null)
                        {
                            _onPayloadReceived.Invoke(payload);
                            await writer.WriteLineAsync("{\"status\":\"ok\"}");
                        }
                        else
                        {
                            await writer.WriteLineAsync("{\"status\":\"error\",\"message\":\"Payload inválido\"}");
                        }
                    }
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"[PipeServerService] Erro no loop de escuta do pipe: {ex.Message}");
                    try
                    {
                        await Task.Delay(250, _cts.Token);
                    }
                    catch (OperationCanceledException)
                    {
                        break;
                    }
                }
            }
        }

        /// <summary>
        /// Tenta enviar uma mensagem JSON para uma instância já em execução através do Named Pipe.
        /// Retorna true se a mensagem foi entregue com sucesso.
        /// </summary>
        public static async Task<bool> TrySendToRunningInstanceAsync(string jsonPayload, int timeoutMs = 2000)
        {
            try
            {
                await using var client = new NamedPipeClientStream(".", PipeName, PipeDirection.InOut, PipeOptions.Asynchronous);
                using var cts = new CancellationTokenSource(timeoutMs);

                await client.ConnectAsync(cts.Token);

                var utf8NoBom = new UTF8Encoding(false);
                await using var writer = new StreamWriter(client, utf8NoBom, leaveOpen: true) { AutoFlush = true };
                using var reader = new StreamReader(client, utf8NoBom, leaveOpen: true);

                // Garante que o payload esteja em uma única linha
                string singleLine = jsonPayload.Replace("\r", "").Replace("\n", " ");
                await writer.WriteLineAsync(singleLine.AsMemory(), cts.Token);

                string? response = await reader.ReadLineAsync(cts.Token);
                return response != null && response.Contains("\"ok\"");
            }
            catch
            {
                return false;
            }
        }

        public async ValueTask DisposeAsync()
        {
            _cts.Cancel();
            if (_listenerTask != null)
            {
                try
                {
                    await _listenerTask;
                }
                catch
                {
                    // Ignora cancelamento
                }
            }
            _cts.Dispose();
            GC.SuppressFinalize(this);
        }
    }
}
