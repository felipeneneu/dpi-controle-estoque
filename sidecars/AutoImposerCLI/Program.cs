using System;
using System.Globalization;
using System.IO;
using System.Security.Cryptography;
using System.Diagnostics;
using System.Text.Json;
using PdfSharp.Drawing;
using PdfSharp.Pdf;
using PdfSharp.Pdf.IO;

Thread.CurrentThread.CurrentCulture = CultureInfo.InvariantCulture;
Thread.CurrentThread.CurrentUICulture = CultureInfo.InvariantCulture;

if (args.Length == 0 || string.IsNullOrWhiteSpace(args[0]))
{
    Console.ForegroundColor = ConsoleColor.Yellow;
    Console.WriteLine("USO: AutoImposerCLI.exe <arquivo.pdf> [largura_mm] [altura_mm] [gap_mm] [margem_mm] [pasta_saida] [target_copies]");
    Console.WriteLine("     [--margin-t N] [--margin-r N] [--margin-b N] [--margin-l N] [--rotation auto|0|90] [--copies N] [--json]");
    Console.WriteLine("     [--json '{\"inputPdf\":\"...\",\"sheetWMm\":665,...}']");
    Console.WriteLine("Exemplo: AutoImposerCLI.exe C:\\Artes\\adesivo.pdf 700 1000 2 10");
    Console.WriteLine("         AutoImposerCLI.exe --json '{\"inputPdf\":\"C:\\\\Artes\\\\copiar2.pdf\",\"sheetWMm\":665,\"sheetHMm\":986,\"cols\":35,\"rows\":29,\"pecaWMm\":19,\"pecaHMm\":34,\"gapMm\":0,\"marginLeftMm\":0,\"marginTopMm\":0,\"rotacionar90\":true,\"targetCopies\":1015}'");
    Console.ResetColor();
    return 1;
}

const double MM_TO_PT = 72.0 / 25.4;
const double PT_TO_MM = 25.4 / 72.0;

// ── Modo --json: parseia payload completo do Electron ──────────────────
string? jsonPayloadStr = null;
for (int i = 0; i < args.Length - 1; i++)
{
    if (string.Equals(args[i], "--json", StringComparison.OrdinalIgnoreCase) &&
        !args[i + 1].StartsWith("--", StringComparison.Ordinal))
    {
        jsonPayloadStr = args[i + 1];
        break;
    }
}

JsonPayload? jp = null;
if (jsonPayloadStr != null)
{
    try
    {
        jp = JsonSerializer.Deserialize<JsonPayload>(jsonPayloadStr, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
        });
    }
    catch (Exception ex)
    {
        Console.ForegroundColor = ConsoleColor.Red;
        Console.WriteLine($"[ERRO] Falha ao parsear JSON: {ex.Message}");
        Console.ResetColor();
        return 1;
    }
}

// ── Resolve inputPdf ──────────────────────────────────────────────────
string inputPdf = jp?.inputPdf?.Trim('"') ?? args[0].Trim('"');
if (!File.Exists(inputPdf))
{
    Console.ForegroundColor = ConsoleColor.Red;
    Console.WriteLine($"[ERRO] Arquivo de entrada não encontrado: {inputPdf}");
    Console.ResetColor();
    return 1;
}

// ── Parâmetros posicionais (Defaults: Chapa 700x1000mm, Gap 2mm, Margem 10mm) ─
double sheetWMm   = jp?.sheetWMm   ?? numArg(args, 1, 700.0);
double sheetHMm   = jp?.sheetHMm   ?? numArg(args, 2, 1000.0);
double gapMm      = jp?.gapMm      ?? numArg(args, 3, 2.0);
double baseMarginMm = jp != null ? 0 : numArg(args, 4, 10.0);
double marginTop    = jp?.marginTopMm    ?? flagNum(args, "--margin-t", baseMarginMm);
double marginRight  = jp != null ? (jp.marginRightMm ?? jp.marginLeftMm)     : flagNum(args, "--margin-r", baseMarginMm);
double marginBottom = jp != null ? (jp.marginBottomMm ?? jp.marginTopMm)     : flagNum(args, "--margin-b", baseMarginMm);
double marginLeft   = jp?.marginLeftMm   ?? flagNum(args, "--margin-l", baseMarginMm);

string rotationArg = jp?.rotacionar90 == true ? "90" : flagStr(args, "--rotation", "auto");
bool rotacaoForcada = jp != null || rotationArg != "auto";
int rotacaoGeral = rotationArg switch {
    "0" => 0,
    "90" => 90,
    _ => -1,
};

bool jsonMode = jp != null || args.Contains("--json", StringComparer.OrdinalIgnoreCase);
string outputDir = jp?.outputPath ?? (args.Length > 5 && !args[5].StartsWith("--", StringComparison.Ordinal) ? args[5].Trim('"') : Path.GetDirectoryName(inputPdf)!);
if (outputDir.Length > 0 && !Directory.Exists(outputDir))
{
    Directory.CreateDirectory(outputDir);
}

var sw = Stopwatch.StartNew();
var result = new ImpositionResult { inputFile = inputPdf, version = "0.3.0" };
string? error = null;

// ── Lê a arte ────────────────────────────────────────────────────────
XPdfForm arteForm;
try
{
    arteForm = XPdfForm.FromFile(inputPdf);
}
catch (Exception ex)
{
    error = $"Falha ao ler PDF de entrada: {ex.Message}";
    fail(result, jsonMode, error);
    return 1;
}

double arteWMm = Math.Round(arteForm.PointWidth * PT_TO_MM, 2);
double arteHMm = Math.Round(arteForm.PointHeight * PT_TO_MM, 2);

double utilWMm = sheetWMm - marginLeft - marginRight;
double utilHMm = sheetHMm - marginTop - marginBottom;

if (utilWMm <= 0 || utilHMm <= 0)
{
    error = "Margens configuradas são maiores que o tamanho da chapa.";
    fail(result, jsonMode, error);
    return 1;
}

// ── Se JSON completo, usa dims da peça ao invés do MediaBox ──────────
double slotWMm, slotHMm;
int cols, rows, targetCopies;
bool rotacionar;

if (jp != null && jp.cols > 0 && jp.rows > 0 && jp.pecaWMm > 0 && jp.pecaHMm > 0)
{
    // Modo Electron: grade já calculada, peça escalada para caber no slot
    rotacionar = jp.rotacionar90;
    cols = jp.cols;
    rows = jp.rows;
    targetCopies = jp.targetCopies > 0 ? jp.targetCopies : cols * rows;
    slotWMm = jp.pecaWMm;
    slotHMm = jp.pecaHMm;

    // Override arteWMm/arteHMm para display (usa dims reais da peça)
    arteWMm = slotWMm;
    arteHMm = slotHMm;
}
else
{
    // Modo legado: calcula a partir do MediaBox
    int cols0 = (int)Math.Floor((utilWMm + gapMm) / (arteWMm + gapMm));
    int rows0 = (int)Math.Floor((utilHMm + gapMm) / (arteHMm + gapMm));

    int cols90 = (int)Math.Floor((utilWMm + gapMm) / (arteHMm + gapMm));
    int rows90 = (int)Math.Floor((utilHMm + gapMm) / (arteWMm + gapMm));

    rotacionar = rotacaoForcada ? rotacaoGeral == 90 : cols90 * rows90 > cols0 * rows0;
    cols = rotacionar ? cols90 : cols0;
    rows = rotacionar ? rows90 : rows0;
    slotWMm = rotacionar ? arteHMm : arteWMm;
    slotHMm = rotacionar ? arteWMm : arteHMm;

    targetCopies = jp?.targetCopies > 0
        ? jp.targetCopies
        : (int)flagNum(args, "--target-copies",
            (int)flagNum(args, "--copies", cols * rows));
}

Console.ForegroundColor = ConsoleColor.Cyan;
Console.WriteLine("------------------------------------------------------------");
Console.WriteLine($"ARQUIVO:       {Path.GetFileName(inputPdf)} ({arteWMm:F1} x {arteHMm:F1} mm)");
Console.WriteLine($"SUBSTRATO:     {sheetWMm:F0} x {sheetHMm:F0} mm (Margens T/R/B/L: {marginTop:F0}/{marginRight:F0}/{marginBottom:F0}/{marginLeft:F0} | Gap: {gapMm}mm)");
Console.WriteLine($"ORIENTAÇÃO:    {(rotacionar ? "ROTACIONADO (90°)" : "DIRETO (0°)")}");
Console.WriteLine($"APROVEITAMENTO: {targetCopies} UN ({cols} colunas x {rows} linhas)");
Console.WriteLine($"PEÇA SLOT:     {slotWMm:F1} x {slotHMm:F1} mm");
Console.WriteLine("------------------------------------------------------------");
Console.ResetColor();

if (targetCopies == 0)
{
    error = "Dimensão da arte excede a área útil do substrato.";
    Console.ForegroundColor = ConsoleColor.Yellow;
    Console.WriteLine($"[AVISO] {error}");
    Console.ResetColor();
    fail(result, jsonMode, error);
    return 1;
}

// ── Cálculo de escala da arte para caber no slot ──────────────────────
double arteWPt = arteForm.PointWidth;
double arteHPt = arteForm.PointHeight;

// No modo JSON, a arte original pode ter MediaBox grande; escalamos para o slot.
// Escala mantendo proporção: min(slotW/artW, slotH/artH)
double scale0 = Math.Min((slotWMm * MM_TO_PT) / arteWPt, (slotHMm * MM_TO_PT) / arteHPt);
double drawWPt0 = arteWPt * scale0;
double drawHPt0 = arteHPt * scale0;

// Para rotação 90°: largura da arte → altura do slot, altura da arte → largura do slot
double scale90 = Math.Min((slotHMm * MM_TO_PT) / arteWPt, (slotWMm * MM_TO_PT) / arteHPt);
double drawWPt90 = arteWPt * scale90;
double drawHPt90 = arteHPt * scale90;

// ── Centralização da grade na folha ──────────────────────────────────
double gradeWMm = (cols * slotWMm) + ((cols - 1) * gapMm);
double gradeHMm = (rows * slotHMm) + ((rows - 1) * gapMm);
double startXMm = marginLeft + ((utilWMm - gradeWMm) / 2.0);
double startYMm = marginTop + ((utilHMm - gradeHMm) / 2.0);

result.sheet = new SheetInfo {
    widthMm = sheetWMm, heightMm = sheetHMm,
    gapMm = gapMm,
    marginTopMm = marginTop, marginRightMm = marginRight,
    marginBottomMm = marginBottom, marginLeftMm = marginLeft,
};
result.art = new ArtInfo { widthMm = arteWMm, heightMm = arteHMm };
result.grid = new GridInfo { cols = cols, rows = rows, units = targetCopies, rotated = rotacionar, rotationDeg = rotacionar ? 90 : 0 };
result.startedAt = DateTime.Now;

try
{
    using var outputDoc = new PdfDocument();
    var page = outputDoc.AddPage();
    page.Width = XUnit.FromPoint(sheetWMm * MM_TO_PT);
    page.Height = XUnit.FromPoint(sheetHMm * MM_TO_PT);

    int geradas = 0;
    using (var gfx = XGraphics.FromPdfPage(page))
    {
        for (int r = 0; r < rows; r++)
        {
            for (int c = 0; c < cols; c++)
            {
                if (geradas >= targetCopies)
                {
                    break;
                }

                double xPt = (startXMm + (c * (slotWMm + gapMm))) * MM_TO_PT;
                double yPt = (startYMm + (r * (slotHMm + gapMm))) * MM_TO_PT;

                var state = gfx.Save();
                if (rotacionar)
                {
                    gfx.TranslateTransform(xPt + (slotWMm * MM_TO_PT), yPt);
                    gfx.RotateTransform(90);
                    gfx.DrawImage(arteForm, 0, 0, drawWPt90, drawHPt90);
                }
                else
                {
                    gfx.DrawImage(arteForm, xPt, yPt, drawWPt0, drawHPt0);
                }
                gfx.Restore(state);
                geradas++;
            }
            if (geradas >= targetCopies)
            {
                break;
            }
        }
    }

    result.grid.units = geradas;
    result.outputDir = outputDir;
    string baseName = Path.GetFileNameWithoutExtension(inputPdf);
    result.outputFile = Path.Combine(outputDir, $"{baseName}_IMPOSTO_{sheetWMm:F0}x{sheetHMm:F0}mm_{geradas}UN.pdf");

    outputDoc.Save(result.outputFile);

    result.outputPath = result.outputFile;
    result.durationMs = sw.ElapsedMilliseconds;
    result.finishedAt = DateTime.Now;
    result.status = "ok";
    result.checksum = Sha256OfFile(result.outputFile);

    Console.ForegroundColor = ConsoleColor.Green;
    Console.WriteLine($"[SUCESSO] PDF gerado em:\n{result.outputFile}");
    Console.WriteLine($"          {geradas} unidades ({cols}×{rows}) em {sw.ElapsedMilliseconds}ms");
    Console.ResetColor();

    if (jsonMode)
    {
        Console.WriteLine($"RESULT_JSON:{JsonSerializer.Serialize(result, Opts)}");
    }
    return 0;
}
catch (Exception ex)
{
    error = ex.Message;
    fail(result, jsonMode, error);
    return 1;
}

static string Sha256OfFile(string path)
{
    using var fs = File.OpenRead(path);
    using var sha = SHA256.Create();
    var hash = sha.ComputeHash(fs);
    return Convert.ToHexString(hash).ToLowerInvariant();
}

static double numArg(string[] args, int index, double def)
{
    if (index >= args.Length || args[index].StartsWith("--", StringComparison.Ordinal)) return def;
    return double.TryParse(args[index], NumberStyles.Any, CultureInfo.InvariantCulture, out var v) ? v : def;
}

static double flagNum(string[] args, string flag, double def)
{
    for (int i = 0; i < args.Length - 1; i++)
        if (string.Equals(args[i], flag, StringComparison.OrdinalIgnoreCase) &&
            double.TryParse(args[i + 1], NumberStyles.Any, CultureInfo.InvariantCulture, out var v))
            return v;
    return def;
}

static string flagStr(string[] args, string flag, string def)
{
    for (int i = 0; i < args.Length - 1; i++)
        if (string.Equals(args[i], flag, StringComparison.OrdinalIgnoreCase))
            return args[i + 1];
    return def;
}

static void fail(ImpositionResult result, bool jsonMode, string message)
{
    result.status = "error";
    result.error = message;
    result.durationMs = result.durationMs > 0 ? result.durationMs : 0;
    Console.ForegroundColor = ConsoleColor.Red;
    Console.WriteLine($"[ERRO] {message}");
    Console.ResetColor();
    if (jsonMode)
    {
        Console.WriteLine($"RESULT_JSON:{JsonSerializer.Serialize(result, Opts)}");
    }
}

partial class Program
{
    internal static readonly JsonSerializerOptions Opts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
    };
}

// ── Modelo JSON recebido do Electron ──────────────────────────────────
public class JsonPayload
{
    public string? inputPdf { get; set; }
    public string? outputPath { get; set; }
    public double sheetWMm { get; set; }
    public double sheetHMm { get; set; }
    public int cols { get; set; }
    public int rows { get; set; }
    public double gapMm { get; set; }
    public double marginLeftMm { get; set; }
    public double marginTopMm { get; set; }
    public double? marginRightMm { get; set; }
    public double? marginBottomMm { get; set; }
    public bool rotacionar90 { get; set; }
    public int targetCopies { get; set; }
    public double pecaWMm { get; set; }
    public double pecaHMm { get; set; }
}

public class ImpositionResult
{
    public string version { get; set; } = "";
    public string status { get; set; } = "";
    public string? error { get; set; }
    public string inputFile { get; set; } = "";
    public ArtInfo? art { get; set; }
    public SheetInfo? sheet { get; set; }
    public GridInfo? grid { get; set; }
    public string? outputPath { get; set; }
    public string? checksum { get; set; }
    public long durationMs { get; set; }
    public DateTime startedAt { get; set; }
    public DateTime finishedAt { get; set; }
    public string? outputDir { get; set; }
    public string? outputFile { get; set; }
}

public class ArtInfo { public double widthMm { get; set; } public double heightMm { get; set; } }
public class SheetInfo
{
    public double widthMm { get; set; }
    public double heightMm { get; set; }
    public double gapMm { get; set; }
    public double marginTopMm { get; set; }
    public double marginRightMm { get; set; }
    public double marginBottomMm { get; set; }
    public double marginLeftMm { get; set; }
}
public class GridInfo
{
    public int cols { get; set; }
    public int rows { get; set; }
    public int units { get; set; }
    public bool rotated { get; set; }
    public int rotationDeg { get; set; }
}