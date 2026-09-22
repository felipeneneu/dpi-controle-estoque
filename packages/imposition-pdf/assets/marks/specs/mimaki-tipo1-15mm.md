# Spec — mimaki-tipo1-15mm.pdf

## Propósito
Marca de registro Mimaki Tipo 1 (OutTombo).

## Geometria

```
┌──────────────────────┐
│                      │
│  ─────┐              │  ← haste horizontal 15mm
│       │              │
│       │              │  ← haste vertical 15mm
│       │              │
│       │              │
└──────────────────────┘
```

| Parâmetro | Valor |
|---|---|
| Haste horizontal | 15mm |
| Haste vertical | 15mm |
| Espessura do traço | 1mm (traço grosso) |
| Cor | 100% K (preto) |
| Offset da grade | 3mm |
| Fill | Nenhum (só stroke) |
| Overprint | Não |

## Como criar no Illustrator
1. Documento A4, unidade mm.
2. Path: `(0, 15)` → `(0, 0)` → `(15, 0)`
3. Stroke preto, **1mm** (não 0.25pt).
4. Exportar como PDF.

## Validação
- [ ] Traço 1mm
- [ ] Haste 15mm × 15mm
- [ ] Preto 100% K
