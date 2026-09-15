---
type: project
created: 2026-07-18
updated: 2026-07-18
---

# Technical Decisions

- Component metadata uses SemVer while the toolkit release keeps CalVer.
- `manifest.json` and `manifest.lock.json` must remain synchronized with component frontmatter.
- ADR-014: Standardized physical labels (90x35mm) on Konica 330x480mm sheet (client-side `pdf-lib` imposition, 40 labels/sheet at 90° and 36 at 0°, semantic payload `BOB:xxxx`/`TNK:xxxx`, Preps-style workbench with native Drag & Drop, Quick-Switch `F2` with Enter-confirmation on machine transfer).
- ADR-015 & DD-001: Native C# (.NET 8 WPF, DirectX/DrawingContext) Sidecar Pattern for graphical imposition (`ImpositorKonica`). Single-file self-contained binary in `extraResources` invoked via CLI `--data <temp_json>` and standard exit codes (0, 1, 2, 3), 1:1 metric space, focused zoom, graphical shortcuts (F4, P, C, E, T, B, L, R, Ctrl+D).
