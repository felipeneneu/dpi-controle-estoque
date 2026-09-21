# pdfl-pdfsettings.md — Papel do PDFL Resource e pdfsettings (por que o Ai embarca filtragem de PDF de produção)

> Análise estática; somente leitura.

## 1. O que é a PDFL no Illustrator 30.6

- **PDFL = Adobe PDF Library** — a biblioteca de parsing/geração de PDF da Adobe.
- Binários em `Support Files\Contents\Windows`:
  - `AdobePDFL.dll` (11,58 MB) — núcleo PDFL (criação/leitura de PDF, flattening, PDF/X).
  - `AdobePDFSettings.dll` (217 KB) — leitura/escrita de presets PDF (`.joboptions`).
  - `pdfport.dll` (1,11 MB) — camada de transporte/porta do PDF (import).
  - `AdobePIE.dll` (62,5 MB) — mecanismo de interpretação/import (PDF "Import Engine").
- Plugin de formato: `Plug-ins\Illustrator Formats\PDFFormat.aip` (1,17 MB) — strings revelam que ele **consome joboptions**: 77 matches de `joboptions` (ex.: `settings from joboptions file`, `FatalSettingsError`, `Creating settings file list`, `JoboptionsStringType`), e a string `"requests both PFD/X-1a and PDF/X-3 compliance"` (0x000C76BF) — evidência direta do caminho PDF/X de produção.

## 2. `PDFL Resource\Resource\` — recursos usados na geração de PDF

- `CMaps\` — 47 arquivos de CMap CJK (Adobe-Japan1, Adobe-GB1, Adobe-CNS1, Adobe-Korea1, variantes UCS2/90ms-RKSJ etc.) → mapeamento de fontes CJK ao gravar/exportar PDF.
- `Fonts\` — fontes base14/variantes embutíveis por default: `CourierStd*`, `MyriadPro-Regular`, `MinionPro-Regular`, `AdobeArabic-*`, `AdobeHebrew-*`, `AdobeThai-*`, `AdobePiStd.otf`, símbolos `sy_____.pfb`, `zx____.pfb`, `zy____.pfb` (+ `.afm`/`.pfm` em `PFM\`) → substituição/incorporação mínima de fontes no PDF gerado.

Ou seja: o "PDFL Resource" é o dicionário de fontes/CMaps que a biblioteca consulta ao criar o PDF final (exportar PDF, separações, PDF/X).

## 3. `pdfsettings\settings\` — presets de PDF de produção (joboptions)

Estrutura:
- `settings\mul\settings\` (multilíngue):
  - `High Quality Print.joboptions` (32.216 B)
  - `Press Quality.joboptions` (30.097 B)
  - `PDFX1a 2001.joboptions` (48.950 B)
  - `PDFX3 2002.joboptions` (48.692 B)
  - `PDFX4 2008.joboptions` (37.513 B)
  - `Smallest File Size.joboptions` e `Smallest File Size (PDF 1.6).joboptions` (32.681 B cada)
- `settings\japan\settings\` — mesmos presets com sufixo JPN + `MAGAZINE Ad 2006 JPN.joboptions` (padrão de revista japonês).

Formato: **dicionário PostScript estilo Distiller** — cabeçalho lido de `High Quality Print.joboptions`:
```
<<
  /ASCII85EncodePages false
  /AllowTransparency false
  /AutoPositionEPSFiles true           # auto-position EPS nativo (PDFL)
  /CalGrayProfile (Dot Gain 20%)
  /CalRGBProfile (sRGB IEC61966-2.1)
  /CalCMYKProfile (U.S. Web Coated (SWOP) v2)
  /CompatibilityLevel 1.4
  /CompressObjects /Tags
  /ConvertImagesToIndexed true
  /EmbedAllFonts true
  /ColorConversionStrategy /LeaveColorUnchanged
  ...
```
Esses arquivos são o padrão da indústria "Adobe PDF Settings" (os mesmos presets do Acrobat Distiller) — e é por isso que o Illustrator 2026 fala "High Quality Print / Press Quality / PDF/X-1a / PDF/X-3 / PDF/X-4" no diálogo "Salvar como PDF".

## 4. `pdfsettings\translationdictionaries\Res\*.zdct`

- Dicionários por locale usados para localizar a UI/filtros do diálogo PDF: `ARA, CHS, CHT, CZE, DAN, DEU, ENU, ESO, FRA, GRE, HEB, HUN, ITA, JPN, KOR, NLD, NOR, POL, PTB, RUM, ...` — **`PTB` presente** = pt-BR.

## 5. Por que o Ai embarca filtragem de "Print Production PDF"

1. **Exportação/importação de PDF fiel**: o Ai tem que ler/gravar PDF nativamente (ABNT: separações, transparência, fontes, CMaps CJK) → usa PDFL.
2. **Conformidade PDF/X** (gráfica): X-1a (CMYK/trap), X-3 (permissivo com cores gerenciadas), X-4 (transparência) são exigências comerciais de gráficas; o Ai oferece esses presets prontos nos joboptions.
3. **Workflow de produção**: presets "Press Quality"/"High Quality Print" são os padrões usados em fluxos de gráfica (inclusive no pipeline deste repositório: `Save Artboards As PDF`/`SalvarDocsComoPDF.jsx` usam `PDFSaveOptions`).
4. **Relação com imposição**: os joboptions preparam o PDF final (marcas, blood, espaço de cor), mas **não fazem imposição** — ver `csep-impos.md`: stepping/step-and-repeat continua fora do Ai (Acrobat/Preflight/terceiros ou o `IllustratorImposerCLI` do repositório via DOM do Ai).

## 6. Outros datapoints correlatos

- `New Document Profiles\pt_BR\` — perfis de novo documento (pt-BR): `Arte e ilustração.ai`, `Dispositivos móveis.ai`, `Filme e vídeo.ai`, `Identidade visual.ai`, `Impressão.ai`, `Rede social.ai`, `Web.ai` → o perfil **`Impressão.ai`** (Print) é o gatilho de novo doc em modo gráfica.
- `Support Files\Required\Resources\pt_BR\` — recursos de UI (setas, Bisel.ai, SVG filters, VariableWidthProfiles) — não relacionado a PDF.
- `AIFeatures.cfg` (raiz do install) — configuração de features (não inspecionado; **não verificado** se lista PDFL/PDF settings).