# AIFeatures.cfg e configuração do Illustrator 2026 (Fase 2, somente leitura)

## 1) `AIFeatures.cfg` (raiz do install)

- Caminho: `D:\Programas\Adobe Illustrator 2026\AIFeatures.cfg`
- Tamanho: **65 bytes** (texto)
- Conteúdo (ASCII/UTF-8):

```
HEX: 3C 3F 78 6D 6C 20 76 65 72 73 69 6F 6E 3D 22 31 2E 30 22 20 65 6E 63 6F 64 69 6E 67 3D 22 75 74 66 2D 38 22 3F 3E 0D 0A 3C 46 65 61 74 75 72 65 73 3E 0D 0A 3C 2F 46 65 61 74 75 72 65 73 3E 0D 0A
TXT: <?xml version="1.0" encoding="utf-8"?>
<Features>
</Features>
```

- **Interpretação**: arquivo de switchboard de features em XML, porém **vazio** (`<Features></Features>`) — nenhuma feature opcional explicitamente habilitada/desabilitada. Hipótese (não verificada): o build de varejo vem sem flags; o arquivo permite toggles futuros (ex.: ativar/desativar modelos Sensei, C2PA, UXP) sem substituir binários.

## 2) `Support Files\Required` — censo de configuração

- Total: **4.594 arquivos**.
- Extensões relevantes (maiores grupos):
  | Extensão | Contagem | Tipo |
  |---|---|---|
  | .js | 843 | código/scripts (UXP/CEP) |
  | .svg | 546 | recursos gráficos (ícones de UI/UXP) |
  | .txt | 532 | dados/dicionários |
  | .json | 398 | **config (#1)** |
  | (sem extensão) | 290 | dados binários/texto |
  | .html | 286 | painéis CEP |
  | .css | 213 | estilos de painel |
  | .jpg | 181 | imagens |
  | .png | 153 | imagens |
  | .map | 141 | sourcemaps JS |
  | .mp4 | 137 | vídeos (onboarding/tutoriais) |
  | .dic | 114 | dicionários (corretores) |
  | .ts | 111 | TypeScript (origem de painéis) |
  | .ttf | 102 | fontes |
  | .properties | 84 | localização (Java-style) |
  | .shx | 74 | AutoCAD SHX (texto) |
  | .aff | 61 | Adobe font files? |
  | .otf | 44 | fontes |
  | .strings | 36 | localização Apple-style |
  | .zdct | 25 | dados |
  | **.xml** | **16** | **config XML (2º formato)** |
  | .aip | 16 | plugins (somente no Required) |
  | .joboptions | 15 | presets de PDF (pré-impressão) |
  | .jsx | 11 | scripts ExtendScript |
  | .ai | 9 | documentos |
  | .dll | 7 | bibliotecas |
  | .pfb | 5 | fontes PostScript Type1 |
  | .bin | 4 | dados pré-computados |
  | .wasm | 3 | WebAssembly (UXP?) |
  | .manifest / .plist / .ini (0 no Required) | 4/2/0 | — |

- **Formato de config dominante: JSON** (398) — manifestos de extensões UXP/CEP; **XML** (16) — principalmente manifestos CEP `CSXS\manifest.xml` e `MstnFontConfig.xml`; **nenhum .ini** dentro do Required (existe 1 .ini em todo o install).

### Diretórios de config relevantes (amostra)
- `\CEP\extensions\com.adobe.DesignLibraries.angular\` → `manifest.json` (3.669 B) + `extensions\capture\manifest.json` + `stock-panel-licensing\manifest.json` + `CSXS\manifest.xml` + `META-INF\signatures.xml` (assinatura, 478 KB)
- `\CEP\extensions\com.adobe.illustrator.OnBoarding\` → `CSXS\manifest.xml` (1.218 B) + `signatures.xml` (646 KB)
- `\pdfsettings\settings\<locale>\settings\*.joboptions` → `High Quality Print.joboptions`, `Press Quality.joboptions`, `PDF/X-1a 2001`, `PDF/X-3 2002`, `PDF/X-4 2008` (presets de pré-impressão)
- `\PDFL Resource\Resource\CMaps\*` → CMaps CJK do Adobe PDF Library (`90ms-RKSJ-UCS2`, `Adobe-CNS1-*`, `Adobe-GB1-*`)
- `\Linguistics\LanguageNames2\DisplayLanguageNames.*.txt` → nomes de idiomas
- Top-level do Required: `AcadFonts`, `AIRobin_Plug-ins`, `CEP`, `Fonts`, `Linguistics`, `New Document Profiles`, `NGL Resources`, `PDFL Resource`, `pdfsettings`, `PLGExperiment`, `Plug-ins`, `Resources`, `typesupport`, `UXP`, `UxpResources`, `GlobalResources`
- Arquivos binários na raiz do Required: `PreComputedFontFeatures.bin` (11,4 MB), `PreComputedFontNames.bin` (456 KB), `Default Patterns.pat`, `Mobile.presets`, `DF_sim_fea_tk.bin` (5,7 MB), `DF_sim_meta_tk.bin` (103 KB), `DF_sim_model.dnm` (3,0 MB — modelo Sensei), `familyLabels.csv`, `cacert.pem` (cadeia TLS), `GlobalResources`

## 3) Observações complementares

- Bin dir tem **664 arquivos** (recursivo), incluindo `CEPHtmlEngine\` (CEF completo) e `weights\` (15 modelos Sensei) + `onnxruntime.dll`/`DirectML.dll`/`dxil.dll`.
- Existem `Illustrator.exe.bak` e `dynamic-torqnative.dll.bak` com ~1 byte a menos que os ativos → atualização in-place com backup (hipótese).
- `AIFeatures.cfg` vazio + presença de `.bak` sugere que flags de feature desta build são determinadas por código/remote config, não por este arquivo.