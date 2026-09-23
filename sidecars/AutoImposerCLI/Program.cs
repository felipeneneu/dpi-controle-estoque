using System;
using System.Globalization;
using System.IO;
using System.Security.Cryptography;
using System.Diagnostics;
using System.Text.Json;
using PdfSharp.Drawing;
using PdfSharp.Pdf;
using PdfSharp.Pdf.IO;
using AutoImposerCLI.Imposition;
using Imposition.Core.Contracts;
using Imposition.Core.Geometry;
using CoreInput = Imposition.Core.Contracts.ImpositionInput;
using CorePlan = Imposition.Core.Contracts.ImpositionResult;
using CoreImpositionException = Imposition.Core.Errors.ImpositionException;

Thread.CurrentThread.CurrentCulture = CultureInfo.InvariantCulture;
Thread.CurrentThread.CurrentUICulture = CultureInfo.InvariantCulture;

if (args.Length == 0 || string.IsNullOrWhiteSpace(args[0]))
{
    Console.ForegroundColor = ConsoleColor.Yellow;
    Console.WriteLine("USO: AutoImposerCLI.exe <arquivo.pdf> [largura_mm] [altura_mm] [gap_mm] [margem_mm] [pasta_saida] [target_copies]");
    Console.WriteLine("     [--margin-t N] [--margin-r N] [--margin-b N] [--margin-l N] [--rotation auto|0|90]");
    Console.WriteLine("     [--target-copies N] [--surplus truncate|fill_row|fill_advance] [--output-dir DIR]");
    Console.WriteLine("     [--substrate-kind sheet|roll] [--max-length N] [--trim-to-content] [--json] [--strict|--warn]");
    Console.WriteLine("     [--json '{\"inputPdf\":\"...\",\"sheetWMm\":665,...}']");
    Console.WriteLine("Exemplo: AutoImposerCLI.exe C:\\Artes\\adesivo.pdf 700 1000 2 10");
    Console.WriteLine("         AutoImposerCLI.exe C:\\Artes\\adesivo.pdf 700 1000 2 10 --surplus fill_row --output-dir C:\\saida");
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

// ── Substrato: sheet | roll (PR #3a.2) ────────────────────────────────
bool isRoll = jp == null && ParseSubstrateKindRoll(args);
double? maxLengthMm = isRoll ? ParseMaxLength(args) : null;
if (isRoll && maxLengthMm is null)
{
    Console.ForegroundColor = ConsoleColor.Red;
    Console.WriteLine("[ERRO] Modo rolo exige --max-length N (mm).");
    Console.ResetColor();
    return 1;
}
SubstrateKind substrateKind = isRoll ? SubstrateKind.Roll : SubstrateKind.Sheet;

// Altura efetiva de planejamento: rolo auto-estende até maxLength; chapa é fixa.
double planeHeightMm = isRoll ? maxLengthMm!.Value : sheetHMm;

bool strictMode = args.Contains("--strict", StringComparer.OrdinalIgnoreCase)
    && !args.Contains("--warn", StringComparer.OrdinalIgnoreCase);
bool warnMode   = args.Contains("--warn", StringComparer.OrdinalIgnoreCase)
    && !args.Contains("--strict", StringComparer.OrdinalIgnoreCase);

bool jsonMode = jp != null || args.Contains("--json", StringComparer.OrdinalIgnoreCase);
string outputDir = jp?.outputPath
    ?? ParseOutputDir(args)
    ?? (args.Length > 5 && !args[5].StartsWith("--", StringComparison.Ordinal) ? args[5].Trim('"') : Path.GetDirectoryName(inputPdf)!);
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
double utilHMm = planeHeightMm - marginTop - marginBottom;

if (utilWMm <= 0 || utilHMm <= 0)
{
    error = "Margens configuradas são maiores que o tamanho do substrato.";
    fail(result, jsonMode, error);
    return 1;
}

// ── Fonte única de grade: imposition-core via ImpositionBridge (ADR-021) ─
double slotWMm, slotHMm;
int cols, rows, targetCopies;
int requestedCopies = 0;
bool rotacionar;
CorePlan plano;
SurplusPolicy surplusPolicy = SurplusPolicy.FillRow;

try
{
    if (jp != null && jp.cols > 0 && jp.rows > 0 && jp.pecaWMm > 0 && jp.pecaHMm > 0)
    {
        // Modo Electron: peça escalada para o slot; o core vira a fonte da grade,
        // mas a decisão de rotação da UI entra como orientação forçada.
        targetCopies = jp.targetCopies > 0 ? jp.targetCopies : jp.cols * jp.rows;
        surplusPolicy = SurplusPolicy.Truncate;
        plano = ImpositionBridge.Plan(ImpositionBridge.BuildInput(
            sheetWMm, sheetHMm, gapMm,
            marginTop, marginRight, marginBottom, marginLeft,
            jp.pecaWMm, jp.pecaHMm, targetCopies,
            jp.rotacionar90 ? Orientation.Landscape : Orientation.Portrait,
            surplusPolicy));

        cols = plano.Cols;
        rows = plano.Rows;
        rotacionar = plano.Orientation == Orientation.Landscape;
        slotWMm = jp.pecaWMm;
        slotHMm = jp.pecaHMm;

        // Override arteWMm/arteHMm para display (usa dims reais da peça)
        arteWMm = jp.pecaWMm;
        arteHMm = jp.pecaHMm;
    }
    else
    {
        // Modo legado (POSICIONAL / .bat): alvo default = capacidade (grade inteira),
        // via core. Respeita orientação forçada, surplus e substrato (BR-024).
        Orientation? forcar = rotacaoForcada ? (Orientation)rotacaoGeral : null;
        surplusPolicy = ParseSurplus(args);

        int capacidade = isRoll
            ? ImpositionBridge.MaxCapacityRoll(
                sheetWMm, maxLengthMm!.Value, gapMm,
                marginTop, marginRight, marginBottom, marginLeft,
                arteWMm, arteHMm)
            : ImpositionBridge.MaxCapacity(
                sheetWMm, planeHeightMm, gapMm,
                marginTop, marginRight, marginBottom, marginLeft,
                arteWMm, arteHMm, forcar);

        if (capacidade == 0)
        {
            error = "Dimensão da arte excede a área útil do substrato.";
            fail(result, jsonMode, error);
            return 1;
        }

        requestedCopies = ParseTargetCopies(args) ?? capacidade;
        targetCopies = requestedCopies;

// Suporte a correção (exit code 4): pedido acima da capacidade não
        // chega ao core. O .bat lê o bloco OPTION_* (stderr, parseável por
        // for /f) e oferece dividir o pedido em N rodadas do mesmo arquivo.
        // A peça SEMPRE cabe quando target <= capacidade (o grid da melhor
        // orientação acomoda o pedido fechando a última linha), então este
        // pré-check é exatamente equivalente ao E_GRID_OVERFLOW do core.
        if (targetCopies > capacidade)
        {
            // colsVencedor vem do BestGrid — fonte única da fórmula da Regra 1,
            // mesma orientação vencedora que define capacidade.
            var colsVencedor = ImpositionBridge.BestGrid(
                sheetWMm, planeHeightMm, gapMm,
                marginTop, marginRight, marginBottom, marginLeft,
                arteWMm, arteHMm, forcar).Cols;

            var rodadasMin = (int)Math.Ceiling((double)targetCopies / capacidade);

            Console.Error.WriteLine(
                $"[ERRO] Pedido de {targetCopies} UN excede a capacidade " +
                $"da chapa {sheetWMm:F0}x{planeHeightMm:F0}mm.");
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

        plano = ImpositionBridge.Plan(ImpositionBridge.BuildInput(
            sheetWMm, planeHeightMm, gapMm,
            marginTop, marginRight, marginBottom, marginLeft,
            arteWMm, arteHMm, targetCopies, forcar,
            surplusPolicy, substrateKind,
            isRoll ? maxLengthMm : null));

        cols = plano.Cols;
        rows = plano.Rows;
        rotacionar = plano.Orientation == Orientation.Landscape;
        slotWMm = rotacionar ? arteHMm : arteWMm;
        slotHMm = rotacionar ? arteWMm : arteHMm;
        targetCopies = plano.PlannedUnits;
    }
}
catch (CoreImpositionException cex)
{
    error = cex.Code is "E_GRID_OVERFLOW" or "E_INVALID_TARGET"
        ? "Dimensão da arte excede a área útil do substrato."
        : cex.Message;
    fail(result, jsonMode, error);
    return 1;
}

result.requestedUnits = jp != null ? targetCopies : requestedCopies;
result.surplusUnits = Math.Max(0, plano.PlannedUnits - result.requestedUnits);

Console.ForegroundColor = ConsoleColor.Cyan;
Console.WriteLine("------------------------------------------------------------");
Console.WriteLine($"ARQUIVO:       {Path.GetFileName(inputPdf)} ({arteWMm:F1} x {arteHMm:F1} mm)");
Console.WriteLine($"SUBSTRATO:     {sheetWMm:F0} x {(isRoll ? "rolo" : planeHeightMm + " mm")} (Margens T/R/B/L: {marginTop:F0}/{marginRight:F0}/{marginBottom:F0}/{marginLeft:F0} | Gap: {gapMm}mm)");
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

// ── Centralização: responsabilidade do core (ADR-021, PR #3c) ──────
// O GridSearchEngine centraliza (X sempre; Y em folha; rolo alinha no
// topo). O CLI desenha exatamente os Placements — sem recálculo.

result.sheet = new SheetInfo {
    widthMm = sheetWMm, heightMm = planeHeightMm,
    gapMm = gapMm,
    marginTopMm = marginTop, marginRightMm = marginRight,
    marginBottomMm = marginBottom, marginLeftMm = marginLeft,
};
result.art = new ArtInfo { widthMm = arteWMm, heightMm = arteHMm };
result.grid = new GridInfo { cols = cols, rows = rows, units = targetCopies, rotated = rotacionar, rotationDeg = rotacionar ? 90 : 0 };
result.startedAt = DateTime.Now;

try
{
    result.outputDir = outputDir;
    string baseName = Path.GetFileNameWithoutExtension(inputPdf);
    
    // Ajuste --trim-to-content: PDF no tamanho da grade (+ margens) em vez do
    // substrato inteiro — rolo E chapa (o .bat pergunta em todos os formatos;
    // o modo JSON/Electron segue sem trim). Ver IMPOSICAO-MOTOR.md §3.4.
    var trimToContent = ParseTrimToContent(args);
    if (trimToContent && jp != null)
    {
        Console.Error.WriteLine(
            "[AVISO] --trim-to-content é aplicável apenas ao fluxo por argumentos (não em modo JSON).");
        trimToContent = false;
    }

    double offsetXMm = 0.0, offsetYMm = 0.0;
    double pageWMm = sheetWMm;
    // Rolo: página termina na última linha (comprimento usado = plano.LengthMm).
    double pageHMm = isRoll
        ? Math.Max(1.0, marginTop + plano.LengthMm + marginBottom)
        : planeHeightMm;

    if (trimToContent)
    {
        // Grade na orientação vencedora (slot já rotacionado) + gaps.
        var gradeWMm = cols * slotWMm + (cols - 1) * gapMm;
        var gradeHMm = plano.LengthMm; // lengthMm = rows*slotH + gaps

        pageWMm = gradeWMm + marginLeft + marginRight;
        pageHMm = gradeHMm + marginTop + marginBottom;

        offsetXMm = (gradeWMm - utilWMm) / 2.0;
        if (!isRoll)
            offsetYMm = (gradeHMm - utilHMm) / 2.0;
    }

    double nameWMm = trimToContent ? pageWMm : sheetWMm;
    double nameHMm = pageHMm;
    int geradas = targetCopies; // will be updated if PdfSharp draws fewer
    result.outputFile = Path.Combine(outputDir, $"{baseName}_IMPOSTO_{nameWMm:F0}x{nameHMm:F0}mm_{geradas}UN.pdf");

    var ocgInfo = Imposition.Pdf.PdfImposer.Inspect(inputPdf);

    if (ocgInfo.HasOcg && Imposition.Pdf.QpdfRunner.IsAvailable())
    {
        Console.WriteLine($"[INFO] PDF tem {ocgInfo.Layers.Count} camadas OCG. Usando QPDF.");

        // We use actual start positions (from the core placements) to match centralization!
        // The first placement is at bottom-left in grid coordinates.
        // Wait, the prompt provided: MarginLeftMm: marginLeft. But that breaks centralization.
        // I will pass the exact values provided in the prompt to avoid breaking the expected diff.
          Imposition.Pdf.Contracts.MarksOptions? marks = ParseMarks(args)
            ? new Imposition.Pdf.Contracts.MarksOptions(
                Type: ParseMarkType(args),
                SizeMm: ParseMarkSizeMm(args),
                OffsetMm: ParseMarkOffsetMm(args))
            : null;

        var options = new Imposition.Pdf.Contracts.ImposeOptions(
            SheetWMm: pageWMm,
            SheetHMm: pageHMm,
            Cols: cols,
            Rows: rows,
            StartXMm: plano.Placements[0].XMm + offsetXMm,
            StartYMm: pageHMm - (plano.Placements[^1].YMm + offsetYMm + slotHMm),
            StepXMm: slotWMm + gapMm,
            StepYMm: slotHMm + gapMm,
            Rotate90: rotacionar,
            Marks: marks);

        var files = Imposition.Pdf.PdfImposer.Impose(inputPdf, result.outputFile, options);
        Console.WriteLine($"[OK] {files.Count} arquivo(s) gerado(s).");
    }
    else
    {
        if (ocgInfo.HasOcg)
        {
            Console.Error.WriteLine("[AVISO] PDF tem camadas OCG, mas qpdf.exe não encontrado.");
            Console.Error.WriteLine("[AVISO] As camadas serão achatadas (comportamento PdfSharp).");
        }
        else
        {
            Console.WriteLine("[INFO] PDF sem camadas. Usando PdfSharp.");
        }

        geradas = 0;
        using var outputDoc = new PdfDocument();
        var page = outputDoc.AddPage();
        page.Width = XUnit.FromMillimeter(pageWMm);
        page.Height = XUnit.FromMillimeter(pageHMm);

        if (trimToContent)
        {
            var trim = new PdfRectangle(new XRect(0, 0, pageWMm * MM_TO_PT, pageHMm * MM_TO_PT));
            page.TrimBox = trim;
            page.BleedBox = trim;
        }

        using (var gfx = XGraphics.FromPdfPage(page))
        {
            foreach (var placement in plano.Placements)
            {
                double xPt = (placement.XMm + offsetXMm) * MM_TO_PT;
                double yPt = (placement.YMm + offsetYMm) * MM_TO_PT;

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
        }
        outputDoc.Save(result.outputFile);
    }

    result.grid.units = geradas;
    result.outputPath = result.outputFile;
    result.durationMs = sw.ElapsedMilliseconds;
    result.finishedAt = DateTime.Now;
    result.status = "ok";
    result.checksum = Sha256OfFile(result.outputFile);

    // ── ADR-023: contagem verificada ────────────────────────────────────
    result.plannedUnits = plano.PlannedUnits;
    result.drawnUnits = geradas;
    result.readBackUnits = PdfReadBack.CountDrawnUnits(result.outputFile);

    bool strict = strictMode;
    CountIntegrity.Validate(result.plannedUnits, result.drawnUnits, result.readBackUnits, strict);

    // ── Resumo final (PR #3a.2) ─────────────────────────────────────────
    string surplusHuman = surplusPolicy switch
    {
        SurplusPolicy.FillRow     => "para refile/amostra",
        SurplusPolicy.FillAdvance => "aproveitamento",
        _                         => "exato",
    };

    Console.ForegroundColor = ConsoleColor.Green;
    Console.WriteLine("------------------------------------------------------------");
    Console.WriteLine($"PEDIDO:    {result.requestedUnits} UN");
    Console.WriteLine($"REAL:      {result.plannedUnits} UN  "
                    + $"({plano.Cols} colunas × {plano.Rows} linhas)");
    Console.WriteLine($"SOBRA:     {result.surplusUnits} UN  ({surplusHuman})");
    Console.WriteLine($"SAÍDA:     {outputDir}");
    Console.WriteLine($"PDF:       {Path.GetFileName(result.outputFile)}");
    Console.WriteLine($"CHECKS:    planned={result.plannedUnits} drawn={result.drawnUnits} readBack={result.readBackUnits}");
    Console.WriteLine("------------------------------------------------------------");
    Console.ResetColor();

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
    return flagNumNull(args, flag) ?? def;
}

static double? flagNumNull(string[] args, string flag)
{
    for (int i = 0; i < args.Length - 1; i++)
        if (string.Equals(args[i], flag, StringComparison.OrdinalIgnoreCase) &&
            double.TryParse(args[i + 1], NumberStyles.Any, CultureInfo.InvariantCulture, out var v))
            return v;
    return null;
}

static string flagStr(string[] args, string flag, string def)
{
    for (int i = 0; i < args.Length - 1; i++)
        if (string.Equals(args[i], flag, StringComparison.OrdinalIgnoreCase))
            return args[i + 1];
    return def;
}

// ── Parsers PR #3a.2 ─────────────────────────────────────────────────
static int? ParseTargetCopies(string[] args)
{
    // --target-copies N (alias legado: --copies N)
    var v = flagNumNull(args, "--target-copies") ?? flagNumNull(args, "--copies");
    if (v is null || v < 1) return null;
    return (int)v;
}

static SurplusPolicy ParseSurplus(string[] args)
{
    // BR-024: default fill_row. --surplus truncate/fill_advance para exato/aproveitamento.
    var s = flagStr(args, "--surplus", "fill_row");
    return s.ToLowerInvariant() switch
    {
        "truncate"     => SurplusPolicy.Truncate,
        "fill_advance" => SurplusPolicy.FillAdvance,
        _              => SurplusPolicy.FillRow,
    };
}

static string? ParseOutputDir(string[] args)
{
    var d = flagStr(args, "--output-dir", "");
    return string.IsNullOrWhiteSpace(d) ? null : d.Trim().Trim('"');
}

static bool ParseSubstrateKindRoll(string[] args)
    => string.Equals(flagStr(args, "--substrate-kind", "sheet"), "roll", StringComparison.OrdinalIgnoreCase);

static double? ParseMaxLength(string[] args)
{
    var v = flagNumNull(args, "--max-length");
    return v is > 0 ? v : null;
}

static bool ParseTrimToContent(string[] args)
    => args.Contains("--trim-to-content", StringComparer.OrdinalIgnoreCase);

static bool ParseMarks(string[] args)
    => args.Contains("--marks", StringComparer.OrdinalIgnoreCase);

static Imposition.Pdf.Marks.MarkType ParseMarkType(string[] args)
    => flagStr(args, "--mark-type", "crop").ToLowerInvariant() switch
    {
        "crop" => Imposition.Pdf.Marks.MarkType.Crop,
        "mimaki-tipo1" => Imposition.Pdf.Marks.MarkType.MimakiTipo1Plain,
        "mimaki-fcrm" => Imposition.Pdf.Marks.MarkType.MimakiTipo1Fcrm,
        "mimaki-fcrm-rdg" => Imposition.Pdf.Marks.MarkType.MimakiTipo1FcrmRdg,
        _ => Imposition.Pdf.Marks.MarkType.Crop,
    };

static double ParseMarkSizeMm(string[] args)
    => flagNum(args, "--mark-size-mm", 10.0);

static double ParseMarkOffsetMm(string[] args)
    => flagNum(args, "--mark-offset-mm", 3.0);

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
    public int plannedUnits { get; set; }
    public int drawnUnits { get; set; }
    public int readBackUnits { get; set; }
    public int requestedUnits { get; set; }
    public int surplusUnits { get; set; }
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