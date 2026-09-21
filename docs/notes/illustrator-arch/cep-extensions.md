# Extensões CEP — Adobe Illustrator 2026 (Windows)

> Análise estática (somente leitura) da instalação em `D:\Programas\Adobe Illustrator 2026`.
> Data: 2026-09-18 · Método: bytes → Latin1 + regex ASCII + parse XML (`[xml]`).

## 1. O que é CEP neste aplicativo

CEP (Common Extensibility Platform) é o runtime de extensões baseado em web (HTML/CSS/JS)
+ ExtendScript (`.jsx`). Nesta instalação o runtime CEP é **Chromium 99 via NW.js**, hospedado pelo
processo `CEPHtmlEngine.exe`:

| Artefato | Tamanho (bytes) | Identificação |
|---|---|---|
| `CEPHtmlEngine.exe` | 4.861.432 | FileVersion 12.1.0 · Product "Adobe CEP HTML Engine" |
| `libcef.dll` | 169.632.248 | CEF 99.2.15+g71e9523 · Chromium-99.0.4844.84 |
| `node.dll` | 15.866.360 | 0.63.2 · **NW.js** (runtime Node no CEF) |
| `icudtl.dat` / `resources.pak` / `locales\` | — | dados ICU e recursos Chromium |

Localização: `Support Files\Contents\Windows\CEPHtmlEngine\`.

O host integra as janelas CEP via `PlugPlugOwl.dll` / `PlugPlugExternalObject.dll`
(`Support Files\Contents\Windows\`).

## 2. Diretório de extensões

`Support Files\Required\CEP\extensions\`

| Extensão | Tamanho (bytes) | Formato do manifest |
|---|---|---|
| `com.adobe.DesignLibraries.angular` | 73.835.952 | `CSXS\manifest.xml` (XML) |
| `com.adobe.illustrator.OnBoarding` | 91.219.618 | `CSXS\manifest.xml` (XML) |
| **Total** | **165.055.570** | 2 extensões |

Observação: existe um `manifest.json` somente na raiz de `DesignLibraries.angular`
(auxiliar do build webpack) — o manifest oficial do CEP é sempre `CSXS\manifest.xml`.

## 3. com.adobe.DesignLibraries.angular — painel Bibliotecas (CC Libraries)

Manifest: `CSXS\manifest.xml`

- `ExtensionManifest Version="7.0"` (⇒ CEP 7.0 / CSXS 5.0)
- `ExtensionBundleId="com.adobe.DesignLibraries.angular.2015.1"` · `ExtensionBundleVersion="4.12.29"`
- `ExtensionBundleName="DesignLibrary"` · `DevBundleVersion="4.12.29"`

### 3.1 Extensões declaradas no bundle

| Id | Versão | Tipo/uso |
|---|---|---|
| `com.adobe.DesignLibraries.angular` | 1.0 | Painel Bibliotecas (principal) |
| `com.adobe.DesignLibraries.touch` | 1.0 | Variante touch (Embedded) |
| `com.adobe.capture.extension` | 2.0.41 | Captura (ModalDialog 860×620) |
| `com.adobe.stock.panel.licensing-embedded` | 4.0.35 | Licenciamento Adobe Stock (ModalDialog 480×323) |
| `com.adobe.cclibraries.manager` | 1.0.0 | Gerenciador de bibliotecas (Modeless 850×700, `HideOnClose`) |

### 3.2 Hosts suportados

```
ILST [29.2,99.9] · PHXS [24.0,99.9] · PHSP [24.0,99.9] · PPRO [23.0,99.9]
IDSN [18.0,99.9] · AEFT [23.0,99.9] · FLPR [23.0,99.9] · DRWV [21.2,99.9]
KBRG [13.0,99.9] · STGR [4.0,99.9]
```
`RequiredRuntimeList → CSXS 5.0` · `LocaleList → All`.

### 3.3 Configuração do painel principal

- `MainPath = ./index.html` (build webpack — há múltiplos `.bundle.js` na raiz)
- `ScriptPath = ./jsx/core.jsx` (ExtendScript)
- Flags `CEFCommandLine`:
  `--high-dpi-support=1 --enable-nodejs --mixed-context --disable-accelerated-video-decode --disable-threaded-scrolling --disable-pinch`
- `UI Type = Panel` (Embedded no KBRG) · `Menu = %DL_LIBRARIES_PANEL_NAME`
- Geometria: 245×300 · min 245×165 · max 7680×7680
- Ícones: `images/IconLight.png` (Normal/RollOver) e `images/IconDark.png` (DarkNormal/DarkRollOver)
- `DispatchInfo` por host com override (ex.: FLPR usa `applications/FLPR/jsx/core.jsx` como script alternativo)

### 3.4 Estrutura do pacote (parcial)

```
com.adobe.DesignLibraries.angular/
├── CSXS/manifest.xml            → manifest oficial
├── extensions/
│   ├── capture/                 → sub-bundle capture (capture.html + capture.jsx por app)
│   └── stock-panel-licensing/   → sub-bundle stock (index.html, CSXS próprio v0.1.0)
├── jsx/core.jsx
├── index.html  + *.bundle.js (webpack)
├── css/ images/ locale/ resources/ applications/ META-INF/
```

## 4. com.adobe.illustrator.OnBoarding — orientação/onboarding

Manifest: `CSXS\manifest.xml`

- `ExtensionManifest Version="7.0"` · `ExtensionBundleId="com.adobe.illustrator.OnBoarding"`
- `ExtensionBundleVersion="2.0.0"` · `ExtensionBundleName="OnBoarding"`
- `Extension Id="com.adobe.illustrator.OnBoarding" Version="2.0"`
- Host: `ILST 21.0+` · `Locale All` · `RequiredRuntime CSXS 5.0`
- `MainPath = ./index.html` · `ScriptPath = ./OnBoarding.jsx`
- `UI Type = Embedded` com geometria 0×0 + `AutoVisible = true`
  → janela oculta que roda conteúdo de onboarding (nível de janela, não painel visível).
- Sem flags `CEFCommandLine` próprias.

Conteúdo offline localizado (recursos HTML/JS por idioma, ex.: pt_BR) para dicas de
RecolorTextboxTooltip, ReducedMode (banners), ReducedModeBanner, VectorSculpting etc.

## 5. Conexão com o aplicativo (fluxo resumido)

1. `Illustrator.exe` carrega `PlugPlugOwl.dll` (host CEP).
2. Sistema CSXS 5.0 lê `CSXS\manifest.xml` de cada bundle em `Required\CEP\extensions\`.
3. Para cada `DispatchInfo` que casa com o host atual (`ILST`), lança `CEPHtmlEngine.exe`
   (NW.js/Chromium 99) apontando para `MainPath` (HTML) com `ScriptPath` (ExtendScript).
4. A janela é embutida via `PlugPlugExternalObject.dll`; a UI nativa conversa com o painel
   via mensagens CSXS + `CSInterface`.

## 6. Itens não verificados

- `capture/CSXS/manifest.xml` (sub-bundle) declara `ExtensionManifest Version="9.0"`
  com `ExtensionBundleId="com.adobe.capture"` e `com.adobe.capture.extension.test 1.0.0` —
  não investigado a fundo (não é carregado para ILST no manifest principal).
- Conteúdo exato de META-INF/ e resources/ do bundle DesignLibraries (assinatura/build) — não analisado.