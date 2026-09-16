@echo off
setlocal enableextensions enabledelayedexpansion
title Illustrator Imposer CLI - Modo 100%% Automatico

set "BIN=%~dp0sidecars\bin\cli\IllustratorImposerCLI.exe"
if not exist "%BIN%" (
    echo [ERRO] Binario nao encontrado em: "%BIN%"
    echo Execute "npm run build:cli:illustrator" primeiro.
    pause
    exit /b 1
)

set "PDF=%~1"
if "%PDF%"=="" (
    cls
    echo ============================================================
    echo   IMPOSITOR AUTOMATICO NO ADOBE ILLUSTRATOR (FINECUT / MIMAKI)
    echo ============================================================
    echo.
    echo  Arraste o arquivo PDF aqui para dentro desta janela
    echo  e pressione [ENTER]:
    echo.
    set /p "PDF=>> PDF da Arte: "
)

set "PDF=!PDF:"=!"
if not exist "!PDF!" (
    echo.
    echo [ERRO] Arquivo nao encontrado: "!PDF!"
    pause
    exit /b 1
)

cls
echo ============================================================
echo   ARQUIVO SELECIONADO:
echo   !PDF!
echo ============================================================
echo.

set "SHEET_W=750"
set /p "SHEET_W=>> Largura da Bobina/Chapa em mm [Padrao 750]: "

set "COPIAS=100"
set /p "COPIAS=>> Tiragem Desejada (Total de Copias) [Padrao 100]: "

set "GAP=2"
set /p "GAP=>> Espacamento (Gap) entre pecas em mm [Padrao 2, 0 para colado]: "

set "MARGIN=15"
set /p "MARGIN=>> Margem lateral/superior em mm [Padrao 15, 0 para sem margem]: "

echo.
echo Escolha o modo de execucao:
echo   [1] MODO BANCADA   (Abre o Illustrator maximizado com FineCut pronto)
echo   [2] MODO SILENCIOSO (Gera o PDF e fecha o Illustrator)
set "MODO=1"
set /p "MODO=>> Opcao [Padrao 1]: "

set "MANTER=1"
if "!MODO!"=="2" set "MANTER=0"

for %%F in ("!PDF!") do (
    set "DIRNAME=%%~dpF"
    set "BASENAME=%%~nF"
)
set "OUTPUT=!DIRNAME!!BASENAME!_IMPOSTO_!SHEET_W!mm_!COPIAS!UN.pdf"

if not defined MARGIN set "MARGIN=15"

cls
echo ============================================================
echo   PROCESSANDO NO ADOBE ILLUSTRATOR...
echo ============================================================
echo  Origem:       !PDF!
echo  Destino:      !OUTPUT!
echo  Largura:      !SHEET_W! mm
echo  Copias:       !COPIAS! UN
echo  Gap:          !GAP! mm
echo  Margem:       !MARGIN! mm
echo  Colunas:      AUTOMATICO (calculado pelas dimensoes da peca)
echo  Linhas:       AUTOMATICO (calculado para atingir a meta)
echo  Comprimento:  AUTOMATICO (estende o rolo para caber tudo)
echo  Modo:         !MODO! (Manter Aberto: !MANTER!)
echo ============================================================
echo.
echo Aguarde... Abrindo e multiplicando vetores no Illustrator...

"%BIN%" "!PDF!" "!OUTPUT!" !SHEET_W! 0 !COPIAS! !GAP! !MARGIN! !MANTER!

echo.
echo ============================================================
echo  Processo finalizado!
echo ============================================================
pause
