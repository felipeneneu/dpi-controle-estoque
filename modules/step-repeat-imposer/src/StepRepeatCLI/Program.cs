using StepRepeatEngine.Geometry;
using StepRepeatPdf;

namespace StepRepeatCLI;

public static class Program
{
    public static int Main(string[] args)
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        Console.Title = "GraficaOS - Step & Repeat Imposer CLI";

        Console.WriteLine("=================================================");
        Console.WriteLine(" GraficaOS - Step & Repeat Imposer CLI v1.0");
        Console.WriteLine(" Evolução do AutoImposerCLI (Controle Total)");
        Console.WriteLine("=================================================");

        string? inputPdf = null;
        string outputPdf = "saida_imposicao.pdf";
        string jobName = "Imposição Comercial";
        string customerName = "GraficaOS Client";
        string side = "Frente";

        double sheetWidth = 330.0;
        double sheetHeight = 483.0;
        double? itemWidth = null;
        double? itemHeight = null;
        double gutterX = 4.0;
        double gutterY = 4.0;
        double bleed = 3.0;
        double gripperMargin = 15.0;
        double sideGuideMargin = 15.0;
        RotationMode rotationMode = RotationMode.AutoBestFit;

        // Toggles de Marcas Inteligentes
        bool drawCropMarks = true;
        bool drawColorBar = true;
        bool drawSlugline = true;
        bool drawKnockout = true;
        bool drawGripperAndGuide = false; // Padrão FALSO para não sujar impresso digital
        bool useTrimBox = true;

        if (args.Length > 0)
        {
            if (!args[0].StartsWith("-"))
            {
                inputPdf = args[0].Trim('"');
            }

            for (int i = 0; i < args.Length; i++)
            {
                string arg = args[i];
                if ((arg == "--input" || arg == "-i") && i + 1 < args.Length) inputPdf = args[++i].Trim('"');
                else if ((arg == "--out" || arg == "-o") && i + 1 < args.Length) outputPdf = args[++i].Trim('"');
                else if (arg == "--job" && i + 1 < args.Length) jobName = args[++i];
                else if (arg == "--customer" && i + 1 < args.Length) customerName = args[++i];
                else if (arg == "--side" && i + 1 < args.Length) side = args[++i];
                else if (arg == "--sheet-width" && i + 1 < args.Length) sheetWidth = double.Parse(args[++i]);
                else if (arg == "--sheet-height" && i + 1 < args.Length) sheetHeight = double.Parse(args[++i]);
                else if (arg == "--item-width" && i + 1 < args.Length) itemWidth = double.Parse(args[++i]);
                else if (arg == "--item-height" && i + 1 < args.Length) itemHeight = double.Parse(args[++i]);
                else if (arg == "--gutter-x" && i + 1 < args.Length) gutterX = double.Parse(args[++i]);
                else if (arg == "--gutter-y" && i + 1 < args.Length) gutterY = double.Parse(args[++i]);
                else if (arg == "--bleed" && i + 1 < args.Length) bleed = double.Parse(args[++i]);
                else if (arg == "--gripper" && i + 1 < args.Length) gripperMargin = double.Parse(args[++i]);
                else if (arg == "--no-cropmarks") drawCropMarks = false;
                else if (arg == "--no-colorbar") drawColorBar = false;
                else if (arg == "--no-slugline") drawSlugline = false;
                else if (arg == "--draw-guide") drawGripperAndGuide = true;
                else if (arg == "--no-trimbox") useTrimBox = false;
                else if (arg == "--rotate" && i + 1 < args.Length)
                {
                    string rotStr = args[++i].ToLowerInvariant();
                    if (rotStr == "auto") rotationMode = RotationMode.AutoBestFit;
                    else if (rotStr == "0" || rotStr == "normal") rotationMode = RotationMode.Normal0;
                    else if (rotStr == "90") rotationMode = RotationMode.Rotate90;
                }
            }
        }

        if (args.Length == 0 || args.Contains("--interactive") || args.Contains("-ui") || (args.Length == 1 && File.Exists(inputPdf)))
        {
            if (string.IsNullOrEmpty(inputPdf))
            {
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.Write("\n📁 Arraste e solte o arquivo PDF aqui (ou aperte ENTER para modo demo): ");
                Console.ResetColor();
                string? rawInput = Console.ReadLine()?.Trim('"');
                if (!string.IsNullOrWhiteSpace(rawInput))
                {
                    inputPdf = rawInput;
                }
            }

            if (!string.IsNullOrEmpty(inputPdf) && !File.Exists(inputPdf))
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine($"[ERRO] O arquivo especificado não existe: {inputPdf}");
                Console.ResetColor();
                return 1;
            }

            Console.WriteLine("\n-------------------------------------------------");
            Console.WriteLine(" 🛠️  CONFIGURAÇÃO COMPLETA DA IMPOSIÇÃO STEP & REPEAT");
            Console.WriteLine("-------------------------------------------------");

            // 1. Folha/Chapa
            Console.WriteLine("1. Selecione o Tamanho da Folha/Chapa:");
            Console.WriteLine("   [1] A3+ (330 x 483 mm) - Padrão Digital");
            Console.WriteLine("   [2] Meia Folha / Chapa (660 x 960 mm)");
            Console.WriteLine("   [3] B2 (500 x 700 mm)");
            Console.WriteLine("   [4] Customizado (Digitar Largura x Altura em mm)");
            Console.Write("   Opção [Padrão 1]: ");
            string? sheetOpt = Console.ReadLine()?.Trim();
            if (sheetOpt == "2") { sheetWidth = 660; sheetHeight = 960; }
            else if (sheetOpt == "3") { sheetWidth = 500; sheetHeight = 700; }
            else if (sheetOpt == "4")
            {
                Console.Write("   -> Largura da folha (mm): ");
                sheetWidth = double.Parse(Console.ReadLine()!);
                Console.Write("   -> Altura da folha (mm): ");
                sheetHeight = double.Parse(Console.ReadLine()!);
            }

            // 2. Controle de TrimBox / Recorte de Marcas Antigas
            if (!string.IsNullOrEmpty(inputPdf))
            {
                Console.WriteLine("\n2. Modo de Leitura do PDF do Cliente:");
                Console.WriteLine("   [1] Usar TrimBox e recortar marcas antigas do cliente [Padrão]");
                Console.WriteLine("   [2] Manter folha completa do cliente (MediaBox)");
                Console.WriteLine("   [3] Digitar dimensões manuais da peça (mm)");
                Console.Write("   Opção [Padrão 1]: ");
                string? trimOpt = Console.ReadLine()?.Trim();
                if (trimOpt == "2")
                {
                    useTrimBox = false;
                }
                else if (trimOpt == "3")
                {
                    Console.Write("   -> Largura da peça em mm: ");
                    itemWidth = double.Parse(Console.ReadLine()!);
                    Console.Write("   -> Altura da peça em mm: ");
                    itemHeight = double.Parse(Console.ReadLine()!);
                }
            }

            // 3. Modo de Rotação
            Console.WriteLine("\n3. Modo de Rotação e Otimização:");
            Console.WriteLine("   [1] AutoBestFit - Escolher automaticamente a rotação com MAIOR aproveitamento [Padrão]");
            Console.WriteLine("   [2] Manter Orientação Original (0°)");
            Console.WriteLine("   [3] Forçar Rotação de 90°");
            Console.Write("   Opção [Padrão 1]: ");
            string? rotOpt = Console.ReadLine()?.Trim();
            if (rotOpt == "2") rotationMode = RotationMode.Normal0;
            else if (rotOpt == "3") rotationMode = RotationMode.Rotate90;

            // 4. Calhas e Sangrias
            Console.Write("\n4. Calha X entre peças (mm) [Padrão 4.0]: ");
            string? gxStr = Console.ReadLine()?.Trim();
            if (!string.IsNullOrEmpty(gxStr)) gutterX = double.Parse(gxStr);

            Console.Write("   Calha Y entre peças (mm) [Padrão 4.0]: ");
            string? gyStr = Console.ReadLine()?.Trim();
            if (!string.IsNullOrEmpty(gyStr)) gutterY = double.Parse(gyStr);

            Console.Write("   Sangria por peça (mm) [Padrão 3.0]: ");
            string? bStr = Console.ReadLine()?.Trim();
            if (!string.IsNullOrEmpty(bStr)) bleed = double.Parse(bStr);

            Console.Write("   Margem de Pinagem/Gripper (mm) [Padrão 15.0]: ");
            string? grStr = Console.ReadLine()?.Trim();
            if (!string.IsNullOrEmpty(grStr)) gripperMargin = double.Parse(grStr);

            // 5. MARCAS INTELIGENTES (TOGGLES LIGA/DESLIGA)
            Console.WriteLine("\n5. Controle de Marcas de Imposição (Sim / Não):");

            Console.Write("   • Desenhar Marcas de Corte (CropMarks)? [S/n]: ");
            string? cmIn = Console.ReadLine()?.Trim().ToLower();
            if (cmIn == "n" || cmIn == "nao" || cmIn == "não") drawCropMarks = false;

            Console.Write("   • Desenhar Barra de Cores CMYK (ColorBar)? [S/n]: ");
            string? cbIn = Console.ReadLine()?.Trim().ToLower();
            if (cbIn == "n" || cbIn == "nao" || cbIn == "não") drawColorBar = false;

            Console.Write("   • Desenhar Slugline (Nome/Data/N-UP)? [S/n]: ");
            string? slIn = Console.ReadLine()?.Trim().ToLower();
            if (slIn == "n" || slIn == "nao" || slIn == "não") drawSlugline = false;

            Console.Write("   • Desenhar Fundo Branco Knockout sob marcas? [S/n]: ");
            string? koIn = Console.ReadLine()?.Trim().ToLower();
            if (koIn == "n" || koIn == "nao" || koIn == "não") drawKnockout = false;

            Console.Write("   • Imprimir Linhas Tracejadas de Pinagem/Guia Lateral? [s/N]: ");
            string? guIn = Console.ReadLine()?.Trim().ToLower();
            if (guIn == "s" || guIn == "sim") drawGripperAndGuide = true;

            // 6. Metadados do Job
            Console.Write("\n6. Nome do Trabalho / OS [Padrão 'Imposição Comercial']: ");
            string? jobInput = Console.ReadLine()?.Trim();
            if (!string.IsNullOrEmpty(jobInput)) jobName = jobInput;

            Console.Write("   Nome do Cliente [Padrão 'GraficaOS Client']: ");
            string? custInput = Console.ReadLine()?.Trim();
            if (!string.IsNullOrEmpty(custInput)) customerName = custInput;

            Console.Write("\n7. Nome da pasta/arquivo de saída [Padrão 'saida_imposicao.pdf']: ");
            string? outStr = Console.ReadLine()?.Trim('"');
            if (!string.IsNullOrEmpty(outStr)) outputPdf = outStr;
        }

        Console.WriteLine("\n-------------------------------------------------");
        Console.WriteLine("[INFO] PROCESSANDO IMPOSIÇÃO E MARCAS...");
        if (!string.IsNullOrEmpty(inputPdf)) Console.WriteLine($"       PDF Entrada: {Path.GetFullPath(inputPdf)}");
        Console.WriteLine($"       Folha: {sheetWidth} x {sheetHeight} mm");
        Console.WriteLine($"       Calhas X/Y: {gutterX}/{gutterY} mm | Sangria: {bleed} mm");

        var markOpts = new SmartMarkOptions(
            DrawCropMarks: drawCropMarks,
            DrawColorBar: drawColorBar,
            DrawSlugline: drawSlugline,
            DrawKnockoutUnderlay: drawKnockout,
            DrawGripperAndSideGuide: drawGripperAndGuide
        );

        var request = new StepRepeatRequest(
            SheetWidthMm: sheetWidth,
            SheetHeightMm: sheetHeight,
            ItemWidthMm: itemWidth,
            ItemHeightMm: itemHeight,
            GutterXMm: gutterX,
            GutterYMm: gutterY,
            BleedMm: bleed,
            GripperMarginMm: gripperMargin,
            SideGuideMarginMm: sideGuideMargin,
            JobName: jobName,
            CustomerName: customerName,
            Side: side,
            InputPdfPath: inputPdf,
            OutputPdfPath: outputPdf,
            RotationMode: rotationMode,
            UseTrimBox: useTrimBox,
            SmartMarkOptions: markOpts
        );

        var execResult = StepRepeatPdfComposer.Compose(request);
        var dirs = execResult.SessionDirs;
        var g = execResult.GridResult;

        string rotNotice = g.IsRotated90 ? " (Com Rotação Automática de 90° aplicada)" : " (Orientação Normal 0°)";

        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine("\n-------------------------------------------------");
        Console.WriteLine($"[SUCESSO] IMPOSIÇÃO E ESTRUTURA DE PASTAS GERADAS!");
        Console.WriteLine($"          Aproveitamento: {g.TotalUp}-UP ({g.Columns} colunas x {g.Rows} linhas){rotNotice}");

        if (execResult.BoxInfo != null)
        {
            string trimNotice = useTrimBox ? "TrimBox recortado (marcas do cliente removidas)" : "MediaBox integral mantido";
            Console.WriteLine($"          Medição: {execResult.BoxInfo.EffectiveWidthMm:F1} x {execResult.BoxInfo.EffectiveHeightMm:F1} mm [{trimNotice}]");
        }

        Console.WriteLine("\n📁 ESTRUTURA DE PASTAS GERADA (TIMESTAMP):");
        Console.WriteLine($"   ├── [AC]             -> {dirs.OriginalCopiedPath}");
        Console.WriteLine($"   ├── [Desenvolvimento]-> {dirs.PretreatedPdfPath}");
        Console.WriteLine($"   └── [Saida]          -> {dirs.ImposedPdfPath}");
        Console.WriteLine("=================================================");
        Console.ResetColor();

        return 0;
    }
}
