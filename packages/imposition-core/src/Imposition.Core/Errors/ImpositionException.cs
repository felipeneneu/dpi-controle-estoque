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
    public const string GridOverflow     = "E_GRID_OVERFLOW";
    public const string InvalidTolerance = "E_INVALID_TOLERANCE";
    public const string InvalidSubstrate = "E_INVALID_SUBSTRATE";
    public const string InvalidPiece     = "E_INVALID_PIECE";
    public const string InvalidTarget    = "E_INVALID_TARGET";
    public const string DuplexNested     = "E_DUPLEX_NESTED";
    public const string NotImplemented   = "E_NOT_IMPLEMENTED";
}
