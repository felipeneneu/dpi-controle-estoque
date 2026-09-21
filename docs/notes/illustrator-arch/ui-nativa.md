# UI Nativa (C++) — Adobe Illustrator 2026 (Windows)

> Análise estática (somente leitura) da instalação em `D:\Programas\Adobe Illustrator 2026`.
> Data: 2026-09-18 · Método: bytes → Latin1 + regex ASCII (strings ≥ 6) + análise de metadados.

## 1. Inventário geral de plugins (.aip)

| Diretório | Qtde .aip | Tamanho total (bytes) |
|---|---|---|
| `Plug-ins\Illustrator UI\` | 67 | 111.281.128 |
| `Plug-ins\Extensions\` | 98 | 136.458.480 |
| `Plug-ins\` (recursivo) | 246 | — |
| `Support Files\Required\Plug-ins\` | 14 | — |
| `Support Files\Required\AIRobin_Plug-ins\` | 2 | 3.421.680 |

Nota: "Illustrator UI" = plugins que constroem a interface do aplicativo (paletas, painéis,
toolbox, barras); "Extensions" = funcionalidades (filtros, efeitos, serviços, loaders).

## 2. Principais plugins de UI e evidências (strings)

### 2.1 `IllustratorUI.aip` (*Plug-ins\Illustrator UI*, 6.636.536 B)
- Paletas: `Attributes palette`, `Info palette`
- Controles DVA: `dva_lock_button`, `dva_scroll_bar`, `dva_text_crawl`, `panel_view`,
  `panel_container`, `tool_stack`, `label_widget_spacing`
- Menus/UI: "Control Panel", "Tool Palettes", "Internal palettes posing as plug-in menus – attributes"
- Integração UXP: referência a `com.adobe.unifiedpanel` e `AI UxpExtension Suite`
- Ferramentas/serviços: `MeasureTool`, `ReflowDetectorPanel`
- → Painéis nativos (Atributos, Info), barra de controles, docking de paletas — UI C++ sobre DVA.

### 2.2 `AIToolBoxUI.aip` (*Plug-ins\Illustrator UI*, 1.070.072 B)
- Toolbox: nomes de ferramentas (Adobe Pen Tool, Eyedropper, Zoom, Rotate Canvas, Scroll,
  Dimension, Constraints, Quick Pen, Color Picker)
- `toggleUnifiedPanel` → botão que alterna o Painel Unificado (UXP)
- `GenAITool` → ferramenta de IA generativa na toolbox
- `FWToolboxADM` → referencia ADM = Adobe Dialog Manager (UI legada ainda presente)

### 2.3 Loaders de runtime (em *Plug-ins\Extensions*)
- `UxpExtension.aip` — loader do runtime UXP (strings `uxp-9.3.0-local`, `LoadUXPExtension`,
  módulos `Uxp::*`, IDs de painéis UXP; source `D:\J\ws\ilst_rel_30_6\PlugInDev\UxpExtension\`)
- `PropertiesPanel.aip` — painel Propriedades (nativo ↔ UXP)
- `AIAgenticSystem.aip` — sistema de agentes/IA

### 2.4 AIRobin (processo auxiliar headless)
- `AIRobinClient.aip` (*Plug-ins\Extensions*): strings `AIRobinServiceAutomation.log`,
  `[AIROBIN] %s`, `Robin Client Idle Timer`, `Launch Robin` / `Quit Robin`,
  `AIRobinProcess: Re-launching AIRobin for recovery`; source
  `D:\J\ws\ilst_rel_30_6\PlugInDev\AIRobinClient\Source\AIRobinClientPlugin.cpp`
- `AIRobin_Plug-ins\AIRobinService.aip` (949.752 B) + `AIRobin_Plug-ins\3DLib.aip`
  (2.471.928 B, "Adobe 3D Effect")
- → AIRobin é um **processo separado** (`AIRobin.exe`, serviço sem janela) onde efeitos e
  comandos pesados rodam isolados do processo principal. Não é framework de UI.

### 2.5 Outros destaques por tamanho (inferência)
- `GenerateUI.aip` (71.965.176 B) — efeito/generativo (Mesh/3D/IA)
- `CropUI.aip` (9.530.872 B) — recorte/aparar
- `MenuConfigurator.aip` (71.160 B) — menus personalizados/barra de tarefas

## 3. Tecnologia de base

- Widgets nativos vêm da biblioteca **DVA/Drover** (`dvaui.dll`) — ver
  [`frameworks-ui.md`](./frameworks-ui.md).
- Parte da UI nativa ainda usa **ADM** (Adobe Dialog Manager, legado do Photoshop) —
  evidência: `FWToolboxADM`.
- A comunicação com as extensões web (CEP/UXP) é feita pelos plugins loader
  (`PlugPlugOwl.dll` para CEP; `UxpExtension.aip`/`dvauxphost.dll` para UXP).

## 4. Itens não verificados

- Mapeamento 1:1 de cada um dos 98 .aip de Extensions para seu painel/serviço — apenas
  amostras por tamanho/strings foram classificadas.
- Presença de ADM em outros plugins além do AIToolBoxUI — não rastreada.
- Detalhes de `AIRobin_Plug-ins\3DLib.aip` (API 3D interna) — só identificado por strings
  ("Adobe 3D Effect"); interface completa não mapeada.