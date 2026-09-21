# Frameworks de UI — Adobe Illustrator 2026 (Windows)

> Análise estática (somente leitura) da instalação em `D:\Programas\Adobe Illustrator 2026`.
> Data: 2026-09-18 · Método: bytes → Latin1 + regex ASCII + metadados de arquivo (FileVersion/Product).

## 1. Camadas de UI no aplicativo

```
┌────────────────────────────────────────────────────────────────────┐
│  CEP (Chromium 99 / NW.js)        UXP (motor "torq" uxp-9.3.0)     │
│  Bibliotecas, OnBoarding e etc.    Properties, Unified, CCX, IA     │
├────────────────────────────────────────────────────────────────────┤
│  Plug-ins nativos .aip (C++) — paletas, toolbox, serviços           │
│  (IllustratorUI.aip, AIToolBoxUI.aip, CropUI.aip, GenerateUI.aip...)│
├────────────────────────────────────────────────────────────────────┤
│  dvaui.dll = biblioteca de widgets nativos DVA ("Drover")           │
│  ADM (legado) · AirRobin (processo auxiliar headless)               │
└────────────────────────────────────────────────────────────────────┘
```

## 2. dvaui.dll — biblioteca nativa de widgets (DVA / "Drover")

`Support Files\Contents\Windows\dvaui.dll` — 31.551.480 bytes · 156.229 strings ASCII (≥ 8).

- Identidade: source `D:\J\ws\ilst_rel_30_6\META\dist\projects\dva\Drover\dvaui\config\src\DVAUIRuntimeConfiguration.cpp`
  → projeto **Drover** (DVA = Digital Video/Audio? marca DVA da Adobe; runtime de UI unificado).
- Entrada: `init-dvaui`, `enableAssertionDialog`, `dvaui::config::EnableRuntimeOption`.
- Acessibilidade: `dvaui::accessibility_support`, `dvaui::uiautomation_support` (UI Automation do Windows).
- Escala/DPI: `dvaui.SetAppScaleFactor` (1.0/1.5/2.0), `dvaui.FlashUpdateRegion`.
- Vocabulário de controles (strings de classe):
  `UI_AccordionSection`, `UI_AccordionView`, `UI_ColorSpectrum`, `DVA_ControlsLayout`,
  `UI_DateTextEdit`, `UI_AutoCompleteTextEditWithCapture`, `UI_FilePicker` (em `dvaadameve/controls`),
  `UI_PopupH`, `UI_TabWell`, `UI_ToolBar`, `UI_ScrollView`, `UI_MultiColumnTree`,
  `UI_SearchBox`, `UI_ProgressDialog`, `UI_PagedDialog`, `UI_LevelMeter(view)`,
  `dvaui/GridView`, `UI_CellsView`.
- Tokens de cor: referências a tokens Spectrum (ex.: "Reduced Contrast Default Foreground Token…")
  → o tema visual nativo segue a linguagem Spectrum da Adobe.

## 3. NGL Resources — diálogo de licença/autenticação (CEF)

`Support Files\Required\NGL Resources\` — 3.232.857 bytes.

| Arquivo | Tamanho (bytes) | Conteúdo/evidência |
|---|---|---|
| `resources\ui\index.html` | 3.198.794 | Página **"Adobe Licensing"** (título `<title>`); template **Handlebars** (30 refs); `normalize.css v7.0.0`; sem Coral/Spectrum/webpack → página CEF própria de licenciamento |
| `resources\cef_strings.json` | 5.741 | Chaves `authDialog.title` / `authDialog.desc` → strings do diálogo de login |
| `resources\locale_strings.json` | 7.492 | `WEBKIT_CBA_DIALOGUE_TITLE` → seletor de certificado (WebKit CBA) |
| `resources\cef_updation_strings.json` | 3.516 | Strings de atualização do CEF |
| `resources\ui\authdialog\mac\*.strings` | — | Cópias macOS (não usadas no Windows) |

Papel: o processo NGL (licenciamento) mostra um diálogo CEF (Chromium) para login/ativação e
seletor de certificado. É **aplicação de suporte**, não parte da UI do documento.

## 4. RIBS_UI — ícones de marca

`Support Files\RIBS_UI\` — 22 arquivos · 520.398 bytes · **somente ícones**:
`ai_app_16/32.png`, `ai_cc_appicon_*.png`, `ai_cc_folder.ico`, `ai_install_pkg_rev.{icns,ico}`,
`ProductIcon.png`, `WDTools/WDArtboardToggle/WDUndo/WDRedo/WDZoomOut/WDArrange` (pasta `Required\Resources`).
Sem código/executável → branding e ícones de janelas do instalador/app.

## 5. CEP vs UXP vs Nativo — comparação

| Aspecto | CEP (CSXS 5.0 / CEP 7.0) | UXP (torq uxp-9.3.0) | Nativo (.aip + dvaui.dll) |
|---|---|---|---|
| Motor | Chromium 99 (libcef.dll 169,6 MB) + NW.js (node.dll 0.63.2) | V8/Node-API próprio (dynamic-torqnative.dll 64 MB + libdynamic-napi.dll 32 MB) | C++ compilado |
| Idiomas | HTML/CSS/JS + ExtendScript (.jsx) | HTML/CSS/JS (sem .jsx) | C++ (SDK/AI SDK) |
| Painéis ex. | Bibliotecas (DesignLibraries), OnBoarding | Propriedades, Painel Unificado, CCX/comentários, IA | Atributos, Informação, toolbox, barra de controles |
| Manifest | `CSXS\manifest.xml` (XML, v7.0) | `manifest.json` (manifestVersion 4) | — (registro via .aip) |
| Integração | `PlugPlugOwl.dll`/`PlugPlugExternalObject.dll` | `UxpExtension.aip` + `dvauxphost.dll` + `AIUXPExtensionHostAPI.dll` | Direta (mesmo processo) |
| Tema | CSS próprio (JSX/HTML) | `UXPHostTheme.css` + `torq-native` | Tokens Spectrum/DVA, ADM legado |

Tendência observada: a Adobe migra funções do CEP → UXP (Properties, painéis CCX) e mantém a
UI nativa crítica (canvas, toolbox) em C++ sobre DVA, com o Painel Unificado (110 MB) como
"shell" React que agrega muitas ferramentas.

## 6. Itens não verificados

- `uxtech.dll` — função exata desconhecida (strings HTTP genéricas); tratado como componente
  auxiliar do runtime UXP/tecnologia web, sem confirmação.
- Drawbot/RegisterDrawbot citados em leitura preliminar do dvaui.dll — **não confirmados** em
  análise reproduzível; desconsiderados.
- `AIUXPExtensionHostAPI.dll` (2.987.000 B) — sem metadados de versão capturados; função inferida
  (API de host por aplicativo), não verificada.
- Mapa completo CEP↔UXP↔Nativo por painel.

## 7. Resumo executivo

O Illustrator 2026 usa **três runtimes de UI simultâneos**: (1) **CEP** (Chromium 99/NW.js) para
extensões legadas pesadas (Bibliotecas, OnBoarding — 165 MB em 2 bundles); (2) **UXP/torq**
(uxp-9.3.0, V8/Node-API, com Chromium embutido via icudtl) para os painéis modernos (Propriedades,
Painel Unificado, CCX, IA — 392 MB em 17 extensões, todas React/webpack); (3) **nativo C++** sobre
**DVA/Drover** (dvaui.dll, 31,5 MB de widgets) para canvas, toolbox e paletas de núcleo, com
resquícios ADM e processos auxiliares headless (AIRobin). O NGL cuida do diálogo de licença em CEF.