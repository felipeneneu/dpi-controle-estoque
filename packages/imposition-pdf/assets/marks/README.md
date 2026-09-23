# Marcas de Imposição — GraficaOS

Marcas canônicas usadas pelo motor `imposition-pdf` para adicionar
marcas de corte ao PDF imposto.

## Origem

Criadas pelo PO no Adobe Illustrator. Uso livre (autorais).

## Catálogo

| Arquivo | Descrição | Uso |
|---|---|---|
| `mimaki-tipo1.pdf` | Marca L-shape padrão Mimaki Tipo 1 (OutTombo) | Papel claro / vinil |
| `mimaki-tipo1-rdg.pdf` | Marca Mimaki Tipo 1 com fundo `RDG_WHITE` | Papel escuro / BOPP prata |

## Como o motor usa

O motor resolve marcas em ordem de precedência:

1. `GRAFICA_MARKS_DIR` (env var) — marcas customizadas do cliente
2. `assets/marks/` (este diretório) — marcas padrão do GraficaOS
3. Fallback hardcoded (dívida técnica — remover em 2026-10-21)

## Especificações técnicas

Ver `specs/mimaki-tipo1.md` e `specs/mimaki-tipo1-rdg.md`.

## Como adicionar novas marcas

1. Criar no Illustrator/CorelDRAW com as dimensões corretas.
2. Exportar como PDF (sem compressão).
3. Salvar neste diretório com nome canônico (kebab-case).
4. Criar spec em `specs/`.
5. Atualizar este README.
6. Commit.

## Não fazer

- ❌ Copiar assets do Preps (Kodak) para cá
- ❌ Commitar marcas de cliente específicas
- ❌ Usar nomes com espaços ou acentos
