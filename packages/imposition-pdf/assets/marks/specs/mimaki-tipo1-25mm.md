# Spec — mimaki-tipo1-25mm.pdf

## Propósito
Marca de registro Mimaki Tipo 1 (OutTombo).

## Geometria

```
┌──────────────────────┐
│                      │
│  ─────┐              │  ← haste horizontal 25mm
│       │              │
│       │              │  ← haste vertical 25mm
│       │              │
│       │              │
└──────────────────────┘
```

| Parâmetro | Valor |
|---|---|
| Haste horizontal | 25mm |
| Haste vertical | 25mm |
| Espessura do traço | 1mm (traço grosso) |
| Cor | 100% K (preto) |
| Offset da grade | 3mm |
| Fill | Nenhum (só stroke) |
| Overprint | Não |

## Como criar no Illustrator
1. Documento A4, unidade mm.
2. Path: `(0, 25)` → `(0, 0)` → `(25, 0)`
3. Stroke preto, **1mm** (não 0.25pt).
4. Exportar como PDF.

## Validação
- [ ] Traço 1mm
- [ ] Haste 25mm × 25mm
- [ ] Preto 100% K
