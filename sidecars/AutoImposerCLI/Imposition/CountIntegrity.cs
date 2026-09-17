using Imposition.Core.Errors;

namespace AutoImposerCLI.Imposition;

/// <summary>
/// Contagem verificada (ADR-023): garante que o que foi planejado (plannedUnits),
/// o que foi desenhado (drawnUnits) e o que foi lido de volta do PDF
/// (readBackUnits) não divirjam silenciosamente — Regra 4 do core AGENTS.md.
/// readBackUnits == -1 significa "não inspecionável" (best-effort, nunca bloqueia).
/// </summary>
public static class CountIntegrity
{
    public const string ErrorCode = "E_COUNT_MISMATCH";

    /// <summary>
    /// Valida a contagem. Em modo strict lança ImpositionException (exit 1);
    /// em warn (default) loga e continua (exit 0).
    /// </summary>
    public static void Validate(int plannedUnits, int drawnUnits, int readBackUnits, bool strict = false)
    {
        var planVsDrawn = $"[BR-010/ADR-023] plannedUnits={plannedUnits} drawnUnits={drawnUnits}";
        var readBackNote = readBackUnits >= 0
            ? $" readBackUnits={readBackUnits}"
            : " readBackUnits=-1 (não inspecionável, best-effort)";

        var ok = drawnUnits == plannedUnits
              && (readBackUnits < 0 || readBackUnits == plannedUnits);

        if (ok)
        {
            Console.WriteLine($"[OK] Contagem verificada: {planVsDrawn};{readBackNote}");
            return;
        }

        var message =
            $"{planVsDrawn};{readBackNote} — divergência na contagem (Regra 4).";

        if (strict)
        {
            throw new ImpositionException(ErrorCode, message);
        }

        Console.ForegroundColor = ConsoleColor.Yellow;
        Console.WriteLine($"[AVISO] {message}");
        Console.ResetColor();
    }
}