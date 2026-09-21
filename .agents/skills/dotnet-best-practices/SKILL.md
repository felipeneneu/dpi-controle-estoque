---
name: dotnet-best-practices
description: Modern C# and .NET 10 patterns for building fast, correct, maintainable applications. Covers records, nullable reference types, pattern matching, async/await, dependency injection, source generators, and JSON serialization.
when_to_use: "When writing, reviewing, or refactoring C# code targeting .NET 8/9/10. NOT for legacy .NET Framework (4.x) or Unity scripts. NOT for WPF/XAML layout (use frontend-design)."
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
version: 1.0.0
---

# Modern C# & .NET 10 Best Practices

Guidance for writing C# code that is **correct, fast, and maintainable**.

## Core Philosophy

**C# is a precision tool, not a scripting language.** Every language feature has a purpose. Use the right feature for the right problem.

- **Immutability first**: `record`, `readonly struct`, `init`
- **Nullability is a contract**: `Nullable=enable` is not optional
- **Warnings are errors**: `TreatWarningsAsErrors=true`
- **Explicit over implicit**: no `dynamic`, no reflection unless necessary
- **Measure before optimizing**: `Stopwatch`, BenchmarkDotNet

## Language Features (modern C#)

### Records — default for DTOs

```csharp
// ✅ CORRECT — immutable, value equality, with-expression
public sealed record ImpositionInput(
    SubstrateSpec Substrate,
    PieceSpec Piece,
    int TargetCopies,
    SurplusPolicy SurplusPolicy = SurplusPolicy.Truncate);

// Usage
var modified = input with { TargetCopies = 500 };

// ❌ WRONG — mutable class for a DTO
public class ImpositionInput
{
    public SubstrateSpec Substrate { get; set; }
    public PieceSpec Piece { get; set; }
    // ...
}