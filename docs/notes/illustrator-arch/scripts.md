# Scripts.md — Catálogo de scripts de exemplo (Adobe Illustrator 2026, instalação pt-BR)

> Análise ESTÁTICA somente-leitura. Nenhum script foi executado.
> Instalação: `D:\Programas\Adobe Illustrator 2026` — versão 30.6.0 (build `ilst_rel_30_6`), 64-bit, pt-BR.
> Data: 2026-09-18.

## 1. Totais (confirmados por varredura de disco)

| Tipo | Total no install | Onde |
|------|-----------------|------|
| `.jsx` | **48** (0 `.jsxbin`) | 33 em `Scripting\Sample Scripts\JavaScript`; 3 em `Presets\pt_BR\Scripts`; 1 em `Support Files\Contents\Windows\Scripts`; 11 dentro da extensão CEP `DesignLibraries.angular` |
| `.vbs` | **40** | `Scripting\Sample Scripts\Visual Basic` (18 categorias) |
| `.bas` | 0 | não há módulos VB6 |

Distribuição dos 48 `.jsx`:
- `Scripting\Sample Scripts\JavaScript` — 33
- `Presets\pt_BR\Scripts\` — 3 (`SalvarDocsComoPDF.jsx`, `SalvarDocsComoSVG.jsx`, ` Traçado de imagem.jsx`)
- `Support Files\Contents\Windows\Scripts\CreateCSS.jsx` — 1
- `Support Files\Required\CEP\extensions\com.adobe.DesignLibraries.angular\...\jsx\*.jsx` — 11 (código interno do painel CC Libraries, ativado via CEP `evalScript` — *a validar*)

## 2. JavaScript (33 amostras, agrupadas por categoria)

Convenções observadas (evidência por grep em todos os 33): **nenhuma amostra usa `#target`**; roda via `Arquivo > Scripts`/`ScriptsMenu.aip` ou via COM `DoJavaScript`. Idiomas do DOM presentes no conjunto (contagens de ocorrência nos 33 arquivos):
`app.documents` = 21 · `app.activeDocument` = 10 · `PDFSaveOptions` = 9 · `new File(...)` = 9 · `exportFile(...)` = 4 · `saveAs(...)` = 3 · `app.open(...)` = 1.

| Categoria | Script | O que demonstra |
|-----------|--------|-----------------|
| AutoCAD | `ExportAsDWG.jsx` | exportar DWG via `ExportOptionsDWG` |
| AutoCAD | `OpenAndMergeLayers.jsx` | abrir e mesclar camadas |
| Datasets | `Variables And Datasets.jsx` | variáveis + datasets |
| Glyphs | `ApplyAlternateGlyphs.jsx` | glifos alternativos/OpenType |
| Gradients | `MakeLinearGradient.jsx` | gradiente linear |
| Gradients | `MakeRadialGradient.jsx` | gradiente radial |
| Miscellaneous | `AppInfo.jsx` | metadados do `app` (versão, idioma...) |
| Miscellaneous | `Brushes.jsx` | criação de pincel de arte |
| Miscellaneous | `Save as PDFs.jsx` | `app.activeDocument` + `PDFSaveOptions` + `exportFile` (Salvar como PDF) |
| MultiArtboards | `AddArtboards.jsx` | adicionar pranchetas |
| MultiArtboards | `CreateArtboards.jsx` | `app.documents.add(DocumentColorSpace.RGB, 612, 792, 3, DocumentArtboardLayout.GridByCol, 20, 3)` |
| MultiArtboards | `ExportArtboardsPhotoshop.jsx` | exportar cada prancheta p/ Photoshop |
| MultiArtboards | `RemoveArtboards.jsx` | remover prancheta |
| MultiArtboards | `SaveArtboardsAsPDF.jsx` | `new File(dest + '/Artboard')` + PDF por prancheta |
| Swatches | `CreateSpotSwatch.jsx` | cor exata (spot) |
| Swatches | `CreateSwatch.jsx` | amostra CMYK/RGB |
| Swatches | `CreateSwatchGroup.jsx` | grupo de amostras |
| Swatches | `EditPatternSwatch.jsx` | padrão editável |
| Swatches | `EditSwatch.jsx` | edição de amostra |
| Swatches | `SwatchGroupFromArt.jsx` | grupo a partir da arte |
| Working With Paths | `AlignTextWithPath.jsx` | texto em caminho |
| Working With Paths | `Make Star Group.jsx` | geometria de estrelas |
| Working With Paths | `MoveItem.jsx` | mover itens |
| Working With Paths | `Text on Path.jsx` | texto sobre traçado |
| Working With Paths | `Trees.jsx` | recursão / geração |
| Working With Symbols | `Symbols From Styles.jsx` | símbolo de estilos gráficos |
| Working With Text | `AlignText.jsx` | alinhamento de texto |
| Working With Text | `CountWords.jsx` | contagem de palavras em frames |
| Working With Text | `FlowingAreaText.jsx` | texto de área |
| Working With Text | `GetTextSelection.jsx` | seleção de texto |
| Working With Text | `KernRomanText.jsx` | kerning |
| Working With Text | `SelectRangeOfText.jsx` | range de caracteres |
| Working With Text | `SelectTextArt.jsx` | seleção de arte de texto |

Teor funcional: documento (5), desenho/geometria (7), cor/amostras (6), texto/glifos (9), exportação (5), multi-prancheta (5), automação/geral (3). (Soma > 33 por sobreposição de rótulos.)

## 3. Visual Basic / VBScript (40 amostras)

Convenção de hospedagem (evidência por leitura de `MultiArtboards\CreateArtboards.vbs`):
`Set appRef = CreateObject("Illustrator.Application")` — **conexão COM/Automation** com o ProgID `Illustrator.Application`.

| Categoria | .vbs |
|-----------|------|
| AutoCAD | `ExportAsDWG.vbs`, `OpenAndMergeLayers.vbs` |
| CalendarSample | `Calendar.vbs` (+ `CalendarTemplate.ai`) |
| Collect for Output | `CollectForOutput.vbs` (+ amostras logo/tif) — **embalagem p/ gráfica (Collect for Output)** |
| ColorWheel | `ColorWheel.vbs` (+ `Result.ai`) |
| ContactSheet | `ContactSheet.vbs` (+ imagens) |
| CycleGraph | `CycleGraph.vbs` (+ `.ai`) |
| Glyphs | `ApplyAltGlyphs.vbs` (+ `AsianText.ai`) |
| Gradients | `MakeLinearGradient.vbs`, `MakeRadialGradient.vbs` |
| Miscellaneous | `AppInformation.vbs` |
| MultiArtboards | `AddArtboards.vbs`, `CreateArtboards.vbs`, `ExportArtboardsPhotoshop.vbs`, `RemoveArtboards.vbs`, `SaveArtboardsAsPDF.vbs` |
| Sierpinski | `Sierpinski.vbs` (+ `Sample.ai`) |
| Swatches | `CreateSpotSwatch.vbs`, `CreateSwatch.vbs`, `CreateSwatchGroup.vbs`, `EditPatternSwatch.vbs`, `EditSwatch.vbs`, `SwatchGroupFromArt.vbs` |
| Web Gallery | `WebGallery.vbs` |
| Working with Datasets | `ExportAllExistingDatasets.vbs`, `ImportDatasets.vbs` |
| Working with Path Points | `CountCorners.vbs`, `CreatePaths.vbs`, `DeletePathPoint.vbs` |
| Working With Symbols | `SymbolsFromPageItems.vbs`, `SymbolsFromStyles.vbs` |
| Working with Tagged Art | `CreateDeleteTag.vbs` |
| Working With Text | `Align Text.vbs`, `Count Words.vbs`, `CreateArea Text.vbs`, `Get Selection.vbs`, `KernRomanOnlyText.vbs`, `MoveTextArt.vbs`, `Select Range of Text.vbs`, `Select Text Art.vbs` (+ `MixedText.ai`) |

Observação: a pasta VB contém também `.ai`/`.tif` de apoio (assets), totalizando mais arquivos que `.vbs`.

## 4. Scripts que vêm prontos no install (fora de Sample Scripts)

- `Presets\pt_BR\Scripts\` (3): `SalvarDocsComoPDF.jsx`, `SalvarDocsComoSVG.jsx`, ` Traçado de imagem.jsx` — provável exposição automática no menu `Arquivo > Scripts` do Illustrator pt-BR (*a validar*: mecanismo de enumeração de `Presets\<locale>\Scripts` pelo plugin `ScriptsMenu.aip`).
- `Support Files\Contents\Windows\Scripts\CreateCSS.jsx` — utilitário de extração CSS, colocado junto ao executável.
- `Plug-ins\Extensions\ScriptsMenu.aip` (61 KB) — plugin do menu de scripts (evidência de nome; conteúdo não analisado).

## 5. Observações finais

- Nenhum `.jsxbin` no install (os exemplos são fonte aberta).
- Os cabeçalhos das amostras são licença Adobe Systems (2005–2010; advento do modelo CC) — ver `Save as PDFs.jsx`, `AppInfo.jsx`, `Count Words.vbs`.
- Convenção do `engine.jsx` do repositório (`sidecars\IllustratorImposerCLI\Scripts\engine.jsx`): usa `#target illustrator` (o único script do repositório a declarar host) + `app.open()`, `doc.layers[]`, `doc.artboards[]`, `artboardRect`, `rotate(...)`, `UserInteractionLevel.DONTDISPLAYALERTS` — ver `automacao.md`.