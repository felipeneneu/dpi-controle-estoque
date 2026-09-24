# GraficaOS Plugin — Extensão Illustrator

Extensão CEP (Common Extensibility Platform) para Adobe Illustrator que expõe
o motor de imposição do GraficaOS diretamente dentro do Illustrator, via COM.

## Arquitetura

```
┌──────────────┐    evalScript     ┌──────────────┐    ActiveXObject    ┌──────────────────┐
│  Painel CEP  │ ──────────────► │  ExtendScript │ ─────────────────► │  .NET COM DLL    │
│  (HTML/JS)   │ ◄────────────── │  (impose.jsx) │ ◄───────────────── │  (GraficaOS.     │
│  main.js     │    callback      │  ES3          │    JSON string     │   Engine)        │
└──────────────┘                  └──────────────┘                     └────────┬─────────┘
                                                                                │
                                                                    ┌───────────┴───────────┐
                                                                    │                       │
                                                              ┌─────┴─────┐          ┌─────┴──────┐
                                                              │Imposition │          │Imposition  │
                                                              │  .Core    │          │  .Pdf      │
                                                              │(grade)    │          │(PDF/QPDF)  │
                                                              └───────────┘          └────────────┘
```

## Pré-requisitos

- **Windows 10/11 x64**
- **Adobe Illustrator CC 2021+** (CEP 9+)
- **.NET 10 Runtime** (x64)
- **Inno Setup 6.x** (apenas para gerar o instalador)

## Estrutura de Pastas

```
GraficaOS.Plugin/
├── GraficaOS.Plugin.sln
├── lib/                               ← DLLs pré-compiladas do motor
│   ├── Imposition.Core.dll
│   └── Imposition.Pdf.dll
├── src/
│   ├── GraficaOS.Engine/              ← Wrapper COM (C#)
│   │   ├── GraficaOS.Engine.csproj
│   │   ├── IGraficaOSEngine.cs
│   │   ├── ImpositionEngine.cs
│   │   ├── ComContracts.cs
│   │   ├── TenantConfig.cs
│   │   ├── TelemetryCollector.cs
│   │   ├── Internal/
│   │   │   └── ImpositionCoreAdapter.cs
│   │   └── appsettings.json
│   └── GraficaOS.Tests/
│       ├── GraficaOS.Tests.csproj
│       └── ComContractTests.cs
├── plugin/
│   └── com.graficaos.imposer/        ← Extensão CEP
│       ├── CSXS/manifest.xml
│       ├── index.html
│       ├── main.js
│       ├── styles.css
│       ├── lib/CSInterface.js
│       ├── icons/logo.svg
│       └── jsx/
│           ├── impose.jsx
│           └── marks.jsx
├── installer/
│   └── graficaos.iss                  ← Inno Setup
└── README.md
```

## Como Compilar

### 1. Compilar o motor (se as DLLs não estiverem em `lib/`)

```powershell
# Na raiz do monorepo
cd packages
dotnet build imposition.slnx -c Release

# Copiar DLLs para lib/
$coreBin = "imposition-core\src\Imposition.Core\bin\Release\net10.0"
$pdfBin = "imposition-pdf\src\Imposition.Pdf\bin\Release\net10.0"
$dest = "..\GraficaOS.Plugin\lib"

New-Item -ItemType Directory -Path $dest -Force
Copy-Item "$coreBin\Imposition.Core.dll" $dest
Copy-Item "$pdfBin\Imposition.Pdf.dll" $dest
```

### 2. Compilar o plugin

```powershell
cd GraficaOS.Plugin

# Compilar a solution inteira (Engine + Testes)
dotnet build GraficaOS.Plugin.sln -c Release

# Ou compilar o Engine especificando o RID x64
dotnet build src\GraficaOS.Engine\GraficaOS.Engine.csproj -c Release -r win-x64
```

A saída inclui:
- `GraficaOS.Engine.dll` — assembly principal
- `GraficaOS.Engine.comhost.dll` — ponte COM para regsvr32 (com host nativo)

### 3. Rodar testes unitários

```powershell
dotnet test src\GraficaOS.Tests\GraficaOS.Tests.csproj -c Release
```

## Como Testar COM sem Instalador

### Registrar COM

**Opção 1 — No sistema todo (necessita Administrador):**
```powershell
# PowerShell como Administrador
$dll = (Resolve-Path "src\GraficaOS.Engine\bin\Release\net10.0-windows\win-x64\GraficaOS.Engine.comhost.dll").Path
regsvr32 /s "$dll"
```

**Opção 2 — Apenas para o usuário atual (sem admin, ideal para desenvolvimento):**
```powershell
$clsid = "{A1B2C3D4-E5F6-7890-ABCD-EF1234567892}"
$progId = "GraficaOS.Engine"
$dll = (Resolve-Path "src\GraficaOS.Engine\bin\Release\net10.0-windows\win-x64\GraficaOS.Engine.comhost.dll").Path

New-Item -Path "HKCU:\Software\Classes\$progId\CLSID" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Classes\$progId" -Name "(Default)" -Value "GraficaOS.Engine.ImpositionEngine"
Set-ItemProperty -Path "HKCU:\Software\Classes\$progId\CLSID" -Name "(Default)" -Value $clsid

$clsidPath = "HKCU:\Software\Classes\CLSID\$clsid"
New-Item -Path "$clsidPath\InprocServer32" -Force | Out-Null
Set-ItemProperty -Path $clsidPath -Name "(Default)" -Value "GraficaOS.Engine.ImpositionEngine"
New-Item -Path "$clsidPath\ProgId" -Force | Out-Null
Set-ItemProperty -Path "$clsidPath\ProgId" -Name "(Default)" -Value $progId
Set-ItemProperty -Path "$clsidPath\InprocServer32" -Name "(Default)" -Value $dll
Set-ItemProperty -Path "$clsidPath\InprocServer32" -Name "ThreadingModel" -Value "Both"
```

### Testar no PowerShell (Late-Binding IDispatch)

Como o .NET Core não gera TypeLib (`.tlb`) em tempo de compilação, o ExtendScript e o WSH acessam via `IDispatch::Invoke` puro. No PowerShell, utiliza-se `InvokeMember`:

```powershell
$type = [Type]::GetTypeFromProgID("GraficaOS.Engine")
$engine = [Activator]::CreateInstance($type)

# Versão do motor
$type.InvokeMember("GetVersion", [System.Reflection.BindingFlags]::InvokeMethod, $null, $engine, $null)
# Esperado: "0.1.0"

# Tenant ativo
$type.InvokeMember("GetActiveTenant", [System.Reflection.BindingFlags]::InvokeMethod, $null, $engine, $null)

# Plano de imposição (caso canônico Golden Master: 19×34mm em 665×986mm)
$json = '{"schemaVersion":"1.0","requestId":"test","sheetWMm":665,"sheetHMm":986,"artWMm":19,"artHMm":34,"gapMm":0,"targetCopies":1015,"surplusPolicy":"fill_row","substrateKind":"sheet"}'
$plan = $type.InvokeMember("PlanImposition", [System.Reflection.BindingFlags]::InvokeMethod, $null, $engine, @($json))
# Esperado: cols=35, rows=29, plannedUnits=1015, total=1015
```

### Testar via Script Host (idêntico ao ExtendScript / Illustrator)

```powershell
$js = @"
var engine = new ActiveXObject('GraficaOS.Engine');
WScript.Echo('Versao: ' + engine.GetVersion());
WScript.Echo('Tenant: ' + engine.GetActiveTenant());
"@
Set-Content -Path "$env:TEMP\test_engine.js" -Value $js
cscript.exe //nologo "$env:TEMP\test_engine.js"
```

## Como Testar Painel sem Instalador

### 1. Habilitar debug mode do CEP

```powershell
@(9,10,11,12) | ForEach-Object {
    New-Item -Path "HKCU:\Software\Adobe\CSXS.$_" -Force | Out-Null
    Set-ItemProperty -Path "HKCU:\Software\Adobe\CSXS.$_" -Name PlayerDebugMode -Value 1 -Type String
}
```

### 2. Copiar plugin para extensões do usuário

```powershell
$dest = "$env:APPDATA\Adobe\CEP\extensions\com.graficaos.imposer"
Copy-Item -Recurse -Force plugin\com.graficaos.imposer $dest
```

> **IMPORTANTE:** Substitua `lib/CSInterface.js` pelo arquivo oficial do
> [Adobe CEP-Resources](https://github.com/AdobeDev/CEP-Resources/tree/master/CEP_11.x).

### 3. Abrir no Illustrator

1. Reiniciar o Illustrator
2. Menu: **Janela → Extensões → GraficaOS Imposer**
3. O painel deve abrir com a faixa de logo

## Como Gerar o Instalador

```powershell
# Requer Inno Setup 6.x (iscc.exe no PATH)
iscc installer\graficaos.iss
# Saída: installer\output\GraficaOS-Imposer-0.1.0-x64.exe
```

## Checklist de Teste por Máquina

| # | Teste | Comando/Ação |
|---|-------|--------------|
| 1 | ✅ Build compila | `dotnet build -c Release -r win-x64` |
| 2 | ✅ regsvr32 sem erro | `regsvr32 /s GraficaOS.Engine.comhost.dll` (admin) |
| 3 | ✅ GetVersion retorna 0.1.0 | `(New-Object -ComObject GraficaOS.Engine).GetVersion()` |
| 4 | ✅ Painel abre no Illustrator | Janela → Extensões → GraficaOS Imposer |
| 5 | ✅ Faixa de logo com fallback | Verificar visualmente "G GraficaOS" |
| 6 | ✅ Modal info | Clicar no botão "i" |
| 7 | ✅ Aba PDF: calcular grade | Selecionar PDF + preencher + "Só calcular" |
| 8 | ✅ Aba Bancada: impor | Selecionar arte + "Impor" |
| 9 | ✅ Camada FineCut_Moldura | Verificar no painel de camadas do AI |
| 10 | ✅ Telemetria local | Verificar `%ProgramData%\GraficaOS\outbox\` |
| 11 | ✅ MSI em máquina limpa | Instalar + repetir testes 2-9 |

## Troubleshooting

### Badge offline / "Motor não registrado"

O COM não foi registrado. Execute como administrador:

```powershell
regsvr32 /s "C:\Program Files\GraficaOS\Imposer\Engine\GraficaOS.Engine.comhost.dll"
```

### ActiveXObject falha no PowerShell

- Verifique se a DLL está no caminho correto
- Verifique se está usando PowerShell x64 (não x86)
- Verifique se o .NET 10 Runtime x64 está instalado

### Painel não aparece no Illustrator

1. Verifique se PlayerDebugMode=1 está no registro (ver seção acima)
2. Verifique se o plugin está em uma das pastas de extensões:
   - `%APPDATA%\Adobe\CEP\extensions\com.graficaos.imposer\`
   - `%CommonProgramFiles%\Adobe\CEP\extensions\com.graficaos.imposer\`
3. Reinicie o Illustrator após copiar
4. Verifique o manifest.xml (versão do host, caminhos)

### Arquivos .jsonl não aparecem

Verifique permissões em `%ProgramData%\GraficaOS\outbox\`. O diretório é
criado automaticamente pelo motor, mas precisa de permissão de escrita.

### Erro "JSON inválido do motor"

O motor retornou algo inesperado. Verifique:
1. O COM está registrado corretamente
2. As DLLs Imposition.Core.dll e Imposition.Pdf.dll estão no mesmo diretório
3. Teste no PowerShell primeiro (seção "Testar COM sem Instalador")
