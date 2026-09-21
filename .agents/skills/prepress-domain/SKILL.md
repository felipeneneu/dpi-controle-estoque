---
name: prepress-domain
description: Domain knowledge of prepress — imposition, bleed, crop marks, spot colors, white ink, CutContour, machine profiles (Konica, Mimaki, HP Latex). Essential for tools a print operator actually uses.
when_to_use: "When implementing operator features: imposition, marks, cut contours, white ink, machine configuration. NOT for editorial/booklet. NOT for ICC color management."
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
version: 1.0.0
---

# Prepress & Print Production Domain

## Core Philosophy

**A print operator is not a developer.** Software must be:

- Predictable
- Forgiving (never fail silently)
- Fast (dozens of jobs per day)
- Explicit (say "capacity is 276", not "doesn't fit")

## Imposition

Arranging N copies on a larger substrate.

| Substrate | Behavior |
|---|---|
| Sheet / chapa | Fixed. Reject if doesn't fit. |
| Roll / bobina | Auto-extends to `maxLengthMm`. |

Terminology:
- N-up: grid (35×29)
- Step & repeat: labels/stickers
- Gang-run: multiple SKUs
- Signature: fold-based (out of scope)

## Duplex

| Pairing | Meaning | Use |
|---|---|---|
| Head-to-Head | Top aligns top | Book binding |
| Head-to-Foot | Top aligns bottom | Table calendar |

Wrong pairing wastes entire run.

## Spots

| Spot | Purpose | Typical name |
|---|---|---|
| White | UV white | `RDG_WHITE`, `MimakiWhite`, `White` |
| Cut | Contour | `FACA`, `CutContour` |
| Varnish | Spot | `Verniz`, `Glossy` |

**Rule:** never rename.

## Marks

| Mark | Purpose |
|---|---|
| Crop marks | L at corners; guillotine reference |
| Registration | Crosses; color alignment |
| Slugline | Job info text |
| Color bar | CMYK patches |

## Bleed (Sangria)

| Region | Meaning |
|---|---|
| TrimBox | Final cut |
| BleedBox | Trim + bleed |
| MediaBox | Total page |

Typical: 3mm (BR), 1/8" (US).

## Machine Profiles

```csharp
public sealed record MachineProfile(
    string Name,
    double MaxRollWidthMm,
    double MaxLengthPerPanelMm,
    double GripperMarginMm,
    double ToleranceMm,
    IReadOnlyList<string> WhiteSpotNames,
    IReadOnlyList<string> CutSpotNames);
```

Lives in config, not hardcoded.

## Workflow — Konica

```
1. Client PDF (COR, BRANCO, FACA)
2. Operator drops
3. Motor imposes N-up on SRA3
4. Crop marks if needed
5. Sent to Konica
6. Cut on guillotine
```

## Workflow — Mimaki

```
1. Client PDF with 3 layers
2. Operator drops
3. Motor imposes on roll
4. Motor preserves OCG → 1 file
5. Load into RasterLink
6. RasterLink reads OCG → 3 channels
7. "Composite" → print
8. Plotter cuts
```

## Common Pains

| Pain | Cause | Fix |
|---|---|---|
| "Doesn't fit" cryptic | Bad message | Say capacity |
| Cut misaligned | No reg marks | Add marks |
| White visible | Wrong overprint | Force overprint |
| CorelDRAW achata | Software | Use QPDF motor |

## Naming

```
originalname_IMPOSTO_{W:F0}x{H:F0}mm_{N}UN.pdf
```

Output folder: `<PDF folder>/saida/`.

## Constants

```csharp
public static class PrepressConstants
{
    public const double FactoryToleranceMm = 0.1;
    public const double DefaultBleedMm = 3.0;
    public const double DefaultCropOffsetMm = 3.0;
    public const double DefaultCropSizeMm = 5.0;
    public const double DefaultCropWidthPt = 0.25;
}
```

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| Hardcode spot names | Read from PDF |
| Assume bleed 3mm | MachineProfile |
| Flatten OCG | QPDF |
| Cryptic errors | Give capacity + action |
| Skip duplex pairing | Explicit pairing |
| Ignore roll max length | Segment |
| No `saida/` folder | Dedicated output |

## Review Checklist

- [ ] Operator runs job in < 1 min
- [ ] Errors actionable ("capacity is 276")
- [ ] Spot names preserved
- [ ] OCG preserved
- [ ] Crop marks correct
- [ ] Naming convention
- [ ] `saida/` folder
- [ ] Duplex explicit
- [ ] Roll respects max length
- [ ] No hardcoded bleed/spot/gripper
