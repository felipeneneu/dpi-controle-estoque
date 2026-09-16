using System;
using System.IO;
using System.Text.Json;
using System.Windows;
using ImpositorKonica.Models;

namespace ImpositorKonica
{
    /// <summary>
    /// Ponto de entrada do sidecar nativo ImpositorKonica.
    /// Gerencia argumentos CLI e códigos de saída padronizados da ADR-015.
    /// </summary>
    public partial class App : Application
    {
        public static int ExitCodeResult { get; set; } = 1; // 1 = cancelado por padrão

        protected override void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);

            ImpositionPayload payload;
            string? dataFilePath = null;

            // 1. Processamento dos argumentos CLI
            for (int i = 0; i < e.Args.Length; i++)
            {
                if (e.Args[i] == "--data" && i + 1 < e.Args.Length)
                {
                    dataFilePath = e.Args[i + 1];
                    break;
                }
            }

            if (!string.IsNullOrEmpty(dataFilePath))
            {
                // Carregamento a partir de arquivo temporário fornecido pelo Electron
                if (!File.Exists(dataFilePath))
                {
                    Console.Error.WriteLine($"[ImpositorKonica] Erro: Arquivo de dados não encontrado: {dataFilePath}");
                    Environment.Exit(2); // Código 2: Arquivo inexistente
                    return;
                }

                try
                {
                    byte[] raw = File.ReadAllBytes(dataFilePath);
                    if (raw.Length >= 3 && raw[0] == 0xEF && raw[1] == 0xBB && raw[2] == 0xBF)
                    {
                        Array.Copy(raw, 3, raw, 0, raw.Length - 3);
                        Array.Resize(ref raw, raw.Length - 3);
                    }

                    string json;
                    try
                    {
                        json = new System.Text.UTF8Encoding(false, true).GetString(raw);
                    }
                    catch (System.Text.DecoderFallbackException)
                    {
                        json = System.Text.Encoding.GetEncoding(1252).GetString(raw);
                        Console.Error.WriteLine("[ImpositorKonica] Aviso: payload JSON não é UTF-8 puro; interpretado como Windows-1252.");
                    }

                    var parsed = JsonSerializer.Deserialize<ImpositionPayload>(json, new JsonSerializerOptions
                    {
                        PropertyNameCaseInsensitive = true
                    });

                    if (parsed == null)
                    {
                        Console.Error.WriteLine("[ImpositorKonica] Erro: JSON resultou em payload nulo.");
                        Environment.Exit(2);
                        return;
                    }

                    payload = parsed;
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"[ImpositorKonica] Erro fatal desserializando JSON: {ex.Message}");
                    Environment.Exit(2); // Código 2: JSON corrompido / inválido
                    return;
                }
            }
            else
            {
                // Inicialização sem argumentos: Mock para desenvolvimento isolado
                Console.WriteLine("[ImpositorKonica] Iniciando com dados MOCK de demonstração...");
                payload = ImpositionPayload.CreateMock();
            }

            // 2. Criação e exibição da Janela Principal
            try
            {
                var mainWindow = new MainWindow(payload);
                MainWindow = mainWindow;
                mainWindow.Show();
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[ImpositorKonica] Erro inicializando interface gráfica: {ex.Message}");
                Environment.Exit(2);
            }
        }
    }
}
