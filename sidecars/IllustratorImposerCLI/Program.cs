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

    [JsonPropertyName("FineCutFrame")]
    public bool? FineCutFrame { get; set; } = null;
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
                Console.WriteLine("     IllustratorImposerCLI.exe <input.pdf> [largura] [altura] [gap] [margem] [flags]");
                Console.WriteLine("     [--copies N] [--target-copies N] [--gap N] [--margin N] [--margin-t N] [--margin-r N] [--margin-b N] [--margin-l N]");
                Console.WriteLine("     [--rotation auto|0|90] [--surplus truncate|fill_row] [--substrate-kind sheet|roll] [--max-length N]");
                Console.WriteLine("     [--finecut-frame 1|0] [--trim-to-content] [--output-dir DIR] [--open-after|--silent]");
                return 0;
            }

            // Auto-cura do registro COM para o Illustrator 64-bit no Windows
            EnsureIllustratorTypeLibRegistered();

            var inv = CultureInfo.InvariantCulture;
            string input;
            string output = "";
            double sheetW = 750;
            double sheetH = 0;
            int? explicitTargetCopies = null;
            double gap = 2;
            double marginBase = 15;
            double marginTop = 15;
            double marginRight = 15;
            double marginBottom = 15;
            double marginLeft = 15;
            string rotationArg = "auto";
            SurplusPolicy surplusPolicy = SurplusPolicy.FillRow;
            bool? explicitIsRoll = null;
            bool isRoll = false;
            double? maxLength = null;
            bool trimToContent = false;
            string? outputDir = null;
            bool manter = true;
            bool finecutFrame = false;

            if (args[0] == "--json" && args.Length > 1)
            {
                var legacyJson = JsonSerializer.Deserialize<ImpositionConfig>(args[1])
                    ?? throw new ArgumentException("Payload JSON inválido.");
                input = Path.GetFullPath(legacyJson.InputPath.Trim('"'));
                output = !string.IsNullOrWhiteSpace(legacyJson.OutputPath) ? Path.GetFullPath(legacyJson.OutputPath.Trim('"')) : "";
                sheetW = legacyJson.SheetWMm;
                sheetH = legacyJson.SheetHMm;
                if (legacyJson.TargetCopies > 0) explicitTargetCopies = legacyJson.TargetCopies;
                gap = legacyJson.GapMm;
                marginBase = legacyJson.MarginSideMm;
                marginTop = legacyJson.MarginTopMm;
                marginRight = legacyJson.MarginSideMm;
                marginBottom = legacyJson.MarginTopMm;
                marginLeft = legacyJson.MarginSideMm;
                manter = legacyJson.ManterAberto;
                isRoll = sheetH <= 0;
                if (legacyJson.FineCutFrame.HasValue) finecutFrame = legacyJson.FineCutFrame.Value;
                if (legacyJson.Rotacionar90.HasValue)
                {
                    rotationArg = legacyJson.Rotacionar90.Value ? "90" : "0";
                }
            }
            else
            {
                input = Path.GetFullPath(args[0].Trim('"'));

                // Distingue estilo AutoImposerCLI (<input> [w] [h] [gap] [margin]) de estilo legado (<input> [output] [w] [h] [copias] [gap] [margin] [manter])
                if (args.Length > 1 && !args[1].StartsWith("--", StringComparison.Ordinal))
                {
                    if (double.TryParse(args[1], NumberStyles.Any, inv, out var pw) && pw > 0)
                    {
                        // Estilo AutoImposerCLI: args[1] é largura
                        sheetW = pw;
                        if (args.Length > 2 && double.TryParse(args[2], NumberStyles.Any, inv, out var ph))
                            sheetH = ph;
                        if (args.Length > 3 && double.TryParse(args[3], NumberStyles.Any, inv, out var g))
                            gap = g;
                        if (args.Length > 4 && double.TryParse(args[4], NumberStyles.Any, inv, out var m))
                            marginBase = m;
                    }
                    else
                    {
                        // Estilo Legado: args[1] é caminho do arquivo de saída
                        output = Path.GetFullPath(args[1].Trim('"'));
                        if (args.Length > 2 && double.TryParse(args[2], NumberStyles.Any, inv, out var pwLeg) && pwLeg > 0)
                            sheetW = pwLeg;
                        if (args.Length > 3 && double.TryParse(args[3], NumberStyles.Any, inv, out var phLeg))
                            sheetH = phLeg;
                        if (args.Length > 4 && int.TryParse(args[4], NumberStyles.Any, inv, out var tc) && tc > 0)
                            explicitTargetCopies = tc;
                        if (args.Length > 5 && double.TryParse(args[5], NumberStyles.Any, inv, out var gLeg))
                            gap = gLeg;
                        if (args.Length > 6 && double.TryParse(args[6], NumberStyles.Any, inv, out var mLeg))
                            marginBase = mLeg;
                        if (args.Length > 7)
                            manter = args[7] != "0" && !args[7].Equals("false", StringComparison.OrdinalIgnoreCase);
                    }
                }

                marginTop = marginBase;
                marginRight = marginBase;
                marginBottom = marginBase;
                marginLeft = marginBase;

                for (int i = 0; i < args.Length; i++)
                {
                    if ((args[i] == "--copies" || args[i] == "--target-copies") && i + 1 < args.Length)
                    {
                        if (int.TryParse(args[i + 1], NumberStyles.Any, inv, out var cVal) && cVal > 0)
                            explicitTargetCopies = cVal;
                    }
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
                        explicitIsRoll = args[i + 1].Equals("roll", StringComparison.OrdinalIgnoreCase);
                    else if (args[i] == "--max-length" && i + 1 < args.Length && double.TryParse(args[i + 1], NumberStyles.Any, inv, out var mlVal))
                        maxLength = mlVal;
                    else if (args[i] == "--trim-to-content")
                        trimToContent = true;
                    else if (args[i] == "--output-dir" && i + 1 < args.Length)
                        outputDir = args[i + 1].Trim('"');
                    else if (args[i] == "--finecut-frame")
                    {
                        if (i + 1 < args.Length && (args[i + 1] == "1" || args[i + 1].Equals("true", StringComparison.OrdinalIgnoreCase)))
                            finecutFrame = true;
                        else if (i + 1 < args.Length && (args[i + 1] == "0" || args[i + 1].Equals("false", StringComparison.OrdinalIgnoreCase)))
                            finecutFrame = false;
                        else
                            finecutFrame = true;
                    }
                }

                isRoll = explicitIsRoll ?? (sheetH <= 0);
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

            int capacidade = isRoll
                ? ImpositionBridge.MaxCapacityRoll(
                    sheetW, maxLength ?? 10000.0, gap,
                    marginTop, marginRight, marginBottom, marginLeft,
                    pieceWMm, pieceHMm)
                : ImpositionBridge.MaxCapacity(
                    sheetW, effectiveHeightMm, gap,
                    marginTop, marginRight, marginBottom, marginLeft,
                    pieceWMm, pieceHMm, forcedOrientation);

            if (capacidade <= 0)
            {
                Console.Error.WriteLine(
                    $"[ERRO] Dimensão da arte ({pieceWMm:F1}x{pieceHMm:F1}mm) excede a área útil do substrato " +
                    $"({sheetW:F0}x{effectiveHeightMm:F0}mm) considerando margens e gap.");
                return 2;
            }

            int targetCopies = explicitTargetCopies ?? capacidade;

            // Suporte a correção (exit code 4): pedido acima da capacidade não chega ao core
            if (!isRoll && targetCopies > capacidade)
            {
                var colsVencedor = ImpositionBridge.BestGrid(
                    sheetW, effectiveHeightMm, gap,
                    marginTop, marginRight, marginBottom, marginLeft,
                    pieceWMm, pieceHMm, forcedOrientation).Cols;

                var rodadasMin = (int)Math.Ceiling((double)targetCopies / capacidade);

                Console.Error.WriteLine(
                    $"[ERRO] Pedido de {targetCopies} UN excede a capacidade " +
                    $"da chapa {sheetW:F0}x{effectiveHeightMm:F0}mm.");
                Console.Error.WriteLine(
                    $"       Capacidade por rodada: {capacidade} UN " +
                    $"({colsVencedor} cols).");
                Console.Error.WriteLine(
                    $"       Rodadas necessarias: {rodadasMin}.");

                // Informações base para o .bat (formato parseável por for /f).
                Console.Error.WriteLine("OPTION_COUNT=3");
                Console.Error.WriteLine("OPTION_1_ROUNDS=1");
                Console.Error.WriteLine($"OPTION_1_TARGET={capacidade}");
                Console.Error.WriteLine($"OPTION_1_TOTAL={capacidade}");
                Console.Error.WriteLine($"OPTION_1_SURPLUS={capacidade - targetCopies}");
                Console.Error.WriteLine($"OPTION_1_LABEL=1 rodada de {capacidade} UN (maximo)");

                for (int i = 0; i < 3; i++)
                {
                    var n = rodadasMin + i;
                    var copiasIdeais = (int)Math.Ceiling((double)targetCopies / n);
                    var resto = copiasIdeais % colsVencedor;
                    var copiasRodada = resto == 0
                        ? copiasIdeais
                        : copiasIdeais + (colsVencedor - resto);
                    var total = copiasRodada * n;
                    var sobra = total - targetCopies;

                    Console.Error.WriteLine($"OPTION_{i + 2}_ROUNDS={n}");
                    Console.Error.WriteLine($"OPTION_{i + 2}_TARGET={copiasRodada}");
                    Console.Error.WriteLine($"OPTION_{i + 2}_TOTAL={total}");
                    Console.Error.WriteLine($"OPTION_{i + 2}_SURPLUS={sobra}");
                    Console.Error.WriteLine(
                        $"OPTION_{i + 2}_LABEL={n} rodadas de {copiasRodada} UN = {total} UN (sobra {sobra})");
                }

                Console.Error.WriteLine($"OPTION_BASE_CAP={capacidade}");
                Console.Error.WriteLine($"OPTION_BASE_COLS={colsVencedor}");
                Console.Error.WriteLine($"OPTION_BASE_TARGET={targetCopies}");

                return 4;
            }

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

            double pageWMm = sheetW;
            double pageHMm = isRoll
                ? Math.Max(1.0, marginTop + gradeHMm + marginBottom)
                : effectiveHeightMm;

            double startXMm = planResult.Placements.Count > 0
                ? planResult.Placements[0].XMm
                : (marginLeft + ((pageWMm - marginLeft - marginRight - gradeWMm) / 2.0));

            double startYMm = planResult.Placements.Count > 0
                ? planResult.Placements[0].YMm
                : (isRoll ? marginTop : (marginTop + ((pageHMm - marginTop - marginBottom - gradeHMm) / 2.0)));

            if (trimToContent)
            {
                pageWMm = gradeWMm + marginLeft + marginRight;
                pageHMm = gradeHMm + marginTop + marginBottom;
                startXMm = marginLeft;
                startYMm = marginTop;
            }

            double artboardWMm = pageWMm;
            double artboardHMm = pageHMm;

            double startXPt = startXMm * MmToPt;
            double startYPt = -(startYMm * MmToPt);

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
                finecutFrame = finecutFrame,
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
        catch (FileNotFoundException ex)
        {
            Console.Error.WriteLine(JsonSerializer.Serialize(new { success = false, error = ex.Message }));
            return 1;
        }
        catch (ArgumentException ex)
        {
            Console.Error.WriteLine(JsonSerializer.Serialize(new { success = false, error = ex.Message }));
            return 1;
        }
        catch (InvalidOperationException ex)
        {
            Console.Error.WriteLine(JsonSerializer.Serialize(new { success = false, error = ex.Message }));
            return 2;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(JsonSerializer.Serialize(new { success = false, error = ex.Message }));
            return 3;
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
