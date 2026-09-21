---
name: math-computational-geometry
description: Precision geometry for prepress — floating-point tolerance, affine transforms, grids, bin packing. Always explicit tolerance, never magic epsilon.
when_to_use: "When implementing geometric calculations, grid algorithms, tolerance logic, or coordinate transforms. NOT for general arithmetic or financial calculations."
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
version: 1.0.0
---

# Math & Computational Geometry

## Core Philosophy

**Tolerance is physical, not arithmetic.** `0.1mm` is the blade thickness.

- Tolerance is domain
- Never magic epsilon
- Draw formula before code
- Cite source (ISO, paper, ADR)
- Test edge cases

## Tolerance — Canonical Formula

```csharp
/// Regra 1 do AGENTS.md: tolerância explícita ANTES do floor.
/// Fórmula: tol = max(toleranceMm, registerMm, 0.1)
public static double Resolve(double toleranceMm, double registerMm)
{
    if (toleranceMm < 0 || registerMm < 0)
        throw new ArgumentOutOfRangeException();
    return Math.Max(Math.Max(toleranceMm, registerMm), 0.1);
}

var tol = Tolerance.Resolve(input.ToleranceMm, input.RegisterMm);
var cols = (int)Math.Floor((utilW + gap + tol) / (pW + gap));
```

## Floating-Point Comparisons

```csharp
// Correct — explicit tolerance
public static bool AreEqual(double a, double b, double tolerance)
    => Math.Abs(a - b) < tolerance;

var fits = length <= maxLength + Tolerance.FactoryFloorMm;

// Wrong
if (a == b) { }
if (Math.Abs(a - b) < 0.000001) { }
```

## Units

**Internal: millimeter (mm), as `double`.**

```csharp
public static class Units
{
    public const double MmToPt = 72.0 / 25.4;
    public const double PtToMm = 25.4 / 72.0;

    public static double MmToPoints(double mm) => mm * MmToPt;
    public static double PointsToMm(double pt) => pt * PtToMm;
}
```

Convert only at renderer boundary.

## Affine Transformations

2D affine: `[a b c d e f]`

```csharp
public readonly record struct AffineTransform(
    double A, double B, double C, double D, double E, double F)
{
    public static AffineTransform Identity => new(1, 0, 0, 1, 0, 0);

    public static AffineTransform Translate(double tx, double ty)
        => new(1, 0, 0, 1, tx, ty);

    public static AffineTransform Rotate(double degrees)
    {
        var rad = degrees * Math.PI / 180.0;
        var cos = Math.Cos(rad);
        var sin = Math.Sin(rad);
        return new(cos, sin, -sin, cos, 0, 0);
    }

    /// <summary>Composition: this * other (apply other first, then this).</summary>
    public AffineTransform Multiply(AffineTransform other)
        => new(
            A * other.A + B * other.C,
            A * other.B + B * other.D,
            C * other.A + D * other.C,
            C * other.B + D * other.D,
            E * other.A + F * other.C + other.E,
            E * other.B + F * other.D + other.F);

    public (double X, double Y) Apply(double x, double y)
        => (A * x + B * y + E, C * x + D * y + F);
}
```

## Grids

```csharp
/// cols = floor((utilW + gap + tol) / (pieceW + gap))
public static (int cols, int rows) CalculateGrid(
    double utilWMm, double utilHMm,
    double pieceWMm, double pieceHMm,
    double gapMm, double tol)
{
    var cols = (int)Math.Floor((utilWMm + gapMm + tol) / (pieceWMm + gapMm));
    var rows = (int)Math.Floor((utilHMm + gapMm + tol) / (pieceHMm + gapMm));
    return (Math.Max(0, cols), Math.Max(0, rows));
}
```

## Centering

```csharp
/// X always centers; Y centers only in sheet (roll = top).
public static (double startX, double startY) ComputeStart(
    double utilWMm, double utilHMm,
    double gradeWMm, double gradeHMm,
    double marginLeftMm, double marginTopMm,
    SubstrateKind kind)
{
    var startX = marginLeftMm + (utilWMm - gradeWMm) / 2.0;
    var startY = kind == SubstrateKind.Roll
        ? marginTopMm
        : marginTopMm + (utilHMm - gradeHMm) / 2.0;
    return (startX, startY);
}
```

## Rounding

```csharp
// Correct — round only at serialization
public Placement Round() => new(
    Math.Round(XMm, 2),
    Math.Round(YMm, 2));

// Wrong — mid-calculation
var x = Math.Round(someIntermediate, 2);
```

## Bin Packing (MaxRects)

Reference: Jukka Jylänki (2010), "A Thousand Ways to Pack the Bin".

```csharp
public sealed record Rect(double X, double Y, double W, double H)
{
    public double Area => W * H;
}

public static IReadOnlyList<(Rect bin, IReadOnlyList<Rect> items)> Pack(
    Rect binSize,
    IReadOnlyList<Rect> items,
    PackingHeuristic heuristic = PackingHeuristic.BestAreaFit)
{
    // 1. Sort items by area desc
    // 2. Find best-fit free rect
    // 3. Subdivide free rects
    // 4. Choose heuristic variant
    // ...
}
```

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| `decimal` for geometry | `double` |
| Magic epsilon | explicit tolerance |
| `Math.Round` mid-calc | round at output |
| Mixing mm and pt | convert at boundary |
| Direct float `==` | tolerance |
| Assume infinite precision | test edge cases |
| Mutable matrices | `readonly record struct` |

## Review Checklist

- [ ] Tolerance explicit (`max(tol, register, 0.1)`)
- [ ] Applied before `floor`
- [ ] No magic epsilon
- [ ] Formula documented
- [ ] Source cited
- [ ] Units consistent (mm internally)
- [ ] `Math.Round` only at output
- [ ] Edge cases tested
- [ ] Matrices immutable
- [ ] No `decimal` for geometry
- [ ] No direct float `==`
