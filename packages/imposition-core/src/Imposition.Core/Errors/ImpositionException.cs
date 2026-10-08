namespace Imposition.Core.Errors;

/// <summary>
/// Regra 9 do AGENTS.md: toda falha tem código (E_*) e mensagem.
/// Nunca retorna null silencioso.
/// </summary>
public sealed class ImpositionException : Exception
{
    public string Code { get; }

    public ImpositionException(string code, string message, Exception? inner = null)
        : base(message, inner)
    {
        Code = code;
    }
}

public static class ErrorCodes
{
    public const string GridOverflow         = "E_GRID_OVERFLOW";
    public const string InvalidTolerance     = "E_INVALID_TOLERANCE";
    public const string InvalidSubstrate     = "E_INVALID_SUBSTRATE";
    public const string InvalidPiece         = "E_INVALID_PIECE";
    public const string InvalidTarget        = "E_INVALID_TARGET";
    public const string DuplexNested         = "E_DUPLEX_NESTED";
    public const string NotImplemented       = "E_NOT_IMPLEMENTED";
    public const string InvalidSluglineInput           = "E_INVALID_SLUGLINE_INPUT";
    public const string InvalidSeamsInput              = "E_INVALID_SEAMS_INPUT";
    public const string SeamsOverlapExceedsRoll        = "E_SEAMS_OVERLAP_EXCEEDS_ROLL";
    public const string SeamsArtworkExceedsMaxPanels   = "E_SEAMS_ARTWORK_EXCEEDS_MAX_PANELS";
    public const string InvalidRoll                    = "E_INVALID_ROLL";
    public const string RollNotFound                   = "E_ROLL_NOT_FOUND";
    public const string RollUsableWidthInvalid         = "E_ROLL_USABLE_WIDTH_INVALID";
    public const string InvalidGuideLine               = "E_INVALID_GUIDE_LINE";
    public const string PreviewInputNotFound           = "E_PREVIEW_INPUT_NOT_FOUND";
    public const string InvalidPreviewInput            = "E_INVALID_PREVIEW_INPUT";
    public const string ExportSourceNotCmyk            = "E_EXPORT_SOURCE_NOT_CMYK";
    public const string InvalidExportInput             = "E_INVALID_EXPORT_INPUT";
    public const string SourceHasOcg                   = "E_SOURCE_HAS_OCG";
    public const string InvalidIccProfile              = "E_INVALID_ICC_PROFILE";
    public const string OperationCanceled              = "E_OPERATION_CANCELED";
    public const string InputNotFound                  = "E_INPUT_NOT_FOUND";
    public const string InvalidArgument                = "E_INVALID_ARGUMENT";
    public const string InvalidDimension               = "E_INVALID_DIMENSION";
    public const string InvalidOverlap                 = "E_INVALID_OVERLAP";
    public const string FormatMismatch                 = "E_FORMAT_MISMATCH";
    public const string RollTooNarrow                  = "E_ROLL_TOO_NARROW";
    public const string PdfxNonCompliant               = "E_PDFX_NON_COMPLIANT";
    public const string IoError                        = "E_IO_ERROR";
    public const string AccessDenied                   = "E_ACCESS_DENIED";
    public const string PdfMultiPageUnsupported        = "E_PDF_MULTI_PAGE_UNSUPPORTED";
    public const string PdfTransparencyUnsupported     = "E_PDF_TRANSPARENCY_UNSUPPORTED";
    public const string PdfUserUnitUnsupported         = "E_PDF_USERUNIT_UNSUPPORTED";
    public const string PdfInvalidTrailer              = "E_PDF_INVALID_TRAILER";
}
