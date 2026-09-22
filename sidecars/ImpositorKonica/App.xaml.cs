using System;
using System.IO;
using System.Text.Json;
using System.Threading;
using System.Windows;
using ImpositorKonica.Models;
using ImpositorKonica.Services;

namespace ImpositorKonica
{
    /// <summary>
    /// Ponto de entrada do sidecar nativo ImpositorKonica.
    /// Gerencia instância única (Singleton), servidor Named Pipe para dados em tempo real
    /// e códigos de saída padronizados da ADR-015.
    /// </summary>
    public partial class App : Application
    {
        private const string MutexName = "GraficaOS_ImpositorKonica_Mutex";

        public static int ExitCodeResult { get; set; } = 1; // 1 = cancelado por padrão

        private Mutex? _mutex;
        private PipeServerService? _pipeServer;

        protected override async void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);

            string? dataFilePath = null;
            for (int i = 0; i < e.Args.Length; i++)
            {
                if (e.Args[i] == "--data" && i + 1 < e.Args.Length)
                {
                    dataFilePath = e.Args[i + 1];
                    break;
                }
            }

            string? jsonContent = null;
            if (!string.IsNullOrEmpty(dataFilePath) && File.Exists(dataFilePath))
            {
                try
                {
                    jsonContent = File.ReadAllText(dataFilePath);
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"[ImpositorKonica] Erro ao ler arquivo temporário: {ex.Message}");
                }
            }

            // 1. Checagem de Instância Única (Singleton Híbrido)
            _mutex = new Mutex(true, MutexName, out bool createdNew);

            if (!createdNew)
            {
                // Já existe uma instância aberta!
                Console.WriteLine("[ImpositorKonica] Instância existente detectada. Encaminhando dados via Named Pipe...");

                string payloadToSend = jsonContent ?? JsonSerializer.Serialize(ImpositionPayload.CreateMock());
                bool delivered = await PipeServerService.TrySendToRunningInstanceAsync(payloadToSend, timeoutMs: 3000);

                if (delivered)
                {
                    Console.WriteLine("[ImpositorKonica] Dados entregues com sucesso à instância em execução.");
                    Environment.Exit(0);
                    return;
                }
                else
                {
                    Console.WriteLine("[ImpositorKonica] Não foi possível contatar o pipe da instância anterior. Assumindo execução...");
                }
            }

            // 2. Primeira Instância: Inicializa payload inicial
            ImpositionPayload payload;
            if (!string.IsNullOrEmpty(jsonContent))
            {
                try
                {
                    var parsed = JsonSerializer.Deserialize<ImpositionPayload>(jsonContent, new JsonSerializerOptions
                    {
                        PropertyNameCaseInsensitive = true
                    });
                    payload = parsed ?? ImpositionPayload.CreateMock();
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"[ImpositorKonica] Falha ao desserializar JSON inicial: {ex.Message}");
                    payload = ImpositionPayload.CreateMock();
                }
            }
            else
            {
                payload = ImpositionPayload.CreateMock();
            }

            // 3. Inicializa a janela principal
            MainWindow mainWindow;
            try
            {
                mainWindow = new MainWindow(payload);
                MainWindow = mainWindow;
                mainWindow.Show();
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[ImpositorKonica] Erro inicializando interface gráfica: {ex.Message}");
                Environment.Exit(2);
                return;
            }

            // 4. Inicia o servidor Named Pipe para receber dados do Electron em tempo real
            try
            {
                _pipeServer = new PipeServerService((newPayload) =>
                {
                    // Despacha com segurança para a thread da UI
                    Dispatcher.Invoke(() =>
                    {
                        mainWindow.UpdatePayload(newPayload);
                    });
                });

                _pipeServer.Start();
                Console.WriteLine($"[ImpositorKonica] Servidor Named Pipe ativo em \\\\.\\pipe\\{PipeServerService.PipeName}");
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[ImpositorKonica] Erro iniciando Named Pipe Server: {ex.Message}");
            }
        }

        protected override async void OnExit(ExitEventArgs e)
        {
            if (_pipeServer != null)
            {
                await _pipeServer.DisposeAsync();
                _pipeServer = null;
            }

            if (_mutex != null)
            {
                try
                {
                    _mutex.ReleaseMutex();
                }
                catch
                {
                    // Mutex já liberado
                }
                _mutex.Dispose();
                _mutex = null;
            }

            base.OnExit(e);
            Environment.ExitCode = ExitCodeResult;
        }
    }
}
