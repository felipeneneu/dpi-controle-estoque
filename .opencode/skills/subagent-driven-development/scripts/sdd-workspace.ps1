<#
.SYNOPSIS
    Cria o workspace SDD (ledger) para uma feature do monorepo GraficaOS.

.DESCRIPTION
    Inicializa .sdd/<FeatureName>/progress.md a partir do ledger-template.md
    da skill subagent-driven-development. O diretorio .sdd/ e ignorado pelo
    git: o ledger e estado local, nunca artefato de entrega.

    O script NAO faz IO destrutivo. Se o ledger ja existir, ele nao sobrescreve:
    reporta o conteudo atual e o orcestrador deve ler o ledger existente para
    retomar (ver SKILL.md, secao 8).

.PARAMETER FeatureName
    Nome da feature. Usado como nome do diretorio em .sdd/.

.PARAMETER BranchName
    Branch esperado para a feature. Se a branch atual nao bater, o script
    apenas sugere — nao troca de branch sozinho.

.PARAMETER SpecPath
    Caminho (repo-relative) do PRD/spec da feature. Opcional.

.PARAMETER Force
    Sobrescreve o ledger existente. Use com(parsedamente): apaga historico
    de rulings.

.EXAMPLE
    .agents\skills\subagent-driven-development\scripts\sdd-workspace.ps1 -FeatureName "slugline" -BranchName "feat/slugline-sdd"
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$FeatureName,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$BranchName,

    [Parameter()]
    [string]$SpecPath = '',

    [Parameter()]
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$skillRoot = Split-Path -Parent $PSScriptRoot
$templatePath = Join-Path $skillRoot 'ledger-template.md'
$repoRoot = (git rev-parse --show-toplevel 2>$null)
if (-not $repoRoot) {
    Write-Error 'Nao foi possivel localizar a raiz do repositorio git. Rode dentro do monorepo.'
    exit 1
}
$repoRoot = $repoRoot.Trim()

$sddRoot = Join-Path $repoRoot '.sdd'
$featureDir = Join-Path $sddRoot $FeatureName
$ledgerPath = Join-Path $featureDir 'progress.md'
$gitignorePath = Join-Path $repoRoot '.gitignore'

function Write-Step { param([string]$Message) Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Ok   { param([string]$Message) Write-Host "    OK  $Message" -ForegroundColor Green }
function Write-Warn2{ param([string]$Message) Write-Host "    !!  $Message" -ForegroundColor Yellow }

# --- 1. Valida o template da skill -----------------------------------------
Write-Step 'Validando template da skill'
if (-not (Test-Path -LiteralPath $templatePath)) {
    Write-Error "Template nao encontrado: $templatePath"
    exit 1
}
# Le como UTF-8 explicito: o Windows PowerShell 5.1 usa a pagina de codigo ANSI
# por padrao e corromperia acentos e travessoes (em-dash) do template.
$template = [System.IO.File]::ReadAllText($templatePath, [System.Text.Encoding]::UTF8)

# Remove o frontmatter do template: o ledger gerado e um documento puro de
# acompanhamento e nao deve carregar metadados de componente do kit.
# ﻿ = BOM, removido por seguranca antes do casamento do regex.
$template = $template -replace ([string][char]0xFEFF), ''
$template = [regex]::Replace($template, '\A---\r?\n[\s\S]*?\r?\n---\r?\n', '').TrimStart()
Write-Ok "template: $([System.IO.Path]::GetFileName($templatePath))"

# --- 2. Garante .sdd/ no .gitignore -----------------------------------------
Write-Step 'Garantindo .sdd/ no .gitignore'
$sddIgnored = $false
if (Test-Path -LiteralPath $gitignorePath) {
    $lines = Get-Content -LiteralPath $gitignorePath
    $sddIgnored = $lines | Where-Object { $_.Trim() -match '^\.sdd/?$' } | Select-Object -First 1
}
if (-not $sddIgnored) {
    if ($PSCmdlet.ShouldProcess($gitignorePath, 'adicionar entrada .sdd/')) {
        Add-Content -LiteralPath $gitignorePath -Value "`n# SDD (Subagent-Driven Development) - ledger local, fora do tracking`n.sdd/"
        Write-Ok '.sdd/ adicionado ao .gitignore'
    }
}
else {
    Write-Ok '.sdd/ ja ignorado'
}

# --- 3. Verifica branch atual (apenas sugere) -------------------------------
Write-Step 'Verificando branch atual'
$currentBranch = (git -C $repoRoot rev-parse --abbrev-ref HEAD 2>$null)
$currentBranch = if ($currentBranch) { $currentBranch.Trim() } else { '(desconhecido)' }

if ($currentBranch -eq $BranchName) {
    Write-Ok "branch atual = $currentBranch"
}
else {
    Write-Warn2 "branch atual = $currentBranch | esperado = $BranchName"
    $branchExists = git -C $repoRoot rev-parse --verify --quiet "refs/heads/$BranchName" 2>$null
    if ($branchExists) {
        Write-Warn2 "a branch existe. Troque com: git checkout $BranchName"
    }
    else {
        Write-Warn2 "a branch nao existe. Crie com: git checkout -b $BranchName"
    }
}

# --- 4. Cria o ledger -------------------------------------------------------
Write-Step "Criando workspace em .sdd/$FeatureName/"

if (Test-Path -LiteralPath $ledgerPath) {
    if (-not $Force) {
        Write-Warn2 "ledger JA EXISTE: $ledgerPath"
        Write-Host '    Nao sobrescrito (use -Force para substituir, APAGANDO rulings).'
        Write-Host '    Proximo passo: leia o ledger e retome o SDD.'
        Write-Host ''
        Write-Host "Ledger: $ledgerPath"
        exit 0
    }
    if ($PSCmdlet.ShouldProcess($ledgerPath, 'sobrescrever ledger existente')) {
        Remove-Item -LiteralPath $ledgerPath -Force
        Write-Ok 'ledger anterior removido (-Force)'
    }
}

if ($PSCmdlet.ShouldProcess($featureDir, 'criar workspace SDD')) {
    if (-not (Test-Path -LiteralPath $featureDir)) {
        New-Item -ItemType Directory -Path $featureDir -Force | Out-Null
    }
}

$timestamp = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss')

$content = $template `
    -replace '<nome-da-feature>', $FeatureName `
    -replace '<branch>', $BranchName `
    -replace '<caminho>', $(if ($SpecPath) { $SpecPath } else { '(a definir)' }) `
    -replace '<data ISO>', $timestamp `
    -replace '<timestamp>', $timestamp `
    -replace '<N>', '3' `
    -replace '<total>', '3'

# Grava como UTF-8 sem BOM (igual ao resto do repo).
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($ledgerPath, $content, $utf8NoBom)
Write-Ok "ledger criado: .sdd/$FeatureName/progress.md"

# --- 5. Resumo --------------------------------------------------------------
Write-Host ''
Write-Host 'Workspace SDD pronto.' -ForegroundColor Green
Write-Host "  Ledger:  $ledgerPath"
Write-Host "  Branch:  $BranchName (atual: $currentBranch)"
Write-Host "  Git:     .sdd/ ignorado"
Write-Host ''
Write-Host 'Proximos passos:'
Write-Host '  1. Preencha a secao "## Tarefas" com tarefas verticais.'
Write-Host '  2. Preencha "### Detalhe das tarefas" com arquivos autorizados e criterio de pronto.'
Write-Host '  3. Use o skill subagent-driven-development para despachar implementador + revisores.'
