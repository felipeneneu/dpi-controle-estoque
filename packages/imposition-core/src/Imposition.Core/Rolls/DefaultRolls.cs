namespace Imposition.Core.Rolls;

/// <summary>
/// Catálogo padrão de rolos de substrato com medidas do mercado brasileiro (ADR-050, BR_051).
/// </summary>
public static class DefaultRolls
{
    /// <summary>Largura física padrão em nova instalação (1520.0 mm / 1,52m).</summary>
    public const double DefaultWidthMm = 1520.0;

    /// <summary>Margem lateral padrão por lado (15.0 mm).</summary>
    public const double DefaultMarginSideMm = 15.0;

    public static RollSpecification Roll1520 { get; } = RollSpecification.Create("roll-1520", "Lona/Vinil 1,52m", 1520.0, DefaultMarginSideMm);
    public static RollSpecification Roll1270 { get; } = RollSpecification.Create("roll-1270", "Lona/Vinil 1,27m", 1270.0, DefaultMarginSideMm);
    public static RollSpecification Roll1060 { get; } = RollSpecification.Create("roll-1060", "Lona/Vinil 1,06m", 1060.0, DefaultMarginSideMm);
    public static RollSpecification Roll910  { get; } = RollSpecification.Create("roll-910",  "Lona/Vinil 0,91m", 910.0,  DefaultMarginSideMm);

    /// <summary>Lista imutável com todos os rolos do catálogo padrão.</summary>
    public static IReadOnlyList<RollSpecification> All { get; } = new[]
    {
        Roll1520,
        Roll1270,
        Roll1060,
        Roll910
    };
}
