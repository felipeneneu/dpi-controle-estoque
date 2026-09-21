# Motor do Illustrator 2026 — mapa de evidência (Fase 2, análise estática)

- Alvo: `D:\Programas\Adobe Illustrator 2026`
- Método: somente leitura — PE headers (`pes.txt`), imports de 1º nível (`imports-graph.md`), strings seletivas (`strings-*.txt`), árvore de arquivos e config (`aifeatures.md`). Nada foi executado.
- Data: 2026-09-18

## Proveniência do build (strings de caminho embutidas)

| String (offset) | Evidência |
|---|---|
| `D:\J\ws\ilst_rel_30_6\META\dist\projects\bravo\source\agm\source\inc\OpenGLVBO.h` (AGM.dll 0x006449E0) | AGM = projeto **bravo**; **versão interna 30.6** (Illustrator 2026) |
| `D:\J\ws\ilst_rel_30_6\META\dist\projects\dva\Drover\dvaui\...\DVAUIRuntimeConfiguration.cpp` (dvaui.dll 0x008188C0) | dvaui = projeto **Drover** (DVA UI) |
| `C:\pie_jenkins\ci\gitws-0\src\photoshop\adobepie\...` + `photoshop\sources\PDFLInitialize.cpp` + `UAGMSheetRenderer.cpp` (AdobePIE.dll) | AdobePIE é o motor **PIE do Photoshop** com **PDFL (Adobe PDF Library)** integrado; build compartilhado com o Photoshop |
| `C:\BFS\BFSAll\META\dist\git\adobe\thirdparty\USD\pxr\usd\usd\object.h` (adobeusd_usd.dll 0x00A560E0) | USD é third-party **Pixar Universal Scene Description**, build Adobe |

## Tabela de motores (motor → evidência → status)

| Motor | Binários/artefatos | Evidência estática (PE / imports / strings / arquivos) | Status |
|---|---|---|---|
| **AGM — render vetorial** | AGM.dll (13,7 MB, subsys 2, base 0x180000000, 6 seções) | **56 imports**, incluindo `d3d12.dll`, `D3DCOMPILER_47.dll`, `dxgi.dll`, `OPENGL32.dll`, `GDI32.dll`; strings `AGMPrint*`, `AGPU_Device<AGPU_OGL>`, `OpenGLVBO.h`; satellites `AdobeSVGAGM.dll`, `drawbotagm.dll` | VERIFICADO — motor vetorial com backend D3D12 + OpenGL + compilador de shader |
| **AdobePIE / PDFL — imagem + PDF** | AdobePIE.dll (62,5 MB, subsys 3, 7 seções); núcleo PDFL também em bibliotecas separadas: `AdobePDFL.dll` (11,58 MB), `AdobePDFSettings.dll`, `pdfport.dll` (Fase 1) | **45 imports**: `AGM.dll`, `AdobeSVGAGM.dll`, `CoolType.dll`, `JP2KLib.dll`, `BIB.dll`/`BIBUtils.dll`, `AdobeXMP`, `AdobePDFSettings`, `icuuc77`, `tbb12`; strings `PDFLInitialize.cpp`, `pdflFontsFolder`, `font_set.cpp`, `layer_types.hpp`, `Moire Filter: `, `$$/SVG/Error/unableToParse`; pasta `PDFL Resource\Resource\CMaps` (CMaps CJK) | VERIFICADO — engine de imagem+PDF (PIE+PDFL) compartilhado com Photoshop, com PDFL também como DLL própria |
| **GPU / DirectX** | dxcompiler.dll (17,1 MB, subsys 3, linker 14.34) | dxcompiler: apenas imports CRT (biblioteca pura de compilação de shader DXIL/DXBC→SPIR-V); strings com alvos `vulkan1.0...vulkan1.3`, `universal1.5` (181 matches gpu); AGM importa d3d12/dxgi; Illustrator.exe importa `d3d12.dll`+`dxgi.dll`; adobe_c2pa importa d3d12+dxgi+`DirectML`+`dxcore`; dvaui importa `d2d1.dll`+`DWrite.dll` e tem `Direct 2D Drawbot Error - DXGI...`, `OS_OpenGLView`; CEPHtmlEngine traz `libEGL`, `libGLESv2`, `vk_swiftshader.dll`, `vulkan-1.dll` | VERIFICADO (parcial) — stack múltipla: D3D12 (render principal), OpenGL (fallback AGM), Direct2D/Write (UI dvaui/drawbot), Vulkan (embutido no CEF) |
| **USD 3D** | adobeusd_*.dll (20 DLLs: sdf 18,1 MB, usd 13,8 MB, gf, tf, pcp, vt...) | adobeusd_usd: **25 imports**, 13 delas `adobeusd_*` irmãs + `tbb12`, `VCRUNTIME`; seções `.pxrctor`, `.idata`, `.tls`; strings de caminho `pxr\usd\usd\*.cpp` (103 matches); `adobeusd_js.dll` (binding JS) | VERIFICADO — stack USD Pixar (build Adobe) para conteúdo 3D |
| **C2PA / Content Credentials** | adobe_c2pa.dll (32,8 MB, linker 14.44) | **26 imports**: `bcrypt`, `bcryptprimitives`, `d3d12.dll`, `DirectML.dll`, `dxcore.dll`, `dxgi.dll`, `ntdll`, `WS2_32`; strings em Illustrator.exe (156 matches ca) e AILib (150): `CAIUnicodeStringImpl::normalize`, `ElixirCAIFileStreamOptimization` | VERIFICADO — credenciamento de conteúdo C2PA; hashing perceptual via DirectML (GPU) |
| **ICU / fontes** | icudt77.dll (37,2 MB, **1 seção `.rdata`, 0 imports** = bloco de dados ICU), icuin77/icuuc77, CoolType.dll, DWrite.dll | imports: AILib/Illustrator.exe importam `icuin77`+`icuuc77`; AdobePIE importa `CoolType.dll`; dvaui importa DWrite; arquivos `PreComputedFontFeatures.bin` (11,4 MB) + `PreComputedFontNames.bin` (456 KB) no Required; strings `CTNewTextFontInstanceProcV3/V4` (AILib), `AGMPrintDeviceControllerGetTTFontDownload`, `pdflFontsFolder` | VERIFICADO — ICU (Unicode/i18n) + CoolType (rasterização de fontes) + cache de fontes pré-computado |
| **Sensei ML** | onnxruntime.dll (10,1 MB), DirectML.dll (12,2 MB), dxil.dll (1,4 MB); `weights\` (15 subpastas: AutoHandles, Denoiser, gen_expand_preset, masking_ai, match_font, NNStrokifier, ocr, planarModel, rt_detr, segmentationModel, sketch2mask, StrokeClassfier, turntable, vecseg); `Plug-ins\Extensions\SenseiAgents.aip` | strings: `AdobeIllustratorSenseiServices` (Illustrator.exe 0x02B2F000), `Adobe Sensei Agents Plugin` (Illustrator.exe/AILib), `SenseiAgents` (AILib); `DF_sim_*` (modelo `.dnm` 3 MB) no Required | VERIFICADO — inferência ML via **ONNX Runtime + DirectML** com modelos Sensei por feature |
| **Scripting host** | Illustrator.exe imports `SPBasic.dll` (ExtendScript), `ZXPSignLib-Minimal.dll`, `CloudAILib.dll`; AILib importa `SPBasic.dll`; CEPHtmlEngine.exe (Chromium: `libcef.dll` 169,6 MB, `node.dll` 15,9 MB, `chrome_elf.dll`, snapshots V8) | strings `UXPPhotoshopJSPath` (AdobePIE); formação `UXP/`, `UxpResources/`, `CEP/` no Required (manifests JSON/XML, hashes `signatures.xml`); `.jsx` (11) e `.js` (843) no Required | VERIFICADO — hospedeiros ExtendScript (SPBasic), UXP e CEP (Chromium embedded + Node) |
| **DVA UI** | dvaui.dll (31,6 MB, subsys 2, 6 seções) | **32 imports**: `dvacore.dll`, `dvaappsupport.dll`, `dvascripting.dll`, `d2d1.dll`, `DWrite.dll`, `dwmapi.dll`, `gdiplus`; Illustrator.exe importa `dvaui`, `dvaworkspace`, `dvaai`, `dvasystemcompatibilityreport`; strings de fonte `Drover\dvaui\ui\src\UI_Dialog.cpp`, `$$$/dvaui/...` (padrão de localização), `drawbotagm` | VERIFICADO — framework de UI Adobe (DVA "Drover"), render Direct2D ("drawbot") |
| **Plugins .aip (núcleo C/C++)** | 262 `.aip` (F1); `Plug-ins\` no Required: PDFSuite.aip, PDFFormat.aip, PathfinderS.aip, FlattenTransparency.aip, Rasterize.aip, UserInterface.aip... | imports de Illustrator.exe/AILib para `aifm.dll` (AI format manager) e plugins; `AITracing.dll` (Image Trace), `typequest_bravo.dll` (vetorização/estilos) | VERIFICADO — arquitetura de plugins AI padrão (SPBasic/ai_send) por `.aip` |

### Notas de identificação
- `dynamic-torqnative.dll` (61 MB, subsys 2, 9 seções, seção `.idata` e `.00cfg`) importa `libdynamic-napi.dll`, `d2d1`, `DWrite`, `gdiplus`, `winhttp`, `libdynamic-napi.dll` → **hipótese**: host nativo de plugins "dinâmicos" (N-API/Node) para a nova arquitetura de plugins; identidade "Torq" **não confirmada** por strings (0 matches rook/torq nas amostras).
- `AIACPL.dll` (29 MB) importada por Illustrator.exe e `mmsdk.dll` (16,5 MB, subsys 3) → infraestrutura Adobe (ACPL = Adobe ... Library; MM = Marketing/Media SDK? hipótese, **não verificado**).

## Busca imposition / prepress / C-SEP — CONCLUSÃO

**Não há evidência de módulo de imposition/C-SEP nesta instalação do Illustrator 2026.**

- **Tabelas de strings** (7 binários escaneados, cap 2000/binário): matches de `impos|csep|prepress|imposition|moire`:
  - AGM.dll: 5 — **falsos positivos** (`impossible`, `glBlendFuncSeparate...` onde "impos" cai dentro de "impossible")
  - AdobePIE.dll: 8 — quase todos falsos positivos (`GPUDisallowCanvasImposters` = "Imposters" de canvas GPU; `a"a'a,a1a6...` = ruído de codepoints) exceto **`Moire Filter: `** (filtro de moiré ao rasterizar, não imposition de páginas)
  - Illustrator.exe: 0 | AILib.dll: 0 | dvaui.dll: 0 | adobeusd_usd.dll: 0 | dxcompiler.dll: 4 (falsos positivos `impossible`)
  - **Nenhuma string real** do tipo `Imposition`, `C-SEP`, `csep`, `prepress` foi encontrada.
- **Nomes de arquivo** em todo o install: **0 arquivos/pastas** contendo `impos|csep|prepress|moire|rook|nebula`.
- **Plugins**: não existe `Imposition.aip`/`Catalog` nos 262 `.aip`; há `PDFSuite.aip`/`PDFFormat.aip` (suporte PDF, não imposition).
- **Config**: os presets `pdfsettings\settings\*.joboptions` (High Quality Print, Press Quality, PDF/X-1a, PDF/X-3, PDF/X-4) são material de **pré-impressão via engine PDF (PDFL)**, não de imposition de páginas.

**Interpretação**: pré-impressão no AI 2026 = engine PDF (AdobePIE/PDFL) + presets; o recurso histórico de imposition/C-SEP (que nunca foi nativo de varejo do Illustrator, era plug-in de fluxo editorial) **não está presente/escondido nesta build** — hipótese: removido ou nunca embarcado; para descartar 100% seria necessário verificação dinâmica (fora do escopo desta fase).

## Itens "não verificado" (hipótese pendente)

1. Backend de GPU efetivo em runtime (D3D12 vs OpenGL) — apenas imports/strings; preferência de `DriverSupportsDirectX`/`OpenGLRenderer` exige execução.
2. Papel exato de `dynamic-torqnative.dll` / `libdynamic-napi.dll` ("Torq" não confirmado por strings; N-API sim, pelos imports).
3. Strings literais `Content Credentials` não capturadas nas 2000 amostras (cap) — C2PA inferido por imports (bcrypt/DirectML/dxcore) + nomes `CAI*`/`ElixirCAI*`.
4. `subsystem=3` (console) em AdobePIE/dxcompiler/mmsdk/ASMKERN — provável artefato do build compartilhado PS; motivo exato não verificado.
5. Uso real do binding `adobeusd_js.dll` (USD↔JS) pelo scripting host.
6. `AIFeatures.cfg` vazio — se há flags adicionáveis em runtime (ver `aifeatures.md`).
7. `Illustrator.exe.bak`/`dynamic-torqnative.dll.bak` — atualização in-place ou backup de patch; comportamento não verificado.
8. AdobePIE "subsystem 3" misturado com `.baks` de mesmo tamanho sugere rebuild recente do binário (linker 14.42-14.44 = VS 2022 17.14).