; ── GraficaOS Imposer — Inno Setup 6.x ──
; Instalador MSI para o plugin CEP + motor COM

#define MyAppName "GraficaOS Imposer"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "GraficaOS"
#define MyAppURL "https://graficaos.com"

[Setup]
AppId={{D4E5F6A7-B8C9-0123-4567-89ABCDEF0123}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={autopf}\GraficaOS\Imposer
DefaultGroupName={#MyAppName}
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
OutputDir=output
OutputBaseFilename=GraficaOS-Imposer-{#MyAppVersion}-x64
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; Motor COM (.NET)
Source: "..\src\GraficaOS.Engine\bin\Release\net10.0-windows\win-x64\GraficaOS.Engine.dll"; DestDir: "{app}\Engine"; Flags: ignoreversion
Source: "..\src\GraficaOS.Engine\bin\Release\net10.0-windows\win-x64\GraficaOS.Engine.comhost.dll"; DestDir: "{app}\Engine"; Flags: ignoreversion
Source: "..\src\GraficaOS.Engine\bin\Release\net10.0-windows\win-x64\Imposition.Core.dll"; DestDir: "{app}\Engine"; Flags: ignoreversion
Source: "..\src\GraficaOS.Engine\bin\Release\net10.0-windows\win-x64\Imposition.Pdf.dll"; DestDir: "{app}\Engine"; Flags: ignoreversion
Source: "..\src\GraficaOS.Engine\bin\Release\net10.0-windows\win-x64\*.json"; DestDir: "{app}\Engine"; Flags: ignoreversion

; Plugin CEP
Source: "..\plugin\com.graficaos.imposer\*"; DestDir: "{commoncf}\Adobe\CEP\extensions\com.graficaos.imposer"; Flags: ignoreversion recursesubdirs createallsubdirs

[Run]
; Registrar COM após instalação
Filename: "{sys}\regsvr32.exe"; Parameters: "/s ""{app}\Engine\GraficaOS.Engine.comhost.dll"""; StatusMsg: "Registrando motor COM..."; Flags: runhidden

[UninstallRun]
; Desregistrar COM antes de desinstalar
Filename: "{sys}\regsvr32.exe"; Parameters: "/s /u ""{app}\Engine\GraficaOS.Engine.comhost.dll"""; Flags: runhidden

[Registry]
; Habilitar PlayerDebugMode para CEP (necessário para extensões não assinadas)
Root: HKCU; Subkey: "Software\Adobe\CSXS.9";  ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"; Flags: createvalueifdoesntexist
Root: HKCU; Subkey: "Software\Adobe\CSXS.10"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"; Flags: createvalueifdoesntexist
Root: HKCU; Subkey: "Software\Adobe\CSXS.11"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"; Flags: createvalueifdoesntexist
Root: HKCU; Subkey: "Software\Adobe\CSXS.12"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"; Flags: createvalueifdoesntexist

[UninstallDelete]
; Remover plugin CEP na desinstalação (manter dados do usuário)
Type: filesandordirs; Name: "{commoncf}\Adobe\CEP\extensions\com.graficaos.imposer"

[Code]
// Criar tenant.json padrão se não existir
procedure CreateDefaultTenant;
var
  TenantDir, TenantFile, Content: String;
begin
  TenantDir := ExpandConstant('{commonappdata}\GraficaOS');
  TenantFile := TenantDir + '\tenant.json';
  
  if not FileExists(TenantFile) then
  begin
    ForceDirectories(TenantDir);
    ForceDirectories(TenantDir + '\outbox');
    Content := '{' + #13#10 +
      '  "schemaVersion": "1.0",' + #13#10 +
      '  "tenantId": "default",' + #13#10 +
      '  "tenantName": "GraficaOS",' + #13#10 +
      '  "installedAt": "' + GetDateTimeString('yyyy-mm-dd"T"hh:nn:ss', '-', ':') + '",' + #13#10 +
      '  "machineId": "' + GetComputerNameString + '",' + #13#10 +
      '  "features": []' + #13#10 +
      '}';
    SaveStringToFile(TenantFile, Content, False);
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    CreateDefaultTenant;
  end;
end;
