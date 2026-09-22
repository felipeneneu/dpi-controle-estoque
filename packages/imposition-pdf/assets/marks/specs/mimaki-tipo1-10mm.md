# Spec — mimaki-tipo1-10mm.pdf

## Propósito
Marca de registro Mimaki Tipo 1 (OutTombo). Recomendada pelo FineCut.

## Geometria

```
┌──────────────────────┐
│                      │
│  ─────┐              │  ← haste horizontal 10mm
│       │              │
│       │              │  ← haste vertical 10mm
│       │              │
│       │              │
└──────────────────────┘
```

| Parâmetro | Valor |
|---|---|
| Haste horizontal | 10mm |
| Haste vertical | 10mm |
| Espessura do traço | 1mm (traço grosso) |
| Cor | 100% K (preto) |
| Offset da grade | 3mm |
| Fill | Nenhum (só stroke) |
| Overprint | Não |

## Como criar no Illustrator
1. Documento A4, unidade mm.
2. Path: `(0, 10)` → `(0, 0)` → `(10, 0)`
3. Stroke preto, **1mm** (não 0.25pt).
4. Exportar como PDF.

## Validação
- [ ] Traço 1mm
- [ ] Haste 10mm × 10mm
- [ ] Preto 100% K
