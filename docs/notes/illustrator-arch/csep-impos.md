# csep-impos.md — Busca por C-SEP / imposição / prepress (conclusão)

> Busca estática em `D:\Programas\Adobe Illustrator 2026` (30.6.0, pt-BR). Somente leitura.
> Padrões testados: `cs-?sep`, `csep`, `impos`, `Imposition/Impositor`, `step and repeat`, `step-and-repeat` (filenames e strings ASCII).

## 1. Filenames — resultado: 0 (conforme esperado)

Varredura recursiva de todos os arquivos do install com `-match 'cs-?sep|csep|impos'`:
**0 arquivos/pastas.** Nada chamado C-SEP, CSEP, Impos*, Imposition etc. em nenhum nível.

## 2. Strings nos binários/plugins-chave — resultado: 0

| Alvo | Padrão | Matches | Nota |
|------|--------|---------|------|
| `Illustrator.exe` (61,3 MB) | `C-SEP\|CSEP\|Imposition\|Impositor\|step and repeat` | **0** | — |
| `Plug-ins\Extensions\Print.aip` | `C-SEP\|CSEP\|Impos\|step and repeat` | 0 | plugin de impressão não fala de imposição |
| `Plug-ins\Illustrator Formats\PDFFormat.aip` | idem | 0 | sim; fala de PDF/X e joboptions (ver §4) |
| `Plug-ins\Illustrator UI\PDFFormatUI.aip` | `C-SEP\|CSEP\|Impos\|step and repeat\|step-and-repeat` | 0 | — |
| `Plug-ins\Illustrator Filters\Overprint.aip` | idem | 0 | sobreimpressão ≠ imposição |
| `Plug-ins\Illustrator Filters\TrimMark.aip` | idem | 0 | marcas de corte/registro ≠ imposição |
| `Plug-ins\Extensions\SeparationPreview.aip` | `C-SEP\|CSEP` | 0 | só "Separation Preview Panel", colorantes CMY K (`Cyan=`, `Magenta=`, `Yellow=`, `Black=`) = prova de prova-de-cor de separações, nada de impor |
| `Plug-ins\Illustrator Formats\MPS*.aip` + `MPS.dll` | (contexto) | — | parser PostScript Level 3; sem contato com imposição |
| `Presets\**` (filenames) | `cs-?sep\|csep\|impos` | 0 | Presets = amostras, pincéis, estilos, ações, SVG, espaços de trabalho |

## 3. O que existe de prepress no Illustrator 30.6 (para não confundir)

- **Perfis PDF/X e qualidade de impressão**: `Support Files\Required\pdfsettings\settings\{mul,japan}\settings\*.joboptions` — `High Quality Print`, `Press Quality`, `PDFX1a 2001`, `PDFX3 2002`, `PDFX4 2008`, `Smallest File Size` — consumidos pela PDFL (`AdobePDFL.dll`) no Save As PDF. Ver `pdfl-pdfsettings.md`.
- **Flattening/transparência**: `Plug-ins\Illustrator Formats\FlattenTransparency.aip` + `Illustrator UI\FlattenTransparencyUI.aip` — achatamento pós-risco de impressão.
- **Overprint**: `Plug-ins\Illustrator Filters\Overprint.aip` — gestão de sobreimpressão (preflight visual).
- **Marcas**: `Plug-ins\Illustrator Filters\TrimMark.aip` — marcas de corte/registro.
- **Preview de separações**: `Plug-ins\Extensions\SeparationPreview.aip` (painel "Separation Preview").
- **Impressão**: `Plug-ins\Extensions\Print.aip` (+ `Printing Defaults` via driver; não inspecionado).
- **Collect for Output** existe como amostra VB (`Sample Scripts\Visual Basic\Collect for Output\CollectForOutput.vbs`) = embalagem de arquivos para gráfica, não imposição.

## 4. Conclusão (definitiva para ESTA instalação)

1. **Não há C-SEP** (ferramenta histórica de separação de produção da Adobe) instalada nem referenciada — 0 filenames, 0 strings.
2. **Não há motor/plugin de imposição nativo** no Illustrator 2026 30.6: nenhuma string `Impos*/step and repeat` em binários, plugins ou Presets; fotolito/imposição não é recurso de produto do Ai.
3. O que o install oferece de "produção gráfica" é: exportação PDF/X via joboptions (PDFL), flattening, overprint, marcas de corte e preview de separações — **sem pipeline de stepping/imposição**.
4. **Caveat**: imposição avançada (n-up, step-and-repeat, sangria, marcas de encadernação) é território de **Acrobat Pro / Preflight / soluções de terceiros** (ex.: Quite Imposing, plugins de Step&Repeat) ou de ferramentas próprias — no caso deste repositório, o `IllustratorImposerCLI` faz a repetição via DOM do Ai (ver `automacao.md`), não por recurso nativo.
5. Status: **verificado por análise estática** (string + filename). Itens que permanecem fora do escopo/estático: comportamento em runtime do diálogo "Salvar como PDF" e de menus de third-party — nenhum plugin de terceiros foi encontrado/avaliado nesta instalação (**não verificado**).