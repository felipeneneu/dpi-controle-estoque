using System;
using System.Globalization;
using System.IO;
using PdfSharp.Drawing;
using PdfSharp.Pdf;
using PdfSharp.Pdf.IO;

Thread.CurrentThread.CurrentCulture = CultureInfo.InvariantCulture;
Thread.CurrentThread.CurrentUICulture = CultureInfo.InvariantCulture;

if (args.Length == 0 || string.IsNullOrWhiteSpace(args[0]))
{
    Console.ForegroundColor = ConsoleColor.Yellow;
    Console.WriteLine("USO: AutoImposerCLI.exe <arquivo.pdf> [largura_mm] [altura_mm] [gap_mm] [margem_mm] [pasta_saida]");
    Console.WriteLine("Exemplo: AutoImposerCLI.exe C:\\Artes\\adesivo.pdf 700 1000 2 10");
    Console.ResetColor();
    return 1;
}

string inputPdf = args[0].Trim('"');
if (!File.Exists(inputPdf))
{
    Console.ForegroundColor = ConsoleColor.Red;
    Console.WriteLine($"[ERRO] Arquivo de entrada não encontrado: {inputPdf}");
    Console.ResetColor();
    return 1;
}

// Parâmetros (Defaults: Chapa 700x1000mm, Gap 2mm, Margem 10mm)
double sheetWMm = args.Length > 1 && double.TryParse(args[1], NumberStyles.Any, CultureInfo.InvariantCulture, out var sw) ? sw : 700.0;
double sheetHMm = args.Length > 2 && double.TryParse(args[2], NumberStyles.Any, CultureInfo.InvariantCulture, out var sh) ? sh : 1000.0;
double gapMm    = args.Length > 3 && double.TryParse(args[3], NumberStyles.Any, CultureInfo.InvariantCulture, out var gp) ? gp : 2.0;
double marginMm = args.Length > 4 && double.TryParse(args[4], NumberStyles.Any, CultureInfo.InvariantCulture, out var mg) ? mg : 10.0;

string outputDir = args.Length > 5 ? args[5].Trim('"') : Path.GetDirectoryName(inputPdf)!;
if (!Directory.Exists(outputDir))
{
    Directory.CreateDirectory(outputDir);
}

const double MM_TO_PT = 72.0 / 25.4;
const double PT_TO_MM = 25.4 / 72.0;

XPdfForm arteForm;
try
{
    arteForm = XPdfForm.FromFile(inputPdf);
}
catch (Exception ex)
{
    Console.ForegroundColor = ConsoleColor.Red;
    Console.WriteLine($"[ERRO] Falha ao ler PDF de entrada: {ex.Message}");
    Console.ResetColor();
    return 1;
}

double arteWMm = arteForm.PointWidth * PT_TO_MM;
double arteHMm = arteForm.PointHeight * PT_TO_MM;

double utilWMm = sheetWMm - (2 * marginMm);
double utilHMm = sheetHMm - (2 * marginMm);

if (utilWMm <= 0 || utilHMm <= 0)
{
    Console.ForegroundColor = ConsoleColor.Red;
    Console.WriteLine("[ERRO] Margens configuradas são maiores que o tamanho da chapa.");
    Console.ResetColor();
    return 1;
}

// Cálculo do cenário Direto (0°)
int cols0 = (int)Math.Floor((utilWMm + gapMm) / (arteWMm + gapMm));
int rows0 = (int)Math.Floor((utilHMm + gapMm) / (arteHMm + gapMm));
int total0 = Math.Max(0, cols0) * Math.Max(0, rows0);

// Cálculo do cenário Rotacionado (90°)
int cols90 = (int)Math.Floor((utilWMm + gapMm) / (arteHMm + gapMm));
int rows90 = (int)Math.Floor((utilHMm + gapMm) / (arteWMm + gapMm));
int total90 = Math.Max(0, cols90) * Math.Max(0, rows90);

bool rotacionar = total90 > total0;
int cols = rotacionar ? cols90 : cols0;
int rows = rotacionar ? rows90 : rows0;
int totalCopias = rotacionar ? total90 : total0;

double slotWMm = rotacionar ? arteHMm : arteWMm;
double slotHMm = rotacionar ? arteWMm : arteHMm;

Console.ForegroundColor = ConsoleColor.Cyan;
Console.WriteLine("------------------------------------------------------------");
Console.WriteLine($"ARQUIVO:       {Path.GetFileName(inputPdf)} ({arteWMm:F1} x {arteHMm:F1} mm)");
Console.WriteLine($"SUBSTRATO:     {sheetWMm:F0} x {sheetHMm:F0} mm (Margem: {marginMm}mm | Gap: {gapMm}mm)");
Console.WriteLine($"ORIENTAÇÃO:    {(rotacionar ? "ROTACIONADO (90°)" : "DIRETO (0°)")}");
Console.WriteLine($"APROVEITAMENTO: {totalCopias} UN ({cols} colunas x {rows} linhas)");
Console.WriteLine("------------------------------------------------------------");
Console.ResetColor();

if (totalCopias == 0)
{
    Console.ForegroundColor = ConsoleColor.Yellow;
    Console.WriteLine("[AVISO] Dimensão da arte excede a área útil do substrato.");
    Console.ResetColor();
    return 1;
}

// Centralização da grade na folha
double gradeWMm = (cols * slotWMm) + ((cols - 1) * gapMm);
double gradeHMm = (rows * slotHMm) + ((rows - 1) * gapMm);
double startXMm = marginMm + ((utilWMm - gradeWMm) / 2.0);
double startYMm = marginMm + ((utilHMm - gradeHMm) / 2.0);

using var outputDoc = new PdfDocument();
var page = outputDoc.AddPage();
page.Width = XUnit.FromPoint(sheetWMm * MM_TO_PT);
page.Height = XUnit.FromPoint(sheetHMm * MM_TO_PT);

using (var gfx = XGraphics.FromPdfPage(page))
{
    for (int r = 0; r < rows; r++)
    {
        for (int c = 0; c < cols; c++)
        {
            double xPt = (startXMm + (c * (slotWMm + gapMm))) * MM_TO_PT;
            double yPt = (startYMm + (r * (slotHMm + gapMm))) * MM_TO_PT;

            var state = gfx.Save();
            if (rotacionar)
            {
                gfx.TranslateTransform(xPt + (slotWMm * MM_TO_PT), yPt);
                gfx.RotateTransform(90);
                gfx.DrawImage(arteForm, 0, 0, arteForm.PointWidth, arteForm.PointHeight);
            }
            else
            {
                gfx.DrawImage(arteForm, xPt, yPt, arteForm.PointWidth, arteForm.PointHeight);
            }
            gfx.Restore(state);
        }
    }
}

string baseName = Path.GetFileNameWithoutExtension(inputPdf);
string outputPath = Path.Combine(outputDir, $"{baseName}_IMPOSTO_{sheetWMm:F0}x{sheetHMm:F0}mm_{totalCopias}UN.pdf");

outputDoc.Save(outputPath);

Console.ForegroundColor = ConsoleColor.Green;
Console.WriteLine($"[SUCESSO] PDF gerado em:\n{outputPath}");
Console.ResetColor();

return 0;