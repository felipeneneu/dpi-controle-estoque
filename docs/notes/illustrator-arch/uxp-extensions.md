# Extensões UXP — Adobe Illustrator 2026 (Windows)

> Análise estática (somente leitura) da instalação em `D:\Programas\Adobe Illustrator 2026`.
> Data: 2026-09-18 · Método: bytes → Latin1 + regex ASCII + parse JSON (`ConvertFrom-Json`).

## 1. O que é UXP neste aplicativo

UXP (Unified Extensibility Platform) é o novo runtime de extensões da Adobe — HTML/CSS/JS
rodando em um motor próprio (codinome **torq**), sem ExtendScript.

Identificação do motor na instalação:

| Artefato | Tamanho (bytes) | Identificação |
|---|---|---|
| `dynamic-torqnative.dll` | 63.968.261 | FileVersion `uxp-9.3.0-local` · Product "Unified Extensibility Platform" |
| `libdynamic-napi.dll` | 32.299.000 | Ponte V8/Node-API do motor |
| `dvauxphost.dll` | 3.798.520 | FileVersion 25.4.0.1 · Product "Adobe DVA 2025" · hospeda views UXP |
| `dvauxpui.dll` | 2.460.664 | Adapters de UI (dvauxpui::Panel/PanelAsMode/Dialog/Popup/Modeless) |
| `AIUXPExtensionHostAPI.dll` | 2.987.000 | API de host específica do Illustrator |
| `dvaaiuxp.dll` | 714.232 | Integração UXP (strings) |
| `UxpExtension.aip` (`Plug-ins\Extensions`) | — | Loader do plugin; strings `uxp-9.3.0-local`, `LoadUXPExtension` |

Evidências em strings (`UxpExtension.aip`): módulos `Uxp::Threading/Seal/V8/JNI/DOM/Runtime/
Plugins/Layout/Rendering/JS/Networking/Database/Testing/SelEngine/WebView`; IDs de painel
`com.adobe.unifiedpanel`, `com.adobe.illustrator.propertiespanel`,
com.adobe.stock.panel.licensing-embedded, `ccx-comments-uxp-webview`, `betaFeedbackPanel`,
`agentspanel`, `domTestPanel`; source path `D:\J\ws\ilst_rel_30_6\PlugInDev\UxpExtension\`.

`dvauxphost.dll` expõe comandos `uxphost.load/unload/closeview`, modo `hostview =
[panel, panelasmode, dialog, popup, modeless, no_ui]`, diretórios `UXPUserPluginsDir /
UXPSystemSharedPluginDir / UXPUser3PPluginDir / UXPSystem3PPluginDir` e log
"Finished scanning UXP Directories".

`dvauxpui.dll` referencia `require("torq-native").native("host/custom-text-view")` e
`applyCornerRadius` → o host nativo expõe controles customizados ao JS.

## 2. Diretório de extensões

`Support Files\Required\UXP\extensions\` — **17 pastas**, total **391.978.997 bytes (~392 MB)**.

| Pasta | Tamanho (bytes) | Id (manifest) | Versão | main | Hosts / entrypoint |
|---|---|---|---|---|---|
| `com.adobe.ccx.comments-webview` | 16.672.902 | com.adobe.ccx.comments-webview | 30.5.4 | external.html | AI/PS/ID · panel `ccx-comments-uxp-webview` |
| `com.adobe.ccx.plg.rtt` | 3.085.017 | ccx-in-app-plg-rtt | 0.0.48 | index.html | AUCB/ILST/PHXS/IDSN · panel onboarding 240×26 |
| `com.adobe.ccx.rtt` | 88.034.999 | ccx-in-app-rtt | 1.1.7 | index.html | AI/PS/ID · panel onboarding 240×26 |
| `com.adobe.ccx.sharesheet` | 8.014.159 | com.adobe.ccx.sharesheet | 30.37.4 | index.html | panels invite (Convidar) + review (Compartilhar p/ revisão) |
| `com.adobe.ccx.start` | 73.212.948 | — (container com plugins internos) | — | — | cc-photos-importer-uxp, express-template-picker, uxp-plugin-account-menu-trigger 1.0.0 |
| `com.adobe.ccx.timeline` | 1.674.068 | com.adobe.ccx.timeline | — | index.html | painel timeline de versionamento |
| `com.adobe.illustrator.agentsui` | 16.787.565 | com.adobe.illustrator.agentsui | — | index.html | painel agentes IA (bridge.js + chunk.js webpack) |
| `com.adobe.illustrator.domtest` | 204.784 | com.adobe.illustrator.domtest | — | index.html | painel de teste de DOM UXP |
| `com.adobe.illustrator.inAppNotifications` | 4.056.677 | com.adobe.illustrator.inAppNotifications | — | index.html | notificações in-app |
| `com.adobe.illustrator.onboarding` | 2.042.280 | com.adobe.illustrator.onboarding | — | index.html | onboarding |
| `com.adobe.illustrator.PixelSnappingOptions` | 4.726.749 | com.adobe.illustrator.PixelSnappingOptions | — | index.html | opções de encaixe de pixel |
| `com.adobe.illustrator.propertiespanel` | 10.122.118 | com.adobe.illustrator.propertiespanel | — | index.html | **Painel Propriedades** (manifestVersion 4, AI min 25.2.0, panel Panel2 250×450, ícones PL_Properties_N.svg, schema propriedades `Selection_*`) |
| `com.adobe.illustrator.t2vOnboarding` | 37.147.022 | com.adobe.illustrator.t2vOnboarding | — | index.html | onboarding texto→vetor (T2V) |
| `com.adobe.illustrator.videoplayer` | 11.844.994 | com.adobe.illustrator.videoplayer | — | index.html | player de vídeo nos painéis |
| `com.adobe.uam` | 2.119.567 | com.adobe.uam | — | index.html | gestão de conta (uxpStyles.css, popup) |
| `com.adobe.unifiedpanel` | 111.430.704 | com.adobe.unifiedpanel | 2605.142.0-r.8 | index.html | **Painel Unificado** (CRA/webpack; appCommitId 0d1dc89b5c3732bd051361178def0aedf84bcb09) |
| `StockPanel` | 802.444 | Adobe Stock (painel) | — | index.html | título "Adobe Stock"; index.js ~798 KB (webpack React) |

Observações de schema: os manifests usam `manifestVersion` (ex.: 4 no propertiespanel),
**não** possuem `requiredApiVersion` de nível superior; a versão mínima do host é indicada
em `host.minVersion` (ex.: AI ≥ 25.2.0).

## 3. Grupos funcionais

- **CCX (colaboração/Creative Cloud)** — comments-webview, plg.rtt, rtt, sharesheet, start, timeline.
  São os painéis de comentários, conversão de documentos (RTT = round-trip), compartilhar
  e importação CC.
- **Painéis do Illustrator** — propertiespanel (Propriedades), agentsui (IA/agentes),
  PixelSnappingOptions, inAppNotifications, onboarding + t2vOnboarding, videoplayer, domtest.
- **Painel Unificado** — `unifiedpanel` (111 MB, maior de todos): hospeda subaplicações
  (Exportar para telas, etc.) compiladas em webpack/CRA.
- **Stock** — StockPanel (busca/licença de imagens).
- **UAM** — com.adobe.uam (gerenciador de conta).

## 4. UxpResources (recursos compartilhados do runtime)

`Support Files\Required\UxpResources\` — 12.661.766 bytes:

| Arquivo | Tamanho (bytes) | Papel |
|---|---|---|
| `icudtl.dat` | 10.717.392 | Dados ICU do Chromium → o host UXP embute Chromium |
| `UXPHostTheme.css` | 806 | Tema CSS do host |
| `AdobeCleanUX\AdobeClean-{Regular,Bold,It,BoldIt}.{otf,ttf}` | 4×2 arquivos | Fonte da UI Corporativa Adobe (UX) |

Não há manifest nem loader dentro de `UxpResources` — o engine é carregado por
`UxpExtension.aip` + `dvauxphost.dll` + `dynamic-torqnative.dll`.

## 5. Stack de front-end (evidências)

- `propertiespanel/index.html` → `<title>Webpack React Demo</title>`; `main.js` = 10.1 MB (React)
- `unifiedpanel` → HTML padrão CRA ("Unified Panel Extension")
- `ccx.start\js\` → múltiplos `*.bundle.js` (chunks webpack)
- `agentsui` → `plugin/bridge.js` (16.952 B) + `static/js/*.chunk.js` (webpack CRA)
- `StockPanel` → `index.js` 798 KB (webpack) com título "Adobe Stock"
- `uam` → `uxpStyles.css` + componentes popup

Conclusão: **todas as extensões UXP da instalação são React + webpack** (CRA ou bundle manual).

## 6. Itens não verificados

- `uxtech.dll` (`Contents\Windows\`): strings genéricas HTTP; papel exato não confirmado.
- Mapeamento completo de cada painel interno do `unifiedpanel` (subbundles) — não enumerado.
- `com.adobe.ccx.start`: estrutura interna/aninhamento dos 3 subplugins — apenas listados.
- Comportamento de hibridização CEP↔UXP (uma extensão sendo carregada nos dois runtimes) — não testado (proibido executar).