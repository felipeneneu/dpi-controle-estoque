# Spec — mimaki-tipo1-10mm-rdg.pdf

## Propósito
Marca Mimaki Tipo 1 com borda RDG_WHITE. Para papel escuro (BOPP prata).

## Geometria

```
┌────────────────────────┐
│  ▓▓▓▓▓▓▓▓▓▓▓           │  ← RDG_WHITE (retângulo sólido)
│  ▓███████▓▓           │  ← L preta em cima
│  ▓▓▓█████▓▓           │
│  ▓▓▓▓▓▓▓▓▓▓▓           │
│                        │
└────────────────────────┘
```

| Parâmetro | Valor |
|---|---|
| Haste | 10mm |
| Espessura do traço | 1mm |
| Cor da L | 100% K |
| Cor do fundo | Spot `RDG_WHITE` |
| Tamanho do fundo RDG | 14mm × 14mm (2mm a mais que a haste) |
| Offset da grade | 3mm |

## Como criar no Illustrator
1. Desenhar retângulo 14×14mm, preencher com spot `RDG_WHITE`.
2. Desenhar L-shape (10mm) por cima, stroke preto 1mm.
3. Exportar como PDF.

## Validação
- [ ] Retângulo RDG_WHITE existe
- [ ] L preta por cima
- [ ] Spot nomeado corretamente
