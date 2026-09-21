# Relatório — Arquitetura do Adobe Illustrator 2026 (inspeção estática)

> Contexto: repositório `dpi-controle-estoque` (inventário de gráfica + automação de imposition/prepress via scripts do Illustrator).
> Propósito deste relatório: entender como a UI e os motores do Illustrator 2026 são construídos, para embasar automação/integração futura (ex.: `IllustratorImposerCLI` + `engine.jsx`).
> Idioma: pt-BR. Fatos ancorados em arquivos de evidência em `docs\notes\illustrator-arch\` (referenciados como `arquivo` ao longo do texto).

---

## 1. Visão geral

- **Objetivo**: mapear a arquitetura interna do Adobe Illustrator 2026 (versão 30.6.0, build `ilst_rel_30_6`, 64-bit, instalação pt-BR em `D:\Programas\Adobe Illustrator 2026`) — diretórios, binários, motores, frameworks de UI, superfícies de script/API e caminhos de automação externa.
- **Método**: **inspeção estática somente-leitura**. Nada foi executado, decompilado ou depurado. Técnicas usadas:
  - Catálogo de arquivos e tamanhos (`binarios.csv`, `arvore.txt`);
  - parse de cabeçalhos PE (DOS → COFF → Optional Header → seções) e cadeia `IMAGE_IMPORT_DESCRIPTOR` (`pes.txt`, `imports-graph.md`);
  - varredura de strings ASCII com offsets (cap 2000/binário; cap 500 em buscas de API) (`motores.md`, `apis.md`, `csep-impos.md`);
  - leitura de metadados de arquivo (FileVersion/Product), manifests XML/JSON (`cep-extensions.md`, `uxp-extensions.md`, `aifeatures.md`);
  - leitura de registro `HKLM:\SOFTWARE\Classes` (COM) — somente leitura (`apis.md`, `automacao.md`).
- **Escopo**: instalação local do Illustrator 2026. Não inclui análise de runtime, comportamento de menus de terceiros ou plugins não presentes na instalação.
- **Convenção**: itens não confirmados por execução estão marcados como **"a validar"** ou **"não verificado"**.

---

## 2. Mapa de diretórios

Tamanhos top-level consolidados na Fase 1 (varredura de disco). Nota: o arquivo de nota `arvore.txt` contém apenas os cabeçalhos no estado atual; os totais abaixo vêm da consolidação da Fase 1 (`binarios.csv` + varredura).

| Diretório (top-level) | Tamanho | Observação |
|---|---|---|
| `Cool Extras` | 742 KB | amostras/bônus |
| `Plug-ins` | 330 MB | ~246 `.aip` recursivamente; `Illustrator UI\` = 67 `.aip` (111,3 MB), `Extensions\` = 98 `.aip` (136,5 MB) |
| `Presets` | 29 MB | perfis, pincéis, estilos, ações, SVG, espaços de trabalho; `Presets\pt_BR\Scripts\` com 3 `.jsx` |
| `Scripting` | 5,1 MB | `Sample Scripts\JavaScript` (33 `.jsx`) + `Sample Scripts\Visual Basic` (40 `.vbs`) |
| `Support Files` | 3,1 GB | núcleo do aplicativo; 664 arquivos recursivos em `Contents\Windows`; 4.594 arquivos em `Required` |

Principais subárvores (`Support Files`):

| Subárvore | Conteúdo | Evidência |
|---|---|---|
| `Contents\Windows` | Binários do app: `Illustrator.exe`, DLLs de motores (AGM, AdobePIE, dvaui...), `CEPHtmlEngine\` (CEF completo), `weights\` (15 modelos Sensei), `System\AIRes.dll` | `binarios.csv`, `aifeatures.md` |
| `Required\AIRobin_Plug-ins` | `AIRobinService.aip` (949.752 B) + `3DLib.aip` (2.471.928 B, efeito 3D) — plugins carregados pelo processo auxiliar AIRobin | `ui-nativa.md` |
| `Required\CEP` | 2 bundles de extensão CEP, total 165.055.570 B (~165 MB): `com.adobe.DesignLibraries.angular` (73,8 MB) + `com.adobe.illustrator.OnBoarding` (91,2 MB) | `cep-extensions.md` |
| `Required\NGL Resources` | 3.232.857 B — diálogo de licença/login em CEF (página "Adobe Licensing", Handlebars) | `frameworks-ui.md` |
| `Required\UXP` | 17 pastas de extensões, total 391.978.997 B (~392 MB) | `uxp-extensions.md` |
| `Required\UxpResources` | 12.661.766 B — `icudtl.dat` (10,7 MB), fonte `AdobeCleanUX`, `UXPHostTheme.css` | `uxp-extensions.md` |
| `Required\PDFL Resource` | `Resource\CMaps` (47 CMaps CJK: Adobe-Japan1, GB1, CNS1, Korea1), `Resource\Fonts` (base14, fontes CJK/Arabic/Hebrew/Thai, símbolos PS) | `pdfl-pdfsettings.md` |
| `Required\pdfsettings` | Presets de PDF de produção: `settings\{mul,japan}\settings\*.joboptions` (High Quality Print, Press Quality, PDF/X-1a/3/4, Smallest File Size) | `pdfl-pdfsettings.md` |
| `RIBS_UI` | 22 arquivos, 520.398 B — somente ícones/branding (ai_app_16/32.png, ProductIcon.png, WDTools...) | `frameworks-ui.md` |

---

## 3. Binários e núcleo

### 3.1 Executáveis (8) — função inferida por strings/registro (`binarios.csv`, `automacao.md`, `pes.txt`)

| Executável | Tamanho | Função inferida |
|---|---|---|
| `Illustrator.exe` | 61,28 MB | Aplicação principal (PE32+ AMD64, linker 14.42, subsys GUI); registrado como servidor COM (`/Automation`); importa 86 DLLs de 1º nível |
| `CEPHtmlEngine.exe` | 4,64 MB | Engine HTML das extensões CEP — Chromium 99 via NW.js (FileVersion 12.1.0, Product "Adobe CEP HTML Engine"); **não é runner de .jsx** |
| `CRWindowsClientService.exe` | 1,66 MB | Cliente do Crash Reporter (named pipe, coleta de minidumps, leitura do System event log); não-automação |
| `AISafeModeLauncher.exe` | 1,59 MB | Launcher de modo seguro; strings não inspecionadas — **não verificado** |
| `AIMonitor.exe` | 1,30 MB | Monitor/sentinela: strings `AISentinelSerializeIPC*`, `--logs-path`; watchdog de processos/updates — **a validar** |
| `IllustratorDiagnosys.exe` | 0,62 MB | Coletor de diagnósticos/logs ("Start collecting logs"); não-automação |
| `AIRobin.exe` | 0,43 MB | Runner interno headless "Robin" (serviço de jobs em background; carrega `AIRobin_Plug-ins\`); uso externo — **a validar** |
| `AISniffer.exe` | 0,28 MB | Probe de GPU/display no instalador (`NumDisplays`, `EnableGPU`, `PerformanceRank`, `DXVersion`); não-automação |

### 3.2 Top DLLs (`binarios.csv`, `pes.txt`)

| DLL | Tamanho (MB) | Papel |
|---|---|---|
| `libcef.dll` | 161,77 (169.632.248 B) | Chromium Embedded Framework do runtime CEP |
| `dynamic-torqnative.dll` | 61,00 (63.968.261 B) | Runtime UXP ("Unified Extensibility Platform", FileVersion `uxp-9.3.0-local`) |
| `AdobePIE.dll` | 59,6 (62.496.248 B) | Engine PIE do Photoshop (PDF/imagem + PDFL) |
| `icudt77.dll` | 35,47 (37.190.136 B) | Dados ICU — **1 seção `.rdata`, 0 imports** (bloco de dados) |
| `adobe_c2pa.dll` | 31,31 (32.830.456 B) | C2PA / Content Credentials |
| `libdynamic-napi.dll` | 30,8 (32.299.000 B) | Ponte V8/Node-API do runtime UXP |
| `dvaui.dll` | 30,09 (31.551.480 B) | Widgets nativos DVA/"Drover" |
| `AIACPL.dll` | 27,69 (29.037.048 B) | Infraestrutura Adobe (ACPL; papel exato — **não verificado**) |
| `AILib.dll` | 24,92 (26.126.328 B) | Biblioteca núcleo do Illustrator (importa AGM, SPBasic, MPS, uxtech...) |
| `AGM.dll` | 13,04 (13.677.048 B) | Motor vetorial (núcleo de render/geometry) |

### 3.3 Proveniência de build (strings de caminho embutidas — `motores.md`)

- **AGM** = projeto **bravo**; versão interna **30.6** (`D:\J\ws\ilst_rel_30_6\META\dist\projects\bravo\source\agm\source\inc\OpenGLVBO.h` em AGM.dll 0x006449E0) → Illustrator 2026 (30.6.0).
- **AdobePIE** = motor **PIE do Photoshop** com **PDFL** integrado; build compartilhado (`C:\pie_jenkins\ci\gitws-0\src\photoshop\adobepie\...`, `photoshop\sources\PDFLInitialize.cpp`, `UAGMSheetRenderer.cpp` em AdobePIE.dll).
- **dvaui** = projeto **Drover** (DVA UI) (`...\projects\dva\Drover\dvaui\...\DVAUIRuntimeConfiguration.cpp` em dvaui.dll 0x008188C0).
- **USD** = third-party Pixar build Adobe (`C:\BFS\BFSAll\...\adobe\thirdparty\USD\pxr\usd\usd\object.h` em adobeusd_usd.dll).
- Linkers 14.42–14.44 (VS 2022 17.14); `Illustrator.exe.bak`/`dynamic-torqnative.dll.bak` (~1 byte menores) sugerem atualização in-place com backup.

---

## 4. Núcleo e motores

Tabela engine → evidência estática (`motores.md`, `imports-graph.md`, `pes.txt`, `aifeatures.md`):

| Motor | Artefatos-chave | Evidência | Status |
|---|---|---|---|
| **AGM — render vetorial** | `AGM.dll` (13,7 MB, subsys GUI, base 0x180000000); satélites `AdobeSVGAGM.dll`, `drawbotagm.dll`, `AdobeSVGAGM` | 56 imports: `d3d12.dll`, `D3DCOMPILER_47.dll`, `dxgi.dll`, `OPENGL32.dll`, `GDI32.dll`; strings `AGPU_Device<AGPU_OGL>`, `AGMPrint*`, `OpenGLVBO.h`; path **bravo** | VERIFICADO — motor vetorial com backend D3D12 + OpenGL + compilador de shader |
| **AdobePIE / PDFL — imagem + PDF** | `AdobePIE.dll` (59,6 MB, subsys 3); `AdobePDFL.dll` (11,04 MB), `AdobePDFSettings.dll`, `pdfport.dll`; plugin `PDFFormat.aip`, `PDFSuite.aip` | 45 imports: `AGM.dll`, `AdobeSVGAGM.dll`, `CoolType.dll`, `JP2KLib.dll`, `BIB.dll`/`BIBUtils.dll`, `AdobeXMP`/`AdobeXMPFiles`, `AdobePDFSettings`, `icuuc77`, `tbb12`; strings `PDFLInitialize.cpp`, `pdflFontsFolder`, `Moire Filter: `; `PDFL Resource\Resource\CMaps` (CMaps CJK); joboptions PDF/X | VERIFICADO — engine imagem+PDF integrado ao Photoshop; PDFL também como DLL própria (criação/leitura de PDF, PDF/X, flattening) |
| **GPU / DirectX** | `dxcompiler.dll` (16,31 MB / 17.105.400 B, subsys 3); `dxil.dll`; imports d3d12/dxgi em AGM, Illustrator.exe e adobe_c2pa | dxcompiler: 181 matches `gpu`, alvos SPIR-V `vulkan1.0...vulkan1.3`, `universal1.5` (DXIL/DXBC → SPIR-V); dvaui importa `d2d1.dll`+`DWrite.dll` (drawbot Direct2D); CEF traz `libEGL`, `libGLESv2`, `vk_swiftshader.dll`, `vulkan-1.dll` | VERIFICADO (parcial) — stack múltipla: D3D12 (render principal), OpenGL (fallback AGM), Direct2D/Write (UI), Vulkan (CEF/SwiftShader) |
| **USD 3D** | 20 DLLs `adobeusd_*.dll` (`sdf` 18,1 MB, `usd` 13,8 MB, `gf`, `tf`, `pcp`, `vt`, `usdGeom`, `usdShade`, `js`...) | Seções `.pxrctor`/`.idata`/`.tls`; imports cruzados entre irmãs `adobeusd_*` + `tbb12`; strings `pxr\usd\usd\*.cpp` (103 matches); binding `adobeusd_js.dll` (USD↔JS — uso real **não verificado**) | VERIFICADO — stack Pixar USD (build Adobe) para conteúdo 3D |
| **C2PA / Content Credentials** | `adobe_c2pa.dll` (31,31 MB, linker 14.44) | 26 imports: `bcrypt`, `bcryptprimitives`, `d3d12.dll`, `DirectML.dll`, `dxcore.dll`, `dxgi.dll`, `ntdll`; strings `CAIUnicodeStringImpl::normalize`, `ElixirCAIFileStreamOptimization` (em Illustrator.exe/AILib); hashing perceptual via DirectML (GPU) | VERIFICADO — credenciamento de conteúdo C2PA |
| **ICU / fontes** | `icudt77.dll` (35,47 MB, **1 seção `.rdata`, 0 imports** = dados puros); `icuin77`/`icuuc77`/`icucnv77`; `CoolType.dll` (4,3 MB); `PreComputedFontFeatures.bin` (11,4 MB) + `PreComputedFontNames.bin` (456 KB) | AILib/Illustrator.exe importam `icuin77`+`icuuc77`; AdobePIE importa `CoolType`; dvaui importa `DWrite`; strings `CTNewTextFontInstanceProcV3/V4`, `pdflFontsFolder` | VERIFICADO — ICU (Unicode/i18n) + CoolType (rasterização de fontes) + cache pré-computado de fontes |
| **Sensei ML** | `onnxruntime.dll` (9,64 MB), `DirectML.dll` (11,61 MB), `dxil.dll`; `weights\` com 15 subpastas de modelos (amostras: `masking_ai`, `match_font`, `ocr`, `vecseg`, `NNStrokifier`, `turntable`, `sketch2mask`, `rt_detr`, `segmentationModel`, `Denoiser`, `AutoHandles`...); `SenseiAgents.aip`, `DeepLearning.aip` | strings `AdobeIllustratorSenseiServices` (Illustrator.exe 0x02B2F000), `Adobe Sensei Agents Plugin`, `SenseiAgents`; modelo `DF_sim_model.dnm` (3,0 MB) no Required | VERIFICADO — inferência ML via ONNX Runtime + DirectML, modelos Sensei por feature |
| **Scripting host** | `SPBasic.dll` (motor ExtendScript, 0,02 MB) + `ExtendScript.dll` (4.5.6) + `ScCore.dll`; runtime UXP (`dynamic-torqnative.dll` + `libdynamic-napi.dll`); `CEPHtmlEngine.exe` | Illustrator.exe/AILib importam `SPBasic.dll`; `UxpExtension.aip` (strings `uxp-9.3.0-local`, `LoadUXPExtension`); CEP Chromium (`libcef.dll` + `node.dll`); `.jsx` (48) e `.js` (843) no install | VERIFICADO — 3 hospedeiros de script: ExtendScript (SPBasic), UXP, CEP |
| **DVA UI** | `dvaui.dll` (30,09 MB) | 32 imports: `dvacore.dll`, `dvaappsupport.dll`, `dvascripting.dll`, `d2d1.dll`, `DWrite.dll`, `dwmapi.dll`, `gdiplus`; source `Drover\dvaui\ui\src\UI_Dialog.cpp`; strings de localização `$$$/dvaui/...` | VERIFICADO — framework de UI Adobe DVA/"Drover" |
| **Plugins .aip (núcleo C/C++)** | 262 `.aip` em todo o install; no Required: `PDFSuite.aip`, `PDFFormat.aip`, `PathfinderS.aip`, `FlattenTransparency.aip`, `Rasterize.aip`, `UserInterface.aip`, `FrameworkS.aip`... | Illustrator.exe/AILib importam `aifm.dll` (format manager); `AITracing.dll` (Image Trace), `typequest_bravo.dll` (vetorização/estilos), `uxtech.dll`, `CloudAILib.dll` | VERIFICADO — arquitetura de plugins AI padrão (SPBasic/ai_send) por `.aip` |

### 4.1 Motor de imposition / C-SEP: **NENHUM presente** (`csep-impos.md`, `motores.md`)

- **Filenames**: 0 arquivos/pastas no install inteiro com `cs-?sep|csep|impos|prepress|moire|rook|nebula`.
- **Strings** (7 binários escaneados, cap 2000/binário): Illustrator.exe = 0; AILib = 0; dvaui = 0; adobeusd = 0; AGM = 5 (falsos positivos `impossible`/`glBlendFuncSeparate`); AdobePIE = 8 (falsos positivos `GPUDisallowCanvasImposters`, ruído de codepoints; exceção `Moire Filter: ` e `Moire Filter` = filtro de moiré ao rasterizar); dxcompiler = 4 (falsos positivos).
- **Plugins**: não existe `Imposition.aip`/`Catalog`; `Print.aip`, `PDFFormat.aip`, `Overprint.aip`, `TrimMark.aip`, `SeparationPreview.aip` = 0 matches de imposição.
- **O que existe de prepress** (não confundir): exportação **PDF/X via joboptions** (PDFL), flattening de transparência (`FlattenTransparency.aip`), sobreimpressão (`Overprint.aip`), marcas de corte (`TrimMark.aip`), preview de separações (`SeparationPreview.aip`), impressão (`Print.aip`) e amostra VB "Collect for Output" (embalagem de arquivos para gráfica) — **sem pipeline de stepping/imposição**.
- **Interpretação**: imposição não é recurso nativo do Illustrator; no fluxo deste repositório a repetição/step é feita via DOM do Ai pelo `IllustratorImposerCLI`, não por motor embarcado (ver §7). Descarte 100% exigiria verificação dinâmica (fora do escopo).

---

## 5. Frameworks de UI

Três runtimes de UI simultâneos (`frameworks-ui.md`, `ui-nativa.md`, `cep-extensions.md`, `uxp-extensions.md`):

### (a) Nativa C++ — `dvaui.dll` (DVA/"Drover")

- Biblioteca de widgets (`UI_AccordionSection`, `UI_AccordionView`, `UI_ColorSpectrum`, `UI_DateTextEdit`, `UI_FilePicker`, `UI_PopupH`, `UI_TabWell`, `UI_ToolBar`, `UI_ScrollView`, `UI_MultiColumnTree`, `UI_SearchBox`, `UI_ProgressDialog`, `UI_PagedDialog`, `DVA_ControlsLayout`...); escala/DPI `dvaui.SetAppScaleFactor` (1.0/1.5/2.0); acessibilidade (UI Automation).
- Tema: referências a **tokens Spectrum** da Adobe ("Reduced Contrast Default Foreground Token...").
- **ADM legado** (Adobe Dialog Manager) ainda presente: `FWToolboxADM` em `AIToolBoxUI.aip` (evidência pontual; presença em outros plugins — **não rastreada**).
- Plugins de UI constroem paletas/toolbox sobre DVA: `IllustratorUI.aip` (6,33 MB; paletas Attributes/Info, `dva_lock_button`, `dva_scroll_bar`, `panel_container`...), `AIToolBoxUI.aip` (toolbox; `toggleUnifiedPanel`, `GenAITool`), `GenerateUI.aip` (68,63 MB, efeito generativo), `CropUI.aip`, `MenuConfigurator.aip`.

### (b) CEP legado — Chromium 99 / NW.js

| Item | Valor | Evidência |
|---|---|---|
| Bundles | **2**: `com.adobe.DesignLibraries.angular` (73,8 MB) + `com.adobe.illustrator.OnBoarding` (91,2 MB); total 165 MB | `cep-extensions.md` |
| Engine | `CEPHtmlEngine.exe` 4,86 MB (FileVersion 12.1.0, Product "Adobe CEP HTML Engine") + `libcef.dll` 169,6 MB (CEF 99.2.15+g71e9523, Chromium-99.0.4844.84) + `node.dll` 0.63.2 (**NW.js**) | `cep-extensions.md` |
| Manifest | `CSXS\manifest.xml` (**ExtensionManifest 7.0** ⇒ CSXS 5.0); DesignLibraries com 5 extensões declaradas (Bibliotecas, touch, capture 2.0.41, stock-panel-licensing 4.0.35, cclibraries.manager) | `cep-extensions.md` |
| Bridge | `PlugPlugOwl.dll` (4,57 MB) + `PlugPlugExternalObject.dll` (0,03 MB) | `binarios.csv`, `cep-extensions.md` |
| Uso | Painel CC Libraries (UI Angular Spectrum, webpack, 11 `.jsx` internos via `evalScript`) e OnBoarding (janela Embedded 0×0, AutoVisible, conteúdo offline localizado) | `cep-extensions.md`, `scripts.md` |

### (c) UXP moderno — motor "torq" (uxp-9.3.0-local)

- **17 extensões** em `Required\UXP\extensions`, total **391.978.997 B (~392 MB)**, **todas React + webpack** (CRA ou bundle manual); manifests `manifestVersion` 4/5, host `AI` com `minVersion` 24.2–30.5, **0 ocorrências de `requireApiVersion`** (`uxp-extensions.md`, `apis.md`).
- Runtime: `dynamic-torqnative.dll` (64 MB, FileVersion `uxp-9.3.0-local`, Product "Unified Extensibility Platform") + `libdynamic-napi.dll` (32 MB, ponte V8/Node-API); views hospedadas por `dvauxphost.dll` (**25.4.0.1**, Product "Adobe DVA 2025") com `dvauxpui.dll` (adapters Panel/PanelAsMode/Dialog/Popup/Modeless; `require("torq-native")` expõe controles customizados); carregador `UxpExtension.aip`; integração por app via `AIUXPExtensionHostAPI.dll` (2,85 MB) e `dvaaiuxp.dll`.
- Principais painéis: **`unifiedpanel`** (111.430.704 B — "Painel Unificado", shell CRA/webpack que agrega subaplicações como Exportar para telas); **`propertiespanel`** (10,1 MB, Painel Propriedades, manifestVersion 4, min AI 25.2.0, schema tipado `Selection_*`/`AIReal`/`AIBoolean`); **CCX cloud** (comments-webview, rtt 88 MB, plg.rtt, sharesheet, start, timeline); **`agentsui`** (IA/agentes, `dependencies: { "dunamis": "" }`, permissões webview + rede adobe.com); `StockPanel` (798 KB, webpack React); `uam` (conta); PixelSnappingOptions, inAppNotifications, onboarding, t2vOnboarding (37 MB), videoplayer, domtest.
- `UxpResources\` (12,7 MB): `icudtl.dat` (10,7 MB — **host UXP embute Chromium**), `UXPHostTheme.css`, fonte `AdobeCleanUX`.
- Pontos de extensão complementares: `AIAgenticSystem.aip` (agentes/IA), `PropertiesPanel.aip` (nativo ↔ UXP), `domTestPanel`.

### Componentes de apoio

- **NGL Resources** (3,2 MB): diálogo de **licença/login em CEF** ("Adobe Licensing", Handlebars, normalize.css) + seletor de certificado (WebKit CBA) — aplicação de suporte, não UI de documento (`frameworks-ui.md`).
- **RIBS_UI** (22 arquivos, 520.398 B): **somente ícones/branding** (`ai_app_16/32.png`, `ai_cc_appicon_*.png`, `ai_cc_folder.ico`, `ProductIcon.png`, `WDTools/*`) — sem código/executável (`frameworks-ui.md`).

---

## 6. Scripts e APIs

Quatro superfícies de script, todas confirmadas por evidência estática (`apis.md`, `scripts.md`):

| Superfície | Existe? | Evidência-chave |
|---|---|---|
| ExtendScript / DOM | SIM | `ExtendScript.dll` (0,91 MB; **ExtendScript 4.5.6 build 80.1**) + `ScCore.dll` (0,85 MB); host `Plug-ins\Extensions\ScriptingSupport.aip` (5,11 MB; BridgeTalk/multi-script, `Startup Scripts CC`, `.jsx`/`.jsxbin`); DOM demonstrado por 48 `.jsx`; **ESTK (ExtendScript Toolkit) NÃO instalado** |
| UXP | SIM | 17 extensões com `manifest.json` (manifestVersion 4/5, host `AI`); runtime `uxtech.dll`, `AIUXPExtensionHostAPI.dll`, `dunamis-ingest.dll`, `libdynamic-napi.dll`, `dynamic-torqnative.dll` |
| CEP (CSInterface) | SIM | 2 bundles com `CSXS\manifest.xml` (v7.0); dezenas de cópias de `CSInterface.js`; `CEPHtmlEngine.exe` + `PlugPlugOwl.dll` |
| COM / ActiveX | SIM | ProgID `Illustrator.Application`/`Illustrator.Application.30` → CLSID `{9A4BA740-BEBF-4409-B787-AC7A610771A6}` → `LocalServer32 = ...\Support Files\Contents\Windows\Illustrator.exe /Automation`; TypeLib `{38E4E28D-F058-4D11-A6F0-9F70ABF345DC}` `1.0\0\win32` = `ScriptingSupport.aip` (**sem subchave win64**); 40 `.vbs` amostras com `CreateObject("Illustrator.Application")`; método **`DoJavaScript(código)`** |

Números de script no install (`scripts.md`):
- **48 `.jsx`** (0 `.jsxbin`): 33 em `Scripting\Sample Scripts\JavaScript`, 3 em `Presets\pt_BR\Scripts` (`SalvarDocsComoPDF.jsx`, `SalvarDocsComoSVG.jsx`, `Traçado de imagem.jsx`), 1 em `Contents\Windows\Scripts\CreateCSS.jsx`, 11 internos da extensão CEP DesignLibraries.
- **40 `.vbs`** em `Scripting\Sample Scripts\Visual Basic` (18 categorias; 0 `.bas`).
- Nenhuma amostra `.jsx` usa `#target` (rodam via menu `Arquivo > Scripts` ou COM). DOM presente: `app.documents` (21×), `app.activeDocument` (10×), `PDFSaveOptions` (9×), `new File` (9×), `exportFile` (4×), `saveAs` (3×), `app.open` (1×).

Esclarecimentos de nomenclatura (`apis.md`):
- **AMPS = 0**: busca case-sensitive `'AMPS'` em Illustrator.exe = 0 (29 matches `AMPS` são falsos positivos de contexto PostScript: `mpsKeyStreamPSFlags`, `mpsKeyStreamDCSVersion`, `mpsKeyWantCompositeStream`...).
- **MPS.dll ≠ script host**: 4,94 MB = "Adobe PostScript Level 3 Parser v1.0" (24× chaves `mpsKey*`); stack `MPSParser.aip`/`MPSExport.aip`/`MPSCommon.aip` = parsing de PostScript/PDF.
- **9-Slice** = recurso de escala de símbolo (6 matches de UI `$$$/Symbol/9SliceScaling/...`), não motor; **Slicer** = plugin de slices web (`slicingAttributes.aip`/`SlicingAttributesUI.aip`).

---

## 7. Automação externa / caminhos de integração

### 7.1 Caminho COM → `DoJavaScript` (oficial; já usado pelo repositório)

Fluxo implementado em `sidecars\IllustratorImposerCLI` (`automacao.md`):

```
Montar*.bat ──► IllustratorImposerCLI.exe ──► COM ProgID "Illustrator.Application"
                                               ├─ GetActiveObject / CreateInstance
                                               └─ DoJavaScript( config JSON + engine.jsx )
                                                    └─ ExtendScript DOM (app.open, artboards, layers, PDF export)
```

- `Program.cs` (240 linhas): auto-cura da TypeLib win64 via `HKCU\Software\Classes` (workaround para `TYPE_E_LIBNOTREGISTERED`, pois o registro oficial só tem `win32`); `Type.GetTypeFromProgID("Illustrator.Application")`; `GetActiveObject` (app ativo) ou `Activator.CreateInstance` (inicia o Illustrator); chama `aiType.InvokeMember("DoJavaScript", ...)`.
- `Scripts\engine.jsx` (195 linhas, embutido): `#target illustrator`; `app.open(File)` com `UserInteractionLevel.DONTDISPLAYALERTS`; lê `doc.layers[i].pageItems`, `doc.artboards[active].artboardRect` (mm↔pt), decide rotação por aproveitamento, redimensiona a prancheta para chapa/rolo, repete itens, exporta PDF.
- `Impor_Illustrator.bat`: orquestra o CLI com largura/tiragem/gap/margem; modo Bancada (ilustrador aberto + FineCut) ou Silencioso.
- Smoke test disponível: `test_ai_file.jsx` (raiz do repo) — escreve em arquivo via `File`; pode rodar por qualquer runner que faça `DoJavaScript` (**a validar**).

### 7.2 Outros executáveis (papel e status)

| Executável | Papel | Automação? |
|---|---|---|
| `AIRobin.exe` (0,43 MB) | Runner interno headless "Robin": strings `AI AIRobinService/Client Suite`, `AI RaidenSessionManager Suite`, `[RobinApp] HandleRobinIdle`, args `clientpid`/`sessionKey`/`DunamisSessionID`/`ProcessID`/`DiagnosysInfo`; carrega `AIRobin_Plug-ins\` (`AIRobinService.aip`, `3DLib.aip`); ProgID interno `AIRobin.com.adobe.AIRobin 30.6.0` (registro não achado em HKLM — pode ser HKCU). Modelo: serviço de jobs em background (UXP/Dunamis + mensagens de script); uso externo não documentado | **a validar** (protocolo exigiria execução) |
| `CEPHtmlEngine.exe` (4,64 MB) | Executa a camada HTML/JS das extensões CEP; não é runner de `.jsx` | Não (infra de extensões) |
| `CRWindowsClientService.exe` (1,66 MB) | Cliente do Crash Reporter (named pipe, minidumps, System event log) | Não |
| `AIMonitor.exe` (1,30 MB) | Sentinela/watchdog (`AISentinelSerializeIPC*`, `--logs-path`) | **a validar** |
| `AISniffer.exe` (0,28 MB) | Probe de GPU/display no instalador (`NumDisplays`, `EnableGPU`, `PerformanceRank`, `DXVersion`) | Não |
| `IllustratorDiagnosys.exe` (0,62 MB) | Coletor de logs/diagnósticos ("Start collecting logs") | Não |
| `AISafeModeLauncher.exe` (1,59 MB) | Launcher de modo seguro (strings não inspecionadas) | **não verificado** |

Regra geral: **tudo que exigiria execução está marcado como "a validar"** — assinatura/timeout exatos de `DoJavaScript`, protocolo do AIRobin, registro HKCU do ProgID Robin, comportamento do modo FineCut/Mimaki das linhas 121–195 do `engine.jsx`.

---

## 8. Glossário

| Termo | Definição |
|---|---|
| **AGM** | Adobe Graphics Model — motor gráfico vetorial base do Illustrator (render/geometry/color; backends D3D12/OpenGL; projeto interno "bravo"). |
| **PDFL** | Adobe PDF Library — biblioteca de parsing/geração de PDF da Adobe (criação, flattening, PDF/X, CMaps). Presente como `AdobePDFL.dll` própria e embutida no AdobePIE. |
| **AdobePIE** | PhotoShop Image Engine / PDF Import Engine — motor de imagem+PDF compartilhado com o Photoshop (build `pie_jenkins`); interpreta/importa PDF e imagem. |
| **UXP** | Unified Extensibility Platform — runtime moderno de extensões da Adobe (HTML/CSS/JS, sem ExtendScript); motor nativo "torq" (`uxp-9.3.0-local`), V8/Node-API, Chromium embutido. |
| **CEP** | Common Extensibility Platform — runtime legado de extensões web (Chromium 99/NW.js) + ExtendScript; manifests `CSXS\manifest.xml`; bridge via PlugPlug. |
| **DVA / Drover** | Digital Video/Audio (marca DVA da Adobe) — framework de UI nativo C++; biblioteca de widgets `dvaui.dll` (projeto "Drover"); render de UI via Direct2D ("drawbot"). |
| **NGL** | Camada de licenciamento/login da Adobe; na instalação expõe diálogo CEF ("Adobe Licensing") via `NGL Resources`. |
| **AIRobin** | Processo auxiliar headless ("Robin") que roda serviços/jobs em background isolados do processo principal; plugins em `AIRobin_Plug-ins\`. |
| **C2PA** | Coalition for Content Provenance and Authenticity — padrão de credenciamento de conteúdo (Content Credentials); implementado por `adobe_c2pa.dll` com hashing perceptual via DirectML. |
| **USD** | Universal Scene Description (Pixar) — formato/stack 3D embarcado como 20 DLLs `adobeusd_*.dll` (build Adobe). |
| **Sensei** | Framework de ML da Adobe — inferência via ONNX Runtime + DirectML; modelos por feature em `weights\` (15) e `DF_sim_*`. |
| **SPBasic / ExtendScript** | Motor de script clássico da Adobe (ECMAScript 3); `SPBasic.dll` = núcleo, `ExtendScript.dll`/`ScCore.dll` = runtime 4.5.6; DOM exposto pelo `ScriptingSupport.aip`. |
| **ADM** | Adobe Dialog Manager — kit de diálogos legado (herdado do Photoshop); resquício ainda usado em partes da UI (ex.: `FWToolboxADM`). |

---

## 9. Apêndice de evidências

Mapa: seção do relatório → arquivo(s) em `docs\notes\illustrator-arch\`.

| Seção | Arquivo(s) de evidência |
|---|---|
| §1 Visão geral | `motores.md`, `pes.txt`, `apis.md` (cabeçalhos de método) |
| §2 Mapa de diretórios | `arvore.txt` (cabeçalhos), `binarios.csv`, `aifeatures.md`, `ui-nativa.md`, `frameworks-ui.md` |
| §3.1 Executáveis | `binarios.csv`, `pes.txt`, `automacao.md` |
| §3.2 Top DLLs | `binarios.csv`, `pes.txt` |
| §3.3 Proveniência de build | `motores.md`, `aifeatures.md` |
| §4 Núcleo e motores | `motores.md`, `imports-graph.md`, `pes.txt`, `aifeatures.md`, `pdfl-pdfsettings.md` |
| §4.1 C-SEP/imposition = ausente | `csep-impos.md`, `motores.md`, `cpp-impos` (busca de filenames/strings) |
| §5 Frameworks de UI | `frameworks-ui.md`, `ui-nativa.md`, `cep-extensions.md`, `uxp-extensions.md` |
| §6 Scripts e APIs | `apis.md`, `scripts.md`, `cep-extensions.md`, `uxp-extensions.md` |
| §7 Automação externa | `automacao.md`, `apis.md`, `scripts.md` |
| §8 Glossário | síntese de todos os acima |
| §9 Apêndice | este arquivo |

Arquivos de evidência disponíveis e não citados em profundidade: `strings-*.txt` (amostras de strings dos binários; usadas como fonte secundária para confirmar claims — leituras limitadas).

---

## 10. Fase X — checklist de verificação

Checklist completo (verificado durante a síntese deste relatório):

- [x] Termos de referência entendidos (objetivo, escopo, entregáveis)
- [x] Evidências F1–F3 lidas e cruzadas (binarios.csv, arvore.txt, pes.txt, imports-graph.md)
- [x] Motores mapeados (motores.md, aifeatures.md, pdfl-pdfsettings.md, csep-impos.md)
- [x] Frameworks de UI mapeados (frameworks-ui.md, ui-nativa.md, cep-extensions.md, uxp-extensions.md)
- [x] Superfícies de API/script mapeadas (apis.md, scripts.md)
- [x] Caminhos de automação externa mapeados e marcados "a validar" onde exige execução (automacao.md)
- [x] Busca por motor de imposition/C-SEP concluída (0 filenames, 0 strings)
- [x] Nenhum número inventado; valores ausentes marcados como "não verificado"/"não coletado"
- [x] Glossário e apêndice de evidências preenchidos
- [x] Releitura do arquivo: 10 seções presentes; marcador ✅ presente

## ✅ FASE X COMPLETA
- Inventário: ✅
- PE/imports/strings: ✅
- UI frameworks: ✅
- APIs/automação: ✅
- Relatório entregue: ✅
- Data: 2026-09-18