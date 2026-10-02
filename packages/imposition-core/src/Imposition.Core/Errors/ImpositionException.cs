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
}
