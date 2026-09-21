---
name: csharp-testing
description: C# testing with xUnit, FluentAssertions, and golden-master characterization tests. Covers BR-* naming, AAA pattern, fixtures, cross-motor contract tests, and property-based testing with FsCheck.
when_to_use: "When writing or reviewing C# tests. NOT for JS/TS testing or Python tests."
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
version: 1.0.0
---

# C# Testing — xUnit + FluentAssertions

## Core Philosophy

**A test that doesn't fail when code is broken is worse than no test.**

- Specific: one thing per test
- Fast: milliseconds
- Deterministic: same in, same out
- Readable: reads like a spec
- Traceable: linked to BR-*

## Test Naming — BR-* convention

```csharp
[Fact]
public void BR_010_a_ToleranceAppliedBeforeFloor_CaseCanonical() { }

[Fact]
public void BR_043_a_ImposePreservesOcg() { }
```

Format: `BR_XXX_letter_Description`
- `XXX`: rule number
- `letter`: sequential
- `Description`: snake_case

Non-business: free description.

## AAA Pattern

```csharp
[Fact]
public void BR_010_a_ToleranceAppliedBeforeFloor_CaseCanonical()
{
    // Arrange
    var input = new ImpositionInput(/* ... */);

    // Act
    var result = GridSearchEngine.Plan(input);

    // Assert
    result.Cols.Should().Be(35);
}
```

Rules: blank lines between blocks, one Act, FluentAssertions.

## FluentAssertions

```csharp
result.Cols.Should().Be(35);
result.Placements.Should().HaveCount(1015);
result.Orientation.Should().Be(Orientation.Portrait);
result.Metrics.UtilizationPct.Should().BeApproximately(98.2, 0.1);

var act = () => GridSearchEngine.Plan(invalidInput);
act.Should().Throw<ImpositionException>()
   .Which.Code.Should().Be(ErrorCodes.GridOverflow);
```

## Fixtures

### Theory + InlineData

```csharp
[Theory]
[InlineData(700, 1000, 39, 55, 165, 156)]
[InlineData(700, 1000, 39, 55, 300, 156)]
public void BR_010_ak_Roll_AutoExtends(
    double sheetW, double sheetH,
    double pieceW, double pieceH,
    int target, int expectedPerRound) { }
```

### Golden-master (file-based)

```
tests/Imposition.Core.Tests/GoldenMaster/
└── cases/000-canonical/
    ├── input.json
    ├── expected.json
    └── notes.md
```

```csharp
[Fact]
public void BR_010_n_GoldenMasterCaseCanonical_1015Copies()
{
    var root = Path.Combine(AppContext.BaseDirectory,
        "GoldenMaster", "cases", "000-canonical");
    var input = DeserializeInput(File.ReadAllText(
        Path.Combine(root, "input.json")));
    var expected = JsonSerializer.Deserialize<Expected>(
        File.ReadAllText(Path.Combine(root, "expected.json")))!;

    var result = GridSearchEngine.Plan(input);

    result.Cols.Should().Be(expected.Cols);
    result.Total.Should().Be(expected.Total);
}
```

Golden fixtures are immutable. Change requires ADR.

## Property-Based (FsCheck)

```csharp
[Property]
public Property Tolerance_IsAlwaysAtLeastFactoryFloor(
    NonNegativeInt tol, NonNegativeInt reg)
{
    var result = Tolerance.Resolve(tol.Get, reg.Get);
    return (result >= 0.1).ToProperty();
}
```

## Cross-Motor Contract

```csharp
[Fact]
public void BR_010_ae_CrossMotor_SameInput_SameGridHash()
{
    var input = BuildCanonicalInput();
    var coreResult = GridSearchEngine.Plan(input);
    var cliResult = ImpositionBridge.Plan(input);
    cliResult.GridHash.Should().Be(coreResult.GridHash);
}
```

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| Always passes | assert something |
| Tests implementation | test behavior |
| One giant test | split |
| Mocking everything | real objects |
| `Thread.Sleep(1000)` | `Task.Delay` + ct |
| Adjusting to pass | fix code |
| Golden changed w/o ADR | justify |
| No `BR-*` | add rule ID |

## Review Checklist

- [ ] Names: `BR_XXX_letter_Description`
- [ ] AAA with blank lines
- [ ] FluentAssertions
- [ ] One concept per test
- [ ] Real fixtures
- [ ] Golden immutable
- [ ] Error tests check `E_*`
- [ ] Async tests use `async Task`
- [ ] No `Thread.Sleep`
- [ ] No mocking what you don't own
- [ ] Cross-motor tests
- [ ] Coverage on critical paths
