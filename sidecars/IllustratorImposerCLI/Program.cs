using System;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Win32;

namespace IllustratorImposerCLI;

public class ImpositionConfig
{
    [JsonPropertyName("InputPath")]
    public string InputPath { get; set; } = string.Empty;

    [JsonPropertyName("OutputPath")]
    public string OutputPath { get; set; } = string.Empty;

    [JsonPropertyName("SheetWMm")]
    public double SheetWMm { get; set; } = 750;

    [JsonPropertyName("SheetHMm")]
    public double SheetHMm { get; set; } = 0; // 0 = automatico

    [JsonPropertyName("Cols")]
    public int Cols { get; set; } = 0; // 0 = automatico

    [JsonPropertyName("Rows")]
    public int Rows { get; set; } = 0; // 0 = automatico

    [JsonPropertyName("GapMm")]
    public double GapMm { get; set; } = 2;

    [JsonPropertyName("MarginSideMm")]
    public double MarginSideMm { get; set; } = 15;

    [JsonPropertyName("MarginTopMm")]
    public double MarginTopMm { get; set; } = 15;

    [JsonPropertyName("Rotacionar90")]
    public bool? Rotacionar90 { get; set; } = null; // null = automatico

    [JsonPropertyName("TargetCopies")]
    public int TargetCopies { get; set; } = 100;

    [JsonPropertyName("ManterAberto")]
    public bool ManterAberto { get; set; } = true;
}

class Program
{
    static int Main(string[] args)
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;

        try
        {
            if (args.Length == 0 || args[0] == "--help" || args[0] == "-h")
            {
                Console.WriteLine("Uso: IllustratorImposerCLI.exe --json \"{...}\" [--open-after|--silent]");
                Console.WriteLine("     IllustratorImposerCLI.exe <input.pdf> [output.pdf] [largura_bobina] [comprimento:0=auto] [copias] [gap] [margem:0_aceito] [manterAberto:0|1]");
                return 0;
            }

            // Auto-cura do registro COM para o Illustrator 64-bit no Windows
            EnsureIllustratorTypeLibRegistered();

            ImpositionConfig config;
            if (args[0] == "--json" && args.Length > 1)
            {
                config = JsonSerializer.Deserialize<ImpositionConfig>(args[1])
                    ?? throw new ArgumentException("Payload JSON inválido.");
            }
            else
            {
                var inv = CultureInfo.InvariantCulture;
                string input = Path.GetFullPath(args[0].Trim('"'));
                string output = args.Length > 1 && !args[1].StartsWith("--") ? Path.GetFullPath(args[1].Trim('"')) : "";
                double w = args.Length > 2 && double.TryParse(args[2], NumberStyles.Any, inv, out var pw) && pw > 0 ? pw : 750;
                double h = args.Length > 3 && double.TryParse(args[3], NumberStyles.Any, inv, out var ph) ? ph : 0; // 0 = auto

                // Layout posicional:
                //   <input.pdf> [output.pdf] [largura] [comprimento:0=auto] [copias] [gap] [margem:0_aceito] [manterAberto:0|1]
                // Forma antiga (sem margem): ... [copias] [gap] [manterAberto:0|1]
                int cols = 0;
                int rows = 0;
                int copias = args.Length > 4 && int.TryParse(args[4], NumberStyles.Any, inv, out var c1) ? c1 : 100;
                double gap = args.Length > 5 && double.TryParse(args[5], NumberStyles.Any, inv, out var g1) ? g1 : 2;
                double margin = 15;
                bool manter = true;

                if (args.Length >= 8)
                {
                    if (double.TryParse(args[6], NumberStyles.Any, inv, out var m1)) margin = m1;
                    manter = args.Length <= 7 || (args[7] != "0" && !args[7].Equals("false", StringComparison.OrdinalIgnoreCase));
                }
                else if (args.Length == 7)
                {
                    manter = args[6] != "0" && !args[6].Equals("false", StringComparison.OrdinalIgnoreCase);
                }

                for (int i = 0; i < args.Length; i++)
                {
                    if (args[i] == "--copies" && i + 1 < args.Length)
                        copias = int.TryParse(args[i + 1], NumberStyles.Any, inv, out var tc) ? tc : copias;
                    else if (args[i] == "--gap" && i + 1 < args.Length)
                        gap = double.TryParse(args[i + 1], NumberStyles.Any, inv, out var ng) ? ng : gap;
                    else if ((args[i] == "--margin" || args[i] == "--margin-side") && i + 1 < args.Length)
                        margin = double.TryParse(args[i + 1], NumberStyles.Any, inv, out var nm) ? nm : margin;
                }

                margin = Math.Max(0, margin);
                gap = Math.Max(0, gap);

                if (string.IsNullOrWhiteSpace(output))
                {
                    string dir = Path.GetDirectoryName(input)!;
                    string name = Path.GetFileNameWithoutExtension(input);
                    output = Path.Combine(dir, $"{name}_IMPOSTO_{w:F0}mm_{copias}UN.pdf");
                }

                config = new ImpositionConfig
                {
                    InputPath = input,
                    OutputPath = output,
                    SheetWMm = w,
                    SheetHMm = h,
                    Cols = cols,
                    Rows = rows,
                    GapMm = gap,
                    MarginSideMm = margin,
                    MarginTopMm = margin,
                    TargetCopies = copias,
                    ManterAberto = manter
                };
            }

            if (args.Contains("--open-after", StringComparer.OrdinalIgnoreCase)) config.ManterAberto = true;
            if (args.Contains("--silent", StringComparer.OrdinalIgnoreCase) || args.Contains("--close-after", StringComparer.OrdinalIgnoreCase)) config.ManterAberto = false;

            if (!File.Exists(config.InputPath))
                throw new FileNotFoundException("Arquivo de origem não encontrado.", config.InputPath);
            Type? aiType = Type.GetTypeFromProgID("Illustrator.Application");
            if (aiType == null)
            {
                Console.Error.WriteLine(JsonSerializer.Serialize(new { success = false, error = "Adobe Illustrator não instalado." }));
                return 2;
            }

            object aiApp = GetOrCreateIllustratorApp(aiType);

            string jsxContent = CarregarScriptEmbutido("IllustratorImposerCLI.Scripts.engine.jsx");
            string payloadJson = JsonSerializer.Serialize(config);

            string runnerCode = $"var config = {payloadJson};\n{jsxContent}\nprocessarArquivoAutomatico(config);";

            // Executa via InvokeMember com BindingFlags.InvokeMethod (evita TYPE_E_LIBNOTREGISTERED 0x8002801D)
            object? res = aiType.InvokeMember(
                "DoJavaScript",
                BindingFlags.InvokeMethod,
                null,
                aiApp,
                new object[] { runnerCode }
            );

            string finalResultJson = res?.ToString() ?? "";
            if (!string.IsNullOrWhiteSpace(finalResultJson) && finalResultJson.StartsWith("{") && finalResultJson.EndsWith("}"))
            {
                Console.WriteLine(finalResultJson);
            }
            else
            {
                Console.WriteLine(JsonSerializer.Serialize(new
                {
                    success = true,
                    copies = config.TargetCopies,
                    outputPath = config.OutputPath,
                    manterAberto = config.ManterAberto
                }));
            }

            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(JsonSerializer.Serialize(new { success = false, error = ex.Message }));
            return 1;
        }
    }

    private static void EnsureIllustratorTypeLibRegistered()
    {
        try
        {
            const string clsidKey = @"CLSID\{D19BF46D-D108-4617-8D8B-0A94E64B348E}\TypeLib";
            using var key = Registry.ClassesRoot.OpenSubKey(clsidKey);
            var typeLibGuid = key?.GetValue("")?.ToString();
            if (!string.IsNullOrEmpty(typeLibGuid))
            {
                string win32Path = $@"TypeLib\{typeLibGuid}\1.0\0\win32";
                using var win32Key = Registry.ClassesRoot.OpenSubKey(win32Path);
                var aipPath = win32Key?.GetValue("")?.ToString();

                if (!string.IsNullOrEmpty(aipPath))
                {
                    string win64SubKey = $@"Software\Classes\TypeLib\{typeLibGuid}\1.0\0\win64";
                    using var hkcuWin64 = Registry.CurrentUser.CreateSubKey(win64SubKey);
                    hkcuWin64?.SetValue("", aipPath);
                }
            }
        }
        catch { }
    }

    [System.Runtime.InteropServices.DllImport("oleaut32.dll", PreserveSig = false)]
    private static extern void GetActiveObject(ref Guid rclsid, IntPtr pvReserved, [System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.IUnknown)] out object ppunk);

    private static object GetOrCreateIllustratorApp(Type aiType)
    {
        try
        {
            Guid clsid = aiType.GUID;
            GetActiveObject(ref clsid, IntPtr.Zero, out object runningApp);
            if (runningApp != null) return runningApp;
        }
        catch { }

        return Activator.CreateInstance(aiType)
            ?? throw new InvalidOperationException("Não foi possível conectar ao Adobe Illustrator.");
    }

    private static string CarregarScriptEmbutido(string resourceName)
    {
        var asm = Assembly.GetExecutingAssembly();
        using var stream = asm.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException($"Recurso '{resourceName}' não encontrado.");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
