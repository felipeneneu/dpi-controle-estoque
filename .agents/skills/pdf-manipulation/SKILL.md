---
name: pdf-manipulation
description: Deep knowledge of PDF internals (ISO 32000), QPDF, QDF format, content streams, OCG (layers), spot colors, and overprint. Essential for prepress tools that must preserve the client's file.
when_to_use: "When reading, writing, or manipulating PDF files. When dealing with layers (OCG), spot colors, overprint, or PDF structure. NOT for basic PDF generation."
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
version: 1.0.0
---

# PDF Manipulation (ISO 32000)

## Core Philosophy

**The client's PDF is sacred.** Preserve everything you don't need
to change.

- Clone, don't rewrite: QPDF clones; PdfSharp rewrites
- Never flatten OCG: layers are the whole point
- Never rename spots: `RDG_WHITE` is the contract
- Never re-encode fonts
- Preserve object streams

## The 4 Approaches

| Approach | Preserves OCG | Risk | Use |
|---|---|---|---|
| QPDF (CLI) | Yes | Low | Always |
| QPDF QDF + C# edit | Yes | Medium | Complex ops |
| iText 7 | Yes | AGPL | Never |
| PdfSharp | No (flattens) | High | Non-OCG only |

## QPDF — Workhorse

```bash
qpdf --check input.pdf
qpdf --json input.pdf
qpdf --qdf input.pdf output.qdf
qpdf --object-streams=generate input.qdf output.pdf
qpdf input.pdf --pages . 1-16 -- output.pdf
```

## QDF Format

QDF is PDF as "source code". Streams decompressed, offsets readable.

```
1 0 obj
<</Metadata 2 0 R /OCProperties
  <</D<</ON[5 0 R 6 0 R 7 0 R] /Order 8 0 R /RBGroups[]>>
    /OCGs[5 0 R 6 0 R 7 0 R]>>
  /Pages 3 0 R /Type/Catalog>>
endobj

5 0 obj
<</Type/OCG /Name/COR>>
endobj
```

## QDF Editing Pipeline

```
1. qpdf --qdf input.pdf working.qdf
2. C# reads working.qdf as Latin-1
3. C# edits text
4. C# regenerates xref
5. qpdf --object-streams=generate working.qdf output.pdf
6. qpdf --check output.pdf
```

Hard-won lessons:
- Latin-1 mandatory (UTF-8 corrupts offsets)
- `/Length` exact
- Off-by-one in `/Resources` (10 chars)
- xref offsets in bytes (Latin-1)

## OCG (Layers)

```
/Catalog
  /OCProperties <<
    /OCGs [5 0 R 6 0 R 7 0 R]
    /D <<
      /ON [5 0 R 6 0 R 7 0 R]
      /Order [5 0 R 6 0 R 7 0 R]
    >>
  >>
```

Content marked:
```
/OC /MC0 BDC
  ... graphics ...
EMC
```

Page `/Resources /Properties`:
```
/Properties <<
  /MC0 5 0 R
  /MC1 6 0 R
>>
```

## Spot Colors

```pdf
11 0 obj
<</CS0 [/Separation /RDG_WHITE /DeviceCMYK 12 0 R]>>
```

RasterLink reads `RDG_WHITE` → activates white ink.

**Rule:** never rename.

## Overprint

```pdf
/GS0 <<
  /Type /ExtGState
  /OP true
  /op true
  /OPM 1
>>
```

**Rule:** preserve `/ExtGState`.

## XObjects

```pdf
10 0 obj
<</Type/XObject /Subtype/Form /BBox[0 0 240 102]
  /Resources << /Properties << /MC0 5 0 R >> >>
  /Length 1234>>
stream
  ... content ...
endstream
endobj
```

N-up content:
```
q 1 0 0 1 0 0 cm /Fm0 Do Q
q 1 0 0 1 300 0 cm /Fm0 Do Q
q 1 0 0 1 0 200 cm /Fm0 Do Q
q 1 0 0 1 300 200 cm /Fm0 Do Q
```

## N-up Pipeline

```
1. qpdf --qdf input.pdf working.qdf
2. C# parses /Catalog, extracts source page's content + resources
3. C# creates new /Form XObject
4. C# creates new page:
   - /MediaBox [0 0 W H]
   - /Resources /XObject << /Fm0 N 0 R >> + /Properties
   - /Contents: q cm /Fm0 Do Q (N times)
5. C# creates new /Pages
6. C# regenerates xref (Latin-1 byte offsets)
7. qpdf --object-streams=generate working.qdf output.pdf
8. qpdf --check output.pdf
```

**Why this preserves OCG:** `/Properties` carries `/MC0 5 0 R`.
Clone preserves references. OCGs in catalog still point to same objects.

## Validation

```bash
qpdf --check output.pdf
qpdf --json output.pdf | grep OCProperties
qpdf --qdf output.pdf check.qdf
grep "/OC" check.qdf
```

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| PdfSharp for OCG | QPDF |
| Renaming spots | preserve |
| UTF-8 reading QDF | Latin-1 |
| Rasterizing | keep `Do` |
| Wrong xref | `qpdf --check` |
| Stripping ExtGState | preserve |

## Review Checklist

- [ ] QPDF for OCG PDFs
- [ ] Latin-1 for QDF I/O
- [ ] `/OCProperties` preserved
- [ ] Spot names unchanged
- [ ] `/ExtGState` preserved
- [ ] One XObject per page, referenced N times
- [ ] xref correct (`qpdf --check` clean)
- [ ] File size linear with N
- [ ] No rasterization
- [ ] Tested with real client PDF
