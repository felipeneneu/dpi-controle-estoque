using System;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Win32;
using PdfSharp.Pdf;
using PdfSharp.Pdf.IO;
using IllustratorImposerCLI.Imposition;
using Imposition.Core.Contracts;
using Imposition.Core.Geometry;

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
    public int Cols { get; set; } = 0;

    [JsonPropertyName("Rows")]
    public int Rows { get; set; } = 0;

    [JsonPropertyName("GapMm")]
    public double GapMm { get; set; } = 2;

    [JsonPropertyName("MarginSideMm")]
    public double MarginSideMm { get; set; } = 15;

    [JsonPropertyName("MarginTopMm")]
    public double MarginTopMm { get; set; } = 15;

    [JsonPropertyName("Rotacionar90")]
    public bool? Rotacionar90 { get; set; } = null;

    [JsonPropertyName("TargetCopies")]
    public int TargetCopies { get; set; } = 100;

    [JsonPropertyName("ManterAberto")]
    public bool ManterAberto { get; set; } = true;
}

class Program
{
    private const double PtToMm = 25.4 / 72.0;
    private const double MmToPt = 72.0 / 25.4;

    static int Main(string[] args)
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;

        try
        {
            if (args.Length == 0 || args[0] == "--help" || args[0] == "-h")
            {
                Console.WriteLine("Uso: IllustratorImposerCLI.exe --json \"{...}\" [--open-after|--silent]");
                Console.WriteLine("     IllustratorImposerCLI.exe <input.pdf> [output.pdf] [largura_bobina] [comprimento:0=auto] [copias] [gap] [margem] [manterAberto:0|1]");
                Console.WriteLine("     [--copies N] [--target-copies N] [--gap N] [--margin N] [--margin-t N] [--margin-r N] [--margin-b N] [--margin-l N]");
                Console.WriteLine("     [--rotation auto|0|90] [--surplus truncate|fill_row] [--substrate-kind sheet|roll] [--max-length N]");
                Console.WriteLine("     [--trim-to-content] [--output-dir DIR] [--open-after|--silent]");
                return 0;
            }

            // Auto-cura do registro COM para o Illustrator 64-bit no Windows
            EnsureIllustratorTypeLibRegistered();

            var inv = CultureInfo.InvariantCulture;
            string input;
            string output = "";
            double sheetW = 750;
            double sheetH = 0;
            int targetCopies = 100;
            double gap = 2;
            double marginBase = 15;
            double marginTop = 15;
            double marginRight = 15;
            double marginBottom = 15;
            double marginLeft = 15;
            string rotationArg = "auto";
            SurplusPolicy surplusPolicy = SurplusPolicy.FillRow;
            bool isRoll = true;
            double? maxLength = null;
            bool trimToContent = false;
            string? outputDir = null;
            bool manter = true;

            if (args[0] == "--json" && args.Length > 1)
            {
                var legacyJson = JsonSerializer.Deserialize<ImpositionConfig>(args[1])
                    ?? throw new ArgumentException("Payload JSON inválido.");
                input = Path.GetFullPath(legacyJson.InputPath.Trim('"'));
                output = !string.IsNullOrWhiteSpace(legacyJson.OutputPath) ? Path.GetFullPath(legacyJson.OutputPath.Trim('"')) : "";
                sheetW = legacyJson.SheetWMm;
                sheetH = legacyJson.SheetHMm;
                targetCopies = legacyJson.TargetCopies > 0 ? legacyJson.TargetCopies : 100;
                gap = legacyJson.GapMm;
                marginBase = legacyJson.MarginSideMm;
                marginTop = legacyJson.MarginTopMm;
                marginRight = legacyJson.MarginSideMm;
                marginBottom = legacyJson.MarginTopMm;
                marginLeft = legacyJson.MarginSideMm;
                manter = legacyJson.ManterAberto;
                isRoll = sheetH <= 0;
                if (legacyJson.Rotacionar90.HasValue)
                {
                    rotationArg = legacyJson.Rotacionar90.Value ? "90" : "0";
                }
            }
            else
            {
                input = Path.GetFullPath(args[0].Trim('"'));
                if (args.Length > 1 && !args[1].StartsWith("--", StringComparison.Ordinal))
                    output = Path.GetFullPath(args[1].Trim('"'));
                if (args.Length > 2 && double.TryParse(args[2], NumberStyles.Any, inv, out var pw) && pw > 0)
                    sheetW = pw;
                if (args.Length > 3 && double.TryParse(args[3], NumberStyles.Any, inv, out var ph))
                    sheetH = ph;
                if (args.Length > 4 && int.TryParse(args[4], NumberStyles.Any, inv, out var tc) && tc > 0)
                    targetCopies = tc;
                if (args.Length > 5 && double.TryParse(args[5], NumberStyles.Any, inv, out var g))
                    gap = g;

                if (args.Length >= 8)
                {
                    if (double.TryParse(args[6], NumberStyles.Any, inv, out var m)) marginBase = m;
                    manter = args[7] != "0" && !args[7].Equals("false", StringComparison.OrdinalIgnoreCase);
                }
                else if (args.Length == 7)
                {
                    manter = args[6] != "0" && !args[6].Equals("false", StringComparison.OrdinalIgnoreCase);
                }

                marginTop = marginBase;
                marginRight = marginBase;
                marginBottom = marginBase;
                marginLeft = marginBase;

                for (int i = 0; i < args.Length; i++)
                {
                    if ((args[i] == "--copies" || args[i] == "--target-copies") && i + 1 < args.Length)
                        targetCopies = int.TryParse(args[i + 1], NumberStyles.Any, inv, out var cVal) ? cVal : targetCopies;
                    else if (args[i] == "--gap" && i + 1 < args.Length)
                        gap = double.TryParse(args[i + 1], NumberStyles.Any, inv, out var gVal) ? gVal : gap;
                    else if ((args[i] == "--margin" || args[i] == "--margin-side") && i + 1 < args.Length)
                    {
                        if (double.TryParse(args[i + 1], NumberStyles.Any, inv, out var mVal))
                        {
                            marginBase = mVal;
                            marginTop = mVal;
                            marginRight = mVal;
                            marginBottom = mVal;
                            marginLeft = mVal;
                        }
                    }
                    else if (args[i] == "--margin-t" && i + 1 < args.Length && double.TryParse(args[i + 1], NumberStyles.Any, inv, out var mt))
                        marginTop = mt;
                    else if (args[i] == "--margin-r" && i + 1 < args.Length && double.TryParse(args[i + 1], NumberStyles.Any, inv, out var mr))
                        marginRight = mr;
                    else if (args[i] == "--margin-b" && i + 1 < args.Length && double.TryParse(args[i + 1], NumberStyles.Any, inv, out var mb))
                        marginBottom = mb;
                    else if (args[i] == "--margin-l" && i + 1 < args.Length && double.TryParse(args[i + 1], NumberStyles.Any, inv, out var ml))
                        marginLeft = ml;
                    else if (args[i] == "--rotation" && i + 1 < args.Length)
                        rotationArg = args[i + 1].ToLowerInvariant();
                    else if (args[i] == "--surplus" && i + 1 < args.Length)
                        surplusPolicy = args[i + 1].Equals("truncate", StringComparison.OrdinalIgnoreCase) ? SurplusPolicy.Truncate : SurplusPolicy.FillRow;
                    else if (args[i] == "--substrate-kind" && i + 1 < args.Length)
                        isRoll = args[i + 1].Equals("roll", StringComparison.OrdinalIgnoreCase);
                    else if (args[i] == "--max-length" && i + 1 < args.Length && double.TryParse(args[i + 1], NumberStyles.Any, inv, out var mlVal))
                        maxLength = mlVal;
                    else if (args[i] == "--trim-to-content")
                        trimToContent = true;
                    else if (args[i] == "--output-dir" && i + 1 < args.Length)
                        outputDir = args[i + 1].Trim('"');
                }

                if (sheetH <= 0) isRoll = true;
            }

            if (args.Contains("--open-after", StringComparer.OrdinalIgnoreCase)) manter = true;
            if (args.Contains("--silent", StringComparer.OrdinalIgnoreCase) || args.Contains("--close-after", StringComparer.OrdinalIgnoreCase)) manter = false;

            marginBase = Math.Max(0, marginBase);
            gap = Math.Max(0, gap);

            if (!File.Exists(input))
                throw new FileNotFoundException("Arquivo de origem não encontrado.", input);

            // Leitura instantânea do MediaBox via PdfSharp
            var (pieceWMm, pieceHMm) = ReadPdfMediaBox(input);

            // Planejamento matemático centralizado via imposition-core (ADR-021)
            Orientation? forcedOrientation = rotationArg switch
            {
                "0" => Orientation.Portrait,
                "90" => Orientation.Landscape,
                _ => null
            };

            double effectiveHeightMm = isRoll ? (maxLength ?? 10000.0) : sheetH;
            var inputSpec = ImpositionBridge.BuildInput(
                sheetWidthMm: sheetW,
                sheetHeightMm: effectiveHeightMm,
                gapMm: gap,
                marginTopMm: marginTop,
                marginRightMm: marginRight,
                marginBottomMm: marginBottom,
                marginLeftMm: marginLeft,
                pieceWidthMm: pieceWMm,
                pieceHeightMm: pieceHMm,
                targetCopies: targetCopies,
                forcedOrientation: forcedOrientation,
                surplusPolicy: surplusPolicy,
                kind: isRoll ? SubstrateKind.Roll : SubstrateKind.Sheet,
                maxLengthMm: isRoll ? (maxLength ?? 10000.0) : null
            );

            var planResult = ImpositionBridge.Plan(inputSpec);

            bool rotacionar90 = planResult.Orientation == Orientation.Landscape;
            double finalPieceWMm = rotacionar90 ? pieceHMm : pieceWMm;
            double finalPieceHMm = rotacionar90 ? pieceWMm : pieceHMm;

            double gradeWMm = (planResult.Cols * finalPieceWMm) + ((planResult.Cols - 1) * gap);
            double gradeHMm = (planResult.Rows * finalPieceHMm) + ((planResult.Rows - 1) * gap);

            double artboardWMm = sheetW;
            double artboardHMm = planResult.LengthMm;

            if (trimToContent)
            {
                artboardWMm = gradeWMm + marginLeft + marginRight;
                artboardHMm = gradeHMm + marginTop + marginBottom;
            }

            double utilWMm = artboardWMm - marginLeft - marginRight;
            double startXPt = (marginLeft + ((utilWMm - gradeWMm) / 2.0)) * MmToPt;

            double startYPt;
            if (isRoll)
            {
                startYPt = -(marginTop * MmToPt);
            }
            else
            {
                double utilHMm = artboardHMm - marginTop - marginBottom;
                startYPt = -(marginTop + ((utilHMm - gradeHMm) / 2.0)) * MmToPt;
            }

            double stepXPt = (finalPieceWMm + gap) * MmToPt;
            double stepYPt = (finalPieceHMm + gap) * MmToPt;

            if (string.IsNullOrWhiteSpace(output))
            {
                string targetDir = !string.IsNullOrWhiteSpace(outputDir) ? outputDir : Path.GetDirectoryName(input)!;
                if (!Directory.Exists(targetDir)) Directory.CreateDirectory(targetDir);
                string name = Path.GetFileNameWithoutExtension(input);
                output = Path.Combine(targetDir, $"{name}_IMPOSTO_{artboardWMm:F0}x{artboardHMm:F0}mm_{planResult.PlannedUnits}UN.pdf");
            }
            else if (!string.IsNullOrWhiteSpace(outputDir))
            {
                string fileName = Path.GetFileName(output);
                if (!Directory.Exists(outputDir)) Directory.CreateDirectory(outputDir);
                output = Path.Combine(outputDir, fileName);
            }

            var planPayload = new
            {
                InputPath = input,
                OutputPath = output,
                cols = planResult.Cols,
                rows = planResult.Rows,
                rotacionar90 = rotacionar90,
                plannedUnits = planResult.PlannedUnits,
                targetCopies = targetCopies,
                gridHash = planResult.GridHash,
                artboardWMm = Math.Round(artboardWMm, 2),
                artboardHMm = Math.Round(artboardHMm, 2),
                startXPt = startXPt,
                startYPt = startYPt,
                stepXPt = stepXPt,
                stepYPt = stepYPt,
                pieceWMm = Math.Round(pieceWMm, 2),
                pieceHMm = Math.Round(pieceHMm, 2),
                finalPieceWMm = Math.Round(finalPieceWMm, 2),
                finalPieceHMm = Math.Round(finalPieceHMm, 2),
                gradeWMm = Math.Round(gradeWMm, 2),
                gradeHMm = Math.Round(gradeHMm, 2),
                manterAberto = manter
            };

            Type? aiType = Type.GetTypeFromProgID("Illustrator.Application");
            if (aiType == null)
            {
                Console.Error.WriteLine(JsonSerializer.Serialize(new { success = false, error = "Adobe Illustrator não instalado." }));
                return 2;
            }

            object aiApp = GetOrCreateIllustratorApp(aiType);

            string jsxContent = CarregarScriptEmbutido("IllustratorImposerCLI.Scripts.engine.jsx");
            string payloadJson = JsonSerializer.Serialize(planPayload);

            string runnerCode = $"var plan = {payloadJson};\n{jsxContent}\nexecuteImposition(plan);";

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
                    cols = planResult.Cols,
                    rows = planResult.Rows,
                    copies = planResult.PlannedUnits,
                    gridHash = planResult.GridHash,
                    outputPath = output,
                    manterAberto = manter
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

    private static (double wMm, double hMm) ReadPdfMediaBox(string pdfPath)
    {
        using var doc = PdfReader.Open(pdfPath, PdfDocumentOpenMode.Import);
        var page = doc.Pages[0];
        var box = page.MediaBox;
        return (box.Width * PtToMm, box.Height * PtToMm);
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
