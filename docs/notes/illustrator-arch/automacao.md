# automacao.md — Caminhos de automação externa (Illustrator 2026, 30.6.0, pt-BR)

> Análise estática. Nada executado. Hipóteses marcadas como **"a validar"**.

## 1. Entradas de automação no install (`Support Files\Contents\Windows`)

| Executável | Tamanho | Papel provável (evidência de strings) |
|------------|---------|----------------------------------------|
| `Illustrator.exe` | 61,28 MB | Aplicação principal; **registrada como servidor COM** (`/Automation`, ver §2). Aceita `-Automation` no `LocalServer32`. |
| `AIRobin.exe` | 0,43 MB | **Script runner headless** "Robin": strings `AI AIRobinService Suite`, `AI AIRobinClient Suite` (em Illustrator.exe), `AI RaidenSessionManager Suite`, `[RobinApp] HandleRobinIdle`, args de protocolo `clientpid`, `sessionKey`, `DunamisSessionID`, `ProcessID`, `DiagnosysInfo`, log `AIRobinServiceGeneral.Log`; carrega pasta **`AIRobin_Plug-ins\`** (`AIRobinService.aip` 950 KB, `3DLib.aip` 2,47 MB); ProgID interno `AIRobin.com.adobe.AIRobin 30.6.0`; env `AIROBIN_DISABLE_CRASH_REPORTER`. *Modelo de uso: serviço interno de jobs em background (UXP/Dunamis e mensagens de script); uso externo não documentado — **a validar***. |
| `CEPHtmlEngine.exe` | 4,86 MB | Engine HTML **CEP** (Chromium): strings `adobe_cep__.analyticsLogging()`, `native_showopendialogex`, `vulcangettargetspecifiersEx` → executa a camada HTML/JS das extensões CEP; **não é runner de .jsx**. |
| `CRWindowsClientService.exe` | 1,74 MB | Cliente do **Crash Reporter**: strings "connect to the named pipe", "Crash data read from the pipe", leitura do System event log → coleta minidumps; não-automação. |
| `AIMonitor.exe` | 1,37 MB | Monitor/sentinela: strings `AISentinelSerializeIPC*`, `--logs-path` ("AIMonitor.log file path where we can write exit status") → watchdog de processos/updates; **a validar**. |
| `AISniffer.exe` | 0,29 MB | Sniffer de **GPU/display** (instalação): `NumDisplays`, `EnableGPU`, `PerformanceRank`, `DXVersion`, `AISnifferLog` → grava capacidades gráficas; não-automação. |
| `IllustratorDiagnosys.exe` | 0,63 MB | **Coletor de diagnósticos/logs**: "Start collecting logs", "Collecting logs after exit" → gera pacote de logs p/ suporte; não-automação. |
| `AISafeModeLauncher.exe` | 1,67 MB | Launcher de modo seguro; strings não inspecionadas (**não verificado**). |

## 2. Caminho COM (o único oficial para automação externa de scripts)

Registro (somente leitura):
```
Illustrator.Application.30
  CLSID = {9A4BA740-BEBF-4409-B787-AC7A610771A6}
  LocalServer32 = "...\Support Files\Contents\Windows\Illustrator.exe" /Automation
  TypeLib = {38E4E28D-F058-4D11-A6F0-9F70ABF345DC}
TypeLib\...\1.0\0\win32 = "...\Plug-ins\Extensions\ScriptingSupport.aip"   (sem win64)
```
- Modelo: `CreateObject("Illustrator.Application")` (VBS amostras) → inicializa/exfila o Illustrator; interface expõe **`DoJavaScript(código)`** (evidência: `InvokeMember("DoJavaScript", ...)` no CLI do repositório + plugin `ScriptingSupport.aip` é a type library).
- Workaround conhecido no repositório: como só há `win32` na TypeLib, o CLI escreve `HKCU\Software\Classes\TypeLib\{guid}\1.0\0\win64` apontando para o mesmo `.aip` para evitar `TYPE_E_LIBNOTREGISTERED (0x8002801D)`.
- **Não instancie COM por aqui** — a análise foi somente leitura de registro. (*comportamento runtime: a validar*)

## 3. Como o repositório já se conecta (leitura de fonte)

### `Impor_Illustrator.bat`
- Chamada: `sidecars\bin\cli\IllustratorImposerCLI.exe "%PDF%" "%OUTPUT%" <largura_mm> 0 <copias> <gap> <margem> <manter:0|1>`.
- Fluxo: valida PDF, pergunta largura/tiragem/gap/margem, escolhe Modo Bancada (ilustrador aberto + FineCut) ou Silencioso (fecha), gera nome `*_IMPOSTO_<L>mm_<N>UN.pdf`.

### `IllustratorImposerCLI` (`sidecars\IllustratorImposerCLI\`, .NET 10, single-file)
- `Program.cs` (240 linhas):
  1. `EnsureIllustratorTypeLibRegistered()` — auto-cura da TypeLib win64 (HKCU).
  2. `Type.GetTypeFromProgID("Illustrator.Application")` → se ausente, exit 2.
  3. `GetOrCreateIllustratorApp` — tenta `GetActiveObject` (roda ativo?) senão `Activator.CreateInstance` (inicia o Illustrator).
  4. Monta `runnerCode = "var config = {json};" + engine.jsx + "processarArquivoAutomatico(config);"` e invoca **`aiType.InvokeMember("DoJavaScript", ...)`** — ou seja: **COM → DoJavaScript → ExtendScript DOM**.
  5. Parse do retorno JSON do script.
- `Scripts\engine.jsx` (195 linhas, embedded): `#target illustrator`; abre o PDF com `app.open(File)`, `UserInteractionLevel.DONTDISPLAYALERTS`; lê `doc.layers[i].pageItems`, `doc.artboards[active].artboardRect` (mm↔pt), decide rotação por aproveitamento, redimensiona `artboardRect` para a chapa/rolo, repete itens, exporta PDF (restante não lido integralmente; ver linha 121+ **não verificado**).

### `test_ai_file.jsx` (raiz do repositório)
- Conteúdo: escreve `"OK FROM ILLUSTRATOR CC 2019"` em `C:/Users/impressao/Desktop/.../scratch_ai_out.txt` via `File`/`write`.
- Como aproveitar: é um **smoke test** do pipeline COM→DoJavaScript; pode ser executado por qualquer runner que faça `DoJavaScript(arquivo.toString())` (o próprio CLI, ou AIRobin se exposto — **a validar**). O texto "CC 2019" é genérico e não invalida a execução em 2026 (o DOM usado — `new File`, `open/f/write` — é estável).

### Demais `.bat` (não dependem do Illustrator)
- `MontarPDF.bat` → `AutoImposerCLI.exe` (.NET, sem COM, só geometria/PDF); `Montar_Chapa_70x100.bat`, `Montar_SRA3_Konica.bat`, `Montar_Rolo_Mimaki.bat` são atalhos que definem `MONTAR_PRESET` e chamam `MontarPDF.bat`.

## 4. Diagrama de encaixe (recomendado pelo estático)

```
Montar*.bat ──► IllustratorImposerCLI.exe ──► COM ProgID "Illustrator.Application"
                                              ├─ GetActiveObject / CreateInstance
                                              └─ DoJavaScript( config JSON + engine.jsx )
                                                   └─ ExtendScript DOM (app.open, artboards, layers, PDF export)
```
Pontos alternativos confirmados como existentes (não usados pelo repo):
- `AIRobin.exe` — runner interno de scripts/jobs (potencial futuro p/ modo headless sem abrir UI; **a validar** protocolo).
- `Presets\pt_BR\Scripts\*.jsx` — scripts que aparecem no menu do Ai (candidatos a distribuição user-friendly).
- Startup scripts: pastas `Adobe/Startup Scripts CC` (string em `ScriptingSupport.aip`) — scripts que rodam na inicialização (**a validar** se esta instalação as usa).

## 5. Limitações / não verificado
- Chamada exata e retorno de `DoJavaScript` (args opcionais, timeout, assinatura) — não verificado (exigiria runtime).
- Registro real do ProgID `AIRobin.com.adobe.AIRobin` (procurado só em HKLM\SOFTWARE\Classes; pode estar em HKCU) — **não verificado**.
- Conteúdo integral de `engine.jsx` (linhas 121–195) e comportamento do modo FineCut/Mimaki — **não verificado** nesta fase estática.