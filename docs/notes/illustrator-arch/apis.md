# apis.md — Mapa das superfícies de API (evidências estáticas)

> Somente leitura. Binários: exame de strings ASCII com offsets (cap 500 matches/arquivo).
> Build: `ilst_rel_30_6` (Illustrator 2026 = versão 30.6.0), 64-bit.

## 0. Resumo executivo

| Superfície | Existe? | Evidência-chave |
|------------|---------|-----------------|
| ExtendScript DOM (JSX) | **SIM** | `ExtendScript.dll` + `ScCore.dll` (ExtendScript 4.5.6 build 80.1); host `ScriptingSupport.aip`; 48 `.jsx` |
| UXP | **SIM** | 17 extensões UXP com `manifest.json` (manifestVersion 4/5, host `AI`); runtime `uxtech.dll`/`AIUXPExtensionHostAPI.dll`/Dunamis |
| CEP (CSInterface) | **SIM** | 2 bundles CEP com `CSXS/manifest.xml` (ExtensionManifest 7.0); centenas de cópias de `CSInterface.js`; `CEPHtmlEngine.exe` |
| COM/ActiveX | **SIM** | ProgID `Illustrator.Application`/`.30`; `LocalServer32 = Illustrator.exe /Automation`; TypeLib → `ScriptingSupport.aip`; 40 `.vbs` |
| AMPS / "9-Slice" / "Slicer" / "script host" | **strings não encontradas como motor** | see §6 |

## 1. ExtendScript / DOM

Binários do motor (na pasta `Support Files\Contents\Windows`):
- `ExtendScript.dll` (934 KB) — strings: `BUILDINFO ExtendScript 4.5.6 80.1 2014/12/03`, `ADOBE_INFO : Adobe ExtendScript 4.5.6`, `The ExtendScript scripting engine. Copyright 1998-2014 Adobe`, `ExtendScript version does not match ScCore version!`, `jsx.jsxbin`, cadeias `$$$/CT/ExtendScript/...` (UI/erros/datas).
- `ScCore.dll` (868 KB) — strings: `ADOBE_INFO : Adobe ExtendScript 4.5.6`, `$$$/CT/ExtendScript/Errors/...`.

Host/plugin (o que liga o motor ao Illustrator e expõe o DOM):
- `Plug-ins\Extensions\ScriptingSupport.aip` (5,36 MB) — strings:
  - `getExtendScriptEngine@Variant@ScCore@@QEBAPEAVEngine@ScScript@@` (C++ mangled: acesso ao engine ScCore)
  - `ExtendScriptHandler@BridgeTalkLiveObject@ScObjects@@` e `ExtendScript@MultiScript@@` → **BridgeTalk / multi-script** (mensageria inter-app)
  - `ExtendScript.dll`, `AXEDOMCore.dll` (XML DOM core)
  - `Adobe/Startup Scripts CC`, `".jsx"` + `".jsxbin"` (pastas de scripts de inicialização)
  - `AI_BG_SCRIPTING_EXPORT_SCREENS`, `AI11 Gallery Scripting ... Presets/Collections`, `ScriptingSuitePerformAction` (constantes/actions do DOM)
- Evidência do DOM via amostras `.jsx`: `app.documents.add(DocumentColorSpace.RGB, ...)`, `app.activeDocument`, `app.open(File)`, `doc.artboards[...].artboardRect`, `doc.layers[i].pageItems`, `PDFSaveOptions`, `exportFile`, `saveAs` — ver `scripts.md`.
- `Plug-ins\Extensions\ScriptsMenu.aip` — menu `Arquivo > Scripts`.
- **ExtendScript Toolkit (ESTK): NÃO INSTALADO** — sem pasta `Adobe ExtendScript Toolkit` em `C:\Program Files (x86)\Adobe` e sem entrada de desinstalação; o motor embarcado (4.5.6) é o único vestígio de ESTK nesta máquina.

## 2. UXP

- **17 extensões** em `Support Files\Required\UXP\extensions` (F1 confirmado): `ccx.comments-webview`, `ccx.plg.rtt`, `ccx.rtt`, `ccx.sharesheet`, `ccx.start` (+ subplugins `cc-photos-importer-uxp`, `express-template-picker`, `uxp-plugin-account-menu-trigger`), `ccx.timeline`, `illustrator.agentsui`, `illustrator.domtest`, `illustrator.inAppNotifications`, `illustrator.onboarding`, `illustrator.PixelSnappingOptions`, `illustrator.propertiespanel`, `illustrator.t2vOnboarding`, `illustrator.videoplayer`, `uam`, `unifiedpanel`, `StockPanel`.
- Manifests (varredura dos 20 `manifest.json`): `manifestVersion` 4 ou 5; host `"app": "AI"` com `minVersion` de 24.2 até **30.5.0** (unifiedpanel/uam aceitam AI 30.5+; agentsui exige 30.0+); entrypoints:
  - `domtest` → `panel:domTestPanel` (min AI 30.0.0)
  - `propertiespanel` → `panel:Panel2` (min AI 25.2.0; `properties` com centenas de chaves tipadas `AIReal`, `AIBoolean`, `VectorAIShort` etc. = contrato de UI com o host nativo)
  - `agentsui` (AI Assistant) → `panel:agentspanel` + `command:cmd.aiagents.new.chat`; `requiredPermissions: webview.enableMessageBridge, network https://*.adobe.com + https://localhost:*`, `localFileSystem: request`; **`dependencies: { "dunamis": "" }`** (runtime UXP)
  - Nenhum manifest usa `requireApiVersion` (0 ocorrências) — API liberada pela versão mínima do host.
- Runtime UXP em `Contents\Windows`: `AIUXPExtensionHostAPI.dll` (2,99 MB), `uxtech.dll` (859 KB), `dunamis-ingest.dll` (3,0 MB), `libdynamic-napi.dll` (32,3 MB, Node-API) e `dynamic-torqnative.dll` (64 MB, CEF/Torq). `UxpResources\` = `AdobeCleanUX\`, `icudtl.dat` (ICU/Chromium), `UXPHostTheme.css` (host baseado em Chromium).
- Evidência de carregamento nativo: plugin `Plug-ins\Extensions\UxpExtension.aip` (728 KB) — nome apenas (conteúdo não analisado).

## 3. CEP

- **2 bundles** em `Support Files\Required\CEP\extensions` (F1 confirmado):
  - `com.adobe.DesignLibraries.angular` — `CSXS/manifest.xml` (ExtensionManifest **7.0**, bundle `com.adobe.DesignLibraries.angular.2015.1`, `Host Name="ILST" Version="[29.2,99.9]"`, entrypoints `panel:ccLibrariesPanel` + `command:adobeStockLicensingPlugin`), `ccd_manifest.json`, UI Angular Spectrum (SpButton/SpIcon...) — o painel CC Libraries (e `main.js` + 11 `.jsx` internos).
  - `com.adobe.illustrator.OnBoarding` — `CSXS/manifest.xml` + `index.html` + `offline\**` com **dezenas de cópias de `CSInterface.js`** (ex.: `GenExpand/CSInterface.js`, `ImageTrace/CSInterface.js`, `MeasureTool/CSInterface.js`, `ShapeFill/CSInterface.js`...) + `README.md` — onboarding/FTUE por CEP.
- Engine CEP: `Support Files\Contents\Windows\CEPHtmlEngine\CEPHtmlEngine.exe` (4,86 MB) — strings `adobe_cep__.analyticsLogging()`, `native_showopendialogex`, `native_showsavedialogex`, `vulcangettargetspecifiersEx`, `vulcanGetTargetSpecifiers` → ponte nativa (dialogs/object specifiers) do host CEP.
- Infraestrutura CEP em `Contents\Windows`: `PlugPlugExternalObject.dll` (35 KB) e `PlugPlugOwl.dll` (4,79 MB) = bridge CEP ↔ host.

## 4. COM / ActiveX

Registro (leitura `HKLM:\SOFTWARE\Classes`, somente-leitura):
- `Illustrator.Application` → ProgID geral (`(default)="Illustrator Application"`, sem `CurVer` explícito)
- `Illustrator.Application.30` → `CLSID={9A4BA740-BEBF-4409-B787-AC7A610771A6}`; `LocalServer32 = "D:\Programas\Adobe Illustrator 2026\Support Files\Contents\Windows\Illustrator.exe /Automation"` ← **entrada de automação COM**; `TypeLib={38E4E28D-F058-4D11-A6F0-9F70ABF345DC}`
- TypeLib: `HKLM\...\TypeLib\{38E4E28D-...}\1.0\0\win32 = "D:\Programas\Adobe Illustrator 2026\Plug-ins\Extensions\ScriptingSupport.aip"` ← **a type library COM vive dentro do plugin de scripts**; **não há subchave `win64`** (falha conhecida → workaround no repositório, ver `automacao.md`).
- Amostras VB: `Set appRef = CreateObject("Illustrator.Application")` (40 `.vbs`).
- Superfície: interface expõe ao menos `DoJavaScript(appCode)` — evidência: `Type.GetTypeFromProgID("Illustrator.Application")` + `InvokeMember("DoJavaScript", ...)` no `IllustratorImposerCLI` do repositório (*a validar* para a assinatura exata; pode aceitar tamanho/timeout).
- ProgID adicional de script runner: string em `AIRobin.exe` = `AIRobin.com.adobe.AIRobin` (30.6.0) — procura em `HKLM\SOFTWARE\Classes\AIRobin*` não achou chave; registro pode ser por-usuário (`HKCU\Software\Classes`) → **não verificado**.

## 5. PDFL

Papel: ver `pdfl-pdfsettings.md`.

## 6. AMPS / 9-Slice / Slicer / script host (offsets)

Buscas com offsets (cap 500; ASCII, offsets hex do match):

`Illustrator.exe` (61,3 MB):
| Padrão (case-insensitive) | Matches | Leitura |
|---|---|---|
| `AMPS` | 29 | **falsos positivos** — contexto PostScript de separação de cores: `_rampSD`, `mpsKeyStreamPSFlags`, `mpsKeyStreamDCSVersion`, `mpsKeyWantCompositeStream` (0x02B2FABA, 0x02B52D20...); **case-sensitive `'AMPS'` = 0** |
| `9Slice|9-slice` | 6 | só UI de símbolo: `$$$/Symbol/9SliceScaling/9SliceScalingWarning=9 Slice defines how a symbol scales...` (0x02C04C9B), `AI13Pattern9SliceScalingGridKey` (0x02CAE8D3), `DropLegacyScale9` (0x02CAE9F4) — **recurso de escala de símbolo, não motor** |
| `Slicer` | 0 | — |
| `script host` | 0 | — |
| `C-SEP|CSEP|Impos|Impositor|step and repeat` | 0 | ver `csep-impos.md` |
| `AIRobin` | 24 | `AI AIRobinClient Suite` (0x02B2339B), `AI AIRobinService Suite` (0x02B23ED3), `AIRobin.AIRobin 2026` (0x02BBD320), `ERROR: AIRobinClient suite not found`, `HandleSaveAIFileScriptMessage: Robin...`, `AIRobinGeneral.log` |

`AIRobin.exe` (455 KB):
| Padrão | Matches | Leitura |
|---|---|---|
| `AMPS`, `9Slice`, `Slicer`, `ExtendScript`, `script host`, `CSInterface`, `\.jsx` | 0 | — |
| `CEP` | 24 | só infra C++ (`ExceptionPtr...`, `VCRUNTIME140.dll`) — não é CEP |
| `AIR` | 23 | `AI AIRobinService Suite`, `AI Application Private Suite`, `AI RaidenSessionManager Suite`, `AIRobin_Plug-ins`, `AIRobin.com.adobe.AIRobin...30.6.0`, `[RobinApp] HandleRobinIdle`, `AIROBIN_DISABLE_CRASH_REPORTER`, `AIRobinImpl.cpp line: 69` com args `clientpid`, `sessionKey`, `DunamisSessionID`, `ProcessID`, `DiagnosysInfo`, `AIRobinServiceGeneral.Log`, `AIRobin.pdb ...\ilst_rel_30_6\symbols\64\win\release\AIRobin` |

Complementos que esclarecem o pedido "AMPS/9-Slice":
- **MPS não é script host**: `MPS.dll` (5,05 MB) = "Adobe PostScript Parser" / "Adobe PostScript Level 3 Parser v1.0" com chaves `mpsKeyCommonParserParams`, `mpsKeyPostScript3ParserParams` (24× `mpsKey`), ρed; `Plug-ins\Illustrator Formats\MPSCommon.aip`, `MPSParser.aip`, `MPSExport.aip` → stack de parsing de PS/PDF, não de scripts.
- **Slicer = plugin de slices web**: `Plug-ins\Illustrator Formats\slicingAttributes.aip` / `Illustrator UI\SlicingAttributesUI.aip` (AdobeSlicingPlugin; `ImageSliceIcon`, `LayerSliceIcon`, `TextSliceIcon`, `$.../slicingAttributes/Str/Make=&Slice`). Não há "Slicer engine" discreto.

**Conclusão §6**: não existe string "AMPS" real (case-sensitive) nem `script host` nos binários; o motor de scripts é o ExtendScript 4.5.6 (`ExtendScript.dll`/`ScCore.dll`, ver §1); 9-Slice e Slicer são recursos de produto, não motores.