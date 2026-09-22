# Spec — crop-5mm.pdf

## Propósito
Marca de corte tipo L para chapa offset.

## Geometria

```
┌──────────────────────┐
│                      │
│  ───┐                │  ← haste horizontal 5mm
│     │                │  ← haste vertical 5mm
│     │                │
│                      │
└──────────────────────┘
```

| Parâmetro | Valor |
|---|---|
| Haste horizontal | 5mm |
| Haste vertical | 5mm |
| Espessura do traço | 0.25pt (hairline) |
| Cor | 100% K (preto) |
| Offset da grade | 5mm |
| Fill | Nenhum (só stroke) |
| Overprint | Não |

## Posição
- 4 marcas nos 4 cantos da grade.
- Cada marca com L voltado para **fora** da grade.
- Offset de 5mm entre grade e marca.

## Como criar no Illustrator
1. Documento A4, unidade mm.
2. Desenhar path com `moveTo/lineTo/lineTo`:
   - `(0, 5)` → `(0, 0)` → `(5, 0)`
3. Stroke preto, 0.25pt, sem fill.
4. Exportar como PDF (preserve editability OFF).

## Como criar no Inkscape
1. Documento A4, unidade mm.
2. Ferramenta Pen: 3 pontos (0,5) → (0,0) → (5,0).
3. Stroke preto, 0.25pt.
4. Exportar como PDF.

## Validação
- [ ] Traço 0.25pt
- [ ] Haste 5mm × 5mm
- [ ] Preto 100% K
- [ ] Sem fill
