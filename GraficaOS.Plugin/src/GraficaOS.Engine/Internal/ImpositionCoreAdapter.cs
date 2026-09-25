using Imposition.Core.Contracts;
using Imposition.Core.Geometry;
using Imposition.Core.Grid;
using Imposition.Pdf;
using Imposition.Pdf.Contracts;
using Imposition.Pdf.Marks;

namespace GraficaOS.Engine.Internal;

/// <summary>
/// Camada de adaptação entre os DTOs públicos do COM e os tipos internos
/// do Imposition.Core e Imposition.Pdf. Este é o ÚNICO arquivo que conhece
/// os tipos reais do motor — todo acoplamento fica isolado aqui.
/// </summary>
internal static class ImpositionCoreAdapter
{
    private const double DefaultToleranceMm = 0.1;
    private const double DefaultRegisterMm = 0.1;

    /// <summary>
    /// Executa o planejamento de grade via GridSearchEngine.Plan().
    /// Retorna o resultado do motor e as opções de imposição PDF pré-construídas.
    /// </summary>
    internal static (ImpositionResult Result, ImposeOptions PdfOptions) Plan(ImposeRequestDto request)
    {
        var input = BuildInput(request);
        var result = GridSearchEngine.Plan(input);

        var pdfOptions = BuildPdfOptions(request, result);
        return (result, pdfOptions);
    }

    /// <summary>
    /// Gera o PDF imposto usando PdfImposer.Impose().
    /// Retorna a lista de arquivos de saída.
    /// </summary>
    internal static IReadOnlyList<string> Impose(
        string inputPath,
        string outputPath,
        ImposeOptions options)
    {
        return PdfImposer.Impose(inputPath, outputPath, options);
    }

    /// <summary>
    /// Inspeciona um PDF para verificar camadas OCG.
    /// </summary>
    internal static OcgInfo Inspect(string pdfPath)
    {
        return PdfImposer.Inspect(pdfPath);
    }

    /// <summary>Converte ImposeRequestDto → ImpositionInput do motor.</summary>
    private static ImpositionInput BuildInput(ImposeRequestDto req)
    {
        var kind = ParseSubstrateKind(req.SubstrateKind);
        var margins = req.Margins ?? new MarginsDto();

        return new ImpositionInput(
            Substrate: new SubstrateSpec(
                Kind: kind,
                WidthMm: req.SheetWMm,
                InitialLengthMm: req.SheetHMm,
                MaxLengthMm: kind == SubstrateKind.Roll ? req.MaxLengthMm : null,
                ToleranceMm: DefaultToleranceMm,
                RegisterMm: DefaultRegisterMm),
            Piece: new PieceSpec(req.ArtWMm, req.ArtHMm),
            Gap: new GapSpec(req.GapMm, req.GapMm),
            Margin: new MarginSpec(margins.Left, margins.Right, margins.Top, margins.Bottom),
            TargetCopies: req.TargetCopies,
            SurplusPolicy: ParseSurplusPolicy(req.SurplusPolicy),
            ScalePolicy: ScalePolicy.Reject,
            ForcedOrientation: ParseOrientation(req.ForceRotation),
            ForcedCols: null);
    }

    /// <summary>Constrói ImposeOptions a partir do resultado do plano.</summary>
    private static ImposeOptions BuildPdfOptions(ImposeRequestDto req, ImpositionResult result)
    {
        var rotated = result.Orientation == Orientation.Landscape;
        var pieceW = rotated ? req.ArtHMm : req.ArtWMm;
        var pieceH = rotated ? req.ArtWMm : req.ArtHMm;

        // StartX/Y do primeiro placement (o motor já calcula centralizado)
        var startX = result.Placements.Count > 0 ? result.Placements[0].XMm : 0;
        var startY = result.Placements.Count > 0 ? result.Placements[0].YMm : 0;

        return new ImposeOptions(
            SheetWMm: req.SheetWMm,
            SheetHMm: result.LengthMm,
            Cols: result.Cols,
            Rows: result.Rows,
            StartXMm: startX,
            StartYMm: startY,
            StepXMm: pieceW + req.GapMm,
            StepYMm: pieceH + req.GapMm,
            Rotate90: rotated,
            Marks: BuildMarksOptions(req.Marks));
    }

    /// <summary>Converte MarksDto → MarksOptions do motor.</summary>
    private static MarksOptions? BuildMarksOptions(MarksDto? marks)
    {
        if (marks is null || !marks.Enabled)
            return null;

        var markType = marks.Type?.ToLowerInvariant() switch
        {
            "mimaki-fcrm" => MarkType.MimakiTipo1Fcrm,
            "mimaki-plain" => MarkType.MimakiTipo1Plain,
            "mimaki-fcrm-rdg" => MarkType.MimakiTipo1FcrmRdg,
            "crop" => MarkType.Crop,
            _ => MarkType.MimakiTipo1Fcrm,
        };

        return new MarksOptions(
            Type: markType,
            SizeMm: marks.SizeMm,
            OffsetMm: marks.OffsetMm);
    }

    // ── Helpers de parsing ────────────────────────────────────────────

    private static SubstrateKind ParseSubstrateKind(string? kind) =>
        kind?.ToLowerInvariant() switch
        {
            "roll" => SubstrateKind.Roll,
            _ => SubstrateKind.Sheet,
        };

    private static SurplusPolicy ParseSurplusPolicy(string? policy) =>
        policy?.ToLowerInvariant() switch
        {
            "cut_exact" => SurplusPolicy.Truncate,
            _ => SurplusPolicy.FillRow,
        };

    private static Orientation? ParseOrientation(string? rotation) =>
        rotation?.ToLowerInvariant() switch
        {
            "portrait" => Orientation.Portrait,
            "landscape" => Orientation.Landscape,
            _ => null,
        };

    // ── Conversão Result → DTOs ───────────────────────────────────────

    /// <summary>Converte ImpositionResult do motor → DTOs públicos do COM.</summary>
    internal static ImposeResponseDto ToResponse(
        ImposeRequestDto request,
        ImpositionResult result,
        long elapsedMs,
        IReadOnlyList<string>? outputFiles = null)
    {
        var rotated = result.Orientation == Orientation.Landscape;

        var placements = result.Placements
            .Select(p => new PlacementDto(
                Index: p.Index,
                Col: p.Col,
                Row: p.Row,
                XMm: Math.Round(p.XMm, 2),
                YMm: Math.Round(p.YMm, 2),
                WidthMm: Math.Round(p.WidthMm, 2),
                HeightMm: Math.Round(p.HeightMm, 2),
                Rotated: p.RotationDegrees != 0))
            .ToList();

        return new ImposeResponseDto(
            SchemaVersion: "1.0",
            RequestId: request.RequestId,
            Success: true,
            ErrorCode: null,
            Message: $"Imposição calculada: {result.Cols}×{result.Rows} = {result.PlannedUnits} unidades.",
            ExecutionTimeMs: elapsedMs,
            Sheet: new SheetDto(
                WidthMm: Math.Round(request.SheetWMm, 2),
                HeightMm: Math.Round(result.LengthMm, 2)),
            Grid: new GridDto(
                Cols: result.Cols,
                Rows: result.Rows,
                PlannedUnits: result.PlannedUnits,
                RequestedUnits: request.TargetCopies,
                SurplusUnits: result.Surplus,
                RotationDeg: (int)result.Orientation),
            OutputFiles: outputFiles,
            Placements: placements,
            Options: null);
    }

    /// <summary>
    /// Calcula a melhor grade e capacidade máxima para chapa com tolerância física.
    /// Fonte única alinhada à Regra 1 do AGENTS.md e ao ImpositionBridge.
    /// </summary>
    internal static (int Cols, int Rows, int Capacity, Orientation Orientation) BestGrid(ImposeRequestDto req)
    {
        var tol = Math.Max(DefaultToleranceMm, DefaultRegisterMm);
        var margins = req.Margins ?? new MarginsDto();
        var utilW = req.SheetWMm - margins.Left - margins.Right;
        var utilH = req.SheetHMm - margins.Top - margins.Bottom;

        (int Cols, int Rows) Cap(double pW, double pH) => (
            (int)Math.Floor((utilW + req.GapMm + tol) / (pW + req.GapMm)),
            (int)Math.Floor((utilH + req.GapMm + tol) / (pH + req.GapMm)));

        var portrait = Cap(req.ArtWMm, req.ArtHMm);
        var landscape = Cap(req.ArtHMm, req.ArtWMm);

        var forced = ParseOrientation(req.ForceRotation);
        return forced switch
        {
            Orientation.Portrait => (portrait.Cols, portrait.Rows, portrait.Cols * portrait.Rows, Orientation.Portrait),
            Orientation.Landscape => (landscape.Cols, landscape.Rows, landscape.Cols * landscape.Rows, Orientation.Landscape),
            _ => (portrait.Cols * portrait.Rows >= landscape.Cols * landscape.Rows)
                ? (portrait.Cols, portrait.Rows, portrait.Cols * portrait.Rows, Orientation.Portrait)
                : (landscape.Cols, landscape.Rows, landscape.Cols * landscape.Rows, Orientation.Landscape)
        };
    }

    /// <summary>
    /// Gera resposta de overflow a partir da capacidade máxima calculada.
    /// </summary>
    internal static ImposeResponseDto ToOverflowResponse(
        ImposeRequestDto request,
        (int Cols, int Rows, int Capacity, Orientation Orientation) best,
        long elapsedMs)
    {
        var maxPerSheet = best.Capacity;
        var needed = request.TargetCopies;

        if (maxPerSheet <= 0)
        {
            return new ImposeResponseDto(
                SchemaVersion: "1.0",
                RequestId: request.RequestId,
                Success: false,
                ErrorCode: "E_GRID_OVERFLOW",
                Message: $"A arte {request.ArtWMm}×{request.ArtHMm}mm (com gap) não cabe na chapa {request.SheetWMm}×{request.SheetHMm}mm.",
                ExecutionTimeMs: elapsedMs,
                Sheet: new SheetDto(
                    WidthMm: Math.Round(request.SheetWMm, 2),
                    HeightMm: Math.Round(request.SheetHMm, 2)),
                Grid: new GridDto(
                    Cols: best.Cols,
                    Rows: best.Rows,
                    PlannedUnits: 0,
                    RequestedUnits: needed,
                    SurplusUnits: 0,
                    RotationDeg: (int)best.Orientation),
                OutputFiles: null,
                Placements: null,
                Options: new List<OverflowOptionDto>());
        }

        var sheetsForAll = (int)Math.Ceiling((double)needed / maxPerSheet);

        var options = new List<OverflowOptionDto>
        {
            new("OPTION_1",
                $"1 chapa com {maxPerSheet} unidades (máximo possível)",
                Sheets: 1,
                TotalUnits: maxPerSheet),

            new("OPTION_2",
                $"{sheetsForAll} chapa(s) × {maxPerSheet} unidades = {sheetsForAll * maxPerSheet} total",
                Sheets: sheetsForAll,
                TotalUnits: sheetsForAll * maxPerSheet),

            new("OPTION_3",
                $"{sheetsForAll} chapa(s) balanceadas ≈ {(int)Math.Ceiling((double)needed / sheetsForAll)} cada",
                Sheets: sheetsForAll,
                TotalUnits: needed),
        };

        return new ImposeResponseDto(
            SchemaVersion: "1.0",
            RequestId: request.RequestId,
            Success: false,
            ErrorCode: "E_GRID_OVERFLOW",
            Message: $"Grade comporta {maxPerSheet} unidades ({best.Cols}×{best.Rows}), mas foram solicitadas {needed}.",
            ExecutionTimeMs: elapsedMs,
            Sheet: new SheetDto(
                WidthMm: Math.Round(request.SheetWMm, 2),
                HeightMm: Math.Round(request.SheetHMm, 2)),
            Grid: new GridDto(
                Cols: best.Cols,
                Rows: best.Rows,
                PlannedUnits: best.Capacity,
                RequestedUnits: needed,
                SurplusUnits: 0,
                RotationDeg: (int)best.Orientation),
            OutputFiles: null,
            Placements: null,
            Options: options);
    }

    /// <summary>
    /// Gera resposta de overflow com 3 opções quando a grade não comporta
    /// todas as cópias solicitadas em uma única chapa.
    /// </summary>
    internal static ImposeResponseDto ToOverflowResponse(
        ImposeRequestDto request,
        ImpositionResult result,
        long elapsedMs)
    {
        var maxPerSheet = result.Cols * result.Rows;
        var needed = request.TargetCopies;

        if (maxPerSheet <= 0)
        {
            return new ImposeResponseDto(
                SchemaVersion: "1.0",
                RequestId: request.RequestId,
                Success: false,
                ErrorCode: "E_GRID_OVERFLOW",
                Message: $"A arte {request.ArtWMm}×{request.ArtHMm}mm (com gap) não cabe na chapa {request.SheetWMm}×{request.SheetHMm}mm.",
                ExecutionTimeMs: elapsedMs,
                Sheet: new SheetDto(
                    WidthMm: Math.Round(request.SheetWMm, 2),
                    HeightMm: Math.Round(result.LengthMm, 2)),
                Grid: new GridDto(
                    Cols: result.Cols,
                    Rows: result.Rows,
                    PlannedUnits: result.PlannedUnits,
                    RequestedUnits: needed,
                    SurplusUnits: result.Surplus,
                    RotationDeg: (int)result.Orientation),
                OutputFiles: null,
                Placements: null,
                Options: new List<OverflowOptionDto>());
        }

        var sheetsForAll = (int)Math.Ceiling((double)needed / maxPerSheet);

        var options = new List<OverflowOptionDto>
        {
            // OPTION_1: 1 chapa no máximo
            new("OPTION_1",
                $"1 chapa com {maxPerSheet} unidades (máximo possível)",
                Sheets: 1,
                TotalUnits: maxPerSheet),

            // OPTION_2: N chapas completas
            new("OPTION_2",
                $"{sheetsForAll} chapa(s) × {maxPerSheet} unidades = {sheetsForAll * maxPerSheet} total",
                Sheets: sheetsForAll,
                TotalUnits: sheetsForAll * maxPerSheet),

            // OPTION_3: N chapas balanceadas
            new("OPTION_3",
                $"{sheetsForAll} chapa(s) balanceadas ≈ {(int)Math.Ceiling((double)needed / sheetsForAll)} cada",
                Sheets: sheetsForAll,
                TotalUnits: needed),
        };

        return new ImposeResponseDto(
            SchemaVersion: "1.0",
            RequestId: request.RequestId,
            Success: false,
            ErrorCode: "E_GRID_OVERFLOW",
            Message: $"Grade comporta {maxPerSheet} unidades, mas foram solicitadas {needed}.",
            ExecutionTimeMs: elapsedMs,
            Sheet: new SheetDto(
                WidthMm: Math.Round(request.SheetWMm, 2),
                HeightMm: Math.Round(result.LengthMm, 2)),
            Grid: new GridDto(
                Cols: result.Cols,
                Rows: result.Rows,
                PlannedUnits: result.PlannedUnits,
                RequestedUnits: needed,
                SurplusUnits: result.Surplus,
                RotationDeg: (int)result.Orientation),
            OutputFiles: null,
            Placements: null,
            Options: options);
    }
}
