param(
    [string]$OutputDir = "sidecars\bin\cli\qpdf",
    [string]$Version = "11.9.1"
)

$ErrorActionPreference = "Stop"
$url = "https://github.com/qpdf/qpdf/releases/download/v$Version/qpdf-$Version-msvc64.zip"
$temp = "$env:TEMP\qpdf.zip"

Write-Host "Baixando QPDF $Version..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $url -OutFile $temp

Write-Host "Extraindo..." -ForegroundColor Cyan
Expand-Archive -Path $temp -DestinationPath $OutputDir -Force

$inner = Get-ChildItem $OutputDir -Directory | Select-Object -First 1
if ($inner) {
    Move-Item "$($inner.FullName)\*" $OutputDir -Force
    Remove-Item $inner.FullName -Recurse
}

Remove-Item $temp
Write-Host "OK: $OutputDir" -ForegroundColor Green
