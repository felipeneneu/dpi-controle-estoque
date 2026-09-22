# Marcas Padrão do GraficaOS

> Diretório de marcas de imposição distribuídas com o GraficaOS.
> **Licença:** Apache 2.0. **Origem:** criadas do zero, NÃO derivadas
> de assets de terceiros (Preps, Kodak, Adobe).

## Como funciona

O motor `imposition-pdf` resolve o diretório de marcas em 4 níveis de
precedência:

| # | Nível | Quando usar |
|---|---|---|
| 1 | `GRAFICA_MARKS_DIR` (env var) | Cliente tem marcas próprias (Preps ou custom) |
| 2 | `assets/marks/` (este diretório) | Cliente sem marcas próprias |
| 3 | `D:\Programas\Marks\` (fallback) | Dívida temporária — remover em 2026-10-21 |
| 4 | Erro `E_MARKS_DIR_NOT_SET` | Após remoção do fallback |

**Cliente sem Preps** funciona out-of-the-box (usa este diretório).
**Cliente com Preps** configura `GRAFICA_MARKS_DIR` e usa as dele.

## Catálogo de marcas

### Marcas de corte (Konica, guilhotina)

| Arquivo | Specs | Uso |
|---|---|---|
| `crop-3mm.pdf` | L 5mm, offset 3mm, 0.25pt | Konica SRA3 |
| `crop-5mm.pdf` | L 5mm, offset 5mm, 0.25pt | Chapa offset |

### Marcas Mimaki Tipo 1 (OutTombo)

| Arquivo | Specs | Uso |
|---|---|---|
| `mimaki-tipo1-10mm.pdf` | L 10mm, espessura 1mm | Recomendado FineCut |
| `mimaki-tipo1-15mm.pdf` | L 15mm, espessura 1mm | Médio |
| `mimaki-tipo1-25mm.pdf` | L 25mm, espessura 1mm | Rolo |
| `mimaki-tipo1-10mm-rdg.pdf` | L 10mm + borda RDG_WHITE | Papel escuro |

### Marcas de registro (offset)

| Arquivo | Specs | Uso |
|---|---|---|
| `regmark-cross.pdf` | Cruz + círculo | Multi-cor offset |

## Como criar cada marca

**Método 1 — Illustrator:**
1. Novo documento A4.
2. Desenhar L-shape (retângulo fino).
3. Medir (haste X mm, espessura Y mm).
4. Exportar como PDF (sem compressão).
5. Salvar neste diretório com o nome correto.

**Método 2 — Inkscape (open source):**
1. Novo documento A4.
2. Desenhar L-shape.
3. Exportar como PDF.
4. Salvar aqui.

**Especificações exatas:** ver `specs/*.md` de cada marca.

## Regras

- **NUNCA** copiar assets do Preps (Kodak) para este diretório.
- **NUNCA** commitar marcas de cliente específicas.
- **SEMPRE** criar marcas novas (L-shape, cruz) — geometria simples.
- **SEMPRE** documentar em `specs/` antes de desenhar.

## Status

- [ ] crop-3mm.pdf
- [ ] crop-5mm.pdf
- [ ] mimaki-tipo1-10mm.pdf
- [ ] mimaki-tipo1-15mm.pdf
- [ ] mimaki-tipo1-25mm.pdf
- [ ] mimaki-tipo1-10mm-rdg.pdf
- [ ] regmark-cross.pdf

**Marcas pendentes de criação manual.**
